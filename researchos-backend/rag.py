"""
rag.py — Grounded Document RAG for ResearchOS (v3 — retrieval overhaul).

What was broken in v2 and why users got "I could not find relevant information":
  1. Weak embedding model (all-MiniLM-L6-v2, 384-dim) → poor semantic matching
  2. Fixed MIN_SCORE=0.28 threshold too aggressive → valid chunks discarded
  3. TOP_K_RETRIEVE=12 too low → good chunks never even considered
  4. No query expansion → exact-phrasing mismatches caused silent failures
  5. No cross-encoder reranker → final top-5 often wrong ranking
  6. Section regex too strict → most PDFs fell back to dumb paragraph splits
  7. No fallback strategy when retrieval fails → cold "not found" every time

v3 fixes (in order of impact):
  ✓ Upgraded to BAAI/bge-base-en-v1.5 (768-dim, MTEB top-tier for RAG)
  ✓ Adaptive threshold — starts at 0.35, drops to 0.20 if needed
  ✓ TOP_K_RETRIEVE raised to 25
  ✓ Query expansion via HyDE (Hypothetical Document Embedding)
  ✓ Cross-encoder reranker (ms-marco-MiniLM-L-6-v2) for final ranking
  ✓ Flexible section detection (numbered + title-case + ALL CAPS headings)
  ✓ Graceful degradation: explains WHY it can't answer + suggests rephrasing
  ✓ MMR (Maximal Marginal Relevance) deduplication before reranking

Flow:
  1. ingest_pdf()    → stitch → clean → section-split → embed → persist
  2. chat_with_pdf() → expand query → retrieve (k=25) → adaptive threshold
                     → MMR dedup → cross-encode rerank → grounded stream
"""

from __future__ import annotations

import re
from pathlib import Path
from typing import Generator

from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_chroma import Chroma
from langchain_core.documents import Document

from agents import get_chain_llm


# ── Config ────────────────────────────────────────────────────────────────────

CHROMA_DIR      = Path(__file__).parent / "chroma_store"

# v3: Upgraded from all-MiniLM-L6-v2 (384-dim, weak) to bge-base (768-dim, strong)
# BGE consistently outperforms MiniLM on retrieval benchmarks by 8–15% NDCG
EMBEDDING_MODEL = "BAAI/bge-base-en-v1.5"

# Cross-encoder for final reranking — understands query-doc relationship directly
RERANKER_MODEL  = "cross-encoder/ms-marco-MiniLM-L-6-v2"

# Chunking
MAX_SECTION_CHARS = 1800   # increased from 1200 — technical explanations need room
SECTION_OVERLAP   = 200

# Retrieval — v3 retrieves 2× more candidates before filtering
TOP_K_RETRIEVE  = 25       # was 12
TOP_K_FINAL     = 6        # was 5 — one extra for cross-encoder to choose from

# Adaptive threshold — tries strict first, relaxes if nothing passes
MIN_SCORE_STRICT = 0.35
MIN_SCORE_RELAX  = 0.20

MAX_HISTORY     = 4

CHROMA_DIR.mkdir(exist_ok=True)


# ── System prompt ─────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are a precise, thorough document assistant.
Answer ONLY from the document chunks provided. Never use outside knowledge.

RULES:
1. Cite every chunk you draw from, inline, as [Chunk N].
2. Use ALL relevant chunks — do not stop after the first one.
3. For list/overview questions: enumerate every item across ALL chunks.
4. If the chunks don't contain the answer, say exactly:
   "This specific information is not present in the document."
   Then suggest 1-2 related questions the document CAN answer.
5. Never invent, infer, or extrapolate beyond what the chunks say.
6. Conversation history is for continuity only — not evidence.

FORMAT:
- Lists/overviews: numbered list, one sentence per item, with [Chunk N] citation.
- Specific questions: focused paragraph with inline citations.
- End EVERY response with: Sources: Chunk N (section: X), Chunk M (section: Y)
"""


# ── Embeddings (cached singleton) ─────────────────────────────────────────────

_embeddings_instance: HuggingFaceEmbeddings | None = None


def _get_embeddings() -> HuggingFaceEmbeddings:
    global _embeddings_instance
    if _embeddings_instance is None:
        _embeddings_instance = HuggingFaceEmbeddings(
            model_name=EMBEDDING_MODEL,
            model_kwargs={"device": "cpu"},
            # BGE requires this prefix for retrieval queries (not passages)
            encode_kwargs={
                "normalize_embeddings": True,
                "prompt": "Represent this sentence for searching relevant passages: ",
            },
        )
    return _embeddings_instance


# ── Cross-encoder reranker (cached singleton) ─────────────────────────────────

_reranker_instance = None


def _get_reranker():
    """
    Lazy-load the cross-encoder. Falls back gracefully if sentence-transformers
    is not installed — in that case, reranking is skipped silently.
    """
    global _reranker_instance
    if _reranker_instance is None:
        try:
            from sentence_transformers import CrossEncoder
            _reranker_instance = CrossEncoder(RERANKER_MODEL)
        except Exception as e:
            print(f"[RAG] Cross-encoder unavailable ({e}). Using embedding scores only.")
            _reranker_instance = False  # sentinel: tried but failed
    return _reranker_instance if _reranker_instance else None


# ── Text cleaning ─────────────────────────────────────────────────────────────

def _clean_text(raw: str) -> str:
    text = raw.replace("\x00", "]")

    icon_chars = ["\ue072", "\ue073", "\ue074", "\ue075",
                  "\ue076", "\ue077", "\ue078", "\ue079"]
    for ch in icon_chars:
        text = text.replace(ch, "•")

    # Remove ligature artifacts common in LaTeX/PDF exports
    text = text.replace("\ufb01", "fi").replace("\ufb02", "fl")

    # Collapse 3+ blank lines to 2
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


# ── Flexible section splitter ─────────────────────────────────────────────────

# v3: Three patterns instead of one — handles numbered, title-case, and ALLCAPS
_SECTION_PATTERNS = [
    # "1. Prefix Sum" or "13. Depth-First Search (DFS)"
    re.compile(r"(?m)^(\d{1,2})\.\s+([A-Z][^\n]{3,60})$"),
    # "## Introduction" or "# Overview"
    re.compile(r"(?m)^#{1,3}\s+([A-Z][^\n]{3,60})$"),
    # "INTRODUCTION" or "BACKGROUND AND MOTIVATION" (ALL CAPS heading)
    re.compile(r"(?m)^([A-Z][A-Z\s]{4,50})$"),
    # Title Case lines that look like headings (short, no period)
    re.compile(r"(?m)^([A-Z][a-z]+(?:\s+[A-Z][a-z]+){1,6})$"),
]


def _split_into_sections(full_text: str, filename: str) -> list[Document]:
    """
    Try each heading pattern in order. Use the first that finds ≥3 sections.
    Falls back to paragraph chunking if none match.
    """
    for pattern in _SECTION_PATTERNS:
        matches = list(pattern.finditer(full_text))
        if len(matches) >= 3:
            return _build_section_docs(full_text, matches, filename)

    # No heading structure found — paragraph chunking
    return _paragraph_chunks(full_text, filename, section_name="document", section_num=0)


def _build_section_docs(
    full_text: str,
    matches: list,
    filename: str,
) -> list[Document]:
    """Convert regex matches into sectioned Document chunks."""
    docs: list[Document] = []
    sections: list[tuple[int, int, int, str]] = []

    if matches[0].start() > 0:
        sections.append((0, matches[0].start(), 0, "Introduction"))

    for i, m in enumerate(matches):
        start = m.start()
        end   = matches[i + 1].start() if i + 1 < len(matches) else len(full_text)
        # Grab the section name from whichever group matched
        name  = (m.group(2) if m.lastindex and m.lastindex >= 2 else m.group(1)).strip()
        num   = i + 1
        sections.append((start, end, num, name))

    for start, end, num, name in sections:
        section_text = full_text[start:end].strip()
        if not section_text:
            continue

        sub_chunks = _sub_chunk(section_text, MAX_SECTION_CHARS, SECTION_OVERLAP)
        for idx, chunk_text in enumerate(sub_chunks):
            if num > 0 and not chunk_text.startswith(name):
                chunk_text = f"Section: {name}\n\n{chunk_text}"

            docs.append(Document(
                page_content=chunk_text,
                metadata={
                    "section_num":  num,
                    "section_name": name,
                    "source":       filename,
                    "chunk_idx":    idx,
                },
            ))

    return docs


def _sub_chunk(text: str, max_chars: int, overlap: int) -> list[str]:
    if len(text) <= max_chars:
        return [text]

    paragraphs = re.split(r"\n\n+", text)
    chunks: list[str] = []
    current = ""

    for para in paragraphs:
        if len(current) + len(para) + 2 <= max_chars:
            current = (current + "\n\n" + para).strip()
        else:
            if current:
                chunks.append(current)
            if len(para) > max_chars:
                for i in range(0, len(para), max_chars - overlap):
                    chunks.append(para[i: i + max_chars])
                current = ""
            else:
                current = para

    if current:
        chunks.append(current)

    return chunks if chunks else [text]


def _paragraph_chunks(
    text: str,
    filename: str,
    section_name: str,
    section_num: int,
) -> list[Document]:
    sub_chunks = _sub_chunk(text, MAX_SECTION_CHARS, SECTION_OVERLAP)
    return [
        Document(
            page_content=chunk,
            metadata={
                "section_num":  section_num,
                "section_name": section_name,
                "source":       filename,
                "chunk_idx":    i,
            },
        )
        for i, chunk in enumerate(sub_chunks)
    ]


# ── Ingestion ─────────────────────────────────────────────────────────────────

def ingest_pdf(file_path: str, session_id: str) -> dict:
    """
    Load PDF → stitch pages → clean text → semantic section split
    → embed → persist in ChromaDB.

    Returns:
        {session_id, filename, page_count, chunk_count}
    """
    from pypdf import PdfReader

    reader = PdfReader(file_path)
    pages  = reader.pages

    if not pages:
        raise ValueError("PDF has no pages.")

    raw_parts = []
    for page in pages:
        text = page.extract_text() or ""
        if text.strip():
            raw_parts.append(text)

    if not raw_parts:
        raise ValueError("PDF has no extractable text. May be scanned/image-only.")

    full_raw  = "\n".join(raw_parts)
    full_text = _clean_text(full_raw)
    filename  = Path(file_path).name
    chunks    = _split_into_sections(full_text, filename)

    if not chunks:
        raise ValueError("Could not extract any chunks from the PDF.")

    Chroma.from_documents(
        documents=chunks,
        embedding=_get_embeddings(),
        collection_name=f"session_{session_id}",
        persist_directory=str(CHROMA_DIR),
    )

    return {
        "session_id":  session_id,
        "filename":    filename,
        "page_count":  len(pages),
        "chunk_count": len(chunks),
    }


# ── Query expansion via HyDE ──────────────────────────────────────────────────

def _expand_query(question: str) -> str:
    """
    Hypothetical Document Embedding (HyDE):
    Generate a short hypothetical answer, then embed THAT instead of the question.
    This maps the query into the document's vocabulary space, not question space.

    Falls back to original question if LLM call fails.
    """
    try:
        llm    = get_chain_llm()
        prompt = (
            "Write a 2-3 sentence factual answer to the following question, "
            "as if it appeared in a technical document. "
            "Be specific and use domain terminology.\n\n"
            f"Question: {question}\n\nHypothetical answer:"
        )
        # Non-streaming call — we need the full text before embedding
        response = llm.invoke(prompt)
        hypothetical = response.content.strip()
        # Combine original + hypothetical for best of both worlds
        return f"{question}\n\n{hypothetical}"
    except Exception as e:
        print(f"[RAG] HyDE expansion failed ({e}). Using original question.")
        return question


# ── MMR deduplication ─────────────────────────────────────────────────────────

def _mmr_deduplicate(
    docs_with_scores: list[tuple],
    top_n: int,
    diversity: float = 0.3,
) -> list[tuple]:
    """
    Maximal Marginal Relevance — selects diverse chunks by penalising
    chunks that are too similar to already-selected ones.

    diversity=0.0 → pure relevance (no dedup)
    diversity=1.0 → pure diversity (ignore relevance)
    """
    if len(docs_with_scores) <= top_n:
        return docs_with_scores

    selected: list[tuple] = []
    remaining = list(docs_with_scores)

    while len(selected) < top_n and remaining:
        if not selected:
            # First pick: highest relevance score
            best = max(remaining, key=lambda x: x[1])
        else:
            # Subsequent picks: balance relevance vs similarity to selected
            def mmr_score(candidate):
                rel   = candidate[1]
                # Approximate similarity via text overlap with already-selected chunks
                ctext = candidate[0].page_content.lower()
                max_sim = max(
                    len(set(ctext.split()) & set(s[0].page_content.lower().split()))
                    / max(len(set(ctext.split())), 1)
                    for s in selected
                )
                return (1 - diversity) * rel - diversity * max_sim

            best = max(remaining, key=mmr_score)

        selected.append(best)
        remaining.remove(best)

    return selected


# ── Cross-encoder reranker ────────────────────────────────────────────────────

def _cross_encode_rerank(
    question: str,
    docs_with_scores: list[tuple],
    top_n: int,
) -> list[tuple]:
    """
    Use cross-encoder to score (question, chunk) pairs directly.
    Falls back to embedding score ranking if cross-encoder unavailable.
    """
    reranker = _get_reranker()

    if reranker is None:
        # Fallback: keyword-boosted embedding ranking (same as v2)
        q_lower  = question.lower()
        q_tokens = set(re.sub(r"[^\w\s]", "", q_lower).split())

        def _score(doc, emb_score: float) -> float:
            text  = doc.page_content.lower()
            hits  = sum(1 for tok in q_tokens if tok in text)
            kw    = hits / max(len(q_tokens), 1)
            sname = doc.metadata.get("section_name", "").lower()
            bonus = 0.10 if sname and sname in q_lower else 0.0
            return 0.70 * emb_score + 0.30 * kw + bonus

        scored = sorted(docs_with_scores, key=lambda x: _score(x[0], x[1]), reverse=True)
        return scored[:top_n]

    # Cross-encoder scores (question, passage) pairs — much more accurate
    pairs  = [(question, doc.page_content) for doc, _ in docs_with_scores]
    scores = reranker.predict(pairs)

    reranked = sorted(
        zip([d for d, _ in docs_with_scores], scores),
        key=lambda x: x[1],
        reverse=True,
    )

    return [(doc, float(score)) for doc, score in reranked[:top_n]]


# ── Grounded context builder ──────────────────────────────────────────────────

def _build_grounded_context(docs_with_scores: list[tuple]) -> str:
    parts: list[str] = []
    for i, (doc, score) in enumerate(docs_with_scores, 1):
        section = doc.metadata.get("section_name", "unknown")
        source  = doc.metadata.get("source", "document")
        parts.append(
            f'<chunk id="{i}" section="{section}" source="{source}" relevance="{score:.3f}">\n'
            f"{doc.page_content.strip()}\n"
            f"</chunk>"
        )
    return "\n\n".join(parts)


# ── Chat ──────────────────────────────────────────────────────────────────────

def chat_with_pdf(
    session_id: str,
    question:   str,
    history:    list[tuple[str, str]],
) -> Generator[str, None, None]:
    """
    v3 pipeline:
      1. Expand query via HyDE
      2. Retrieve k=25 candidates
      3. Adaptive threshold (strict → relax)
      4. MMR deduplication
      5. Cross-encoder reranking
      6. Grounded stream
    """
    vectorstore = Chroma(
        collection_name=f"session_{session_id}",
        embedding_function=_get_embeddings(),
        persist_directory=str(CHROMA_DIR),
    )

    # ── Step 1: Expand query ──────────────────────────────────────────────────
    expanded_query = _expand_query(question)

    # ── Step 2: Retrieve (large pool) ────────────────────────────────────────
    raw_results = vectorstore.similarity_search_with_relevance_scores(
        expanded_query, k=TOP_K_RETRIEVE
    )

    # ── Step 3: Adaptive threshold ────────────────────────────────────────────
    # Try strict threshold first; if nothing passes, relax it.
    # This prevents "not found" on legitimate questions with slightly low scores.
    filtered = [(doc, score) for doc, score in raw_results if score >= MIN_SCORE_STRICT]

    threshold_used = MIN_SCORE_STRICT
    if not filtered:
        filtered = [(doc, score) for doc, score in raw_results if score >= MIN_SCORE_RELAX]
        threshold_used = MIN_SCORE_RELAX

    if not filtered:
        # Genuine failure — nothing relevant even at relaxed threshold
        # Give a useful diagnostic instead of a cold refusal
        top_sections = list({
            doc.metadata.get("section_name", "unknown")
            for doc, _ in raw_results[:5]
        })
        yield (
            f"I could not find content relevant to \"{question}\" in this document.\n\n"
            f"The document appears to cover: {', '.join(top_sections)}.\n\n"
            f"Try asking about one of those topics, or rephrase your question "
            f"using terms that might appear in the document."
        )
        return

    # ── Step 4: MMR deduplication ─────────────────────────────────────────────
    # Remove near-duplicate chunks before reranking
    diverse = _mmr_deduplicate(filtered, top_n=min(12, len(filtered)))

    # ── Step 5: Cross-encoder reranking ───────────────────────────────────────
    best    = _cross_encode_rerank(question, diverse, top_n=TOP_K_FINAL)
    context = _build_grounded_context(best)

    # ── Step 6: Build prompt with history ────────────────────────────────────
    history_text = ""
    for user_q, asst_a in history[-MAX_HISTORY:]:
        history_text += f"<user>{user_q}</user>\n<assistant>{asst_a}</assistant>\n"

    prompt = (
        f"{_SYSTEM_PROMPT}\n\n"
        "=== DOCUMENT CHUNKS (answer ONLY from these) ===\n"
        f"{context}\n\n"
        "=== CONVERSATION HISTORY (continuity only, not evidence) ===\n"
        f"{history_text if history_text else '(none)'}\n\n"
        "=== CURRENT QUESTION ===\n"
        f"{question}\n\n"
        "=== YOUR GROUNDED ANSWER ==="
    )

    llm = get_chain_llm()
    for chunk in llm.stream(prompt):
        yield chunk.content


# ── Source inspection ─────────────────────────────────────────────────────────

def get_top_sources(session_id: str, question: str) -> list[dict]:
    vectorstore = Chroma(
        collection_name=f"session_{session_id}",
        embedding_function=_get_embeddings(),
        persist_directory=str(CHROMA_DIR),
    )

    expanded = _expand_query(question)
    raw      = vectorstore.similarity_search_with_relevance_scores(expanded, k=TOP_K_RETRIEVE)
    diverse  = _mmr_deduplicate(raw, top_n=12)
    reranked = _cross_encode_rerank(question, diverse, top_n=TOP_K_FINAL)

    return [
        {
            "section":           doc.metadata.get("section_name", "unknown"),
            "snippet":           doc.page_content[:220].strip(),
            "score":             round(score, 3),
            "passed_threshold":  score >= MIN_SCORE_RELAX,
        }
        for doc, score in reranked
    ]


# ── Session cleanup ───────────────────────────────────────────────────────────

def delete_session(session_id: str) -> None:
    try:
        Chroma(
            collection_name=f"session_{session_id}",
            embedding_function=_get_embeddings(),
            persist_directory=str(CHROMA_DIR),
        ).delete_collection()
    except Exception as exc:
        print(f"[RAG] cleanup warning for session {session_id}: {exc}")


# ── What changed from v2 → v3 (summary) ──────────────────────────────────────
#
# RETRIEVAL:
#   all-MiniLM-L6-v2 (384-dim) → BAAI/bge-base-en-v1.5 (768-dim)
#     BGE is purpose-built for retrieval; ~10% better NDCG on BEIR benchmark
#   TOP_K_RETRIEVE: 12 → 25
#     More candidates = more chances to find the right chunk before filtering
#   Fixed threshold (0.28) → Adaptive (try 0.35, fall back to 0.20)
#     Prevents silent failures on valid questions with slightly lower scores
#
# QUERY UNDERSTANDING:
#   Raw question → HyDE-expanded query
#     Bridges vocabulary gap between question phrasing and document language
#
# DEDUPLICATION:
#   None → MMR (Maximal Marginal Relevance)
#     Prevents 3 near-identical chunks from crowding out diverse evidence
#
# RERANKING:
#   Weighted cosine + keyword → Cross-encoder (ms-marco-MiniLM-L-6-v2)
#     Cross-encoders read (question + chunk) together — far more accurate
#     than comparing embeddings in isolation
#
# FAILURE MODE:
#   Cold "not found" → Diagnostic message with available topic suggestions
#     User understands WHY and what to ask instead
#
# SECTION DETECTION:
#   Single numbered pattern → 4 patterns (numbered, markdown, ALLCAPS, TitleCase)
#     Works on academic papers, textbooks, blog exports, not just DSA guides
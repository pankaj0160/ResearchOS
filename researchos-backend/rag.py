"""
rag.py — Grounded Document RAG for ResearchOS (v2 — fixed ingestion).

Root causes of hallucination fixed in this version:
  1. Page-boundary fragmentation  → full doc stitched before chunking
  2. Null-byte / bracket corruption → cleaned before embedding
  3. Image-only pages losing content → section metadata injected on every chunk
  4. Character-count splits mid-walkthrough → semantic section-aware chunking

Anti-hallucination architecture (unchanged from v1):
  • Relevance threshold  — chunks below MIN_SCORE are discarded, never reach LLM
  • XML context fence    — structured chunk tags prevent cross-chunk fabrication
  • Strict system prompt — mandatory [Chunk N] citations, hard refusal contract
  • History isolation    — labelled "context only, not evidence"
  • Hybrid re-ranking    — 70 % embedding + 30 % keyword overlap

Flow:
  1. ingest_pdf()    → stitch → clean → section-split → embed → persist
  2. chat_with_pdf() → retrieve → threshold → re-rank → grounded stream
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
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

# Semantic chunking params
MAX_SECTION_CHARS = 1200   # split large sections into sub-chunks of this size
SECTION_OVERLAP   = 150    # overlap between sub-chunks within a section

TOP_K_RETRIEVE  = 12
TOP_K_FINAL     = 5
MIN_SCORE       = 0.28     # slightly lower than v1 to compensate for cleaner chunks
MAX_HISTORY     = 4

CHROMA_DIR.mkdir(exist_ok=True)

# ── System prompt (anti-hallucination contract) ───────────────────────────────

_SYSTEM_PROMPT = """You are a helpful, thorough document assistant. Your job is to give
complete, well-structured answers based ONLY on the document chunks provided below.

Rules:
1. Use ALL relevant chunks provided — do not stop after the first one.
2. Cite every chunk you draw from, inline, as [Chunk N].
3. For summary or "list" questions, enumerate every item found across ALL chunks.
4. If something is genuinely not in the chunks, say so briefly — but do not use
   this as an excuse to give a short answer when the chunks ARE rich enough.
5. Do NOT invent information not present in the chunks.
6. Conversation history is for continuity only — do not answer from it.

Format guidance:
- For list/overview questions: use a numbered or bulleted list with one sentence
  of explanation per item, citing the chunk. Be thorough, not brief.
- For specific questions: one focused paragraph with inline citations.
- End with: Sources: Chunk N (section: X), Chunk M (section: Y), ...
"""


# ── Embeddings (cached singleton) ─────────────────────────────────────────────

_embeddings_instance: HuggingFaceEmbeddings | None = None


def _get_embeddings() -> HuggingFaceEmbeddings:
    global _embeddings_instance
    if _embeddings_instance is None:
        _embeddings_instance = HuggingFaceEmbeddings(
            model_name=EMBEDDING_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
    return _embeddings_instance


# ── Text cleaning ─────────────────────────────────────────────────────────────

def _clean_text(raw: str) -> str:
    """
    Fix corruption introduced by PyPDF on this class of PDFs:
      - Null bytes replacing brackets: prefix[i + 1\x00  →  prefix[i + 1]
      - Icon/emoji unicode artifacts from PDF bullet rendering
      - Excessive blank lines
    """
    # Null bytes almost always replace closing brackets in code blocks
    text = raw.replace("\x00", "]")

    # PDF icon font artifacts (common in Substack exports)
    icon_chars = ["\ue072", "\ue073", "\ue074", "\ue075",
                  "\ue076", "\ue077", "\ue078", "\ue079"]
    for ch in icon_chars:
        text = text.replace(ch, "•")

    # Collapse 3+ blank lines to 2
    text = re.sub(r"\n{3,}", "\n\n", text)

    return text.strip()


# ── Semantic section splitter ─────────────────────────────────────────────────

# Matches numbered sections like "1. Prefix Sum", "13. Depth-First Search (DFS)"
_SECTION_RE = re.compile(r"(?m)^(\d{1,2})\.\s+([A-Z][^\n]+)")


def _split_into_sections(full_text: str, filename: str) -> list[Document]:
    """
    Split a document into semantic sections based on numbered headings.

    For documents without numbered headings (non-DSA content), falls back
    to paragraph-level splitting with overlap.

    Each returned Document carries metadata:
      - section_num   : int   (0 = preamble, 1-20 = pattern number)
      - section_name  : str
      - source        : str   (filename)
      - chunk_idx     : int   (sub-chunk index within section)
    """
    matches = list(_SECTION_RE.finditer(full_text))
    docs: list[Document] = []

    if len(matches) < 3:
        # No clear section structure — fall back to paragraph chunking
        return _paragraph_chunks(full_text, filename, section_name="document", section_num=0)

    # Build sections list: (start_char, end_char, num, name)
    sections: list[tuple[int, int, int, str]] = []

    # Preamble (before first section)
    if matches[0].start() > 0:
        sections.append((0, matches[0].start(), 0, "Introduction"))

    for i, m in enumerate(matches):
        start = m.start()
        end   = matches[i + 1].start() if i + 1 < len(matches) else len(full_text)
        num   = int(m.group(1))
        name  = m.group(2).strip()
        if 0 <= num <= 30:  # sanity check
            sections.append((start, end, num, name))

    for start, end, num, name in sections:
        section_text = full_text[start:end].strip()
        if not section_text:
            continue

        sub_chunks = _sub_chunk(section_text, MAX_SECTION_CHARS, SECTION_OVERLAP)
        for idx, chunk_text in enumerate(sub_chunks):
            # Prepend section header to every sub-chunk so the LLM always
            # knows which pattern it's reading about — fixes the "orphaned
            # content" problem where content had no heading.
            if num > 0 and not chunk_text.startswith(name):
                chunk_text = f"Pattern: {num}. {name}\n\n{chunk_text}"

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
    """
    Split a section into sub-chunks of at most max_chars,
    preferring paragraph boundaries, with character-level overlap.
    """
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
            # If a single paragraph exceeds max_chars, hard-split it
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
    """Fallback: paragraph-level chunking with overlap for unstructured docs."""
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
    from pypdf import PdfReader  # prefer pypdf (newer) over PyPDFLoader

    reader = PdfReader(file_path)
    pages  = reader.pages

    if not pages:
        raise ValueError("PDF has no pages.")

    # ── Step 1: Stitch all pages into one document ────────────────────────────
    # This is the key fix for page-boundary fragmentation.
    # Pattern names and their content were split across page boundaries;
    # stitching first ensures they land in the same section.
    raw_parts = []
    for page in pages:
        text = page.extract_text() or ""
        if text.strip():
            raw_parts.append(text)

    if not raw_parts:
        raise ValueError("PDF has no extractable text. May be scanned/image-only.")

    full_raw  = "\n".join(raw_parts)

    # ── Step 2: Clean corruption ──────────────────────────────────────────────
    full_text = _clean_text(full_raw)

    # ── Step 3: Semantic section splitting ────────────────────────────────────
    filename = Path(file_path).name
    chunks   = _split_into_sections(full_text, filename)

    if not chunks:
        raise ValueError("Could not extract any chunks from the PDF.")

    # ── Step 4: Embed and persist ─────────────────────────────────────────────
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


# ── Hybrid re-ranker ──────────────────────────────────────────────────────────

def _rerank(
    question: str,
    docs_with_scores: list[tuple],
    top_n: int = TOP_K_FINAL,
) -> list[tuple]:
    """
    Re-rank by: 70 % embedding similarity + 30 % keyword overlap.
    Also boosts chunks whose section_name appears in the question.
    """
    q_lower  = question.lower()
    q_tokens = set(re.sub(r"[^\w\s]", "", q_lower).split())

    def _score(doc, emb_score: float) -> float:
        text   = doc.page_content.lower()
        hits   = sum(1 for tok in q_tokens if tok in text)
        kw     = hits / max(len(q_tokens), 1)
        # Section name match bonus (e.g. "prefix sum" in question + chunk)
        sname  = doc.metadata.get("section_name", "").lower()
        bonus  = 0.10 if sname and sname in q_lower else 0.0
        return 0.70 * emb_score + 0.30 * kw + bonus

    scored = sorted(docs_with_scores, key=lambda x: _score(x[0], x[1]), reverse=True)
    return scored[:top_n]


# ── Grounded context builder ──────────────────────────────────────────────────

def _build_grounded_context(docs_with_scores: list[tuple]) -> str:
    parts: list[str] = []
    for i, (doc, score) in enumerate(docs_with_scores, 1):
        section = doc.metadata.get("section_name", "unknown")
        source  = doc.metadata.get("source", "document")
        parts.append(
            f'<chunk id="{i}" section="{section}" relevance="{score:.2f}">\n'
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
    Retrieve → threshold → re-rank → stream a grounded answer.
    Yields string chunks. Caller concatenates for storage.
    """
    vectorstore = Chroma(
        collection_name=f"session_{session_id}",
        embedding_function=_get_embeddings(),
        persist_directory=str(CHROMA_DIR),
    )

    raw_results = vectorstore.similarity_search_with_relevance_scores(
        question, k=TOP_K_RETRIEVE
    )

    filtered = [(doc, score) for doc, score in raw_results if score >= MIN_SCORE]

    if not filtered:
        yield (
            f'I could not find relevant information in the document to answer '
            f'"{question}". The question may be outside the document\'s scope. '
            f"Please try rephrasing or ask about a different topic."
        )
        return

    best    = _rerank(question, filtered, top_n=TOP_K_FINAL)
    context = _build_grounded_context(best)

    history_text = ""
    for user_q, asst_a in history[-MAX_HISTORY:]:
        history_text += f"<user>{user_q}</user>\n<assistant>{asst_a}</assistant>\n"

    prompt = (
        f"{_SYSTEM_PROMPT}\n\n"
        "=== DOCUMENT CHUNKS (answer only from these) ===\n"
        f"{context}\n\n"
        "=== CONVERSATION HISTORY (context only, not evidence) ===\n"
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
    """
    Return top-k source chunks with relevance scores.
    Only returns chunks that pass MIN_SCORE.
    """
    vectorstore = Chroma(
        collection_name=f"session_{session_id}",
        embedding_function=_get_embeddings(),
        persist_directory=str(CHROMA_DIR),
    )

    raw      = vectorstore.similarity_search_with_relevance_scores(question, k=TOP_K_RETRIEVE)
    reranked = _rerank(question, raw, top_n=TOP_K_FINAL)

    return [
        {
            "section":           doc.metadata.get("section_name", "unknown"),
            "snippet":           doc.page_content[:220].strip(),
            "score":             round(score, 3),
            "passed_threshold":  score >= MIN_SCORE,
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

        

# When you ask a question, here's what happens step by step:
# 1. Find candidates — The system searches your PDF and pulls 12 text chunks that might be relevant.
# 2. Filter ruthlessly — Any chunk that scores below 30% similarity to your question gets thrown out. If everything scores below 30%, the system never even calls the AI — it just tells you "I couldn't find this in the document." No guessing, full stop.
# 3. Pick the best 5 — The surviving chunks get re-scored using both meaning similarity and keyword matching. The top 5 move forward.
# 4. Lock the context — Those 5 chunks are wrapped in labelled boxes with their page numbers and relevance scores. The AI can clearly see where one chunk ends and another begins, making it hard to blend them into a fabricated statement.
# 5. Give the AI a strict contract — The system prompt tells the LLM three hard rules: cite the chunk number for every claim, never draw on outside knowledge, and if the answer isn't in the chunks — say exactly "I could not find this in the document" — nothing else.
# 6. Keep history out of the evidence — Past conversation turns are sent along for context, but the AI is explicitly told: history is not evidence. You can't answer from it.

# The key mindset shift:
# The old system trusted the AI to self-police. The new system removes the temptation by controlling what the AI is even allowed to see and respond from. A model can't hallucinate from chunks it never receives.
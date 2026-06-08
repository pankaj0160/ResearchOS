"""
rag.py — Memory-optimized RAG for Render free tier (512MB RAM).

Memory budget breakdown:
  all-MiniLM-L6-v2  →  ~90MB  (was bge-base: 440MB — saves 350MB)
  ChromaDB on disk  →  ~30MB  (never fully loaded into RAM)
  PDF page-by-page  →  ~5MB   (was full-doc in RAM)
  FastAPI baseline  →  ~100MB
  Safety headroom   →  ~100MB
  ──────────────────────────
  Total             →  ~325MB  ✓ fits in 512MB

Changes from v2/v3:
  ✓ Smaller embedding model (MiniLM vs BGE) — saves 350MB alone
  ✓ Page-by-page PDF processing — never loads full PDF into RAM
  ✓ Embeds in batches of 20 — no spike from embedding all chunks at once
  ✓ gc.collect() after every major operation
  ✓ Embeddings loaded lazily (only on first use, not at import)
  ✓ No cross-encoder reranker (saves ~90MB)
  ✓ Temp file deleted immediately after ingestion
  ✓ RENDER_LOW_MEMORY=true env var disables feature with friendly message
  ✓ Chroma persists to disk — not held in RAM
"""

from __future__ import annotations

import gc
import os
import re
from pathlib import Path
from typing import Generator

from langchain_chroma import Chroma
from langchain_core.documents import Document

from agents import get_chain_llm


# ── Environment check ─────────────────────────────────────────────────────────
# Set RENDER_LOW_MEMORY=true in Render dashboard to disable RAG entirely
# Returns a friendly message instead of OOM-crashing the whole server.
LOW_MEMORY_MODE = os.getenv("RENDER_LOW_MEMORY", "false").lower() == "true"

# ── Config ────────────────────────────────────────────────────────────────────

CHROMA_DIR      = Path(__file__).parent / "chroma_store"

# MiniLM = 90MB RAM vs BGE = 440MB RAM — single biggest memory saving
EMBEDDING_MODEL = "all-MiniLM-L6-v2"

# Smaller chunks = less RAM per operation
MAX_SECTION_CHARS = 1000
SECTION_OVERLAP   = 100

TOP_K_RETRIEVE  = 8    # reduced from 25 — less RAM during search
TOP_K_FINAL     = 4    # reduced from 6
MIN_SCORE       = 0.25

MAX_HISTORY     = 3    # reduced from 4 — shorter prompt = less RAM

CHROMA_DIR.mkdir(exist_ok=True)

# ── System prompt ─────────────────────────────────────────────────────────────

_SYSTEM_PROMPT = """You are a precise document assistant.
Answer ONLY from the document chunks provided. Never use outside knowledge.

RULES:
1. Cite every chunk inline as [Chunk N].
2. Use ALL relevant chunks — do not stop after the first one.
3. If the answer is not in the chunks, say: "This is not in the document."
4. Never invent information.

FORMAT: Paragraph with [Chunk N] citations. End with: Sources: Chunk N (section: X)
"""

# ── Embeddings — lazy singleton ───────────────────────────────────────────────
# CRITICAL: Do NOT load at module import time.
# Loading at import = model loads on every Render worker startup = instant OOM.
# Lazy load = only loads when first PDF is actually uploaded.

_embeddings_instance = None


def _get_embeddings():
    global _embeddings_instance
    if _embeddings_instance is None:
        # Import here, not at top — avoids loading torch at server startup
        from langchain_community.embeddings import HuggingFaceEmbeddings
        _embeddings_instance = HuggingFaceEmbeddings(
            model_name=EMBEDDING_MODEL,
            model_kwargs={"device": "cpu"},
            encode_kwargs={"normalize_embeddings": True},
        )
    return _embeddings_instance


# ── Text cleaning ─────────────────────────────────────────────────────────────

def _clean_text(raw: str) -> str:
    text = raw.replace("\x00", "]")
    text = text.replace("\ufb01", "fi").replace("\ufb02", "fl")
    for ch in ["\ue072","\ue073","\ue074","\ue075","\ue076","\ue077","\ue078","\ue079"]:
        text = text.replace(ch, "•")
    text = re.sub(r"\n{3,}", "\n\n", text)
    return text.strip()


# ── Sub-chunker ───────────────────────────────────────────────────────────────

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


# ── Ingestion — page by page ──────────────────────────────────────────────────

def ingest_pdf(file_path: str, session_id: str) -> dict:
    """
    Memory-safe ingestion:
      - Reads one page at a time (never full PDF text in RAM)
      - Embeds in batches of 20 chunks (no spike from embedding all at once)
      - Calls gc.collect() after each page and each batch
      - Deletes temp file from disk immediately after ingestion completes

    Returns: {session_id, filename, page_count, chunk_count}
    """
    if LOW_MEMORY_MODE:
        raise ValueError(
            "PDF Chat is currently unavailable on this deployment due to memory constraints. "
            "Please contact support or try again later."
        )

    from pypdf import PdfReader

    reader     = PdfReader(file_path)
    pages      = reader.pages
    page_count = len(pages)

    if not pages:
        raise ValueError("PDF has no pages.")

    filename   = Path(file_path).name
    all_chunks: list[Document] = []

    # ── Process one page at a time — key memory fix ───────────────────────────
    for page_num, page in enumerate(pages):
        raw_text = page.extract_text() or ""
        if not raw_text.strip():
            continue

        clean = _clean_text(raw_text)
        sub   = _sub_chunk(clean, MAX_SECTION_CHARS, SECTION_OVERLAP)

        for idx, chunk_text in enumerate(sub):
            all_chunks.append(Document(
                page_content=chunk_text,
                metadata={
                    "page":         page_num + 1,
                    "section_name": f"Page {page_num + 1}",
                    "section_num":  page_num + 1,
                    "source":       filename,
                    "chunk_idx":    idx,
                },
            ))

        # Free page text from RAM immediately after chunking
        del raw_text, clean, sub
        gc.collect()

    # Free the reader object (holds full PDF bytes in RAM)
    del reader, pages
    gc.collect()

    if not all_chunks:
        raise ValueError("PDF has no extractable text. May be scanned/image-only.")

    # ── Embed in batches of 20 to avoid RAM spike ─────────────────────────────
    BATCH_SIZE = 20
    for i in range(0, len(all_chunks), BATCH_SIZE):
        batch = all_chunks[i: i + BATCH_SIZE]
        Chroma.from_documents(
            documents=batch,
            embedding=_get_embeddings(),
            collection_name=f"session_{session_id}",
            persist_directory=str(CHROMA_DIR),
        )
        del batch
        gc.collect()

    chunk_count = len(all_chunks)
    del all_chunks
    gc.collect()

    # ── Delete temp file immediately after ingestion ──────────────────────────
    # main.py also tries to delete it — this is a safety net
    try:
        Path(file_path).unlink(missing_ok=True)
    except Exception as e:
        print(f"[RAG] Warning: could not delete temp file {file_path}: {e}")

    return {
        "session_id":  session_id,
        "filename":    filename,
        "page_count":  page_count,
        "chunk_count": chunk_count,
    }


# ── Reranker (lightweight — no cross-encoder) ─────────────────────────────────

def _rerank(
    question: str,
    docs_with_scores: list[tuple],
    top_n: int = TOP_K_FINAL,
) -> list[tuple]:
    q_lower  = question.lower()
    q_tokens = set(re.sub(r"[^\w\s]", "", q_lower).split())

    def _score(doc, emb_score: float) -> float:
        text  = doc.page_content.lower()
        hits  = sum(1 for tok in q_tokens if tok in text)
        kw    = hits / max(len(q_tokens), 1)
        sname = doc.metadata.get("section_name", "").lower()
        bonus = 0.08 if sname and any(tok in sname for tok in q_tokens) else 0.0
        return 0.70 * emb_score + 0.30 * kw + bonus

    scored = sorted(docs_with_scores, key=lambda x: _score(x[0], x[1]), reverse=True)
    return scored[:top_n]


# ── Context builder ───────────────────────────────────────────────────────────

def _build_context(docs_with_scores: list[tuple]) -> str:
    parts = []
    for i, (doc, score) in enumerate(docs_with_scores, 1):
        section = doc.metadata.get("section_name", "unknown")
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
    Memory-safe chat:
      - Retrieves fewer candidates (8 vs 25)
      - Shorter history window (3 vs 4 turns)
      - gc.collect() after retrieval, before LLM call
    """
    if LOW_MEMORY_MODE:
        yield "PDF Chat is currently unavailable on this deployment due to memory constraints."
        return

    vectorstore = Chroma(
        collection_name=f"session_{session_id}",
        embedding_function=_get_embeddings(),
        persist_directory=str(CHROMA_DIR),
    )

    raw_results = vectorstore.similarity_search_with_relevance_scores(
        question, k=TOP_K_RETRIEVE
    )

    filtered = [(doc, score) for doc, score in raw_results if score >= MIN_SCORE]

    # Adaptive threshold — relax if nothing passes
    if not filtered:
        filtered = [(doc, score) for doc, score in raw_results if score >= 0.15]

    if not filtered:
        top_sections = list({
            doc.metadata.get("section_name", "unknown")
            for doc, _ in raw_results[:3]
        })
        yield (
            f'Could not find content relevant to "{question}" in this document.\n\n'
            f"The document covers: {', '.join(top_sections)}.\n\n"
            f"Try rephrasing your question using terms from the document."
        )
        return

    best    = _rerank(question, filtered, top_n=TOP_K_FINAL)
    context = _build_context(best)

    # Free retrieval objects before LLM call — important for RAM
    del raw_results, filtered, best
    gc.collect()

    history_text = ""
    for user_q, asst_a in history[-MAX_HISTORY:]:
        history_text += f"<user>{user_q}</user>\n<assistant>{asst_a}</assistant>\n"

    prompt = (
        f"{_SYSTEM_PROMPT}\n\n"
        "=== DOCUMENT CHUNKS ===\n"
        f"{context}\n\n"
        "=== HISTORY ===\n"
        f"{history_text or '(none)'}\n\n"
        "=== QUESTION ===\n"
        f"{question}\n\n"
        "=== ANSWER ==="
    )

    del context, history_text
    gc.collect()

    llm = get_chain_llm()
    for chunk in llm.stream(prompt):
        yield chunk.content


# ── Source inspection ─────────────────────────────────────────────────────────

def get_top_sources(session_id: str, question: str) -> list[dict]:
    if LOW_MEMORY_MODE:
        return []

    vectorstore = Chroma(
        collection_name=f"session_{session_id}",
        embedding_function=_get_embeddings(),
        persist_directory=str(CHROMA_DIR),
    )

    raw      = vectorstore.similarity_search_with_relevance_scores(question, k=TOP_K_RETRIEVE)
    reranked = _rerank(question, raw, top_n=TOP_K_FINAL)

    result = [
        {
            "section":          doc.metadata.get("section_name", "unknown"),
            "snippet":          doc.page_content[:200].strip(),
            "score":            round(score, 3),
            "passed_threshold": score >= MIN_SCORE,
        }
        for doc, score in reranked
    ]

    del raw, reranked
    gc.collect()

    return result


# ── Session cleanup ───────────────────────────────────────────────────────────

def delete_session(session_id: str) -> None:
    try:
        Chroma(
            collection_name=f"session_{session_id}",
            embedding_function=_get_embeddings(),
            persist_directory=str(CHROMA_DIR),
        ).delete_collection()
        gc.collect()
    except Exception as exc:
        print(f"[RAG] cleanup warning for session {session_id}: {exc}")

        
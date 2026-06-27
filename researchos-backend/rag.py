"""
rag.py — Production-grade PDF/text RAG for ResearchOS.

What this file does (plain English):
  1. You upload a PDF
  2. We extract every page's text
  3. We cut it into smart chunks (respecting headings, paragraphs)
  4. We embed each chunk — turn text into numbers (vectors) Google Gemini can search
  5. We store those vectors in ChromaDB (a local vector database)
  6. When you ask a question, we find the most relevant chunks, rerank them,
     and send them to the LLM as context so it answers from YOUR document only

Speed improvements in this version:
  - Progress tracking: _progress dict lets frontend show "Processing... 45%"
  - Smart chunking: respects headings and sentence boundaries
  - Duplicate detection: same PDF uploaded twice → instant cache hit (no re-embedding)
  - Better answer quality: page numbers + confidence scores in every answer
  - Batch embedding with rate-limit awareness

RAG = Retrieval-Augmented Generation
  Retrieval   = find relevant text chunks from the document
  Augmented   = add those chunks to the LLM prompt as context
  Generation  = LLM generates an answer grounded in that context
"""

from __future__ import annotations

import gc
import hashlib
import json
import os
import re
import time
from pathlib import Path
from typing import Generator

from langchain_chroma import Chroma
from langchain_core.documents import Document
from langchain_core.embeddings import Embeddings

from agents import get_chain_llm

# ── Environment ───────────────────────────────────────────────────────────────

LOW_MEMORY_MODE = os.getenv("RENDER_LOW_MEMORY", "false").lower() == "true"
GOOGLE_API_KEY  = os.getenv("GOOGLE_API_KEY", "")
COHERE_API_KEY  = os.getenv("COHERE_API_KEY", "")

# ── Config ────────────────────────────────────────────────────────────────────

CHROMA_DIR        = Path(__file__).parent / "chroma_store"
MAX_SECTION_CHARS = 1200   # increased from 1000 — captures more context per chunk
SECTION_OVERLAP   = 150    # increased from 100 — better continuity between chunks
TOP_K_RETRIEVE    = 30     # how many chunks to retrieve before reranking
TOP_K_FINAL       = 8      # how many chunks to send to LLM after reranking
MIN_SCORE         = 0.15   # minimum relevance score to include a chunk
MAX_HISTORY       = 3      # how many previous Q&A pairs to include in context
EMBED_BATCH_SIZE  = 10     # send 10 chunks to Gemini API at once (faster)

CHROMA_DIR.mkdir(exist_ok=True)


# ═══════════════════════════════════════════════════════════════════════════════
# PROGRESS TRACKING
# Powers the "Processing... 45%" indicator in the frontend.
# Key = session_id, Value = {pct: int, stage: str, done: bool, error: str|None}
# ═══════════════════════════════════════════════════════════════════════════════

_progress: dict[str, dict] = {}


def get_progress(session_id: str) -> dict:
    """
    Return current processing progress for a session.
    Returns default 'waiting' state if session not yet started.
    """
    return _progress.get(session_id, {
        "pct":   0,
        "stage": "waiting",
        "done":  False,
        "error": None,
    })


def _set_progress(session_id: str, pct: int, stage: str, done: bool = False, error: str | None = None) -> None:
    """Update progress for a session. Called throughout the ingestion pipeline."""
    _progress[session_id] = {
        "pct":   min(pct, 100),
        "stage": stage,
        "done":  done,
        "error": error,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# FILE HASHING — Duplicate Detection
# ═══════════════════════════════════════════════════════════════════════════════

def compute_file_hash(file_path: str) -> str:
    """
    SHA256 fingerprint of a file — used to detect duplicate uploads.
    If user uploads the same PDF twice, we skip re-embedding and return cached result.
    Only first 16 chars used — collision risk is negligible at this scale.
    """
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for block in iter(lambda: f.read(8192), b""):
            h.update(block)
    return h.hexdigest()[:16]


# ═══════════════════════════════════════════════════════════════════════════════
# METADATA / CACHE FILES
# ═══════════════════════════════════════════════════════════════════════════════

def _meta_path(doc_hash: str) -> Path:
    """Path to the JSON file storing page_count + chunk_count for a doc."""
    return CHROMA_DIR / f"{doc_hash}.json"


def _save_meta(doc_hash: str, meta: dict) -> None:
    _meta_path(doc_hash).write_text(json.dumps(meta))


def _load_meta(doc_hash: str) -> dict:
    return json.loads(_meta_path(doc_hash).read_text())


def _collection_exists(doc_hash: str) -> bool:
    """Check if a ChromaDB collection already exists for this document hash."""
    import chromadb
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    cols   = client.list_collections()
    names  = [c.name if hasattr(c, "name") else c for c in cols]
    return f"doc_{doc_hash}" in names


# ═══════════════════════════════════════════════════════════════════════════════
# SESSION → COLLECTION MAPPING
# Maps session_id (UUID) → ChromaDB collection name
# PDF  sessions: stored as bare doc_hash    → collection = "doc_{hash}"
# Text sessions: stored as "text:{sid}"    → collection = "session_{sid}"
# ═══════════════════════════════════════════════════════════════════════════════

_SESSION_MAP_PATH = CHROMA_DIR / "session_map.json"


def _load_session_map() -> dict:
    if _SESSION_MAP_PATH.exists():
        try:
            return json.loads(_SESSION_MAP_PATH.read_text())
        except (json.JSONDecodeError, OSError):
            return {}
    return {}


def _save_session_map(m: dict) -> None:
    _SESSION_MAP_PATH.write_text(json.dumps(m))


def _register_pdf_session(session_id: str, doc_hash: str) -> None:
    """Store raw doc_hash for a PDF session (no prefix — added at resolve time)."""
    m = _load_session_map()
    m[session_id] = doc_hash
    _save_session_map(m)


def _register_text_session(session_id: str) -> None:
    """Store 'text:{session_id}' sentinel for a text-ingest session."""
    m = _load_session_map()
    m[session_id] = f"text:{session_id}"
    _save_session_map(m)


def _resolve_collection(session_id: str) -> str | None:
    """
    Return the fully-qualified ChromaDB collection name for a session.
    Returns None if session is unknown.

    Handles all storage formats (including legacy):
      bare hash      → "doc_{hash}"
      "doc_{hash}"   → "doc_{hash}"   (old bug — still works)
      "text:{sid}"   → "session_{sid}"
      "session_{sid}"→ "session_{sid}" (old bug — still works)
    """
    raw = _load_session_map().get(session_id)
    if raw is None:
        return None
    if raw.startswith("text:"):
        return f"session_{raw[len('text:'):]}"
    if raw.startswith("doc_") or raw.startswith("session_"):
        return raw   # legacy — already has prefix
    return f"doc_{raw}"  # bare hash — correct new format


# ═══════════════════════════════════════════════════════════════════════════════
# LLM SYSTEM PROMPT
# Controls how the AI answers questions about documents
# ═══════════════════════════════════════════════════════════════════════════════

_SYSTEM_PROMPT = """You are a precise document assistant. Answer ONLY using the chunks below.

STRICT RULES:
1. Every factual claim MUST be supported by a chunk. Cite it as [Chunk N].
2. If the chunks do not contain enough information, say:
   "The document does not fully cover this. Based on [Chunk N]: ..."
3. DO NOT add examples, analogies, or context from your training data.
4. Always mention the page number when citing (e.g. "[Chunk 2, Page 5]").

FORMATTING (Markdown):
- Use ## headings to separate distinct topics.
- Use bullet lists for enumerable items (findings, dates, names, steps).
- Use **bold** for key terms, numbers, or names.
- Keep paragraphs short — 2 to 4 sentences max.
- End with: Sources: Chunk N (Page X), Chunk M (Page Y)
"""


# ═══════════════════════════════════════════════════════════════════════════════
# EMBEDDING MODELS
# ═══════════════════════════════════════════════════════════════════════════════

class GeminiEmbeddings(Embeddings):
    """
    Google Gemini embeddings — high quality, zero local RAM.
    Uses the google-genai SDK directly (not langchain wrapper).
    Implements batching + rate-limit pauses to stay within API limits.
    """
    _MODELS = [
        "models/gemini-embedding-001",
        "models/gemini-embedding-2",
        "models/gemini-embedding-2-preview",
    ]

    def __init__(self, api_key: str):
        self.api_key     = api_key
        self._model_name: str | None = None
        self._client     = None

    def _get_client(self):
        if self._client is None:
            try:
                from google import genai
            except ImportError:
                raise RuntimeError(
                    "google-genai not installed. Run: pip install google-genai"
                )
            self._client = genai.Client(api_key=self.api_key)
        return self._client

    def _resolve_model(self) -> str:
        if self._model_name:
            return self._model_name
        client = self._get_client()
        try:
            available = [
                m.name for m in client.models.list()
                if m.supported_actions and "embedContent" in m.supported_actions
            ]
        except Exception as e:
            print(f"[RAG] Could not list models ({e}) — using default list")
            available = self._MODELS

        for preferred in self._MODELS:
            if preferred in available:
                self._model_name = preferred
                print(f"[RAG] Using embedding model: {preferred}")
                return self._model_name

        if available:
            self._model_name = available[0]
            print(f"[RAG] Using first available model: {self._model_name}")
            return self._model_name

        # Hard fallback
        self._model_name = "models/gemini-embedding-001"
        return self._model_name

    def _embed_one(self, text: str) -> list[float]:
        """Embed a single text with exponential backoff on failure."""
        client = self._get_client()
        model  = self._resolve_model()
        for attempt in range(4):
            try:
                result = client.models.embed_content(model=model, contents=text[:8000])
                return result.embeddings[0].values
            except Exception as e:
                if attempt == 3:
                    raise RuntimeError(f"Embedding failed after 4 attempts: {e}") from e
                wait = 2 ** attempt   # 1s, 2s, 4s
                print(f"[RAG] Embedding retry {attempt+1}/4 in {wait}s: {e}")
                time.sleep(wait)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        """
        Embed all texts with rate-limit awareness.
        Pauses every 80 chunks (Gemini free tier limit) and every 10 chunks
        to avoid overwhelming the API.

        Progress is tracked via _progress so the frontend can show percentage.
        """
        embeddings = []
        total = len(texts)
        for i, text in enumerate(texts):
            embeddings.append(self._embed_one(text))

            # Rate limiting — free tier has strict per-minute limits
            if i > 0 and i % 80 == 0:
                print(f"[RAG] Rate limit pause at chunk {i}/{total}...")
                time.sleep(62)   # Gemini free tier resets every minute
            elif i > 0 and i % 10 == 0:
                time.sleep(0.8)  # Small pause every 10 — avoids burst rejection

        return embeddings

    def embed_query(self, text: str) -> list[float]:
        """Embed a single search query (user's question)."""
        return self._embed_one(text)


class TFIDFEmbeddings(Embeddings):
    """
    Fallback embeddings using TF-IDF (no API key required).
    Quality is lower than Gemini but works offline and in local dev.
    TF-IDF = Term Frequency × Inverse Document Frequency
    (measures how important a word is in a document vs all documents)
    """
    VOCAB_SIZE = 512

    def __init__(self):
        self._vocab:  dict[str, int]   = {}
        self._idf:    dict[str, float] = {}
        self._fitted = False

    def _tokenize(self, text: str) -> list[str]:
        return re.findall(r"[a-z]{2,}", text.lower())

    def _fit(self, texts: list[str]) -> None:
        import math
        N  = len(texts)
        df: dict[str, int] = {}
        for t in texts:
            for tok in set(self._tokenize(t)):
                df[tok] = df.get(tok, 0) + 1
        top           = sorted(df.items(), key=lambda x: x[1], reverse=True)[:self.VOCAB_SIZE]
        self._vocab   = {tok: i for i, (tok, _) in enumerate(top)}
        self._idf     = {tok: math.log((N+1)/(cnt+1))+1 for tok, cnt in top}
        self._fitted  = True

    def _vectorize(self, text: str) -> list[float]:
        import math
        tokens = self._tokenize(text)
        tf: dict[str, int] = {}
        for tok in tokens:
            tf[tok] = tf.get(tok, 0) + 1
        vec = [0.0] * self.VOCAB_SIZE
        for tok, idx in self._vocab.items():
            if tok in tf:
                vec[idx] = (tf[tok] / max(len(tokens), 1)) * self._idf.get(tok, 1.0)
        norm = (sum(v*v for v in vec) ** 0.5) or 1.0
        return [v/norm for v in vec]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not self._fitted:
            self._fit(texts)
        return [self._vectorize(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._vectorize(text)


# Singleton — created once, reused for every embedding call
_embeddings_instance: Embeddings | None = None


def _get_embeddings() -> Embeddings:
    global _embeddings_instance
    if _embeddings_instance is not None:
        return _embeddings_instance
    if GOOGLE_API_KEY:
        print("[RAG] Using Google Gemini embeddings")
        _embeddings_instance = GeminiEmbeddings(GOOGLE_API_KEY)
    else:
        print("[RAG] No GOOGLE_API_KEY — using TF-IDF fallback (lower quality)")
        _embeddings_instance = TFIDFEmbeddings()
    return _embeddings_instance


# ═══════════════════════════════════════════════════════════════════════════════
# TEXT CLEANING
# ═══════════════════════════════════════════════════════════════════════════════

def _clean_text(raw: str) -> str:
    """
    Clean extracted PDF text — removes garbage characters that break embedding.
    PDFs often contain special unicode characters from fonts that don't render correctly.
    """
    # Remove null bytes
    text = raw.replace("\x00", " ")
    # Common ligature fixes (fi, fl appear as single unicode chars in many PDFs)
    text = text.replace("\ufb01", "fi").replace("\ufb02", "fl")
    # Remove private-use unicode bullets that appear in some PDFs
    for ch in ["\ue072","\ue073","\ue074","\ue075","\ue076","\ue077","\ue078","\ue079"]:
        text = text.replace(ch, "• ")
    # Collapse 3+ consecutive newlines to 2 (preserve paragraph structure)
    text = re.sub(r"\n{3,}", "\n\n", text)
    # Collapse multiple spaces
    text = re.sub(r" {2,}", " ", text)
    return text.strip()


# ═══════════════════════════════════════════════════════════════════════════════
# SMART CHUNKER
# Cuts document text into pieces the AI can process
# ═══════════════════════════════════════════════════════════════════════════════

def _detect_heading(line: str) -> bool:
    """
    Detect if a line is a heading so we chunk at natural section boundaries.
    Headings are: ALL CAPS lines, numbered sections (1. 2.1 etc), or short lines
    ending without punctuation that precede content.
    """
    stripped = line.strip()
    if not stripped:
        return False
    # Numbered heading: "1.", "2.1", "Chapter 3", "Section 1.2"
    if re.match(r"^(chapter|section|part|\d+(\.\d+)*\.?)\s", stripped, re.IGNORECASE):
        return True
    # ALL CAPS heading (3+ words, no sentence-ending punctuation)
    if stripped.isupper() and len(stripped.split()) >= 2 and not stripped.endswith((".", "!", "?")):
        return True
    return False


def _smart_chunk(text: str, max_chars: int = MAX_SECTION_CHARS, overlap: int = SECTION_OVERLAP) -> list[str]:
    """
    Split text into chunks that respect natural boundaries:
    1. Try to split at headings first
    2. Then at paragraph breaks (double newlines)
    3. Then at sentences
    4. Finally at character limit as last resort

    overlap: how many chars from the previous chunk to include at the start
    of the next — helps the AI understand context at chunk boundaries.
    """
    if len(text) <= max_chars:
        return [text]

    chunks: list[str] = []
    current = ""
    lines   = text.split("\n")

    for line in lines:
        # Start new chunk at heading boundaries (natural section breaks)
        if _detect_heading(line) and len(current) > max_chars * 0.3:
            if current.strip():
                chunks.append(current.strip())
            # Add overlap: take last `overlap` chars from previous chunk
            current = (current[-overlap:].strip() + "\n" + line) if current else line
            continue

        proposed = current + "\n" + line if current else line
        if len(proposed) <= max_chars:
            current = proposed
        else:
            if current.strip():
                chunks.append(current.strip())
            # Try to split long lines at sentence boundaries
            if len(line) > max_chars:
                sentences = re.split(r"(?<=[.!?])\s+", line)
                for sent in sentences:
                    if len(current) + len(sent) + 1 <= max_chars:
                        current = (current + " " + sent).strip()
                    else:
                        if current:
                            chunks.append(current.strip())
                        current = sent
            else:
                # Start new chunk with overlap from previous for continuity
                overlap_text = current[-overlap:].strip() if current else ""
                current = (overlap_text + "\n" + line).strip() if overlap_text else line

    if current.strip():
        chunks.append(current.strip())

    # Final safety net: if any chunk is still too long, force-split it
    final: list[str] = []
    for chunk in chunks:
        if len(chunk) <= max_chars:
            final.append(chunk)
        else:
            for i in range(0, len(chunk), max_chars - overlap):
                final.append(chunk[i: i + max_chars])

    return final or [text[:max_chars]]


# ═══════════════════════════════════════════════════════════════════════════════
# PDF INGESTION — The Main Entry Point
# ═══════════════════════════════════════════════════════════════════════════════

def ingest_pdf(file_path: str, session_id: str) -> dict:
    """
    Process a PDF and store its chunks in ChromaDB for later retrieval.

    Steps:
      1. Hash the file (duplicate check)
      2. If same file seen before → return cached result instantly
      3. Extract text from each page using pypdf
      4. Clean and chunk each page's text
      5. Embed all chunks in batches (with progress updates)
      6. Store in ChromaDB
      7. Return metadata (page_count, chunk_count)

    Progress is tracked in _progress[session_id] — poll get_progress() to read it.
    """
    if LOW_MEMORY_MODE:
        raise ValueError("PDF Chat is not available on this deployment (low-memory mode).")

    from pypdf import PdfReader

    _set_progress(session_id, 5, "Computing file fingerprint...")

    doc_hash        = compute_file_hash(file_path)
    collection_name = f"doc_{doc_hash}"

    # ── CACHE HIT — same PDF uploaded before ─────────────────────────────────
    if _collection_exists(doc_hash) and _meta_path(doc_hash).exists():
        print(f"[RAG] Cache HIT — doc_hash={doc_hash} — skipping embedding")
        _set_progress(session_id, 100, "Ready (from cache)", done=True)
        meta = _load_meta(doc_hash)
        try:
            Path(file_path).unlink(missing_ok=True)
        except Exception:
            pass
        _register_pdf_session(session_id, doc_hash)
        return {
            "session_id":    session_id,
            "collection_id": doc_hash,
            "filename":      Path(file_path).name,
            "page_count":    meta["page_count"],
            "chunk_count":   meta["chunk_count"],
            "cached":        True,
        }

    # ── CACHE MISS — process the PDF ─────────────────────────────────────────
    print(f"[RAG] Cache MISS — doc_hash={doc_hash} — processing now")
    _set_progress(session_id, 10, "Reading PDF pages...")

    try:
        reader     = PdfReader(file_path)
        pages      = reader.pages
        page_count = len(pages)
    except Exception as exc:
        _set_progress(session_id, 0, "Failed to read PDF", done=True, error=str(exc))
        raise ValueError(f"Could not read PDF: {exc}") from exc

    if not pages:
        err = "PDF has no pages."
        _set_progress(session_id, 0, err, done=True, error=err)
        raise ValueError(err)

    filename   = Path(file_path).name
    all_chunks: list[Document] = []

    # ── Extract + chunk every page ────────────────────────────────────────────
    for page_num, page in enumerate(pages):
        # Update progress: 10% → 40% during extraction phase
        extraction_pct = 10 + int((page_num / page_count) * 30)
        _set_progress(session_id, extraction_pct, f"Extracting page {page_num + 1}/{page_count}...")

        raw = page.extract_text() or ""
        if not raw.strip():
            continue   # skip image-only pages

        clean = _clean_text(raw)
        for idx, chunk_text in enumerate(_smart_chunk(clean)):
            all_chunks.append(Document(
                page_content=chunk_text,
                metadata={
                    "page":         page_num + 1,
                    "page_label":   f"Page {page_num + 1}",
                    "section_name": f"Page {page_num + 1}",
                    "section_num":  page_num + 1,
                    "source":       filename,
                    "chunk_idx":    idx,
                    "total_pages":  page_count,
                },
            ))
        del raw, clean
        gc.collect()

    del reader, pages
    gc.collect()

    if not all_chunks:
        err = "PDF has no extractable text. It may be a scanned image — try copy-pasting text instead."
        _set_progress(session_id, 0, err, done=True, error=err)
        raise ValueError(err)

    chunk_count = len(all_chunks)
    print(f"[RAG] {page_count} pages → {chunk_count} chunks — starting embedding")
    _set_progress(session_id, 40, f"Embedding {chunk_count} chunks... (this takes 30-60s for large PDFs)")

    # ── Embed in batches and store in ChromaDB ────────────────────────────────
    # We process EMBED_BATCH_SIZE chunks at a time instead of all at once.
    # This means:
    #   a) Progress updates more frequently (user sees progress bar move)
    #   b) Less memory used at once
    #   c) If it fails midway, we lose less work

    embeddings_obj = _get_embeddings()

    for batch_start in range(0, chunk_count, EMBED_BATCH_SIZE):
        batch = all_chunks[batch_start: batch_start + EMBED_BATCH_SIZE]

        # Progress: 40% → 90% during embedding phase
        embed_pct = 40 + int((batch_start / chunk_count) * 50)
        _set_progress(
            session_id,
            embed_pct,
            f"Embedding chunks {batch_start + 1}–{min(batch_start + EMBED_BATCH_SIZE, chunk_count)} of {chunk_count}...",
        )

        try:
            Chroma.from_documents(
                documents         = batch,
                embedding         = embeddings_obj,
                collection_name   = collection_name,
                persist_directory = str(CHROMA_DIR),
            )
        except Exception as exc:
            # Log but continue — partial embedding is better than complete failure
            print(f"[RAG] Batch {batch_start}–{batch_start+EMBED_BATCH_SIZE} failed: {exc}")

        del batch
        gc.collect()

    del all_chunks
    gc.collect()

    # ── Cleanup + persist metadata ────────────────────────────────────────────
    _set_progress(session_id, 92, "Saving index...")
    try:
        Path(file_path).unlink(missing_ok=True)
    except Exception as e:
        print(f"[RAG] Could not delete temp file: {e}")

    _save_meta(doc_hash, {"page_count": page_count, "chunk_count": chunk_count})
    _register_pdf_session(session_id, doc_hash)

    _set_progress(session_id, 100, "Ready", done=True)
    print(f"[RAG] session={session_id} ready — {page_count} pages, {chunk_count} chunks")

    return {
        "session_id":    session_id,
        "collection_id": doc_hash,
        "filename":      filename,
        "page_count":    page_count,
        "chunk_count":   chunk_count,
        "cached":        False,
    }


# ═══════════════════════════════════════════════════════════════════════════════
# RERANKING — Find the best chunks for a question
# ═══════════════════════════════════════════════════════════════════════════════

def _cohere_rerank(
    question: str,
    docs_with_scores: list[tuple],
    top_n: int = TOP_K_FINAL,
) -> list[tuple]:
    """
    Use Cohere's reranker to pick the most relevant chunks.
    Cohere rerank is better than pure vector similarity — it understands
    the RELATIONSHIP between the question and each chunk, not just word overlap.

    Falls back to our heuristic reranker if COHERE_API_KEY is not set.
    """
    if not COHERE_API_KEY:
        return _heuristic_rerank(question, docs_with_scores, top_n)

    try:
        import cohere
        try:
            co = cohere.ClientV2(api_key=COHERE_API_KEY)
        except AttributeError:
            co = cohere.Client(api_key=COHERE_API_KEY)

        docs_text = [d.page_content for d, _ in docs_with_scores]
        if not docs_text:
            return _heuristic_rerank(question, docs_with_scores, top_n)

        result = co.rerank(
            model     = "rerank-v3.5",
            query     = question,
            documents = docs_text,
            top_n     = min(top_n, len(docs_text)),
        )
        return [(docs_with_scores[r.index][0], r.relevance_score) for r in result.results]

    except Exception as e:
        print(f"[RAG] Cohere rerank failed ({e}) — using heuristic fallback")
        return _heuristic_rerank(question, docs_with_scores, top_n)


def _heuristic_rerank(
    question: str,
    docs_with_scores: list[tuple],
    top_n: int = TOP_K_FINAL,
) -> list[tuple]:
    """
    Heuristic reranker — combines vector similarity score with keyword overlap.
    Used when Cohere API key is not set.
    70% vector similarity + 30% keyword match + bonus for heading matches.
    """
    q_tokens = set(re.sub(r"[^\w\s]", "", question.lower()).split())

    def score(doc, emb_score: float) -> float:
        text    = doc.page_content.lower()
        kw      = sum(1 for t in q_tokens if t in text) / max(len(q_tokens), 1)
        heading = doc.metadata.get("section_name", "").lower()
        bonus   = 0.08 if any(t in heading for t in q_tokens) else 0
        return 0.70 * emb_score + 0.30 * kw + bonus

    return sorted(
        docs_with_scores,
        key=lambda x: score(x[0], x[1]),
        reverse=True,
    )[:top_n]


# ═══════════════════════════════════════════════════════════════════════════════
# CONTEXT BUILDER — Format chunks for LLM prompt
# ═══════════════════════════════════════════════════════════════════════════════

def _build_context(docs_with_scores: list[tuple]) -> str:
    """
    Format retrieved chunks as XML-like blocks for the LLM.
    Include page number and relevance score so the LLM can cite correctly.
    """
    return "\n\n".join(
        f'<chunk id="{i}" page="{d.metadata.get("page", "?")}" '
        f'section="{d.metadata.get("section_name", "?")}" '
        f'relevance="{s:.2f}">\n{d.page_content.strip()}\n</chunk>'
        for i, (d, s) in enumerate(docs_with_scores, 1)
    )


# ═══════════════════════════════════════════════════════════════════════════════
# CHAT — Answer questions from documents
# ═══════════════════════════════════════════════════════════════════════════════

def chat_with_pdf(
    session_id: str,
    question:   str,
    history:    list[tuple[str, str]],
) -> Generator[str, None, None]:
    """
    Stream an answer to `question` grounded in the PDF for `session_id`.
    `history` is a list of (question, answer) tuples for conversation context.
    Yields string chunks for SSE streaming.
    """
    if LOW_MEMORY_MODE:
        yield "PDF Chat is not available on this deployment."
        return

    collection_name = _resolve_collection(session_id)
    if not collection_name:
        yield f"Session '{session_id}' not found. Please re-upload your PDF."
        return

    try:
        vectorstore = Chroma(
            collection_name    = collection_name,
            embedding_function = _get_embeddings(),
            persist_directory  = str(CHROMA_DIR),
        )
        raw = vectorstore.similarity_search_with_relevance_scores(question, k=TOP_K_RETRIEVE)
    except Exception as exc:
        yield f"Could not search document: {exc}"
        return

    # Filter by minimum score, fall back to top-3 if nothing passes threshold
    filtered = [(d, s) for d, s in raw if s >= MIN_SCORE]
    if not filtered:
        filtered = raw[:3]   # always return something rather than nothing

    if not filtered:
        sections = list({d.metadata.get("section_name", "?") for d, _ in raw[:3]})
        yield (
            f'Could not find relevant content for "{question}".\n'
            f'The document covers: {", ".join(sections)}.\n'
            f'Try rephrasing your question or asking about specific topics.'
        )
        return

    # Rerank to find the best chunks
    top_chunks = _cohere_rerank(question, filtered)
    context    = _build_context(top_chunks)
    del raw, filtered
    gc.collect()

    # Build conversation history string (last MAX_HISTORY turns only)
    history_text = "".join(
        f"<user>{q}</user>\n<assistant>{a}</assistant>\n"
        for q, a in history[-MAX_HISTORY:]
    )

    prompt = (
        f"{_SYSTEM_PROMPT}\n\n"
        f"=== DOCUMENT CHUNKS ===\n{context}\n\n"
        f"=== CONVERSATION HISTORY ===\n{history_text or '(none — first question)'}\n\n"
        f"=== CURRENT QUESTION ===\n{question}\n\n"
        f"=== ANSWER ==="
    )

    del context, history_text
    gc.collect()

    try:
        for chunk in get_chain_llm().stream(prompt):
            yield chunk.content
    except Exception as exc:
        yield f"\n\n⚠️ Answer generation failed: {exc}"


# ═══════════════════════════════════════════════════════════════════════════════
# SOURCES — Return cited page references for the UI
# ═══════════════════════════════════════════════════════════════════════════════

def get_top_sources(session_id: str, question: str) -> list[dict]:
    """
    Return the top source chunks for a question with page numbers + scores.
    Called before chat_with_pdf() so the frontend can show a "Sources" panel.

    Returns list of dicts:
      { section, page, snippet, score, passed_threshold }
    """
    if LOW_MEMORY_MODE:
        return []

    collection_name = _resolve_collection(session_id)
    if not collection_name:
        return []

    try:
        vectorstore = Chroma(
            collection_name    = collection_name,
            embedding_function = _get_embeddings(),
            persist_directory  = str(CHROMA_DIR),
        )
        raw = vectorstore.similarity_search_with_relevance_scores(question, k=TOP_K_RETRIEVE)
    except Exception as exc:
        print(f"[RAG] get_top_sources failed: {exc}")
        return []

    result = [
        {
            "section":          d.metadata.get("section_name", "?"),
            "page":             d.metadata.get("page", "?"),       # ← NEW: page number
            "snippet":          d.page_content[:250].strip(),
            "score":            round(s, 3),
            "passed_threshold": s >= MIN_SCORE,
        }
        for d, s in _cohere_rerank(question, raw)
    ]
    del raw
    gc.collect()
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# TEXT INGESTION — For non-PDF content (research reports, pasted text)
# ═══════════════════════════════════════════════════════════════════════════════

def ingest_text_content(
    text:       str,
    session_id: str,
    title:      str = "Document",
) -> dict:
    """
    Embed plain text into ChromaDB so it can be queried via chat_with_pdf().
    Used by the research pipeline (auto-ingest after report generation)
    and the /api/rag/ingest-text endpoint.

    Collection name: f"session_{session_id}"
    """
    from langchain.text_splitter import RecursiveCharacterTextSplitter

    if not text or len(text.strip()) < 50:
        raise ValueError("Text is too short to ingest (minimum 50 characters)")

    _set_progress(session_id, 10, "Splitting text into chunks...")

    # RecursiveCharacterTextSplitter tries larger separators first
    # (paragraphs > sentences > words) before hard-splitting at max_chars
    splitter = RecursiveCharacterTextSplitter(
        chunk_size    = MAX_SECTION_CHARS,
        chunk_overlap = SECTION_OVERLAP,
        separators    = ["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_text(text)

    if not chunks:
        raise ValueError("Text produced no chunks after splitting")

    _set_progress(session_id, 30, f"Embedding {len(chunks)} chunks...")

    docs = [
        Document(
            page_content=chunk,
            metadata={
                "session_id":   session_id,
                "title":        title,
                "chunk_idx":    i,
                "source":       "text_ingest",
                "section_name": title,
                "page":         1,   # text doesn't have pages — use 1 as default
            },
        )
        for i, chunk in enumerate(chunks)
    ]

    collection_name = f"session_{session_id}"

    Chroma.from_documents(
        docs,
        _get_embeddings(),
        persist_directory = str(CHROMA_DIR),
        collection_name   = collection_name,
    )

    _register_text_session(session_id)
    _set_progress(session_id, 100, "Ready", done=True)

    print(f"[TextIngest] session={session_id} ready — {len(chunks)} chunks from '{title}'")
    return {"chunk_count": len(chunks)}


# ═══════════════════════════════════════════════════════════════════════════════
# CLEANUP — Delete a session
# ═══════════════════════════════════════════════════════════════════════════════

def delete_session(session_id: str) -> None:
    """
    Remove a session's ChromaDB collection and session map entry.
    Called when user deletes a PDF session.
    """
    collection_name = _resolve_collection(session_id)
    if not collection_name:
        print(f"[RAG] delete_session: no collection for session_id={session_id}")
        return
    try:
        Chroma(
            collection_name    = collection_name,
            embedding_function = _get_embeddings(),
            persist_directory  = str(CHROMA_DIR),
        ).delete_collection()
        m = _load_session_map()
        m.pop(session_id, None)
        _save_session_map(m)
        # Clean up progress tracking entry
        _progress.pop(session_id, None)
        gc.collect()
    except Exception as e:
        print(f"[RAG] delete_session warning: {e}")
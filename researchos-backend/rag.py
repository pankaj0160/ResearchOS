"""
rag.py — Zero-RAM RAG using google-generativeai SDK.

Root cause of all 404 errors:
  Hardcoding model names + REST calls = breaks when Google changes availability.
  Fix: use google-generativeai SDK which auto-resolves the correct endpoint.

pip install google-generativeai
"""

from __future__ import annotations

import gc
import json
import hashlib
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

# ── Config ────────────────────────────────────────────────────────────────────

CHROMA_DIR        = Path(__file__).parent / "chroma_store"
MAX_SECTION_CHARS = 1000
SECTION_OVERLAP   = 100
TOP_K_RETRIEVE    = 20
TOP_K_FINAL       = 5
MIN_SCORE         = 0.25
MAX_HISTORY       = 3

CHROMA_DIR.mkdir(exist_ok=True)



def compute_file_hash(file_path: str) -> str:
    """SHA256 fingerprint of a file's contents — used to detect duplicate uploads."""
    h = hashlib.sha256()
    with open(file_path, "rb") as f:
        for block in iter(lambda: f.read(8192), b""):
            h.update(block)
    return h.hexdigest()[:16]


def _meta_path(doc_hash: str) -> Path:
    return CHROMA_DIR / f"{doc_hash}.json"


def _save_meta(doc_hash: str, meta: dict) -> None:
    _meta_path(doc_hash).write_text(json.dumps(meta))


def _load_meta(doc_hash: str) -> dict:
    return json.loads(_meta_path(doc_hash).read_text())


def _collection_exists(doc_hash: str) -> bool:
    import chromadb
    client = chromadb.PersistentClient(path=str(CHROMA_DIR))
    cols = client.list_collections()
    names = [c.name if hasattr(c, "name") else c for c in cols]
    return f"doc_{doc_hash}" in names


_SYSTEM_PROMPT = """You are a precise document assistant.
Answer ONLY from the document chunks provided. Never use outside knowledge.

RULES:
1. Cite every claim inline as [Chunk N].
2. Use ALL relevant chunks — do not stop after the first one.
3. If the answer is not in the chunks, say: "This is not in the document."
4. Never invent information.

FORMATTING (use Markdown):
- If the answer is a list of items (problems, findings, dates, steps, names, etc.),
  format it as a Markdown bulleted or numbered list — ONE ITEM PER LINE.
  Do NOT cram a list into a single paragraph separated by commas.
- If the answer covers multiple distinct topics or sections, use ## headings
  to separate them.
- Use **bold** for key terms, names, or numbers worth highlighting.
- Keep paragraphs short — 2 to 4 sentences max.
- End with a line: Sources: Chunk N (section: X), Chunk M (section: Y)
"""

# ══════════════════════════════════════════════════════════════════════════════
# EMBEDDING — uses official SDK, no manual URL/model guessing
# ══════════════════════════════════════════════════════════════════════════════

class GeminiEmbeddings(Embeddings):
    """
    Uses google-generativeai SDK — no hardcoded URLs, no model guessing.
    SDK auto-picks the correct endpoint for your key type.

    Install: pip install google-generativeai
    Key:     https://aistudio.google.com/app/apikey
    """

    # Models to try in order — SDK resolves the correct endpoint for each
    _MODELS = [
        "models/gemini-embedding-001",
        "models/gemini-embedding-2",
        "models/gemini-embedding-2-preview",
    ]

    def __init__(self, api_key: str):
        self.api_key     = api_key
        self._model_name = None   # resolved on first call
        self._client     = None

    def _get_client(self):
        if self._client is None:
            try:
                from google import genai
                from google.genai import types
            except ImportError:
                raise RuntimeError(
                    "google-genai not installed. "
                    "Run: pip install google-genai"
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
            print(f"[RAG] Available embedding models: {available}")
        except Exception as e:
            print(f"[RAG] Could not list models ({e}), using defaults.")
            available = self._MODELS

        for preferred in self._MODELS:
            if preferred in available:
                self._model_name = preferred
                print(f"[RAG] Using embedding model: {preferred}")
                return self._model_name

        if available:
            self._model_name = available[0]
            print(f"[RAG] Using first available: {self._model_name}")
            return self._model_name

        # Hardcode best known working model as last resort
        self._model_name = "models/gemini-embedding-001"
        return self._model_name

    def _embed_one(self, text: str) -> list[float]:
        client = self._get_client()
        model  = self._resolve_model()

        max_retries = 4
        for attempt in range(max_retries):
            try:
                result = client.models.embed_content(
                    model    = model,
                    contents = text[:8000],
                )
                return result.embeddings[0].values
            except Exception as e:
                if attempt == max_retries - 1:
                    # Out of retries — let the caller (ingest_pdf) handle this
                    raise
                wait = 2 ** attempt  # 1s, 2s, 4s, 8s
                print(f"[RAG] Embedding call failed (attempt {attempt+1}/{max_retries}): {e}. Retrying in {wait}s...")
                time.sleep(wait)

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        embeddings = []
        for i, text in enumerate(texts):
            embeddings.append(self._embed_one(text))
            # Free tier: 100 requests/min — pace at ~80/min to be safe
            if i > 0 and i % 80 == 0:
                print(f"[RAG] Rate limit pause at chunk {i}...")
                time.sleep(62)
            elif i > 0 and i % 10 == 0:
                time.sleep(0.8)
        return embeddings

    def embed_query(self, text: str) -> list[float]:
        return self._embed_one(text)


class TFIDFEmbeddings(Embeddings):
    """
    Pure Python fallback — zero dependencies, zero RAM.
    Used when GOOGLE_API_KEY is not set.
    Lower quality but never crashes.
    """

    VOCAB_SIZE = 512

    def __init__(self):
        self._vocab:   dict[str, int]   = {}
        self._idf:     dict[str, float] = {}
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
        top = sorted(df.items(), key=lambda x: x[1], reverse=True)[:self.VOCAB_SIZE]
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
        norm = math.sqrt(sum(v*v for v in vec)) or 1.0
        return [v/norm for v in vec]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not self._fitted:
            self._fit(texts)
        return [self._vectorize(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._vectorize(text)


# ── Singleton ─────────────────────────────────────────────────────────────────

_embeddings_instance: Embeddings | None = None

def _get_embeddings() -> Embeddings:
    global _embeddings_instance
    if _embeddings_instance is not None:
        return _embeddings_instance

    if GOOGLE_API_KEY:
        print("[RAG] Using Google Gemini embeddings (0MB RAM)")
        _embeddings_instance = GeminiEmbeddings(GOOGLE_API_KEY)
    else:
        print("[RAG] No GOOGLE_API_KEY — using TF-IDF fallback")
        _embeddings_instance = TFIDFEmbeddings()

    return _embeddings_instance


# ── Text cleaning ─────────────────────────────────────────────────────────────

def _clean_text(raw: str) -> str:
    text = raw.replace("\x00", "]")
    text = text.replace("\ufb01", "fi").replace("\ufb02", "fl")
    for ch in ["\ue072","\ue073","\ue074","\ue075","\ue076","\ue077","\ue078","\ue079"]:
        text = text.replace(ch, "•")
    return re.sub(r"\n{3,}", "\n\n", text).strip()


# ── Chunker ───────────────────────────────────────────────────────────────────

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
    return chunks or [text]


# ── Ingestion ─────────────────────────────────────────────────────────────────

def ingest_pdf(file_path: str, session_id: str) -> dict:
    if LOW_MEMORY_MODE:
        raise ValueError("PDF Chat is currently unavailable on this deployment.")

    from pypdf import PdfReader

    doc_hash = compute_file_hash(file_path)
    collection_name = f"doc_{doc_hash}"

    if _collection_exists(doc_hash) and _meta_path(doc_hash).exists():
        print(f"[RAG] Cache HIT — doc_hash={doc_hash}, skipping embedding")
        meta = _load_meta(doc_hash)
        try:
            Path(file_path).unlink(missing_ok=True)
        except Exception:
            pass
        return {
            "session_id":    session_id,
            "collection_id": doc_hash,
            "filename":      Path(file_path).name,
            "page_count":    meta["page_count"],
            "chunk_count":   meta["chunk_count"],
            "cached":        True,
        }

    print(f"[RAG] Cache MISS — doc_hash={doc_hash}, embedding now")

    reader     = PdfReader(file_path)
    pages      = reader.pages
    page_count = len(pages)

    if not pages:
        raise ValueError("PDF has no pages.")

    filename   = Path(file_path).name
    all_chunks: list[Document] = []

    for page_num, page in enumerate(pages):
        raw = page.extract_text() or ""
        if not raw.strip():
            continue
        clean = _clean_text(raw)
        for idx, chunk_text in enumerate(_sub_chunk(clean, MAX_SECTION_CHARS, SECTION_OVERLAP)):
            all_chunks.append(Document(
                page_content = chunk_text,
                metadata     = {
                    "page":         page_num + 1,
                    "section_name": f"Page {page_num + 1}",
                    "section_num":  page_num + 1,
                    "source":       filename,
                    "chunk_idx":    idx,
                },
            ))
        del raw, clean
        gc.collect()

    del reader, pages
    gc.collect()

    if not all_chunks:
        raise ValueError("PDF has no extractable text. May be scanned/image-only.")

    BATCH_SIZE = 20
    for i in range(0, len(all_chunks), BATCH_SIZE):
        batch = all_chunks[i: i + BATCH_SIZE]
        Chroma.from_documents(
            documents         = batch,
            embedding         = _get_embeddings(),
            collection_name   = collection_name,
            persist_directory = str(CHROMA_DIR),
        )
        del batch
        gc.collect()

    chunk_count = len(all_chunks)
    del all_chunks
    gc.collect()

    try:
        Path(file_path).unlink(missing_ok=True)
    except Exception as e:
        print(f"[RAG] Could not delete temp file: {e}")


    _save_meta(doc_hash, {"page_count": page_count, "chunk_count": chunk_count})

    return {
        "session_id":    session_id,
        "collection_id": doc_hash,
        "filename":      filename,
        "page_count":    page_count,
        "chunk_count":   chunk_count,
        "cached":        False,
    }


# ── Reranker ──────────────────────────────────────────────────────────────────


COHERE_API_KEY = os.getenv("COHERE_API_KEY", "")

def _cohere_rerank(question: str, docs_with_scores: list[tuple], top_n: int = TOP_K_FINAL) -> list[tuple]:
    """Rerank candidate chunks using Cohere's cross-encoder rerank API.
    Falls back to the heuristic _rerank() if Cohere is unavailable or errors."""
    if not COHERE_API_KEY:
        print("[RAG] No COHERE_API_KEY — using heuristic reranker")
        return _rerank(question, docs_with_scores, top_n)

    try:
        import cohere
        co = cohere.ClientV2(api_key=COHERE_API_KEY)

        docs_text = [d.page_content for d, _ in docs_with_scores]

        result = co.rerank(
            model="rerank-v3.5",
            query=question,
            documents=docs_text,
            top_n=top_n,
        )

        reranked = [
            (docs_with_scores[r.index][0], r.relevance_score)
            for r in result.results
        ]
        return reranked

    except Exception as e:
        print(f"[RAG] Cohere rerank failed ({e}) — falling back to heuristic")
        return _rerank(question, docs_with_scores, top_n)


def _rerank(question: str, docs_with_scores: list[tuple], top_n: int = TOP_K_FINAL) -> list[tuple]:
    q_tokens = set(re.sub(r"[^\w\s]", "", question.lower()).split())
    def _score(doc, emb: float) -> float:
        text  = doc.page_content.lower()
        kw    = sum(1 for t in q_tokens if t in text) / max(len(q_tokens), 1)
        bonus = 0.08 if any(t in doc.metadata.get("section_name","").lower() for t in q_tokens) else 0
        return 0.70 * emb + 0.30 * kw + bonus
    return sorted(docs_with_scores, key=lambda x: _score(x[0], x[1]), reverse=True)[:top_n]


# ── Context builder ───────────────────────────────────────────────────────────

def _build_context(docs_with_scores: list[tuple]) -> str:
    return "\n\n".join(
        f'<chunk id="{i}" section="{d.metadata.get("section_name","?")}" relevance="{s:.2f}">\n{d.page_content.strip()}\n</chunk>'
        for i, (d, s) in enumerate(docs_with_scores, 1)
    )


# ── Chat ──────────────────────────────────────────────────────────────────────

def chat_with_pdf(session_id: str, question: str, history: list[tuple[str, str]]) -> Generator[str, None, None]:
    if LOW_MEMORY_MODE:
        yield "PDF Chat is currently unavailable on this deployment."
        return

    vectorstore = Chroma(
        collection_name    = f"doc_{session_id}",
        embedding_function = _get_embeddings(),
        persist_directory  = str(CHROMA_DIR),
    )

    raw      = vectorstore.similarity_search_with_relevance_scores(question, k=TOP_K_RETRIEVE)
    filtered = [(d, s) for d, s in raw if s >= MIN_SCORE] or [(d, s) for d, s in raw if s >= 0.15]

    if not filtered:
        sections = list({d.metadata.get("section_name","?") for d,_ in raw[:3]})
        yield f'Could not find content for "{question}".\nDocument covers: {", ".join(sections)}.'
        return

    context = _build_context(_cohere_rerank(question, filtered))
    del raw, filtered
    gc.collect()

    history_text = "".join(f"<user>{q}</user>\n<assistant>{a}</assistant>\n" for q, a in history[-MAX_HISTORY:])
    prompt = f"{_SYSTEM_PROMPT}\n\n=== CHUNKS ===\n{context}\n\n=== HISTORY ===\n{history_text or '(none)'}\n\n=== QUESTION ===\n{question}\n\n=== ANSWER ==="

    del context, history_text
    gc.collect()

    for chunk in get_chain_llm().stream(prompt):
        yield chunk.content


# ── Sources ───────────────────────────────────────────────────────────────────

def get_top_sources(session_id: str, question: str) -> list[dict]:
    if LOW_MEMORY_MODE:
        return []
    vectorstore = Chroma(
        collection_name    = f"doc_{session_id}",
        embedding_function = _get_embeddings(),
        persist_directory  = str(CHROMA_DIR),
    )
    raw      = vectorstore.similarity_search_with_relevance_scores(question, k=TOP_K_RETRIEVE)
    result   = [
        {"section": d.metadata.get("section_name","?"), "snippet": d.page_content[:200].strip(), "score": round(s,3), "passed_threshold": s >= MIN_SCORE}
        for d, s in _cohere_rerank(question, raw)
    ]
    del raw
    gc.collect()
    return result


# ── Cleanup ───────────────────────────────────────────────────────────────────

def delete_session(session_id: str) -> None:
    try:
        Chroma(
            collection_name    = f"doc_{session_id}",
            embedding_function = _get_embeddings(),
            persist_directory  = str(CHROMA_DIR),
        ).delete_collection()
        gc.collect()
    except Exception as e:
        print(f"[RAG] cleanup warning: {e}")
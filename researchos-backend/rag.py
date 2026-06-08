"""
rag.py — Zero-RAM RAG for Render free tier.

WHY LOCAL MODELS ALWAYS OOM ON RENDER FREE:
  Render free = 512MB RAM hard limit
  all-MiniLM-L6-v2  = 90MB model weights
  + PyTorch runtime  = 200MB
  + FastAPI baseline = 100MB
  + ChromaDB         = 50MB
  + PDF processing   = 30MB
  = 470MB before a single request → OOM on any traffic spike

THE ONLY REAL FIX:
  Use API-based embeddings → 0MB RAM for model weights
  Google Gemini embeddings → free tier (1500 req/day), no local model

MEMORY BUDGET WITH THIS FILE:
  Google API call    =  0MB  (HTTP request only)
  ChromaDB on disk   = 30MB
  PDF page-by-page   =  5MB
  FastAPI baseline   = 100MB
  ─────────────────────────
  Total              = ~135MB  ✓ fits easily in 512MB
"""

from __future__ import annotations

import gc
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

LOW_MEMORY_MODE  = os.getenv("RENDER_LOW_MEMORY", "false").lower() == "true"
GOOGLE_API_KEY   = os.getenv("GOOGLE_API_KEY", "")
OPENAI_API_KEY   = os.getenv("OPENAI_API_KEY", "")

# ── Config ────────────────────────────────────────────────────────────────────

CHROMA_DIR        = Path(__file__).parent / "chroma_store"
MAX_SECTION_CHARS = 1000
SECTION_OVERLAP   = 100
TOP_K_RETRIEVE    = 8
TOP_K_FINAL       = 4
MIN_SCORE         = 0.25
MAX_HISTORY       = 3

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


# ══════════════════════════════════════════════════════════════════════════════
# EMBEDDING PROVIDERS — zero local RAM, pure API calls
# Priority: Google Gemini (free) → OpenAI → TF-IDF fallback (truly zero dep)
# ══════════════════════════════════════════════════════════════════════════════

class GeminiEmbeddings(Embeddings):
    """
    Google Gemini embeddings via REST API.
    Uses embedContent (single) endpoint — works on all free tier keys.
    Free tier: 1500 requests/day, 100 requests/minute.
    Get key: https://aistudio.google.com/app/apikey (no credit card)
    """

    def __init__(self, api_key: str):
        self.api_key  = api_key
        self.model    = "text-embedding-004"
        self.base_url = "https://generativelanguage.googleapis.com/v1beta/models"

    def _embed_one(self, text: str) -> list[float]:
        import urllib.request, json as _json, urllib.error

        url     = f"{self.base_url}/{self.model}:embedContent?key={self.api_key}"
        payload = _json.dumps({
            "model":   f"models/{self.model}",
            "content": {"parts": [{"text": text[:8000]}]},
        }).encode()

        req = urllib.request.Request(
            url,
            data    = payload,
            headers = {"Content-Type": "application/json"},
            method  = "POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as resp:
                result = _json.loads(resp.read())
            return result["embedding"]["values"]
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", errors="ignore")
            raise RuntimeError(f"Gemini API error {e.code}: {body}") from e

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        embeddings = []
        for i, text in enumerate(texts):
            embeddings.append(self._embed_one(text))
            # Stay under 100 req/min free tier limit
            if i > 0 and i % 90 == 0:
                time.sleep(62)
            elif i > 0 and i % 10 == 0:
                time.sleep(1)
        return embeddings

    def embed_query(self, text: str) -> list[float]:
        return self._embed_one(text)


class OpenAIEmbeddings(Embeddings):
    """
    OpenAI text-embedding-3-small via REST API.
    ~$0.00002 per 1K tokens — very cheap but not free.
    Falls back to this only if GOOGLE_API_KEY is not set.
    """

    def __init__(self, api_key: str):
        self.api_key = api_key
        self.url     = "https://api.openai.com/v1/embeddings"
        self.model   = "text-embedding-3-small"

    def _embed_batch(self, texts: list[str]) -> list[list[float]]:
        import urllib.request, json as _json

        payload = _json.dumps({"model": self.model, "input": texts}).encode()
        req     = urllib.request.Request(
            self.url,
            data    = payload,
            headers = {
                "Content-Type":  "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            method = "POST",
        )
        with urllib.request.urlopen(req, timeout=30) as resp:
            result = _json.loads(resp.read())

        return [item["embedding"] for item in result["data"]]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        # OpenAI allows up to 2048 inputs per request — batch in 100 to be safe
        all_emb: list[list[float]] = []
        for i in range(0, len(texts), 100):
            all_emb.extend(self._embed_batch(texts[i: i + 100]))
        return all_emb

    def embed_query(self, text: str) -> list[float]:
        return self._embed_batch([text])[0]


class TFIDFEmbeddings(Embeddings):
    """
    Pure Python TF-IDF fallback — truly zero external dependencies.
    Quality is lower than neural embeddings but uses ~0MB RAM.
    Only used when no API keys are configured.
    Vectors are 512-dimensional sparse float lists.
    """

    VOCAB_SIZE = 512

    def __init__(self):
        self._vocab: dict[str, int] = {}
        self._idf:   dict[str, float] = {}
        self._fitted = False

    def _tokenize(self, text: str) -> list[str]:
        return re.findall(r"[a-z]{2,}", text.lower())

    def _fit(self, texts: list[str]) -> None:
        import math
        N    = len(texts)
        df: dict[str, int] = {}
        for t in texts:
            for tok in set(self._tokenize(t)):
                df[tok] = df.get(tok, 0) + 1

        # Keep top VOCAB_SIZE tokens by document frequency
        top = sorted(df.items(), key=lambda x: x[1], reverse=True)[: self.VOCAB_SIZE]
        self._vocab = {tok: i for i, (tok, _) in enumerate(top)}
        self._idf   = {
            tok: math.log((N + 1) / (cnt + 1)) + 1
            for tok, cnt in top
        }
        self._fitted = True

    def _vectorize(self, text: str) -> list[float]:
        import math
        tokens = self._tokenize(text)
        tf: dict[str, int] = {}
        for tok in tokens:
            tf[tok] = tf.get(tok, 0) + 1

        vec = [0.0] * self.VOCAB_SIZE
        for tok, idx in self._vocab.items():
            if tok in tf:
                tfidf    = (tf[tok] / max(len(tokens), 1)) * self._idf.get(tok, 1.0)
                vec[idx] = tfidf

        # L2 normalise
        norm = math.sqrt(sum(v * v for v in vec)) or 1.0
        return [v / norm for v in vec]

    def embed_documents(self, texts: list[str]) -> list[list[float]]:
        if not self._fitted:
            self._fit(texts)
        return [self._vectorize(t) for t in texts]

    def embed_query(self, text: str) -> list[float]:
        return self._vectorize(text)


# ── Embedding singleton ───────────────────────────────────────────────────────

_embeddings_instance: Embeddings | None = None


def _get_embeddings() -> Embeddings:
    global _embeddings_instance
    if _embeddings_instance is not None:
        return _embeddings_instance

    if GOOGLE_API_KEY:
        print("[RAG] Using Google Gemini embeddings (free, 0MB RAM)")
        _embeddings_instance = GeminiEmbeddings(GOOGLE_API_KEY)

    elif OPENAI_API_KEY:
        print("[RAG] Using OpenAI embeddings (paid, 0MB RAM)")
        _embeddings_instance = OpenAIEmbeddings(OPENAI_API_KEY)

    else:
        print("[RAG] WARNING: No API keys found. Using TF-IDF fallback (lower quality).")
        _embeddings_instance = TFIDFEmbeddings()

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


# ── Ingestion ─────────────────────────────────────────────────────────────────

def ingest_pdf(file_path: str, session_id: str) -> dict:
    """
    Memory-safe ingestion — page by page, batch embedding, temp file deleted.
    """
    if LOW_MEMORY_MODE:
        raise ValueError(
            "PDF Chat is currently unavailable on this deployment. "
            "Please contact support."
        )

    from pypdf import PdfReader

    reader     = PdfReader(file_path)
    pages      = reader.pages
    page_count = len(pages)

    if not pages:
        raise ValueError("PDF has no pages.")

    filename   = Path(file_path).name
    all_chunks: list[Document] = []

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

        del raw_text, clean, sub
        gc.collect()

    del reader, pages
    gc.collect()

    if not all_chunks:
        raise ValueError("PDF has no extractable text. May be scanned/image-only.")

    # Embed in batches of 20
    BATCH_SIZE = 20
    for i in range(0, len(all_chunks), BATCH_SIZE):
        batch = all_chunks[i: i + BATCH_SIZE]
        Chroma.from_documents(
            documents         = batch,
            embedding         = _get_embeddings(),
            collection_name   = f"session_{session_id}",
            persist_directory = str(CHROMA_DIR),
        )
        del batch
        gc.collect()

    chunk_count = len(all_chunks)
    del all_chunks
    gc.collect()

    # Delete temp file immediately
    try:
        Path(file_path).unlink(missing_ok=True)
    except Exception as e:
        print(f"[RAG] Warning: could not delete temp file: {e}")

    return {
        "session_id":  session_id,
        "filename":    filename,
        "page_count":  page_count,
        "chunk_count": chunk_count,
    }


# ── Reranker ──────────────────────────────────────────────────────────────────

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
        bonus = 0.08 if any(tok in sname for tok in q_tokens) else 0.0
        return 0.70 * emb_score + 0.30 * kw + bonus

    return sorted(docs_with_scores, key=lambda x: _score(x[0], x[1]), reverse=True)[:top_n]


# ── Context builder ───────────────────────────────────────────────────────────

def _build_context(docs_with_scores: list[tuple]) -> str:
    parts = []
    for i, (doc, score) in enumerate(docs_with_scores, 1):
        section = doc.metadata.get("section_name", "unknown")
        parts.append(
            f'<chunk id="{i}" section="{section}" relevance="{score:.2f}">\n'
            f"{doc.page_content.strip()}\n</chunk>"
        )
    return "\n\n".join(parts)


# ── Chat ──────────────────────────────────────────────────────────────────────

def chat_with_pdf(
    session_id: str,
    question:   str,
    history:    list[tuple[str, str]],
) -> Generator[str, None, None]:
    if LOW_MEMORY_MODE:
        yield "PDF Chat is currently unavailable on this deployment due to memory constraints."
        return

    vectorstore = Chroma(
        collection_name   = f"session_{session_id}",
        embedding_function = _get_embeddings(),
        persist_directory = str(CHROMA_DIR),
    )

    raw_results = vectorstore.similarity_search_with_relevance_scores(
        question, k=TOP_K_RETRIEVE
    )

    filtered = [(d, s) for d, s in raw_results if s >= MIN_SCORE]
    if not filtered:
        filtered = [(d, s) for d, s in raw_results if s >= 0.15]

    if not filtered:
        top_sections = list({d.metadata.get("section_name","?") for d,_ in raw_results[:3]})
        yield (
            f'Could not find content relevant to "{question}" in this document.\n\n'
            f"Document covers: {', '.join(top_sections)}.\n\n"
            f"Try rephrasing using terms from the document."
        )
        return

    best    = _rerank(question, filtered)
    context = _build_context(best)

    del raw_results, filtered, best
    gc.collect()

    history_text = "".join(
        f"<user>{q}</user>\n<assistant>{a}</assistant>\n"
        for q, a in history[-MAX_HISTORY:]
    )

    prompt = (
        f"{_SYSTEM_PROMPT}\n\n"
        f"=== DOCUMENT CHUNKS ===\n{context}\n\n"
        f"=== HISTORY ===\n{history_text or '(none)'}\n\n"
        f"=== QUESTION ===\n{question}\n\n"
        f"=== ANSWER ==="
    )

    del context, history_text
    gc.collect()

    for chunk in get_chain_llm().stream(prompt):
        yield chunk.content


# ── Source inspection ─────────────────────────────────────────────────────────

def get_top_sources(session_id: str, question: str) -> list[dict]:
    if LOW_MEMORY_MODE:
        return []

    vectorstore = Chroma(
        collection_name   = f"session_{session_id}",
        embedding_function = _get_embeddings(),
        persist_directory = str(CHROMA_DIR),
    )

    raw      = vectorstore.similarity_search_with_relevance_scores(question, k=TOP_K_RETRIEVE)
    reranked = _rerank(question, raw)
    result   = [
        {
            "section":          d.metadata.get("section_name", "unknown"),
            "snippet":          d.page_content[:200].strip(),
            "score":            round(s, 3),
            "passed_threshold": s >= MIN_SCORE,
        }
        for d, s in reranked
    ]
    del raw, reranked
    gc.collect()
    return result


# ── Session cleanup ───────────────────────────────────────────────────────────

def delete_session(session_id: str) -> None:
    try:
        Chroma(
            collection_name   = f"session_{session_id}",
            embedding_function = _get_embeddings(),
            persist_directory = str(CHROMA_DIR),
        ).delete_collection()
        gc.collect()
    except Exception as exc:
        print(f"[RAG] cleanup warning for session {session_id}: {exc}")
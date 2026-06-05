"""
rag.py — Document RAG (Retrieval-Augmented Generation) for ResearchOS.

Flow:
  1. ingest_pdf()   → load → split → embed → store in ChromaDB
  2. chat_with_pdf() → retrieve top-k chunks → stream answer via Groq

Embedding model: all-MiniLM-L6-v2  (free, runs locally, ~80 MB)
Vector store:    ChromaDB           (persistent, per-session collection)
LLM:             Groq via get_chain_llm()
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Generator

from langchain_community.document_loaders import PyPDFLoader
# NEW (0.2+ style)
from langchain_text_splitters import RecursiveCharacterTextSplitter
from langchain_community.embeddings import HuggingFaceEmbeddings
from langchain_chroma import Chroma

from agents import get_chain_llm

# ── Config ────────────────────────────────────────────────────────────────────

CHROMA_DIR     = Path(__file__).parent / "chroma_store"
EMBEDDING_MODEL = "all-MiniLM-L6-v2"   # 80 MB, fast, good quality

CHUNK_SIZE    = 1000
CHUNK_OVERLAP = 200
TOP_K         = 5           # chunks retrieved per question
MAX_HISTORY   = 6           # last N turns included in prompt context

CHROMA_DIR.mkdir(exist_ok=True)


# ── Embeddings (cached singleton) ────────────────────────────────────────────

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


# ── Ingestion ─────────────────────────────────────────────────────────────────

def ingest_pdf(file_path: str, session_id: str) -> dict:
    """
    Load a PDF → split into chunks → embed → persist in ChromaDB.

    Returns:
        {
            session_id: str,
            filename:   str  (basename of file_path),
            page_count: int,
            chunk_count: int,
        }
    """
    loader = PyPDFLoader(file_path)
    pages  = loader.load()

    if not pages:
        raise ValueError("PDF has no extractable text. Ensure it is not scanned/image-only.")

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=CHUNK_SIZE,
        chunk_overlap=CHUNK_OVERLAP,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    chunks = splitter.split_documents(pages)

    if not chunks:
        raise ValueError("Could not extract any text chunks from the PDF.")

    embeddings = _get_embeddings()

    # Each session gets its own Chroma collection — clean isolation
    Chroma.from_documents(
        documents=chunks,
        embedding=embeddings,
        collection_name=f"session_{session_id}",
        persist_directory=str(CHROMA_DIR),
    )

    return {
        "session_id":  session_id,
        "filename":    Path(file_path).name,
        "page_count":  len(pages),
        "chunk_count": len(chunks),
    }


# ── Chat ──────────────────────────────────────────────────────────────────────

def chat_with_pdf(
    session_id: str,
    question:   str,
    history:    list[tuple[str, str]],
) -> Generator[str, None, None]:
    """
    Retrieve relevant chunks and stream an answer using Groq.

    Args:
        session_id: UUID from ingest_pdf()
        question:   User's question
        history:    List of (user_msg, assistant_msg) tuples

    Yields:
        String chunks of the streamed answer
    """
    embeddings   = _get_embeddings()
    vectorstore  = Chroma(
        collection_name=f"session_{session_id}",
        embedding_function=embeddings,
        persist_directory=str(CHROMA_DIR),
    )

    retriever = vectorstore.as_retriever(search_kwargs={"k": TOP_K})
    docs      = retriever.invoke(question)

    # Build numbered context blocks with page metadata
    context_parts = []
    source_pages  = []
    for i, doc in enumerate(docs, 1):
        page_num = doc.metadata.get("page", "?")
        if isinstance(page_num, int):
            page_num += 1          # PyPDF is 0-indexed
        source_pages.append(page_num)
        context_parts.append(
            f"[Chunk {i} — Page {page_num}]\n{doc.page_content.strip()}"
        )
    context = "\n\n---\n\n".join(context_parts)

    # Conversation history (last N turns)
    history_text = ""
    for user_q, asst_a in history[-MAX_HISTORY:]:
        history_text += f"User: {user_q}\nAssistant: {asst_a}\n\n"

    prompt = f"""You are a precise and helpful document assistant. Answer the user's question \
using ONLY the context extracted from their uploaded PDF. Cite specific page numbers \
when referencing information (e.g., "According to page 3...").

If the answer cannot be found in the provided context, say so clearly rather than guessing.

─── Document Context ───
{context}

─── Conversation History ───
{history_text}
─── Current Question ───
User: {question}
Assistant:"""

    llm = get_chain_llm()
    for chunk in llm.stream(prompt):
        yield chunk.content


# ── Source extraction helper ──────────────────────────────────────────────────

def get_top_sources(session_id: str, question: str) -> list[dict]:
    """
    Return the top-k source chunks for a question (for display in the UI).
    Each item: { page: int, snippet: str, score: float }
    """
    embeddings  = _get_embeddings()
    vectorstore = Chroma(
        collection_name=f"session_{session_id}",
        embedding_function=embeddings,
        persist_directory=str(CHROMA_DIR),
    )

    results = vectorstore.similarity_search_with_relevance_scores(question, k=TOP_K)
    sources = []
    for doc, score in results:
        page_num = doc.metadata.get("page", 0)
        if isinstance(page_num, int):
            page_num += 1
        sources.append({
            "page":    page_num,
            "snippet": doc.page_content[:200].strip(),
            "score":   round(score, 3),
        })
    return sources


# ── Session cleanup ───────────────────────────────────────────────────────────

def delete_session(session_id: str) -> None:
    """Remove a session's Chroma collection to free disk space."""
    try:
        embeddings  = _get_embeddings()
        vectorstore = Chroma(
            collection_name=f"session_{session_id}",
            embedding_function=embeddings,
            persist_directory=str(CHROMA_DIR),
        )
        vectorstore.delete_collection()
    except Exception as exc:
        print(f"[RAG] cleanup warning for session {session_id}: {exc}")

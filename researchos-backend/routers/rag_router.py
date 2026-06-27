"""
routers/rag_router.py

All PDF Chat (RAG) routes for ResearchOS.
Handles: PDF upload, ingestion status, session list, chat streaming,
         chat history, session deletion, text ingest.

Also owns _rag_sessions (the shared in-memory session store) and
_run_ingestion (the background PDF processing task).
Other routers import these from here — this is the single source of truth.

RAG = Retrieval-Augmented Generation.
Plain English: we store the PDF's content in a searchable database (ChromaDB),
then when the user asks a question we find the most relevant chunks and
send those to the AI as context so it can answer accurately.
"""

from __future__ import annotations

import asyncio
import gc
import json
from datetime import datetime
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import (
    APIRouter, BackgroundTasks, Depends,
    File, HTTPException, UploadFile, status,
)
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

import database
from auth import get_current_user
from rag import chat_with_pdf, get_top_sources, ingest_pdf, ingest_text_content
from rate_limit import upload_limiter
from error_models import STANDARD_ERROR_RESPONSES, ErrorResponse

# ── Router ────────────────────────────────────────────────────────────────────
router = APIRouter(prefix="/api/rag", tags=["RAG"])

# Shortcut — reads JWT and returns current user dict on every protected request
CurrentUser = Annotated[dict, Depends(get_current_user)]

# ── Upload directory ──────────────────────────────────────────────────────────
# PDFs are saved here temporarily while being ingested into ChromaDB
UPLOAD_DIR = Path(__file__).parent.parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

# ── Shared in-memory session store ────────────────────────────────────────────
# This is the single source of truth for RAG sessions across the app.
# Key   = session_id (UUID string)
# Value = dict with user_id, filename, status, history, etc.
#
# Status flow: "processing" → "ready" (or "error")
# The research router imports this dict and writes to it after pipeline runs.
# On server startup, main.py reloads sessions from the database into this dict.
_rag_sessions: dict[str, dict] = {}


# ── Request body models ───────────────────────────────────────────────────────

class RagChatRequest(BaseModel):
    session_id: str
    question:   str


class IngestTextRequest(BaseModel):
    title:   str
    content: str


# ── Background task: ingest a PDF file ───────────────────────────────────────
# Called after upload — runs in a thread pool so it never blocks the server.
# Updates _rag_sessions[session_id] when done.

async def _run_ingestion(session_id: str, file_path: str) -> None:
    """
    Runs ingest_pdf() in a thread pool so it doesn't block the event loop.
    Updates _rag_sessions[session_id] with status='ready' or status='error'.
    """
    loop = asyncio.get_event_loop()

    def _update_session(payload: dict) -> None:
        # Guard against session being removed between task launch and callback
        if session_id in _rag_sessions:
            _rag_sessions[session_id].update(payload)

    def _cleanup_file() -> None:
        # Best-effort file deletion — never raises
        try:
            Path(file_path).unlink(missing_ok=True)
        except Exception as exc:
            print(f"[Ingestion] Could not delete file '{file_path}': {exc}")

    def _persist_status(st: str, **kwargs) -> None:
        # Save status to DB — wrapped so DB errors don't swallow original error
        try:
            database.update_rag_session_status(session_id, st, **kwargs)
        except Exception as exc:
            print(f"[Ingestion] DB persist failed (status={st!r}): {exc}")

    try:
        # Move blocking PDF processing off the event loop into a thread
        result = await loop.run_in_executor(
            None,
            lambda: ingest_pdf(str(file_path), session_id=session_id),
        )
        page_count  = result.get("page_count",  0) if isinstance(result, dict) else 0
        chunk_count = result.get("chunk_count", 0) if isinstance(result, dict) else 0

        _update_session({"status": "ready", "page_count": page_count, "chunk_count": chunk_count})
        _persist_status("ready", page_count=page_count, chunk_count=chunk_count)
        print(f"[Ingestion] session={session_id} ready — {page_count} pages, {chunk_count} chunks")

    except ValueError as exc:
        # Known domain error (e.g. "PDF has no extractable text")
        error_msg = str(exc)
        print(f"[Ingestion] session={session_id} failed (ValueError): {error_msg}")
        _update_session({"status": "error", "error": error_msg})
        _persist_status("error", error_msg=error_msg)
        _cleanup_file()

    except Exception as exc:
        # Unexpected error
        error_msg = f"Processing failed: {exc}"
        print(f"[Ingestion] session={session_id} unexpected error: {exc}")
        _update_session({"status": "error", "error": error_msg})
        _persist_status("error", error_msg=error_msg)
        _cleanup_file()

    finally:
        gc.collect()     # free memory held by large PDF buffers


# ── Background task: ingest plain text ───────────────────────────────────────
# Used by both /api/rag/ingest-text and the research pipeline auto-ingest.
# Exported so research_router.py can import and use it.

async def _ingest_text_background(
    session_id: str,
    title:      str,
    text:       str,
) -> None:
    """
    Background coroutine: embed plain text into ChromaDB for a RAG session.
    Updates _rag_sessions[session_id] when done.
    """
    loop = asyncio.get_event_loop()
    try:
        result = await loop.run_in_executor(
            None,
            lambda: ingest_text_content(text, session_id, title),
        )
        chunk_count = result.get("chunk_count", 0)

        if session_id in _rag_sessions:
            _rag_sessions[session_id].update({
                "status":      "ready",
                "chunk_count": chunk_count,
                "page_count":  1,
            })

        database.update_rag_session_status(
            session_id, "ready",
            page_count=1, chunk_count=chunk_count,
        )
        print(f"[TextIngest BG] session={session_id} ready — {chunk_count} chunks")

    except Exception as exc:
        print(f"[TextIngest BG] session={session_id} failed: {exc}")
        if session_id in _rag_sessions:
            _rag_sessions[session_id].update({"status": "error", "error": str(exc)})
        database.update_rag_session_status(session_id, "error", error_msg=str(exc))


# ── POST /api/rag/upload ──────────────────────────────────────────────────────

@router.post(
    "/upload",
    responses=STANDARD_ERROR_RESPONSES,
)
async def rag_upload(
    background_tasks: BackgroundTasks,
    current_user:     CurrentUser,
    file:             UploadFile = File(...),
):
    """
    Accept a PDF upload and return immediately with status='processing'.
    Ingestion (chunking + embedding) runs in the background.
    Poll /api/rag/status/{session_id} to check when it's ready.
    """
    # Validate file type — only PDFs supported
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Only PDF files are supported. Please upload a .pdf file.",
        )

    # Rate limit — 10 uploads per 5 minutes per user
    upload_limiter.check(current_user["id"])

    # Generate a unique session ID and safe filename
    session_id    = str(uuid4())
    safe_filename = f"{session_id}_{file.filename}"
    file_path     = UPLOAD_DIR / safe_filename

    # Save the file to disk
    try:
        contents = await file.read()
        if not contents:
            raise HTTPException(status.HTTP_400_BAD_REQUEST, "Uploaded file is empty.")
        file_path.write_bytes(contents)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status.HTTP_500_INTERNAL_SERVER_ERROR,
            f"Failed to save uploaded file: {exc}",
        )

    # Register session in memory immediately so status polling works right away
    created_at = datetime.utcnow().isoformat()
    _rag_sessions[session_id] = {
        "user_id":     current_user["id"],
        "filename":    file.filename,
        "file_path":   str(file_path),
        "created_at":  created_at,
        "history":     [],
        "status":      "processing",
        "page_count":  0,
        "chunk_count": 0,
        "error":       None,
    }

    # Persist to DB so it survives server restarts
    database.save_rag_session(
        session_id, current_user["id"], file.filename, source_type="pdf"
    )

    # Schedule background ingestion — runs AFTER this response is sent
    background_tasks.add_task(_run_ingestion, session_id, str(file_path))

    # Log to activity feed
    database.log_activity(
        current_user["id"],
        "pdf_upload",
        {"session_id": session_id, "filename": file.filename},
    )

    # Return immediately — frontend polls /status to know when ready
    return {
        "session_id": session_id,
        "filename":   file.filename,
        "status":     "processing",
        "created_at": created_at,
    }


# ── GET /api/rag/status/{session_id} ─────────────────────────────────────────

@router.get("/status/{session_id}")
async def rag_status(session_id: str, current_user: CurrentUser):
    """
    Poll this endpoint after upload to check if ingestion is complete.
    Returns status: "processing" | "ready" | "error"
    """
    session = _rag_sessions.get(session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found.")
    if session["user_id"] != current_user["id"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied.")

    return {
        "session_id":  session_id,
        "filename":    session.get("filename"),
        "status":      session.get("status", "processing"),
        "page_count":  session.get("page_count", 0),
        "chunk_count": session.get("chunk_count", 0),
        "error":       session.get("error"),
        "created_at":  session.get("created_at"),
    }


# ── GET /api/rag/sessions ─────────────────────────────────────────────────────

@router.get("/sessions")
async def rag_sessions(current_user: CurrentUser):
    """Returns all RAG sessions belonging to the current user."""
    user_sessions = [
        {
            "session_id":  sid,
            "filename":    s.get("filename"),
            "status":      s.get("status", "ready"),
            "source_type": s.get("source_type", "pdf"),
            "created_at":  s.get("created_at"),
            "page_count":  s.get("page_count", 0),
            "chunk_count": s.get("chunk_count", 0),
        }
        for sid, s in _rag_sessions.items()
        if s.get("user_id") == current_user["id"]
    ]
    # Sort newest first
    user_sessions.sort(key=lambda x: x.get("created_at") or "", reverse=True)
    return {"sessions": user_sessions}


# ── POST /api/rag/chat ────────────────────────────────────────────────────────

@router.post(
    "/chat",
    responses=STANDARD_ERROR_RESPONSES,
)
async def rag_chat(body: RagChatRequest, current_user: CurrentUser):
    """
    Stream an answer grounded in the uploaded PDF.
    Maintains conversation history for multi-turn Q&A.
    """
    # Validate session exists and belongs to this user
    session = _rag_sessions.get(body.session_id)
    if not session:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Session not found. Please upload a PDF first.")
    if session["user_id"] != current_user["id"]:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Access denied")

    # Check ingestion is complete before allowing questions
    if session.get("status") == "processing":
        raise HTTPException(status.HTTP_425_TOO_EARLY, "Document is still being processed. Please wait.")
    if session.get("status") == "error":
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, session.get("error", "Document processing failed."))

    question = body.question.strip()
    if not question:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "Question cannot be empty.")

    def event_stream():
        full_answer = ""
        try:
            # Find the most relevant chunks from ChromaDB for this question
            try:
                sources = get_top_sources(body.session_id, question)
            except Exception:
                sources = []

            # Send source citations to frontend first (for the "Sources" panel)
            yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

            # Stream the answer word by word — history enables follow-up questions
            for chunk in chat_with_pdf(body.session_id, question, session.get("history", [])):
                full_answer += chunk
                yield f"data: {json.dumps({'type': 'chunk', 'chunk': chunk})}\n\n"

            # Save Q&A pair to session history for next turn context
            session["history"].append((question, full_answer))

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'msg': str(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":        "keep-alive",
        },
    )


# ── GET /api/rag/history/{session_id} ────────────────────────────────────────

@router.get("/history/{session_id}")
async def rag_history(session_id: str, current_user: CurrentUser):
    """Returns the full conversation history for a RAG session."""
    session = _rag_sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if session["user_id"] != current_user["id"]:
        raise HTTPException(403, "Access denied")

    # Convert (question, answer) tuples into {role, content} message objects
    messages = []
    for q, a in session["history"]:
        messages.append({"role": "user",      "content": q})
        messages.append({"role": "assistant", "content": a})

    return {"session_id": session_id, "messages": messages}


# ── DELETE /api/rag/session/{session_id} ─────────────────────────────────────

@router.delete("/session/{session_id}")
async def rag_delete_session(session_id: str, current_user: CurrentUser):
    """Deletes a RAG session — removes from memory, DB, and uploaded file."""
    session = _rag_sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if session["user_id"] != current_user["id"]:
        raise HTTPException(403, "Access denied")

    # Remove uploaded PDF file from disk (if it was a file-based session)
    file_path = session.get("file_path")
    if file_path:
        try:
            Path(file_path).unlink(missing_ok=True)
        except Exception:
            pass    # file deletion is best-effort, never fail the request

    # Remove from in-memory store
    del _rag_sessions[session_id]

    # Remove from database
    try:
        database.delete_rag_session_db(session_id)
    except Exception:
        pass    # DB deletion is best-effort too

    return {"deleted": True, "session_id": session_id}


# ── POST /api/rag/ingest-text ─────────────────────────────────────────────────

@router.post("/ingest-text")
async def rag_ingest_text(
    background_tasks: BackgroundTasks,
    body:             IngestTextRequest,
    current_user:     CurrentUser,
):
    """
    Convert plain text (e.g. a pasted article) into a RAG session.
    Returns session_id immediately. Ingestion runs in background.
    """
    if len(body.content.strip()) < 50:
        raise HTTPException(422, "Content too short — minimum 50 characters.")

    session_id = str(uuid4())
    created_at = datetime.utcnow().isoformat()
    title      = body.title.strip()[:80]   # cap title length

    # Register in memory immediately so status polling works right away
    _rag_sessions[session_id] = {
        "user_id":     current_user["id"],
        "filename":    title,
        "file_path":   None,
        "created_at":  created_at,
        "history":     [],
        "status":      "processing",
        "source_type": "text_ingest",
    }

    # Persist to database
    database.save_rag_session(
        session_id, current_user["id"], title, source_type="text_ingest"
    )

    # Schedule background embedding
    background_tasks.add_task(_ingest_text_background, session_id, title, body.content)

    # Log to activity feed
    database.log_activity(
        current_user["id"],
        "text_ingested",
        {"session_id": session_id, "title": title},
    )

    return {
        "session_id": session_id,
        "title":      title,
        "status":     "processing",
        "created_at": created_at,
    }


# ── Session cleanup — fixes the memory leak ───────────────────────────────────

import asyncio as _asyncio
from datetime import datetime, timezone

async def _cleanup_expired_sessions(
    max_age_hours: int = 24,
    interval_seconds: int = 3600,
) -> None:
    """
    Background coroutine that removes old sessions from _rag_sessions every hour.

    WHY THIS WORKS:
    _rag_sessions is an in-memory dict. If a session stays in memory forever,
    the server eventually runs out of RAM and crashes (memory leak).
    This coroutine runs forever in the background — every hour it checks
    every session and removes ones older than max_age_hours.

    The database record is KEPT — only the in-memory entry is removed.
    If the user comes back after 24 hours, the session reloads from DB on demand.

    This is called a TTL (Time To Live) pattern — the same thing Redis uses
    for automatic key expiration.
    """
    while True:
        # Wait first — no cleanup needed right after server starts
        await _asyncio.sleep(interval_seconds)

        now     = datetime.now(timezone.utc)
        removed = 0
        errors  = 0

        # We iterate over a snapshot (list of items) not the dict itself
        # because we might delete items while iterating — that would raise
        # RuntimeError: dictionary changed size during iteration
        for sid, session in list(_rag_sessions.items()):
            try:
                created_raw = session.get("created_at", "")
                if not created_raw:
                    continue   # no timestamp — skip safely

                # Parse the ISO timestamp stored in created_at
                # Handle both "2024-01-15T10:30:00" and "2024-01-15T10:30:00+00:00"
                created_str = str(created_raw).replace("Z", "+00:00")
                try:
                    created_at = datetime.fromisoformat(created_str)
                except ValueError:
                    continue   # unparseable timestamp — skip safely

                # Make timezone-aware if it isn't already
                if created_at.tzinfo is None:
                    created_at = created_at.replace(tzinfo=timezone.utc)

                # Calculate age in hours
                age_hours = (now - created_at).total_seconds() / 3600

                if age_hours > max_age_hours:
                    # Only remove sessions that are not currently being processed
                    # "processing" sessions are mid-upload — never remove those
                    if session.get("status") != "processing":
                        del _rag_sessions[sid]
                        removed += 1

            except Exception as exc:
                # Never let one bad session crash the entire cleanup loop
                errors += 1
                print(f"[Session Cleanup] Error processing session {sid}: {exc}")

        # Log the result — useful for debugging memory issues later
        if removed > 0 or errors > 0:
            remaining = len(_rag_sessions)
            print(
                f"[Session Cleanup] Removed {removed} expired sessions "
                f"({errors} errors) — {remaining} remaining in memory"
            )


def start_session_cleanup(app=None) -> None:
    """
    Starts the cleanup coroutine as a background asyncio task.
    Called once from main.py lifespan at startup.
    asyncio.create_task() runs it concurrently — it never blocks anything.
    """
    _asyncio.create_task(_cleanup_expired_sessions())
    print("[Session Cleanup] Background cleanup task started — runs every hour")
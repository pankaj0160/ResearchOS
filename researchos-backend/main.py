"""
main.py — FastAPI server for ResearchOS.

Routes:
  GET  /api/health
  POST /api/auth/register
  POST /api/auth/login
  POST /api/auth/forgot-password
  POST /api/auth/reset-password
  GET  /api/auth/me

  GET  /api/research/stream          [protected]
  GET  /api/history                  [protected]
  GET  /api/history/{id}             [protected]
  DELETE /api/history/{id}           [protected]

  POST /api/agents/create            [protected]  ← NEW
  GET  /api/agents/list              [protected]  ← NEW
  DELETE /api/agents/{agent_id}      [protected]  ← NEW

  POST /api/support/ticket                        ← NEW (public)

  POST /api/rag/upload               [protected]
  POST /api/rag/chat                 [protected]
  GET  /api/rag/sessions             [protected]
  GET  /api/rag/history/{id}         [protected]
  DELETE /api/rag/session/{id}       [protected]

  GET  /api/news/search              [protected]
  GET  /api/news/summarize           [protected]

  GET  /api/dashboard/weather        [protected]
  GET  /api/dashboard/travel-safety  [protected]
  GET  /api/dashboard/headlines      [protected]
  POST /api/dashboard/chat           [protected]
"""

from __future__ import annotations

from auth import decode_token
from rate_limit import research_limiter, upload_limiter
import json
import gc      
import os
import secrets
from contextlib import asynccontextmanager
from typing import Annotated, List

import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, HTTPException, Query, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, EmailStr, field_validator

import auth
import database
from auth import get_current_user
from database import delete_run, get_history, get_run, init_db, save_run
from pipeline import run_pipeline_async
from pathlib import Path

# ── RAG / upload imports ───────────────────────────────────────────────────────
from fastapi import UploadFile, File
from uuid import uuid4
from datetime import datetime
from fastapi import (
    BackgroundTasks,   # ← add this
    Depends,
    FastAPI,
    File,
    HTTPException,
    UploadFile,
    status,
)




from rag import (
    ingest_pdf,
    chat_with_pdf,
    get_top_sources,
    delete_session,
    ingest_text_content,
)

load_dotenv(Path(__file__).parent / ".env", override=True)

# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()          # creates all tables including agents + support_tickets

    # NEW: reload RAG session metadata from DB into the in-memory dict
    # This means sessions persist across server restarts
    try:
        all_db_sessions = database.get_all_rag_sessions()
        for s in all_db_sessions:
            sid = s["id"]
            if sid not in _rag_sessions:  # don't overwrite if already in memory
                _rag_sessions[sid] = {
                    "user_id":     s["user_id"],
                    "filename":    s["filename"],
                    "file_path":   None,       # file may not be on disk after restart
                    "created_at":  str(s.get("created_at", "")),
                    "history":     [],          # chat history is NOT persisted (by design)
                    "status":      s.get("status", "ready"),
                    "page_count":  s.get("page_count", 0),
                    "chunk_count": s.get("chunk_count", 0),
                    "source_type": s.get("source_type", "pdf"),
                    "run_id":      s.get("run_id"),
                }
        print(f"[Startup] Reloaded {len(all_db_sessions)} RAG sessions from DB")
    except Exception as exc:
        print(f"[Startup] RAG session reload failed (non-fatal): {exc}")
    yield



import asyncio
async def event_stream():
    report = ""
    feedback = ""
    last_ping = asyncio.get_event_loop().time()

    try:
        async for event in run_pipeline_async(topic):
            # Ping if 15s have passed with no event
            now = asyncio.get_event_loop().time()
            if now - last_ping > 15:
                yield f"data: {json.dumps({'type': 'ping'})}\n\n"
                last_ping = now

            if event.get("agent") == "writer" and event.get("type") in ("chunk", "streaming"):
                report += event.get("msg", "")
            if event.get("agent") == "critic" and event.get("type") in ("chunk", "streaming"):
                feedback += event.get("msg", "")

            yield f"data: {json.dumps(event)}\n\n"
            last_ping = asyncio.get_event_loop().time()

        if report:
            run_id = save_run(topic, report, feedback, user_id=user_id)
            yield f"data: {json.dumps({'type': 'saved', 'run_id': run_id})}\n\n"

        yield f"data: {json.dumps({'type': 'done'})}\n\n"

    except Exception as exc:
        yield f"data: {json.dumps({'type': 'error', 'msg': str(exc)})}\n\n"








# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="ResearchOS API",
    version="2.0.0",
    description="AI Research & Intelligence Platform",
    lifespan=lifespan,
)

_ORIGINS = [
    "http://localhost:5173",
    "http://localhost:3000",
    "http://localhost:4173",
    "https://research-os-kappa.vercel.app",
    os.getenv("FRONTEND_ORIGIN", ""),
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=[o for o in _ORIGINS if o],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

CurrentUser = Annotated[dict, Depends(get_current_user)]


# ── Health ────────────────────────────────────────────────────────────────────

@app.get("/")
async def root():
    return {"status": "ok", "service": "ResearchOS"}

@app.head("/")
async def root_head():
    return {}


@app.get("/api/health")
async def health():
    return {"status": "ok", "service": "ResearchOS", "version": "2.0.0"}


# ── Auth — Pydantic models ────────────────────────────────────────────────────

class RegisterRequest(BaseModel):
    email: EmailStr
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def username_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 3:
            raise ValueError("Username must be at least 3 characters")
        if len(v) > 30:
            raise ValueError("Username must be 30 characters or less")
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username may only contain letters, numbers, _ and -")
        return v

    @field_validator("password")
    @classmethod
    def password_strong(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str

    @field_validator("new_password")
    @classmethod
    def password_strong(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        return v


# ── Auth — Routes ─────────────────────────────────────────────────────────────

@app.post("/api/auth/register", status_code=status.HTTP_201_CREATED)
async def register(req: RegisterRequest):
    if database.get_user_by_email(req.email):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "An account with that email already exists")
    if database.get_user_by_username(req.username):
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "That username is already taken")

    user_id = database.create_user(
        email=req.email,
        username=req.username,
        password_hash=auth.hash_password(req.password),
    )
    token = auth.create_access_token({"sub": str(user_id)})
    return {"token": token, "user": {"id": user_id, "email": req.email, "username": req.username}}


@app.post("/api/auth/login")
async def login(req: LoginRequest):
    user = database.get_user_by_email(req.email)
    if not user or not auth.verify_password(req.password, user["password_hash"]):
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid email or password")
    token = auth.create_access_token({"sub": str(user["id"])})
    return {"token": token, "user": {"id": user["id"], "email": user["email"], "username": user["username"]}}


@app.post("/api/auth/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    user = database.get_user_by_email(req.email)
    if user:
        reset_token = secrets.token_urlsafe(32)
        database.save_reset_token(user["id"], reset_token)
        # TODO: send email with link: /reset-password?token={reset_token}
        print(f"[DEV] Reset token for {req.email}: {reset_token}")
    return {"message": "If that email exists, a reset link has been sent."}


@app.post("/api/auth/reset-password")
async def reset_password(req: ResetPasswordRequest):
    user_id = database.use_reset_token(req.token)
    if not user_id:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Invalid or expired reset token")
    database.update_password(user_id, auth.hash_password(req.new_password))
    return {"message": "Password updated successfully"}


# ── Auth — GET /api/auth/me (UPDATED) ─────────────────────────────────────────
# Old version only returned id/email/username.
# New version also returns city and default_topic from the user's profile
# so the Dashboard can auto-load weather for their city and headlines for their topic.

@app.get("/api/auth/me")
async def me(current_user: CurrentUser):
    # Use new get_user_full() which includes profile columns
    user = database.get_user_full(current_user["id"])
    if user:
        return user
    # Fallback to current_user dict if get_user_full fails for any reason
    return {
        "id":            current_user["id"],
        "email":         current_user["email"],
        "username":      current_user["username"],
        "city":          "Mumbai",
        "default_topic": "technology",
    }


# ── Auth — PATCH /api/auth/me (NEW) ───────────────────────────────────────────
# Lets users update their city and default_topic from the Profile Settings page.

@app.patch("/api/auth/me")
async def update_me(body: dict, current_user: CurrentUser):
    city          = body.get("city")
    default_topic = body.get("default_topic")
    if not city and not default_topic:
        raise HTTPException(422, "Provide city or default_topic to update")
    database.update_user_profile(
        current_user["id"],
        city=city,
        default_topic=default_topic,
    )
    return {"updated": True}


# ── Research History ──────────────────────────────────────────────────────────

@app.get("/api/history")
async def history(current_user: CurrentUser):
    return {"runs": get_history(limit=50, user_id=current_user["id"])}


@app.get("/api/history/search")
async def search_history(
    q:            str = Query(..., min_length=2, max_length=200),
    current_user: CurrentUser = None,
    limit:        int = Query(default=20, ge=1, le=50),
):
    """
    Full-text search over research history.
    Searches both topic AND report content.
    Returns lightweight rows with excerpt (no full report text).
    """
    results = database.search_runs(current_user["id"], q, limit=limit)
    return {"results": results, "query": q, "count": len(results)}


@app.get("/api/history/{run_id}")
async def get_run_route(run_id: int, current_user: CurrentUser):
    run = get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    if run.get("user_id") != current_user["id"]:
        raise HTTPException(403, "Access denied")
    return run


@app.delete("/api/history/{run_id}")
async def delete_run_route(run_id: int, current_user: CurrentUser):
    run = get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    if run.get("user_id") != current_user["id"]:
        raise HTTPException(403, "Access denied")
    delete_run(run_id)
    return {"deleted": True}



@app.get("/api/history/{run_id}/export")
async def export_run(run_id: int, current_user: CurrentUser):
    """Download a past research run as a Markdown file."""
    from fastapi.responses import Response
    import re

    run = get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found.")
    if run.get("user_id") != current_user["id"]:
        raise HTTPException(status_code=403, detail="Access denied.")
    if not run.get("report", "").strip():
        raise HTTPException(status_code=422, detail="This run has no report content to export.")

    topic    = run.get("topic", "research")
    report   = run.get("report", "").strip()
    feedback = run.get("feedback", "").strip()

    content = f"# {topic}\n\n{report}"
    if feedback:
        content += f"\n\n---\n\n## Critic Review\n\n{feedback}"

    slug     = re.sub(r"[^a-z0-9]+", "-", topic.lower()).strip("-") or "report"
    filename = f"researchos-{slug}.md"

    return Response(
        content    = content.encode("utf-8"),
        media_type = "text/markdown",
        headers    = {"Content-Disposition": f'attachment; filename="{filename}"'},
    )




# ── Background text ingestion helper ──────────────────────────────────────────
# Called by research_stream to ingest the report into RAG without blocking SSE.
# Uses asyncio.create_task() so it runs concurrently after the stream ends.
# Pattern is identical to _run_ingestion() which handles PDF files.

async def _ingest_text_background(
    session_id: str,
    title: str,
    text: str,
) -> None:
    """
    Background coroutine: ingest plain text into ChromaDB for a RAG session.
    Updates _rag_sessions[session_id] status when done.
    Never raises — failures are logged to console only.
    """
    loop = asyncio.get_event_loop()
    try:
        # run_in_executor so the blocking Chroma/embedding code doesn't block the event loop
        result = await loop.run_in_executor(
            None,
            lambda: ingest_text_content(text, session_id, title),
        )
        chunk_count = result.get("chunk_count", 0)

        # Update in-memory session dict
        if session_id in _rag_sessions:
            _rag_sessions[session_id].update({
                "status":      "ready",
                "chunk_count": chunk_count,
                "page_count":  1,
            })

        # Update DB status
        database.update_rag_session_status(
            session_id, "ready",
            page_count=1, chunk_count=chunk_count,
        )
        print(f"[TextIngest BG] session={session_id} ready — {chunk_count} chunks")

    except Exception as exc:
        print(f"[TextIngest BG] session={session_id} failed: {exc}")
        if session_id in _rag_sessions:
            _rag_sessions[session_id].update({
                "status": "error",
                "error":  str(exc),
            })
        database.update_rag_session_status(
            session_id, "error", error_msg=str(exc)
        )


# ── Research SSE Stream (UPDATED) ─────────────────────────────────────────────
# Changes from original:
#   + accepts optional workspace_id query param
#   + after save_run(), auto-ingests the report into RAG (background task)
#   + sends rag_session_id in the 'saved' SSE event
#   + logs activity after successful save
# The SSE streaming loop itself (lines with "yield") is UNCHANGED.

@app.get("/api/research/stream")
async def research_stream(
    topic:        str = Query(..., min_length=3, max_length=300),
    workspace_id: int = Query(default=None),   # NEW — optional workspace linkage
    current_user: CurrentUser = None,
):
    research_limiter.check(current_user["id"])
    user_id = current_user["id"]

    async def event_stream():
        report    = ""
        feedback  = ""
        last_ping = asyncio.get_event_loop().time()

        try:
            async for event in run_pipeline_async(topic):
                now = asyncio.get_event_loop().time()
                if now - last_ping > 15:
                    yield f"data: {json.dumps({'type': 'ping'})}\n\n"
                    last_ping = now

                if event.get("agent") == "writer" and event.get("type") in ("chunk", "streaming"):
                    report += event.get("msg", "")
                if event.get("agent") == "critic" and event.get("type") in ("chunk", "streaming"):
                    feedback += event.get("msg", "")

                yield f"data: {json.dumps(event)}\n\n"
                last_ping = asyncio.get_event_loop().time()

            if report:
                # Save the run (now also stores workspace_id, word_count, source_count)
                run_id = save_run(
                    topic,
                    report,
                    feedback,
                    user_id=user_id,
                    workspace_id=workspace_id,  # NEW
                )

                # ── NEW: Auto-ingest report into RAG as a background task ──────────
                # Creates a chat session so user can immediately "Chat with this report"
                # Runs in background — doesn't delay the SSE response
                rag_session_id = None
                try:
                    rag_session_id = str(uuid4())
                    created_at     = datetime.utcnow().isoformat()

                    # Register session in memory immediately (status=processing)
                    _rag_sessions[rag_session_id] = {
                        "user_id":     user_id,
                        "filename":    f"Research: {topic[:60]}",
                        "file_path":   None,
                        "created_at":  created_at,
                        "history":     [],
                        "status":      "processing",
                        "source_type": "research_run",
                        "run_id":      run_id,
                    }

                    # Persist to DB (so it survives restarts)
                    database.save_rag_session(
                        rag_session_id,
                        user_id,
                        f"Research: {topic[:60]}",
                        source_type="research_run",
                        run_id=run_id,
                        workspace_id=workspace_id,
                    )

                    # Ingest text in background — same executor pattern as _run_ingestion
                    loop = asyncio.get_event_loop()
                    asyncio.create_task(
                        _ingest_text_background(rag_session_id, topic, report)
                    )
                except Exception as exc:
                    print(f"[RAG auto-ingest] Failed to start: {exc}")
                    rag_session_id = None  # don't send broken id to frontend

                # ── NEW: Log activity ──────────────────────────────────────────────
                database.log_activity(
                    user_id,
                    "research_run",
                    {
                        "run_id":        run_id,
                        "topic":         topic,
                        "word_count":    len(report.split()),
                        "rag_session_id": rag_session_id,
                    },
                    workspace_id=workspace_id,
                )

                # Send run_id AND rag_session_id to the frontend
                yield f"data: {json.dumps({'type': 'saved', 'run_id': run_id, 'rag_session_id': rag_session_id})}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'msg': str(exc)})}\n\n"

        finally:
            del report, feedback
            gc.collect()

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache, no-transform",
            "X-Accel-Buffering": "no",
            "Connection":        "keep-alive",
            "Transfer-Encoding": "chunked",
        },
    )

# ══════════════════════════════════════════════════════════════════════════════
# RAG
# ══════════════════════════════════════════════════════════════════════════════

UPLOAD_DIR = Path(__file__).parent / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)



# In-memory session store: session_id → {user_id, filename, created_at, history, status, error}
# status values: "processing" | "ready" | "error"
_rag_sessions: dict[str, dict] = {}


class RagChatRequest(BaseModel):
    session_id: str
    question: str


async def _run_ingestion(session_id: str, file_path: str) -> None:
    """
    Runs ingest_pdf() in a thread pool so it doesn't block the event loop.
    Updates _rag_sessions[session_id] with status='ready' or status='error' when done.

    Flow:
        1. Offload blocking ingest_pdf() to a ThreadPoolExecutor via run_in_executor.
        2. On success  → update in-memory session dict + persist to DB.
        3. On failure  → update in-memory session dict + persist error to DB
                       + attempt to clean up the uploaded file.
        4. Always     → force a GC cycle to release large PDF buffers.
    """
    import asyncio

    loop = asyncio.get_event_loop()

    # ------------------------------------------------------------------ #
    # Helper: safely write to the in-memory session registry.             #
    # Guards against the session being evicted between the background     #
    # task launch and this callback running (race-condition safety).      #
    # ------------------------------------------------------------------ #
    def _update_session(payload: dict) -> None:
        if session_id in _rag_sessions:
            _rag_sessions[session_id].update(payload)

    # ------------------------------------------------------------------ #
    # Helper: best-effort file cleanup — never raises.                    #
    # ------------------------------------------------------------------ #
    def _cleanup_file() -> None:
        try:
            Path(file_path).unlink(missing_ok=True)
        except Exception as cleanup_exc:
            # Log but never propagate; file cleanup is non-critical.
            print(f"[Ingestion] session={session_id} — could not delete file '{file_path}': {cleanup_exc}")

    # ------------------------------------------------------------------ #
    # Helper: persist status to DB — wraps the call so a DB failure       #
    # never silently swallows the original error context.                 #
    # ------------------------------------------------------------------ #
    def _persist_status(status: str, **kwargs) -> None:
        try:
            database.update_rag_session_status(session_id, status, **kwargs)
        except Exception as db_exc:
            print(f"[Ingestion] session={session_id} — DB persist failed (status={status!r}): {db_exc}")

    # ------------------------------------------------------------------ #
    # 1. Run blocking ingestion off the event loop.                        #
    # ------------------------------------------------------------------ #
    try:
        ingest_result: dict = await loop.run_in_executor(
            None,  # Default ThreadPoolExecutor (size = min(32, os.cpu_count() + 4))
            lambda: ingest_pdf(str(file_path), session_id=session_id),
        )

        # Defensive extraction — ingest_pdf must return a dict, but guard anyway.
        page_count  = ingest_result.get("page_count",  0) if isinstance(ingest_result, dict) else 0
        chunk_count = ingest_result.get("chunk_count", 0) if isinstance(ingest_result, dict) else 0

        # 2a. Update in-memory state.
        _update_session({
            "status":      "ready",
            "page_count":  page_count,
            "chunk_count": chunk_count,
        })

        # 2b. Persist to DB (wrapped so DB errors surface but don't crash the task).
        _persist_status("ready", page_count=page_count, chunk_count=chunk_count)

        print(
            f"[Ingestion] session={session_id} ready — "
            f"{page_count} pages, {chunk_count} chunks"
        )

    # ------------------------------------------------------------------ #
    # 3a. Known domain error (e.g. "PDF has no extractable text").        #
    # ------------------------------------------------------------------ #
    except ValueError as exc:
        error_msg = str(exc)
        print(f"[Ingestion] session={session_id} failed (ValueError): {error_msg}")

        _update_session({"status": "error", "error": error_msg})
        _persist_status("error", error_msg=error_msg)
        _cleanup_file()

    # ------------------------------------------------------------------ #
    # 3b. Unexpected / infrastructure errors.                             #
    # ------------------------------------------------------------------ #
    except Exception as exc:
        error_msg = f"Processing failed: {exc}"
        print(f"[Ingestion] session={session_id} failed (unexpected): {exc}")

        _update_session({"status": "error", "error": error_msg})
        _persist_status("error", error_msg=error_msg)
        _cleanup_file()

    # ------------------------------------------------------------------ #
    # 4. Always release memory held by large PDF/vector objects.          #
    # ------------------------------------------------------------------ #
    finally:
        gc.collect()



@app.post("/api/rag/upload", tags=["RAG"])
async def rag_upload(
    background_tasks: BackgroundTasks,
    current_user: CurrentUser,
    file: UploadFile = File(...),
):
    """
    Accept a PDF upload and return immediately with status='processing'.
    Ingestion (chunking + embedding) runs in the background.
    Poll /api/rag/status/{session_id} to know when it's ready.
    """
    # 1. Validate file type
    if not file.filename or not file.filename.lower().endswith(".pdf"):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Only PDF files are supported. Please upload a .pdf file.",
        )
    
    # ── Rate limit: 10 uploads per 5 minutes per user ─────────────────────
    upload_limiter.check(current_user["id"])

    # 2. Generate session ID and save file to disk
    session_id    = str(uuid4())
    safe_filename = f"{session_id}_{file.filename}"
    file_path     = UPLOAD_DIR / safe_filename

    try:
        contents = await file.read()
        if not contents:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Uploaded file is empty.",
            )
        file_path.write_bytes(contents)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Failed to save uploaded file: {exc}",
        )

    # 3. Register session immediately with status="processing"
    created_at = datetime.utcnow().isoformat()
    _rag_sessions[session_id] = {
        "user_id":     current_user["id"],
        "filename":    file.filename,
        "file_path":   str(file_path),
        "created_at":  created_at,
        "history":     [],
        "status":      "processing",   # ← new field
        "page_count":  0,
        "chunk_count": 0,
        "error":       None,
    }

    # NEW: persist session metadata to DB so it survives server restarts
    database.save_rag_session(
        session_id,
        current_user["id"],
        file.filename,
        source_type="pdf",
    )

    # 4. Schedule ingestion to run AFTER this response is sent
    background_tasks.add_task(_run_ingestion, session_id, str(file_path))


    # NEW: log activity so upload appears in Dashboard feed
    database.log_activity(
        current_user["id"],
        "pdf_upload",
        {"session_id": session_id, "filename": file.filename},
    )

    # 5. Return immediately — don't wait for ingestion
    return {
        "session_id": session_id,
        "filename":   file.filename,
        "status":     "processing",
        "created_at": created_at,
    }



@app.get("/api/rag/status/{session_id}", tags=["RAG"])
async def rag_status(session_id: str, current_user: CurrentUser):
    """
    Poll this endpoint after upload to check if ingestion is complete.

    Returns:
      status: "processing" | "ready" | "error"
      page_count, chunk_count: populated when status="ready"
      error: populated when status="error"
    """
    session = _rag_sessions.get(session_id)

    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found.",
        )

    if session["user_id"] != current_user["id"]:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Access denied.",
        )

    return {
        "session_id":  session_id,
        "filename":    session.get("filename"),
        "status":      session.get("status", "processing"),
        "page_count":  session.get("page_count", 0),
        "chunk_count": session.get("chunk_count", 0),
        "error":       session.get("error"),
        "created_at":  session.get("created_at"),
    }



@app.get("/api/rag/sessions", tags=["RAG"])
async def rag_sessions(current_user: CurrentUser):
    user_sessions = [
        {
            "session_id": sid,
            "filename":   s.get("filename"),
            "created_at": s.get("created_at"),
        }
        for sid, s in _rag_sessions.items()
        if s.get("user_id") == current_user["id"]
    ]
    return {"sessions": user_sessions}


@app.post("/api/rag/chat", tags=["RAG"])
async def rag_chat(body: RagChatRequest, current_user: CurrentUser):
    """
    Stream an answer to a question grounded in the uploaded PDF.

    Flow:
      Validate session_id → check ownership → get question
      → fetch top sources → stream answer from chat_with_pdf()
      → save to history → send SSE events
    """
    # 1. Validate session exists
    session = _rag_sessions.get(body.session_id)
    if not session:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Session not found. Please upload a PDF first.",
        )

    # 2. Ownership check
    if session["user_id"] != current_user["id"]:
        raise HTTPException(status_code=status.HTTP_403_FORBIDDEN, detail="Access denied")
    
    if session.get("status") == "processing":
        raise HTTPException(
            status_code=status.HTTP_425_TOO_EARLY,
            detail="Document is still being processed. Please wait.",
        )
    if session.get("status") == "error":
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=session.get("error", "Document processing failed."),
        )

    # 3. Validate question
    question = body.question.strip()
    if not question:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail="Question cannot be empty.",
        )


    def event_stream():
        full_answer = ""
        try:
            # 4. Retrieve relevant source chunks
            try:
                sources = get_top_sources(body.session_id, question)
            except Exception:
                sources = []

            # Emit sources so the frontend can render citations
            yield f"data: {json.dumps({'type': 'sources', 'sources': sources})}\n\n"

            # 5. Stream the answer token-by-token (pass history for multi-turn context)
            for chunk in chat_with_pdf(body.session_id, question, session.get("history", [])):
                full_answer += chunk
                yield f"data: {json.dumps({'type': 'chunk', 'chunk': chunk})}\n\n"

            # 6. Persist Q&A to session history
            session["history"].append((question, full_answer))

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'msg': str(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":    "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":       "keep-alive",
        },
    )


@app.get("/api/rag/history/{session_id}", tags=["RAG"])
async def rag_history(session_id: str, current_user: CurrentUser):
    session = _rag_sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if session["user_id"] != current_user["id"]:
        raise HTTPException(403, "Access denied")
    messages = []
    for q, a in session["history"]:
        messages.append({"role": "user",      "content": q})
        messages.append({"role": "assistant", "content": a})
    return {"session_id": session_id, "messages": messages}


@app.delete("/api/rag/session/{session_id}", tags=["RAG"])
async def rag_delete_session(session_id: str, current_user: CurrentUser):
    session = _rag_sessions.get(session_id)
    if not session:
        raise HTTPException(404, "Session not found")
    if session["user_id"] != current_user["id"]:
        raise HTTPException(403, "Access denied")

    # Remove from vector store
    try:
        pass
        # Note: we intentionally do NOT delete the underlying doc_{hash} collection here.
        # Multiple sessions (or users) may share the same collection if they uploaded
        # the same file. Deleting it would break other sessions still pointing at it.
        # Trade-off: cached collections accumulate in chroma_store over time —
        # a production system would need a ref-count or TTL-based cleanup job.
    except Exception:
        pass

    # Remove file from disk
    file_path = session.get("file_path")
    if file_path:
        try:
            Path(file_path).unlink(missing_ok=True)
        except Exception:
            pass

    del _rag_sessions[session_id]
    return {"deleted": True, "session_id": session_id}


# ══════════════════════════════════════════════════════════════════════════════
# NEWS
# ══════════════════════════════════════════════════════════════════════════════

import news as _news_module


@app.get("/api/news/search", tags=["News"])
async def news_search(
    topic:    str = Query(..., min_length=2, max_length=200),
    category: str = Query(default="general"),
    days:     int = Query(default=7, ge=1, le=30),
    current_user: CurrentUser = None,
):
    cat = category.lower().strip()
    if cat not in _news_module.VALID_CATEGORIES:
        raise HTTPException(400, f"Invalid category '{cat}'. Valid: {sorted(_news_module.VALID_CATEGORIES)}")
    try:
        articles = _news_module.search_news(topic, category=cat, days=days)
    except RuntimeError as exc:
        raise HTTPException(503, f"News search unavailable: {exc}")
    return {"articles": articles, "count": len(articles), "topic": topic, "category": cat, "days": days}


@app.get("/api/news/summarize", tags=["News"])
async def news_summarize(
    topic:    str = Query(..., min_length=2, max_length=200),
    category: str = Query(default="general"),
    days:     int = Query(default=7, ge=1, le=30),
    current_user: CurrentUser = None,
):
    cat = category.lower().strip()
    if cat not in _news_module.VALID_CATEGORIES:
        raise HTTPException(400, f"Invalid category '{cat}'.")
    try:
        articles = _news_module.search_news(topic, category=cat, days=days)
    except RuntimeError as exc:
        raise HTTPException(503, f"News search unavailable: {exc}")

    def stream():
        try:
            yield f"data: {json.dumps({'type': 'articles', 'articles': articles, 'count': len(articles)})}\n\n"
            for chunk in _news_module.summarize_news(articles, topic):
                yield f"data: {json.dumps({'type': 'chunk', 'chunk': chunk})}\n\n"
            yield f"data: {json.dumps({'type': 'done', 'article_count': len(articles)})}\n\n"
            # NEW: log activity (runs after stream completes)
            if current_user:
                database.log_activity(
                    current_user["id"],
                    "news_search",
                    {"topic": topic, "category": cat, "article_count": len(articles)},
                )
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'msg': str(exc)})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no", "Connection": "keep-alive"})


# ══════════════════════════════════════════════════════════════════════════════
# DASHBOARD
# ══════════════════════════════════════════════════════════════════════════════

import dashboard_agent as _dash


@app.get("/api/dashboard/weather", tags=["Dashboard"])
async def dashboard_weather(city: str = Query(..., min_length=1, max_length=100), current_user: CurrentUser = None):
    try:
        raw  = _dash.get_weather.invoke({"city": city})
        data = json.loads(raw)
        if "error" in data:
            raise HTTPException(404, data["error"])
        return data
    except json.JSONDecodeError:
        raise HTTPException(502, "Weather service returned invalid data")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, f"Weather service unavailable: {exc}")


@app.get("/api/dashboard/travel-safety", tags=["Dashboard"])
async def dashboard_travel_safety(destination: str = Query(..., min_length=1, max_length=100), current_user: CurrentUser = None):
    try:
        result = _dash.get_travel_safety.invoke({"destination": destination})
        return {"destination": destination, "analysis": result}
    except Exception as exc:
        raise HTTPException(503, f"Travel safety service unavailable: {exc}")


@app.get("/api/dashboard/headlines", tags=["Dashboard"])
async def dashboard_headlines(topic: str = Query(default="world news", max_length=200), current_user: CurrentUser = None):
    try:
        raw       = _dash.get_headlines.invoke({"topic": topic})
        headlines = json.loads(raw)
        if isinstance(headlines, dict) and "error" in headlines:
            raise HTTPException(503, headlines["error"])
        return {"headlines": headlines, "topic": topic}
    except json.JSONDecodeError:
        raise HTTPException(502, "Headlines service returned invalid data")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, f"Headlines service unavailable: {exc}")


@app.post("/api/dashboard/chat", tags=["Dashboard"])
async def dashboard_chat(body: dict, current_user: CurrentUser = None):
    query = body.get("query", "").strip()
    if not query:
        raise HTTPException(422, "query cannot be empty")

    def stream():
        try:
            result     = _dash.run_dashboard_agent(query)
            chunk_size = 80
            for i in range(0, len(result), chunk_size):
                yield f"data: {json.dumps({'type': 'chunk', 'chunk': result[i:i+chunk_size]})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'msg': str(exc)})}\n\n"

    return StreamingResponse(stream(), media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"})



# ══════════════════════════════════════════════════════════════════════════════
# WORKSPACES
# ══════════════════════════════════════════════════════════════════════════════

class WorkspaceCreate(BaseModel):
    name:        str
    topic:       str
    description: str = ""


@app.get("/api/workspaces")
async def list_workspaces(current_user: CurrentUser):
    """Return all workspaces for the logged-in user."""
    workspaces = database.get_workspaces(current_user["id"])
    return {"workspaces": workspaces}


@app.post("/api/workspaces", status_code=201)
async def create_workspace(body: WorkspaceCreate, current_user: CurrentUser):
    """Create a new workspace and log the activity."""
    if not body.name.strip():
        raise HTTPException(422, "Workspace name cannot be empty")
    if not body.topic.strip():
        raise HTTPException(422, "Topic cannot be empty")

    wid = database.create_workspace(
        current_user["id"], body.name, body.topic, body.description
    )
    # Log this as an activity so it appears in the Dashboard feed
    database.log_activity(
        current_user["id"],
        "workspace_created",
        {"workspace_id": wid, "name": body.name, "topic": body.topic},
        workspace_id=wid,
    )
    return {"workspace_id": wid, "name": body.name, "topic": body.topic}


@app.delete("/api/workspaces/{wid}")
async def delete_workspace(wid: int, current_user: CurrentUser):
    """Delete a workspace. Only the owner can delete their workspace."""
    ws = database.get_workspace(wid)
    if not ws:
        raise HTTPException(404, "Workspace not found")
    if ws["user_id"] != current_user["id"]:
        raise HTTPException(403, "You don't own this workspace")
    database.delete_workspace(wid)
    return {"deleted": True, "workspace_id": wid}




# ══════════════════════════════════════════════════════════════════════════════
# ACTIVITY FEED
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/activity")
async def get_activity(
    current_user: CurrentUser,
    limit: int = Query(default=20, ge=1, le=50),
):
    """
    Return the user's recent activity across all features.
    Powers the activity feed on the Dashboard.
    limit: how many events to return (max 50)
    """
    events = database.get_activity(current_user["id"], limit=limit)
    return {"events": events}



# ══════════════════════════════════════════════════════════════════════════════
# NEWS — TRACKED TOPICS
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/news/tracked")
async def get_tracked_topics(current_user: CurrentUser):
    """Return all news topics the user is tracking."""
    topics = database.get_tracked_topics(current_user["id"])
    return {"topics": topics}


@app.post("/api/news/track", status_code=201)
async def track_topic(body: dict, current_user: CurrentUser):
    """
    Save a news topic for tracking.
    Body: {topic: str, category: str, workspace_id?: int}
    Safe to call multiple times — duplicates are silently ignored.
    """
    topic    = body.get("topic", "").strip()
    category = body.get("category", "general").strip()
    wid      = body.get("workspace_id")

    if not topic:
        raise HTTPException(422, "topic is required")

    tid = database.track_news_topic(current_user["id"], topic, category, wid)
    return {"tracked": True, "id": tid, "topic": topic, "category": category}


@app.delete("/api/news/tracked/{tid}")
async def untrack_topic(tid: int, current_user: CurrentUser):
    """Remove a tracked news topic."""
    deleted = database.delete_tracked_topic(tid)
    if not deleted:
        raise HTTPException(404, "Topic not found")
    return {"deleted": True, "id": tid}



# ══════════════════════════════════════════════════════════════════════════════
# RAG — INGEST TEXT ENDPOINT
# Converts any plain text into a chateable RAG session.
# Used by: News page "Save briefing as document" button.
# ══════════════════════════════════════════════════════════════════════════════

class IngestTextRequest(BaseModel):
    title:   str    # e.g. "News: climate change 2025-06-19"
    content: str    # the full text to embed


@app.post("/api/rag/ingest-text", tags=["RAG"])
async def rag_ingest_text(
    background_tasks: BackgroundTasks,
    body:             IngestTextRequest,
    current_user:     CurrentUser,
):
    """
    Convert plain text into a RAG session.

    Returns session_id immediately (status='processing').
    Ingestion runs in background. Poll /api/rag/status/{session_id}
    or just navigate to PDF Chat — it polls automatically.

    Body:
        title:   name shown in sessions list
        content: text to embed (minimum 50 characters)
    """
    if len(body.content.strip()) < 50:
        raise HTTPException(422, "Content is too short to create a useful session (min 50 chars)")

    session_id = str(uuid4())
    created_at = datetime.utcnow().isoformat()
    title      = body.title.strip()[:80]  # cap title length

    # Register in memory immediately
    _rag_sessions[session_id] = {
        "user_id":     current_user["id"],
        "filename":    title,
        "file_path":   None,
        "created_at":  created_at,
        "history":     [],
        "status":      "processing",
        "source_type": "text_ingest",
    }

    # Persist to DB
    database.save_rag_session(
        session_id,
        current_user["id"],
        title,
        source_type="text_ingest",
    )

    # Schedule background ingestion
    background_tasks.add_task(
        _ingest_text_background, session_id, title, body.content
    )

    # Log activity
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



# ══════════════════════════════════════════════════════════════════════════════
# RESEARCH — RELATED CONTENT
# Surfaces cross-feature content related to a research run.
# Uses keyword matching — no ML, no new dependencies.
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/history/{run_id}/related")
async def get_related_content(run_id: int, current_user: CurrentUser):
    """
    Return content from other features related to this research run.

    Matches by keyword overlap — first 4 significant words of the topic
    are checked against: other run topics, RAG session filenames,
    and tracked news topics.

    Returns:
        related_runs:         other research runs on similar topics
        related_rag_sessions: PDF/text sessions with similar titles
        related_news_topics:  tracked news topics matching keywords
    """
    # Verify run exists and belongs to this user
    run = get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    if run.get("user_id") != current_user["id"]:
        raise HTTPException(403, "Access denied")

    topic = run["topic"]
    uid   = current_user["id"]

    # Extract keywords: lowercase words longer than 3 chars, skip stopwords
    stopwords = {"with", "that", "this", "from", "what", "about", "does", "have"}
    keywords  = [
        w.lower() for w in topic.split()
        if len(w) > 3 and w.lower() not in stopwords
    ][:5]  # max 5 keywords

    def matches(text: str) -> bool:
        """True if any keyword appears in text (case-insensitive)."""
        t = text.lower()
        return any(kw in t for kw in keywords)

    # Related research runs (from DB)
    all_runs = get_history(limit=100, user_id=uid)
    related_runs = [
        {
            "id":         r["id"],
            "topic":      r["topic"],
            "score":      r.get("score"),
            "created_at": r.get("created_at"),
        }
        for r in all_runs
        if r["id"] != run_id and matches(r["topic"])
    ][:5]

    # Related RAG sessions (from in-memory dict)
    related_rag = [
        {
            "session_id":  sid,
            "filename":   s.get("filename", ""),
            "source_type": s.get("source_type", "pdf"),
            "created_at": s.get("created_at"),
        }
        for sid, s in _rag_sessions.items()
        if s.get("user_id") == uid
        and s.get("status") == "ready"
        and matches(s.get("filename") or "")
    ][:5]

    # Related tracked news topics (from DB)
    all_tracked = database.get_tracked_topics(uid)
    related_news = [
        {
            "id":       t["id"],
            "topic":    t["topic"],
            "category": t["category"],
        }
        for t in all_tracked
        if matches(t["topic"])
    ][:5]

    return {
        "run_id":              run_id,
        "topic":               topic,
        "keywords":            keywords,
        "related_runs":         related_runs,
        "related_rag_sessions": related_rag,
        "related_news_topics":  related_news,
    }



# ══════════════════════════════════════════════════════════════════════════════
# GLOBAL SEARCH
# Fans out to all feature data and returns grouped results.
# Used by the CommandPalette (Cmd+K) built on Day 4.
# ══════════════════════════════════════════════════════════════════════════════

@app.get("/api/search")
async def global_search(
    q:            str = Query(..., min_length=2, max_length=200),
    current_user: CurrentUser = None,
):
    """
    Search across all ResearchOS features in one call.
    Returns results grouped by type: research, pdf, news, workspaces.

    Query params:
        q: search string (minimum 2 chars)

    Response shape:
        {
          query: str,
          total: int,
          results: {
            research:   [{id, title, subtitle, url}],
            pdf:        [{id, title, subtitle, url}],
            news:       [{id, title, subtitle, url}],
            workspaces: [{id, title, subtitle, url}],
          }
        }
    """
    uid = current_user["id"]
    kw  = q.lower().strip()

    # ── Research runs (DB) ─────────────────────────────────────────────────────
    all_runs = get_history(limit=100, user_id=uid)
    run_results = [
        {
            "type":     "research",
            "id":       r["id"],
            "title":    r["topic"],
            "subtitle": f"{r.get('word_count', 0)} words · score {r.get('score') or '?'}/10",
            "url":      f"/research?run_id={r['id']}",
        }
        for r in all_runs
        if kw in r["topic"].lower()
    ][:6]

    # ── RAG sessions (in-memory dict) ───────────────────────────────────────────
    pdf_results = [
        {
            "type":     "pdf",
            "id":       sid,
            "title":    s.get("filename", "Untitled"),
            "subtitle": f"{s.get('chunk_count', 0)} chunks · {s.get('source_type', 'pdf')}",
            "url":      f"/pdf-chat?session={sid}",
        }
        for sid, s in _rag_sessions.items()
        if s.get("user_id") == uid
        and kw in (s.get("filename") or "").lower()
        and s.get("status") == "ready"
    ][:6]

    # ── Tracked news topics (DB) ─────────────────────────────────────────────────
    tracked   = database.get_tracked_topics(uid)
    news_results = [
        {
            "type":     "news",
            "id":       t["id"],
            "title":    t["topic"],
            "subtitle": f"Tracked · {t['category']}",
            "url":      f"/news?topic={t['topic']}&category={t['category']}",
        }
        for t in tracked
        if kw in t["topic"].lower()
    ][:6]

    # ── Workspaces (DB) ───────────────────────────────────────────────────────
    workspaces  = database.get_workspaces(uid)
    ws_results  = [
        {
            "type":     "workspace",
            "id":       w["id"],
            "title":    w["name"],
            "subtitle": w["topic"],
            "url":      f"/workspace/{w['id']}",
        }
        for w in workspaces
        if kw in w["name"].lower() or kw in w["topic"].lower()
    ][:6]

    total = len(run_results) + len(pdf_results) + len(news_results) + len(ws_results)

    return {
        "query":   q,
        "total":   total,
        "results": {
            "research":   run_results,
            "pdf":        pdf_results,
            "news":       news_results,
            "workspaces": ws_results,
        },
    }




# ── Unified History ────────────────────────────────────────────────────────────
# Returns last N items from all feature types in one call.
# Used by HistoryPage tabs and mini-history strips on feature pages.
# The 'limit' param controls how many per feature (default 5 for mini-strips).

@app.get("/api/history/unified")
async def unified_history(
    current_user: CurrentUser,
    limit: int = Query(default=5, ge=1, le=100),
    feature: str = Query(default="all"),  # all | research | pdf | news
):
    """
    Unified history endpoint — one call to get last N items from all features.
    Used by HistoryPage and mini-history strips on feature pages.

    feature param filters to a single feature type:
      'all'      → returns research + pdf + news + activity
      'research' → only research runs
      'pdf'      → only RAG sessions
      'news'     → only tracked topics
    """
    uid = current_user["id"]
    result: dict = {}

    if feature in ("all", "research"):
        result["research"] = database.get_history(limit=limit, user_id=uid)

    if feature in ("all", "pdf"):
        sessions = [
            {
                "session_id":  sid,
                "filename":    s.get("filename", "Untitled"),
                "status":      s.get("status", "ready"),
                "source_type": s.get("source_type", "pdf"),
                "chunk_count": s.get("chunk_count", 0),
                "created_at":  s.get("created_at", ""),
            }
            for sid, s in _rag_sessions.items()
            if s.get("user_id") == uid and s.get("status") != "error"
        ]
        # Sort by created_at desc and take limit
        sessions.sort(key=lambda x: x.get("created_at", ""), reverse=True)
        result["pdf"] = sessions[:limit]

    if feature in ("all", "news"):
        result["news"] = database.get_tracked_topics(uid)[:limit]

    if feature == "all":
        result["activity"] = database.get_activity(uid, limit=limit)

    return result



if __name__ == "__main__":
    port   = int(os.getenv("PORT", 8000))          # Render sets PORT=10000
    debug  = os.getenv("RENDER", "") == ""         # True locally, False on Render
    uvicorn.run(
        "main:app",
        host    = "0.0.0.0",
        port    = port,
        reload  = debug,   # reload=True locally, reload=False on Render
        workers = 1,       # always 1 — more workers = OOM on free tier
    )
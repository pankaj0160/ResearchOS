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

load_dotenv(Path(__file__).parent / ".env", override=True)

# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()          # creates all tables including agents + support_tickets
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


@app.get("/api/auth/me")
async def me(current_user: CurrentUser):
    return {
        "id":       current_user["id"],
        "email":    current_user["email"],
        "username": current_user["username"],
    }


# ── Research History ──────────────────────────────────────────────────────────

@app.get("/api/history")
async def history(current_user: CurrentUser):
    return {"runs": get_history(limit=50, user_id=current_user["id"])}


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


# ── Research SSE Stream ───────────────────────────────────────────────────────
@app.get("/api/research/stream")
async def research_stream(
    topic: str = Query(..., min_length=3, max_length=300),
    current_user: CurrentUser = None,
):
    user_id = current_user["id"]

    async def event_stream():
        report   = ""
        feedback = ""
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
                run_id = save_run(topic, report, feedback, user_id=user_id)
                yield f"data: {json.dumps({'type': 'saved', 'run_id': run_id})}\n\n"
 
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
 
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'msg': str(exc)})}\n\n"
 
        finally:
            # ── Free research pipeline memory after every run ──────────────
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

from rag import (
    ingest_pdf,
    chat_with_pdf,
    get_top_sources,
    delete_session,
)

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
    """
    import asyncio

    loop = asyncio.get_event_loop()

    try:
        # run_in_executor runs a blocking function in a separate thread
        # This is the correct way to run sync code inside async FastAPI
        ingest_result = await loop.run_in_executor(
            None,  # None = use default ThreadPoolExecutor
            lambda: ingest_pdf(str(file_path), session_id=session_id)
        )

        page_count  = ingest_result.get("page_count",  0) if isinstance(ingest_result, dict) else 0
        chunk_count = ingest_result.get("chunk_count", 0) if isinstance(ingest_result, dict) else 0

        # Update session with results
        if session_id in _rag_sessions:
            _rag_sessions[session_id].update({
                "status":      "ready",
                "page_count":  page_count,
                "chunk_count": chunk_count,
            })
        print(f"[Ingestion] session={session_id} ready — {page_count} pages, {chunk_count} chunks")

    except ValueError as exc:
        # e.g. "PDF has no extractable text"
        print(f"[Ingestion] session={session_id} failed (ValueError): {exc}")
        if session_id in _rag_sessions:
            _rag_sessions[session_id].update({
                "status": "error",
                "error":  str(exc),
            })
        try:
            Path(file_path).unlink(missing_ok=True)
        except Exception:
            pass

    except Exception as exc:
        print(f"[Ingestion] session={session_id} failed: {exc}")
        if session_id in _rag_sessions:
            _rag_sessions[session_id].update({
                "status": "error",
                "error":  f"Processing failed: {exc}",
            })
        try:
            Path(file_path).unlink(missing_ok=True)
        except Exception:
            pass

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

    # 4. Schedule ingestion to run AFTER this response is sent
    background_tasks.add_task(_run_ingestion, session_id, str(file_path))

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
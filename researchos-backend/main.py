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

load_dotenv(Path(__file__).parent / ".env", override=True)

# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    init_db()          # creates all tables including agents + support_tickets
    yield


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
        try:
            async for event in run_pipeline_async(topic):
                if event.get("agent") == "writer" and event.get("type") == "chunk":
                    report += event.get("msg", "")
                if event.get("agent") == "critic" and event.get("type") == "chunk":
                    feedback += event.get("msg", "")
                yield f"data: {json.dumps(event)}\n\n"

            if report:
                run_id = save_run(topic, report, feedback, user_id=user_id)
                yield f"data: {json.dumps({'type': 'saved', 'run_id': run_id})}\n\n"

            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'msg': str(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


# ══════════════════════════════════════════════════════════════════════════════
# AGENTS — Custom agent creator  [protected]
# ══════════════════════════════════════════════════════════════════════════════

class AgentCreateRequest(BaseModel):
    name:          str
    system_prompt: str
    tools:         List[str]
    model:         str

    @field_validator("name")
    @classmethod
    def name_valid(cls, v: str) -> str:
        v = v.strip()
        if len(v) < 2:
            raise ValueError("Agent name must be at least 2 characters")
        if len(v) > 60:
            raise ValueError("Agent name must be 60 characters or less")
        return v

    @field_validator("system_prompt")
    @classmethod
    def prompt_not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("System prompt cannot be empty")
        return v.strip()


@app.post("/api/agents/create", status_code=status.HTTP_201_CREATED, tags=["Agents"])
async def create_agent(req: AgentCreateRequest, current_user: CurrentUser):
    """Create and persist a custom agent. Returns new agent id + name."""
    agent_id = database.create_agent(
        owner_id=current_user["id"],
        name=req.name,
        system_prompt=req.system_prompt,
        tools=req.tools,
        model=req.model,
    )
    return {"id": agent_id, "name": req.name, "message": "Agent deployed successfully"}


@app.get("/api/agents/list", tags=["Agents"])
async def list_agents(current_user: CurrentUser):
    """Return all agents owned by the current user."""
    agents = database.get_agents_by_user(current_user["id"])
    return {"agents": agents}


@app.delete("/api/agents/{agent_id}", tags=["Agents"])
async def delete_agent(agent_id: int, current_user: CurrentUser):
    """Delete an agent. Only the owner can delete."""
    agent = database.get_agent_by_id(agent_id)
    if not agent:
        raise HTTPException(404, "Agent not found")
    if agent["owner_id"] != current_user["id"]:
        raise HTTPException(403, "Access denied")
    database.delete_agent(agent_id)
    return {"deleted": True, "id": agent_id}


# ══════════════════════════════════════════════════════════════════════════════
# SUPPORT — Ticket submission  [public]
# ══════════════════════════════════════════════════════════════════════════════

class SupportTicketRequest(BaseModel):
    name:    str
    email:   EmailStr
    subject: str
    message: str

    @field_validator("name", "subject", "message")
    @classmethod
    def not_empty(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("This field cannot be empty")
        return v.strip()


@app.post("/api/support/ticket", status_code=status.HTTP_201_CREATED, tags=["Support"])
async def submit_ticket(req: SupportTicketRequest):
    """Submit a support ticket. Public endpoint — no auth required."""
    ticket_id = database.create_support_ticket(
        name=req.name,
        email=req.email,
        subject=req.subject,
        message=req.message,
    )
    print(f"[Support] New ticket #{ticket_id} from {req.email}: {req.subject}")
    return {"status": "received", "ticket_id": ticket_id, "message": "We'll get back to you within 24 hours."}


# ══════════════════════════════════════════════════════════════════════════════
# RAG  (unchanged from your original — kept in full)
# ══════════════════════════════════════════════════════════════════════════════

from rag import ResearchRAG

_rag = ResearchRAG()
_rag_sessions: dict[str, dict] = {}   # session_id → {user_id, filename, history}


@app.post("/api/rag/upload", tags=["RAG"])
async def rag_upload(current_user: CurrentUser):
    """Placeholder — your original upload route goes here unchanged."""
    raise HTTPException(501, "Use your original rag_upload implementation")


@app.get("/api/rag/sessions", tags=["RAG"])
async def rag_sessions(current_user: CurrentUser):
    user_sessions = [
        {"session_id": sid, "filename": s.get("filename"), "created_at": s.get("created_at")}
        for sid, s in _rag_sessions.items()
        if s.get("user_id") == current_user["id"]
    ]
    return {"sessions": user_sessions}


@app.post("/api/rag/chat", tags=["RAG"])
async def rag_chat(body: dict, current_user: CurrentUser):
    """Your original rag_chat implementation goes here unchanged."""
    raise HTTPException(501, "Use your original rag_chat implementation")


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
    try:
        _rag.delete_session(session_id)
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
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
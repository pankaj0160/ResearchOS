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

  POST /api/agents/create            [protected]
  GET  /api/agents/list              [protected]
  DELETE /api/agents/{agent_id}      [protected]

  POST /api/support/ticket                        (public)

  POST /api/rag/upload               [protected]  → rag_router
  POST /api/rag/chat                 [protected]  → rag_router
  GET  /api/rag/sessions             [protected]  → rag_router
  GET  /api/rag/status/{id}          [protected]  → rag_router
  GET  /api/rag/history/{id}         [protected]  → rag_router
  DELETE /api/rag/session/{id}       [protected]  → rag_router

  GET  /api/news/search              [protected]  → news_router
  GET  /api/news/summarize           [protected]  → news_router
  GET  /api/news/tracked             [protected]  → news_router
  POST /api/news/track               [protected]  → news_router
  DELETE /api/news/tracked/{id}      [protected]  → news_router

  GET  /api/dashboard/weather        [protected]  → dashboard_router
  GET  /api/dashboard/travel-safety  [protected]  → dashboard_router
  GET  /api/dashboard/headlines      [protected]  → dashboard_router
  POST /api/dashboard/chat           [protected]  → dashboard_router

  GET  /api/workspaces               [protected]  → workspace_router
  POST /api/workspaces               [protected]  → workspace_router
  DELETE /api/workspaces/{id}        [protected]  → workspace_router

  GET  /api/activity                 [protected]  → workspace_router
  GET  /api/search                   [protected]  → workspace_router
  GET  /api/history/unified          [protected]  → workspace_router
"""

from __future__ import annotations

import os
from contextlib import asynccontextmanager
from pathlib import Path

import uvicorn
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
import asyncpg

# ── Routers ───────────────────────────────────────────────────────────────────
# NOTE: _rag_sessions is the *single* shared dict that lives in rag_router.
#       Every module that needs it must import from there — not from main.py.
from routers.auth_router      import router as auth_router
from routers.research_router  import router as research_router
from routers.rag_router       import router as rag_router, _rag_sessions
from routers.news_router      import router as news_router
from routers.workspace_router import router as workspace_router

# ── Internal modules ──────────────────────────────────────────────────────────
import database
from auth import get_current_user
from database import init_db

load_dotenv(Path(__file__).parent / ".env", override=True)


# ── Global connection pool ────────────────────────────────────────────────────
# Module-level so every router can reach it via get_pool().
# None until lifespan initialises it; stays None in local/SQLite mode.
db_pool: asyncpg.Pool | None = None


def get_pool() -> asyncpg.Pool | None:
    """
    Return the active asyncpg connection pool, or None in local dev mode.

    Usage inside any async route handler:
        pool = get_pool()
        if pool:
            async with pool.acquire() as conn:
                rows = await conn.fetch("SELECT ...")
        else:
            # fall back to sync database module
            rows = database.some_sync_call(...)
    """
    return db_pool


# ── Lifespan ──────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs once at startup and once at shutdown.

    Startup order:
      1. init_db()      — create tables via psycopg2 (sync, one-time cost)
      2. create_pool()  — open 2 warm async connections to Supabase/Postgres
      3. reload RAG sessions from DB into the shared in-memory dict

    Shutdown:
      4. pool.close()   — drain and close all pooled connections cleanly
    """
    global db_pool

    # ── 1. Initialise tables ─────────────────────────────────────────────────
    init_db()

    # ── 2. Build async connection pool ───────────────────────────────────────
    # Strip whitespace so that DATABASE_URL=<blank> in .env is treated as unset.
    # Without .strip(), os.getenv returns "" which is falsy only after stripping.
    database_url = (
        os.getenv("DATABASE_URL", "").strip()
        or os.getenv("SUPABASE_DB_URL", "").strip()
        or None
    )

    if database_url:
        try:
            db_pool = await asyncpg.create_pool(
                dsn             = database_url,
                min_size        = 2,   # always-warm connections
                max_size        = 10,  # Supabase free-tier safe ceiling
                command_timeout = 30,  # seconds before a slow query raises
            )
            print("[DB Pool] Connected — min=2 max=10 connections ready")
        except Exception as exc:
            # Non-fatal: sync psycopg2 fallback still works for all existing code
            print(f"[DB Pool] Failed to create pool: {exc}")
            print("[DB Pool] Falling back to per-request sync connections")
            db_pool = None
    else:
        print("[DB Pool] No DATABASE_URL set — using SQLite / sync mode (local dev)")
        db_pool = None

    # Keep app.state in sync so routers can also do request.app.state.pool
    app.state.pool = db_pool

    # ── 3. Reload RAG sessions from DB ───────────────────────────────────────
    # _rag_sessions is the same dict object imported at module level above;
    # mutating it here mutates it everywhere (Python passes dicts by reference).
    try:
        all_db_sessions = database.get_all_rag_sessions()
        for s in all_db_sessions:
            sid = s["id"]
            if sid not in _rag_sessions:   # never clobber a live in-flight session
                _rag_sessions[sid] = {
                    "user_id":     s["user_id"],
                    "filename":    s["filename"],
                    "file_path":   None,   # file may not exist on disk after restart
                    "created_at":  str(s.get("created_at", "")),
                    "history":     [],     # chat history is intentionally ephemeral
                    "status":      s.get("status", "ready"),
                    "page_count":  s.get("page_count", 0),
                    "chunk_count": s.get("chunk_count", 0),
                    "source_type": s.get("source_type", "pdf"),
                    "run_id":      s.get("run_id"),
                }
        print(f"[Startup] Reloaded {len(all_db_sessions)} RAG sessions from DB")
    except Exception as exc:
        print(f"[Startup] RAG session reload failed (non-fatal): {exc}")

    # ── Hand off to the running server ────────────────────────────────────────
    yield

    # ── 4. Shutdown: drain the pool ───────────────────────────────────────────
    if db_pool:
        await db_pool.close()
        print("[DB Pool] Closed cleanly")


# ── App ───────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="ResearchOS API",
    version="2.0.0",
    description="AI Research & Intelligence Platform",
    lifespan=lifespan,
)

# Initialise app.state.pool to None now; lifespan will set it to db_pool.
# Routers can access it as:  pool = request.app.state.pool
# or via the module-level:   pool = get_pool()
app.state.pool = None

# ── Routers ───────────────────────────────────────────────────────────────────
app.include_router(auth_router)
app.include_router(research_router)
app.include_router(rag_router)
app.include_router(news_router)
app.include_router(workspace_router)

# ── CORS ──────────────────────────────────────────────────────────────────────
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


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == "__main__":
    port  = int(os.getenv("PORT", 8000))        # Render injects PORT=10000
    debug = os.getenv("RENDER", "") == ""       # True locally, False on Render
    uvicorn.run(
        "main:app",
        host    = "0.0.0.0",
        port    = port,
        reload  = debug,   # hot-reload only in local dev
        workers = 1,       # always 1 — more workers → OOM on free tier
    )
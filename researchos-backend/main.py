"""
main.py — FastAPI server entry point for ResearchOS.

What this file does:
  1. Creates the FastAPI app
  2. Sets up startup (database, connection pool, session reload)
  3. Registers all routers (each feature has its own router)
  4. Sets up CORS (so the React frontend can talk to this backend)
  5. Adds middleware (GZip compression, request timing)
  6. Exposes health check and rate-limit status endpoints

Route map:
  /api/auth/*              → auth_router
  /api/research/*          → research_router
  /api/history/*           → research_router + workspace_router
  /api/rag/*               → rag_router
  /api/news/*              → news_router
  /api/dashboard/*         → news_router
  /api/workspaces/*        → workspace_router
  /api/activity            → workspace_router
  /api/search              → workspace_router
  /api/calendar/*          → calendar_router
  /api/rate-limit/status   → main.py (inline)
  /api/health              → main.py (inline)
"""

from __future__ import annotations

import os
import time
from contextlib import asynccontextmanager
from pathlib import Path
from typing import Annotated

import uvicorn
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
import asyncpg

# ── Routers ───────────────────────────────────────────────────────────────────
from routers.auth_router      import router as auth_router
from routers.research_router  import router as research_router
from routers.rag_router       import router as rag_router, _rag_sessions
from routers.news_router      import router as news_router
from routers.workspace_router import router as workspace_router
from routers.calendar_router  import router as calendar_router
from routers.error_handlers   import register_error_handlers

# ── Internal modules ──────────────────────────────────────────────────────────
import database
from auth import get_current_user
from database import init_db
from rate_limit import ALL_LIMITERS

load_dotenv(Path(__file__).parent / ".env", override=True)

CurrentUser = Annotated[dict, Depends(get_current_user)]


# ═══════════════════════════════════════════════════════════════════════════════
# REQUEST DEDUPLICATION
#
# What is this?
# When a user clicks "Research" and the request takes a few seconds,
# they might click again — now TWO research pipelines run at once.
# Deduplication means: if the same user is already running a research
# on the same topic, we DON'T start a second one — we wait for the first.
#
# How it works:
# We keep a set of "in-flight" keys (user_id + topic).
# When a research starts: add key → pipeline runs → key removed.
# If same key comes in while pipeline is running: return 409 Conflict.
#
# This is the same pattern used by payment systems (idempotency keys).
# ═══════════════════════════════════════════════════════════════════════════════

# Set of strings like "42:ai in healthcare" — currently running research
_in_flight_research: set[str] = set()


def research_dedup_key(user_id: int, topic: str) -> str:
    """Build a deduplication key from user_id + normalized topic."""
    return f"{user_id}:{topic.strip().lower()}"


def is_research_in_flight(user_id: int, topic: str) -> bool:
    """Returns True if this user is already researching this exact topic."""
    return research_dedup_key(user_id, topic) in _in_flight_research


def mark_research_started(user_id: int, topic: str) -> None:
    """Record that this research is now running."""
    _in_flight_research.add(research_dedup_key(user_id, topic))


def mark_research_done(user_id: int, topic: str) -> None:
    """Remove the in-flight marker when research finishes or errors."""
    _in_flight_research.discard(research_dedup_key(user_id, topic))


# ═══════════════════════════════════════════════════════════════════════════════
# ASYNC CONNECTION POOL
# Module-level so every router can reach it via get_pool().
# None until lifespan initialises it; stays None in SQLite/local dev mode.
# ═══════════════════════════════════════════════════════════════════════════════

db_pool: asyncpg.Pool | None = None


def get_pool() -> asyncpg.Pool | None:
    """
    Return the active asyncpg connection pool, or None in local dev mode.

    In async route handlers:
        pool = get_pool()
        if pool:
            async with pool.acquire() as conn:
                rows = await conn.fetch("SELECT ...")
        else:
            rows = database.some_sync_call(...)
    """
    return db_pool


# ═══════════════════════════════════════════════════════════════════════════════
# LIFESPAN — Startup + Shutdown
# ═══════════════════════════════════════════════════════════════════════════════

@asynccontextmanager
async def lifespan(app: FastAPI):
    """
    Runs ONCE at startup and ONCE at shutdown.

    Startup order:
      1. init_db()        — create all tables (safe on existing databases)
      2. create_pool()    — open 2 warm async connections to Supabase/Postgres
      3. set_async_pool() — inject pool into database.py for async queries
      4. reload RAG sessions from DB into _rag_sessions (in-memory dict)
      5. start_session_cleanup() — hourly cleanup of old sessions

    Shutdown:
      6. pool.close() — drain all connections cleanly
    """
    global db_pool

    # ── 1. Create all database tables ────────────────────────────────────────
    init_db()

    # ── 2. Build async connection pool ───────────────────────────────────────
    database_url = (
        os.getenv("DATABASE_URL", "").strip()
        or os.getenv("SUPABASE_DB_URL", "").strip()
        or None
    )

    if database_url:
        try:
            db_pool = await asyncpg.create_pool(
                dsn                 = database_url,
                min_size            = 2,    # always-warm connections (instant response)
                max_size            = 10,   # Supabase free-tier safe ceiling
                command_timeout     = 30,   # seconds before a slow query raises error
                statement_cache_size= 0,    # REQUIRED for Supabase Session pooler (port 5432)
                                            # Session pooler doesn't support prepared statements
                                            # Without this: every query silently falls back to
                                            # sync connection → 1-10 second response times
            )
            mode = "Supavisor pooler" if "pooler.supabase.com" in database_url else "direct"
            print(f"[DB Pool] Connected ({mode}) — min=2 max=10 connections ready")

            # ── 3. Inject pool into database.py ──────────────────────────────
            # Imported here (not at top) to avoid circular import:
            # database.py is imported before the pool exists at module load time
            from database import set_async_pool
            set_async_pool(db_pool)
            print("[DB Pool] Injected into database.py ✓")

        except Exception as exc:
            print(f"[DB Pool] Failed to create pool: {exc}")
            print("[DB Pool] Falling back to per-request sync connections")
            db_pool = None
    else:
        print("[DB Pool] No DATABASE_URL — using SQLite / sync mode (local dev)")
        db_pool = None

    app.state.pool = db_pool

    # ── 4. Reload RAG sessions from database ─────────────────────────────────
    # Without this, every server restart would lose all PDF session history.
    # _rag_sessions is the same dict imported above — mutating it here
    # mutates it everywhere (Python passes dicts by reference).
    try:
        all_db_sessions = database.get_all_rag_sessions()
        reloaded = 0
        for s in all_db_sessions:
            sid = s["id"]
            if sid not in _rag_sessions:   # never overwrite a live in-flight session
                _rag_sessions[sid] = {
                    "user_id":     s["user_id"],
                    "filename":    s["filename"],
                    "file_path":   None,              # file may not exist after restart
                    "created_at":  str(s.get("created_at", "")),
                    "history":     [],                # chat history is ephemeral
                    "status":      s.get("status", "ready"),
                    "page_count":  s.get("page_count", 0),
                    "chunk_count": s.get("chunk_count", 0),
                    "source_type": s.get("source_type", "pdf"),
                    "run_id":      s.get("run_id"),
                }
                reloaded += 1
        print(f"[Startup] Reloaded {reloaded} RAG sessions from database")
    except Exception as exc:
        print(f"[Startup] RAG session reload failed (non-fatal): {exc}")

    # ── 5. Start background session cleanup ──────────────────────────────────
    # Removes sessions older than 24h from _rag_sessions dict every hour.
    # Prevents the in-memory dict from growing forever (memory leak fix).
    from routers.rag_router import start_session_cleanup
    start_session_cleanup()

    print("[Startup] ResearchOS is ready ✓")

    # ── Hand off to the running server ────────────────────────────────────────
    yield

    # ── 6. Shutdown: close pool cleanly ──────────────────────────────────────
    if db_pool:
        await db_pool.close()
        print("[Shutdown] DB pool closed cleanly")


# ═══════════════════════════════════════════════════════════════════════════════
# APP CREATION
# ═══════════════════════════════════════════════════════════════════════════════

app = FastAPI(
    title       = "ResearchOS API",
    version     = "3.0.0",
    description = "AI Research & Intelligence Platform — Production Backend",
    lifespan    = lifespan,
    # Disable default /docs in production (set DISABLE_DOCS=true in Render env)
    docs_url    = None if os.getenv("DISABLE_DOCS") == "true" else "/docs",
    redoc_url   = None if os.getenv("DISABLE_DOCS") == "true" else "/redoc",
)

# Register global error handlers (catches all HTTPException + crashes)
register_error_handlers(app)
app.state.pool = None


# ═══════════════════════════════════════════════════════════════════════════════
# MIDDLEWARE
# Middleware runs on EVERY request, before it reaches your route handler.
# Think of it as security guards at the entrance of a building.
# ═══════════════════════════════════════════════════════════════════════════════

# GZip compression — compress responses larger than 500 bytes
# WHY: compresses JSON from ~10KB to ~2KB = 5x faster page loads
# WHAT IT DOES: adds Content-Encoding: gzip header and compresses automatically
app.add_middleware(GZipMiddleware, minimum_size=500)

# CORS — Cross-Origin Resource Sharing
# WHY: browsers block requests from one domain to another by default
# This tells the browser "it's OK for our frontend to call this backend"
_ALLOWED_ORIGINS = [
    "http://localhost:5173",    # Vite dev server
    "http://localhost:3000",    # Create React App dev server
    "http://localhost:4173",    # Vite preview
    "https://research-os-kappa.vercel.app",   # production frontend on Vercel
    os.getenv("FRONTEND_ORIGIN", ""),         # custom domain from env
]

app.add_middleware(
    CORSMiddleware,
    allow_origins     = [o for o in _ALLOWED_ORIGINS if o],
    allow_credentials = True,
    allow_methods     = ["*"],
    allow_headers     = ["*"],
)


# ── Request timing middleware ─────────────────────────────────────────────────
# Logs how long every request takes. Adds X-Process-Time header to responses.
# Shows in terminal: [Timing] GET /api/history → 42ms
# This helps you find slow endpoints — anything over 200ms needs optimization.

@app.middleware("http")
async def add_process_time_header(request: Request, call_next):
    """
    Middleware that measures how long each request takes.
    Adds X-Process-Time: 0.042 header to every response.
    Logs slow requests (>500ms) to the terminal.
    """
    start   = time.perf_counter()
    response = await call_next(request)
    elapsed  = time.perf_counter() - start
    ms       = int(elapsed * 1000)

    # Add timing header so browser DevTools shows it
    response.headers["X-Process-Time"] = f"{elapsed:.4f}"

    # Log slow requests so you can find bottlenecks
    if ms > 500:
        print(f"[Slow ⚠️ ] {request.method} {request.url.path} → {ms}ms")
    elif ms > 100:
        print(f"[Timing] {request.method} {request.url.path} → {ms}ms")

    return response


# ═══════════════════════════════════════════════════════════════════════════════
# ROUTERS — Register all feature routers
# ═══════════════════════════════════════════════════════════════════════════════

app.include_router(auth_router)
app.include_router(workspace_router)   # MUST be before research_router — /api/history/recent + /unified must register before /api/history/{run_id}
app.include_router(research_router)
app.include_router(rag_router)
app.include_router(news_router)
app.include_router(calendar_router)


# ═══════════════════════════════════════════════════════════════════════════════
# INLINE ROUTES — Small enough to live here, not worth their own router
# ═══════════════════════════════════════════════════════════════════════════════

@app.get("/")
async def root():
    """Root health check — used by Render to verify the server is running."""
    return {"status": "ok", "service": "ResearchOS", "version": "3.0.0"}


@app.head("/")
async def root_head():
    """HEAD / — used by uptime monitors and load balancers."""
    return {}


@app.get("/api/health")
async def health():
    """
    Detailed health check.
    Returns database mode (postgres vs sqlite) and pool status.
    """
    pool_size = db_pool.get_size() if db_pool else 0
    return {
        "status":      "ok",
        "service":     "ResearchOS",
        "version":     "3.0.0",
        "db_mode":     "postgres" if database.USE_POSTGRES else "sqlite",
        "pool_active": db_pool is not None,
        "pool_size":   pool_size,
        "rag_sessions_in_memory": len(_rag_sessions),
    }


@app.get("/api/rate-limit/status")
async def rate_limit_status(current_user: CurrentUser):
    """
    Show the current user's rate limit usage across all limiters.
    The frontend uses this to show "3 research runs remaining" warnings.

    Returns:
      {
        research:       { requests_used: 2, requests_remaining: 3, reset_in_seconds: 45 },
        pdf_upload:     { requests_used: 0, requests_remaining: 10, ... },
        news:           { ... },
        dashboard_chat: { ... }
      }
    """
    uid = current_user["id"]
    return {
        name: limiter.get_status(uid)
        for name, limiter in ALL_LIMITERS.items()
    }


# ═══════════════════════════════════════════════════════════════════════════════
# ENTRY POINT
# ═══════════════════════════════════════════════════════════════════════════════

if __name__ == "__main__":
    port  = int(os.getenv("PORT", 8000))
    debug = os.getenv("RENDER", "") == ""   # True locally, False on Render

    print(f"[Boot] Starting ResearchOS on port {port} (debug={debug})")

    uvicorn.run(
        "main:app",
        host    = "0.0.0.0",
        port    = port,
        reload  = debug,   # hot-reload only in local dev (Render sets RENDER=true)
        workers = 1,       # always 1 — more workers = OOM on free tier
    )
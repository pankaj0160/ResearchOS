"""
database.py — Complete database layer for ResearchOS.

Supports two backends:
  1. PostgreSQL (Supabase)  — when DATABASE_URL or SUPABASE_DB_URL is set
  2. SQLite                 — local dev fallback (no Supabase required)

Design principles:
  - Every function has a sync version (fallback) and async version (production)
  - Async versions use the connection pool injected at startup by main.py
  - Schema includes ALL tables with all columns — no more missing-column crashes
  - ALTER TABLE statements add missing columns to existing databases safely
  - In-memory cache for dashboard data (weather, headlines) reduces external API calls

Tables:
  users               — registered accounts
  runs                — research pipeline results
  reset_tokens        — password reset links
  agents              — custom AI agent definitions
  support_tickets     — user support requests
  workspaces          — research workspaces (group work by topic)
  activity_events     — user action log (powers activity feed)
  news_tracked_topics — topics the user follows in News page
  rag_sessions        — PDF upload metadata and processing status
"""

from __future__ import annotations

import json as _json
import os
import re
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Generator

# ── Config ────────────────────────────────────────────────────────────────────

DATABASE_URL = (
    os.getenv("DATABASE_URL", "").strip()
    or os.getenv("SUPABASE_DB_URL", "").strip()
    or ""
)
DB_PATH   = Path(__file__).parent / "researchos.db"  # SQLite fallback
USE_POSTGRES = bool(DATABASE_URL)

# ── Async pool (injected at startup by main.py's lifespan) ───────────────────
# Stays None in local SQLite mode or before startup completes.
_async_pool: Any = None   # type: asyncpg.Pool | None


def set_async_pool(pool: Any) -> None:
    """
    Called once at startup by main.py after asyncpg.create_pool() succeeds.
    All async DB functions use this pool — never create their own connections.
    """
    global _async_pool
    _async_pool = pool


# ── Simple in-memory cache (for dashboard data) ───────────────────────────────
# Stores {key: (value, expires_at)} — avoids hitting external APIs on every page load.
# This is NOT Redis — it's a simple dict that lives in memory only.
# If the server restarts, cache clears. That's fine for weather/headlines data.
_cache: dict[str, tuple[Any, float]] = {}


def cache_get(key: str) -> Any | None:
    """Return cached value if it exists and hasn't expired. Returns None otherwise."""
    entry = _cache.get(key)
    if entry and time.time() < entry[1]:
        return entry[0]
    return None


def cache_set(key: str, value: Any, ttl_seconds: int = 300) -> None:
    """Store value in cache with a time-to-live (TTL) in seconds."""
    _cache[key] = (value, time.time() + ttl_seconds)


def cache_delete(key: str) -> None:
    """Remove a key from cache (call when data changes)."""
    _cache.pop(key, None)


# ═══════════════════════════════════════════════════════════════════════════════
# SCHEMA DEFINITIONS
# Complete schema for ALL tables with ALL columns.
# ALTER TABLE statements safely add columns to existing databases.
# ═══════════════════════════════════════════════════════════════════════════════

# PostgreSQL schema — $N placeholders, SERIAL primary keys
_PG_SCHEMA = [

    # ── Users ─────────────────────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS users (
        id            SERIAL  PRIMARY KEY,
        email         TEXT    NOT NULL UNIQUE,
        username      TEXT    NOT NULL UNIQUE,
        password_hash TEXT    NOT NULL,
        is_verified   INTEGER NOT NULL DEFAULT 0,
        city          TEXT,
        default_topic TEXT,
        created_at    REAL    NOT NULL,
        updated_at    REAL
    )
    """,

    # ── Research runs ─────────────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS runs (
        id           SERIAL  PRIMARY KEY,
        topic        TEXT    NOT NULL,
        report       TEXT    NOT NULL DEFAULT '',
        feedback     TEXT    NOT NULL DEFAULT '',
        score        REAL,
        user_id      INTEGER REFERENCES users(id),
        workspace_id INTEGER,
        word_count   INTEGER NOT NULL DEFAULT 0,
        source_count INTEGER NOT NULL DEFAULT 0,
        created_at   REAL    NOT NULL
    )
    """,

    # ── Password reset tokens ─────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS reset_tokens (
        id         SERIAL  PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id),
        token      TEXT    NOT NULL UNIQUE,
        expires_at REAL    NOT NULL,
        used       INTEGER NOT NULL DEFAULT 0
    )
    """,

    # ── Custom AI agents ──────────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS agents (
        id            SERIAL  PRIMARY KEY,
        owner_id      INTEGER NOT NULL REFERENCES users(id),
        name          TEXT    NOT NULL,
        system_prompt TEXT    NOT NULL,
        tools         TEXT    NOT NULL DEFAULT '',
        model         TEXT    NOT NULL DEFAULT 'llama-3.1-70b-versatile',
        created_at    REAL    NOT NULL
    )
    """,

    # ── Support tickets ───────────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS support_tickets (
        id         SERIAL PRIMARY KEY,
        name       TEXT   NOT NULL,
        email      TEXT   NOT NULL,
        subject    TEXT   NOT NULL,
        message    TEXT   NOT NULL,
        created_at REAL   NOT NULL
    )
    """,

    # ── Workspaces ────────────────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS workspaces (
        id           SERIAL  PRIMARY KEY,
        user_id      INTEGER NOT NULL REFERENCES users(id),
        name         TEXT    NOT NULL,
        topic        TEXT    NOT NULL DEFAULT '',
        description  TEXT    NOT NULL DEFAULT '',
        created_at   REAL    NOT NULL,
        updated_at   REAL
    )
    """,

    # ── Activity events (powers activity feed) ────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS activity_events (
        id           SERIAL  PRIMARY KEY,
        user_id      INTEGER NOT NULL REFERENCES users(id),
        event_type   TEXT    NOT NULL,
        payload      TEXT    NOT NULL DEFAULT '{}',
        workspace_id INTEGER,
        created_at   REAL    NOT NULL
    )
    """,

    # ── News tracked topics ───────────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS news_tracked_topics (
        id           SERIAL  PRIMARY KEY,
        user_id      INTEGER NOT NULL REFERENCES users(id),
        topic        TEXT    NOT NULL,
        category     TEXT    NOT NULL DEFAULT 'general',
        workspace_id INTEGER,
        created_at   REAL    NOT NULL,
        UNIQUE(user_id, topic, category)
    )
    """,

    # ── RAG sessions (PDF uploads) ────────────────────────────────────────────
    """
    CREATE TABLE IF NOT EXISTS rag_sessions (
        id           TEXT    PRIMARY KEY,
        user_id      INTEGER NOT NULL REFERENCES users(id),
        filename     TEXT    NOT NULL,
        source_type  TEXT    NOT NULL DEFAULT 'pdf',
        status       TEXT    NOT NULL DEFAULT 'processing',
        page_count   INTEGER NOT NULL DEFAULT 0,
        chunk_count  INTEGER NOT NULL DEFAULT 0,
        error_msg    TEXT,
        run_id       INTEGER,
        workspace_id INTEGER,
        created_at   REAL    NOT NULL
    )
    """,
]

# ALTER TABLE statements — safely add columns to existing databases.
# Each runs as a separate statement; IF NOT EXISTS prevents errors on fresh DBs.
# IMPORTANT: These run AFTER CREATE TABLE IF NOT EXISTS, so existing databases
# get the new columns without destroying existing data.
_PG_MIGRATIONS = [
    # Add columns that were added after initial deployment
    "ALTER TABLE users         ADD COLUMN IF NOT EXISTS city          TEXT",
    "ALTER TABLE users         ADD COLUMN IF NOT EXISTS default_topic TEXT",
    "ALTER TABLE users         ADD COLUMN IF NOT EXISTS updated_at    REAL",
    "ALTER TABLE runs          ADD COLUMN IF NOT EXISTS workspace_id  INTEGER",
    "ALTER TABLE runs          ADD COLUMN IF NOT EXISTS word_count    INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE runs          ADD COLUMN IF NOT EXISTS source_count  INTEGER NOT NULL DEFAULT 0",
    "ALTER TABLE workspaces    ADD COLUMN IF NOT EXISTS updated_at    REAL",
    "ALTER TABLE rag_sessions  ADD COLUMN IF NOT EXISTS workspace_id  INTEGER",
    "ALTER TABLE rag_sessions  ADD COLUMN IF NOT EXISTS error_msg     TEXT",
    "ALTER TABLE rag_sessions  ADD COLUMN IF NOT EXISTS run_id        INTEGER",
]

# SQLite schema — ? placeholders, AUTOINCREMENT primary keys
_SQLITE_SCHEMA = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    is_verified   INTEGER NOT NULL DEFAULT 0,
    city          TEXT,
    default_topic TEXT,
    created_at    REAL    NOT NULL,
    updated_at    REAL
);
CREATE TABLE IF NOT EXISTS runs (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    topic        TEXT    NOT NULL,
    report       TEXT    NOT NULL DEFAULT '',
    feedback     TEXT    NOT NULL DEFAULT '',
    score        REAL,
    user_id      INTEGER REFERENCES users(id),
    workspace_id INTEGER,
    word_count   INTEGER NOT NULL DEFAULT 0,
    source_count INTEGER NOT NULL DEFAULT 0,
    created_at   REAL    NOT NULL
);
CREATE TABLE IF NOT EXISTS reset_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL REFERENCES users(id),
    token      TEXT    NOT NULL UNIQUE,
    expires_at REAL    NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS agents (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    owner_id      INTEGER NOT NULL REFERENCES users(id),
    name          TEXT    NOT NULL,
    system_prompt TEXT    NOT NULL,
    tools         TEXT    NOT NULL DEFAULT '',
    model         TEXT    NOT NULL DEFAULT 'llama-3.1-70b-versatile',
    created_at    REAL    NOT NULL
);
CREATE TABLE IF NOT EXISTS support_tickets (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL,
    email      TEXT NOT NULL,
    subject    TEXT NOT NULL,
    message    TEXT NOT NULL,
    created_at REAL NOT NULL
);
CREATE TABLE IF NOT EXISTS workspaces (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    name         TEXT    NOT NULL,
    topic        TEXT    NOT NULL DEFAULT '',
    description  TEXT    NOT NULL DEFAULT '',
    created_at   REAL    NOT NULL,
    updated_at   REAL
);
CREATE TABLE IF NOT EXISTS activity_events (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    event_type   TEXT    NOT NULL,
    payload      TEXT    NOT NULL DEFAULT '{}',
    workspace_id INTEGER,
    created_at   REAL    NOT NULL
);
CREATE TABLE IF NOT EXISTS news_tracked_topics (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    topic        TEXT    NOT NULL,
    category     TEXT    NOT NULL DEFAULT 'general',
    workspace_id INTEGER,
    created_at   REAL    NOT NULL,
    UNIQUE(user_id, topic, category)
);
CREATE TABLE IF NOT EXISTS rag_sessions (
    id           TEXT    PRIMARY KEY,
    user_id      INTEGER NOT NULL REFERENCES users(id),
    filename     TEXT    NOT NULL,
    source_type  TEXT    NOT NULL DEFAULT 'pdf',
    status       TEXT    NOT NULL DEFAULT 'processing',
    page_count   INTEGER NOT NULL DEFAULT 0,
    chunk_count  INTEGER NOT NULL DEFAULT 0,
    error_msg    TEXT,
    run_id       INTEGER,
    workspace_id INTEGER,
    created_at   REAL    NOT NULL
);
"""


# ═══════════════════════════════════════════════════════════════════════════════
# CONNECTION HELPERS
# ═══════════════════════════════════════════════════════════════════════════════

@contextmanager
def _conn() -> Generator:
    """
    Context manager that yields a database connection.
    Auto-commits on success, auto-rollbacks on exception, always closes.
    Routes to PostgreSQL or SQLite based on DATABASE_URL.
    """
    if USE_POSTGRES:
        with _pg_conn() as con:
            yield con
    else:
        with _sqlite_conn() as con:
            yield con


@contextmanager
def _pg_conn() -> Generator:
    """Open one psycopg2 connection to PostgreSQL. Opens + closes on every call."""
    import psycopg2
    import psycopg2.extras
    con = psycopg2.connect(DATABASE_URL)
    con.autocommit = False
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


@contextmanager
def _sqlite_conn() -> Generator:
    """Open one SQLite connection. Uses Row factory so rows behave like dicts."""
    import sqlite3
    con = sqlite3.connect(DB_PATH, check_same_thread=False)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA foreign_keys = ON")
    try:
        yield con
        con.commit()
    except Exception:
        con.rollback()
        raise
    finally:
        con.close()


def _fetchone(cur) -> dict | None:
    """Convert a cursor row to a plain dict regardless of DB backend."""
    row = cur.fetchone()
    if row is None:
        return None
    if hasattr(row, "keys"):
        return dict(row)  # sqlite3.Row
    if hasattr(cur, "description") and cur.description:
        return dict(zip([d[0] for d in cur.description], row))  # psycopg2 tuple
    return None


def _fetchall(cur) -> list[dict]:
    """Convert all cursor rows to a list of plain dicts."""
    rows = cur.fetchall()
    if not rows:
        return []
    if hasattr(rows[0], "keys"):
        return [dict(r) for r in rows]  # sqlite3.Row list
    if hasattr(cur, "description") and cur.description:
        cols = [d[0] for d in cur.description]
        return [dict(zip(cols, r)) for r in rows]  # psycopg2 tuple list
    return []


def _q(sql: str) -> str:
    """Replace ? with %s for PostgreSQL. SQLite keeps ? as-is."""
    return sql.replace("?", "%s") if USE_POSTGRES else sql


# ═══════════════════════════════════════════════════════════════════════════════
# INIT — Create all tables at startup
# ═══════════════════════════════════════════════════════════════════════════════

def init_db() -> None:
    """
    Create all tables and apply migrations. Called once at startup by main.py.
    Safe to run on existing databases — IF NOT EXISTS and ALTER TABLE IF NOT EXISTS
    ensure no data is ever lost.
    """
    if USE_POSTGRES:
        import psycopg2
        con = psycopg2.connect(DATABASE_URL)
        con.autocommit = False
        try:
            cur = con.cursor()
            # Create all tables
            for stmt in _PG_SCHEMA:
                cur.execute(stmt)
            # Apply column migrations for existing databases
            for stmt in _PG_MIGRATIONS:
                try:
                    cur.execute(stmt)
                except Exception as e:
                    # Some columns may already exist — that's fine
                    con.rollback()
                    print(f"[DB Migration] Non-fatal: {e}")
                    # Re-open transaction after rollback
                    cur = con.cursor()
            con.commit()
            print("[DB] ResearchOS initialised (PostgreSQL — Supabase)")
        except Exception:
            con.rollback()
            raise
        finally:
            con.close()
    else:
        import sqlite3
        con = sqlite3.connect(DB_PATH, check_same_thread=False)
        con.executescript(_SQLITE_SCHEMA)
        con.commit()
        con.close()
        print(f"[DB] ResearchOS initialised (SQLite at {DB_PATH})")


# ═══════════════════════════════════════════════════════════════════════════════
# RESEARCH RUNS — Write
# ═══════════════════════════════════════════════════════════════════════════════

def save_run(
    topic: str,
    report: str,
    feedback: str,
    user_id: int | None = None,
    workspace_id: int | None = None,
) -> int:
    """
    Save a completed research run (sync fallback for local dev).
    In production, prefer save_run_async() to avoid blocking the event loop.
    Returns the new run's database id.
    """
    # Extract score from feedback text e.g. "Score: 8/10"
    score: float | None = None
    m = re.search(r"Score:\s*(\d+(?:\.\d+)?)/10", feedback, re.IGNORECASE)
    if m:
        score = float(m.group(1))

    word_count   = len(report.split())
    source_count = len(re.findall(r'\[.*?\]\(https?://', report))

    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q(
                "INSERT INTO runs (topic, report, feedback, score, user_id, workspace_id, "
                "word_count, source_count, created_at) VALUES (?,?,?,?,?,?,?,?,?)"
            ),
            (topic, report, feedback, score, user_id, workspace_id,
             word_count, source_count, time.time()),
        )
        if USE_POSTGRES:
            cur.execute("SELECT lastval()")
            return cur.fetchone()[0]
        return cur.lastrowid


async def save_run_async(
    topic: str,
    report: str,
    feedback: str,
    user_id: int | None = None,
    workspace_id: int | None = None,
) -> int:
    """
    Save a completed research run without blocking the event loop.
    Falls back to sync save_run() if the async pool isn't available.
    Returns the new run's database id.
    """
    if not _async_pool:
        return save_run(topic, report, feedback, user_id, workspace_id)

    score: float | None = None
    m = re.search(r"Score:\s*(\d+(?:\.\d+)?)/10", feedback, re.IGNORECASE)
    if m:
        score = float(m.group(1))

    word_count   = len(report.split())
    source_count = len(re.findall(r'\[.*?\]\(https?://', report))

    # acquire() borrows one connection from the pool for the duration of this block
    async with _async_pool.acquire() as conn:
        run_id: int = await conn.fetchval(
            """
            INSERT INTO runs
                (topic, report, feedback, score, user_id, workspace_id,
                 word_count, source_count, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id
            """,
            topic, report, feedback, score, user_id, workspace_id,
            word_count, source_count, time.time(),
        )
    return run_id


# ═══════════════════════════════════════════════════════════════════════════════
# RESEARCH RUNS — Read
# ═══════════════════════════════════════════════════════════════════════════════

def get_history(limit: int = 50, user_id: int | None = None) -> list[dict]:
    """Return research runs as list of dicts. Sync fallback."""
    with _conn() as con:
        cur = con.cursor()
        if user_id is not None:
            cur.execute(
                _q("""SELECT id, topic, score, word_count, source_count, created_at,
                             substr(report, 1, 300) AS excerpt
                      FROM runs WHERE user_id = ?
                      ORDER BY created_at DESC LIMIT ?"""),
                (user_id, limit),
            )
        else:
            cur.execute(
                _q("""SELECT id, topic, score, word_count, source_count, created_at,
                             substr(report, 1, 300) AS excerpt
                      FROM runs ORDER BY created_at DESC LIMIT ?"""),
                (limit,),
            )
        return _fetchall(cur)


async def get_history_async(limit: int = 50, user_id: int | None = None) -> list[dict]:
    """Return research runs without blocking the event loop."""
    if not _async_pool:
        return get_history(limit=limit, user_id=user_id)

    async with _async_pool.acquire() as conn:
        if user_id is not None:
            rows = await conn.fetch(
                """
                SELECT id, topic, score, word_count, source_count, created_at,
                       SUBSTRING(report, 1, 300) AS excerpt
                FROM   runs
                WHERE  user_id = $1
                ORDER  BY created_at DESC
                LIMIT  $2
                """,
                user_id, limit,
            )
        else:
            rows = await conn.fetch(
                """
                SELECT id, topic, score, word_count, source_count, created_at,
                       SUBSTRING(report, 1, 300) AS excerpt
                FROM   runs
                ORDER  BY created_at DESC
                LIMIT  $1
                """,
                limit,
            )
    return [dict(row) for row in rows]


def get_run(run_id: int) -> dict | None:
    """Return one research run by id. Includes full report text."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(_q("SELECT * FROM runs WHERE id = ?"), (run_id,))
        return _fetchone(cur)


async def get_run_async(run_id: int) -> dict | None:
    """Return one research run by id (async)."""
    if not _async_pool:
        return get_run(run_id)
    async with _async_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM runs WHERE id = $1", run_id)
    return dict(row) if row else None


def delete_run(run_id: int) -> bool:
    """Delete a research run. Returns True if deleted."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(_q("DELETE FROM runs WHERE id = ?"), (run_id,))
        return cur.rowcount > 0


async def delete_run_async(run_id: int) -> bool:
    """Delete a research run (async). Returns True if deleted."""
    if not _async_pool:
        return delete_run(run_id)
    async with _async_pool.acquire() as conn:
        result = await conn.execute("DELETE FROM runs WHERE id = $1", run_id)
    return result.split()[-1] != "0"


def search_runs(user_id: int, query: str, limit: int = 20) -> list[dict]:
    """
    Full-text search over research topics and report content.
    PostgreSQL uses tsvector for fast indexed search.
    SQLite uses LIKE (slower but works locally).
    """
    if not query or not query.strip():
        return []
    q = query.strip()

    if USE_POSTGRES:
        sql = """
            SELECT id, topic, score, word_count, source_count, created_at,
                   LEFT(report, 300) AS excerpt,
                   ts_rank(
                       to_tsvector('english', COALESCE(topic,'') || ' ' || COALESCE(report,'')),
                       plainto_tsquery('english', %s)
                   ) AS rank
            FROM runs
            WHERE user_id = %s
              AND to_tsvector('english', COALESCE(topic,'') || ' ' || COALESCE(report,''))
                  @@ plainto_tsquery('english', %s)
            ORDER BY rank DESC, created_at DESC
            LIMIT %s
        """
        with _conn() as con:
            cur = con.cursor()
            cur.execute(sql, (q, user_id, q, limit))
            return _fetchall(cur)
    else:
        sql = (
            "SELECT id, topic, score, word_count, source_count, created_at, "
            "substr(report, 1, 300) AS excerpt "
            "FROM runs WHERE user_id = ? AND (topic LIKE ? OR report LIKE ?) "
            "ORDER BY created_at DESC LIMIT ?"
        )
        with _conn() as con:
            cur = con.cursor()
            like = f"%{q}%"
            cur.execute(sql, (user_id, like, like, limit))
            return _fetchall(cur)


async def search_runs_async(user_id: int, query: str, limit: int = 20) -> list[dict]:
    """Full-text search over research runs (async)."""
    if not _async_pool:
        return search_runs(user_id, query, limit)
    async with _async_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, topic, score, word_count, source_count, created_at,
                   SUBSTRING(report, 1, 300) AS excerpt
            FROM   runs
            WHERE  user_id = $1
              AND  (
                     to_tsvector('english', topic || ' ' || report)
                     @@ plainto_tsquery('english', $2)
                     OR topic ILIKE $3
                   )
            ORDER  BY created_at DESC
            LIMIT  $4
            """,
            user_id, query, f"%{query}%", limit,
        )
    return [dict(row) for row in rows]


# ═══════════════════════════════════════════════════════════════════════════════
# USERS — Write
# ═══════════════════════════════════════════════════════════════════════════════

def create_user(email: str, username: str, password_hash: str) -> int:
    """Create a new user. Returns the new user's id."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q("INSERT INTO users (email, username, password_hash, created_at) VALUES (?,?,?,?)"),
            (email, username, password_hash, time.time()),
        )
        if USE_POSTGRES:
            cur.execute("SELECT lastval()")
            return cur.fetchone()[0]
        return cur.lastrowid


async def create_user_async(email: str, username: str, password_hash: str) -> int:
    """Create a new user (async). Returns the new user's id."""
    if not _async_pool:
        return create_user(email, username, password_hash)
    async with _async_pool.acquire() as conn:
        user_id = await conn.fetchval(
            """
            INSERT INTO users (email, username, password_hash, created_at)
            VALUES ($1, $2, $3, $4)
            RETURNING id
            """,
            email, username, password_hash, time.time(),
        )
    return user_id


def update_password(user_id: int, password_hash: str) -> None:
    """Update a user's password hash."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q("UPDATE users SET password_hash = ? WHERE id = ?"),
            (password_hash, user_id),
        )


def update_user_profile(
    user_id: int,
    city: str | None = None,
    default_topic: str | None = None,
) -> bool:
    """Update optional profile fields. Only updates fields that are provided."""
    fields: dict = {}
    if city is not None:
        fields["city"] = city.strip()
    if default_topic is not None:
        fields["default_topic"] = default_topic.strip()
    if not fields:
        return False
    fields["updated_at"] = time.time()
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q(f"UPDATE users SET {set_clause} WHERE id = ?"),
            (*fields.values(), user_id),
        )
        return cur.rowcount > 0


async def update_user_profile_async(
    user_id: int,
    city: str | None = None,
    default_topic: str | None = None,
) -> bool:
    """Update optional profile fields (async)."""
    if not _async_pool:
        return update_user_profile(user_id, city=city, default_topic=default_topic)
    updates = []
    values: list = []
    if city is not None:
        updates.append(f"city = ${len(values)+1}")
        values.append(city.strip())
    if default_topic is not None:
        updates.append(f"default_topic = ${len(values)+1}")
        values.append(default_topic.strip())
    if not updates:
        return False
    updates.append(f"updated_at = ${len(values)+1}")
    values.append(time.time())
    values.append(user_id)
    async with _async_pool.acquire() as conn:
        result = await conn.execute(
            f"UPDATE users SET {', '.join(updates)} WHERE id = ${len(values)}",
            *values,
        )
    return result.split()[-1] != "0"


def save_reset_token(user_id: int, token: str, ttl_seconds: int = 3600) -> None:
    """Save a password reset token. Invalidates any previous tokens for this user."""
    expires_at = time.time() + ttl_seconds
    with _conn() as con:
        cur = con.cursor()
        # Invalidate old tokens first
        cur.execute(_q("UPDATE reset_tokens SET used = 1 WHERE user_id = ? AND used = 0"), (user_id,))
        cur.execute(
            _q("INSERT INTO reset_tokens (user_id, token, expires_at) VALUES (?,?,?)"),
            (user_id, token, expires_at),
        )


def use_reset_token(token: str) -> int | None:
    """
    Validate and consume a reset token. Returns user_id if valid, None otherwise.
    Marks the token as used so it can't be reused.
    """
    now = time.time()
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q("SELECT user_id, expires_at, used FROM reset_tokens WHERE token = ?"),
            (token,),
        )
        row = _fetchone(cur)
        if not row or row["used"] or row["expires_at"] < now:
            return None
        cur.execute(_q("UPDATE reset_tokens SET used = 1 WHERE token = ?"), (token,))
        return row["user_id"]


# ═══════════════════════════════════════════════════════════════════════════════
# USERS — Read
# ═══════════════════════════════════════════════════════════════════════════════

def get_user_by_email(email: str) -> dict | None:
    with _conn() as con:
        cur = con.cursor()
        cur.execute(_q("SELECT * FROM users WHERE email = ?"), (email,))
        return _fetchone(cur)


async def get_user_by_email_async(email: str) -> dict | None:
    if not _async_pool:
        return get_user_by_email(email)
    async with _async_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM users WHERE email = $1", email)
    return dict(row) if row else None


def get_user_by_username(username: str) -> dict | None:
    with _conn() as con:
        cur = con.cursor()
        cur.execute(_q("SELECT * FROM users WHERE username = ?"), (username,))
        return _fetchone(cur)


def get_user_by_id(user_id: int) -> dict | None:
    with _conn() as con:
        cur = con.cursor()
        cur.execute(_q("SELECT * FROM users WHERE id = ?"), (user_id,))
        return _fetchone(cur)


def get_user_full(user_id: int) -> dict | None:
    """Return user with profile fields (city, default_topic)."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q("SELECT id, email, username, city, default_topic, created_at FROM users WHERE id = ?"),
            (user_id,),
        )
        return _fetchone(cur)


async def get_user_full_async(user_id: int) -> dict | None:
    """Return user with profile fields (async). Called on every /api/auth/me request."""
    if not _async_pool:
        return get_user_full(user_id)
    async with _async_pool.acquire() as conn:
        row = await conn.fetchrow(
            """
            SELECT id, email, username, city, default_topic, created_at
            FROM   users WHERE id = $1
            """,
            user_id,
        )
    return dict(row) if row else None


# ═══════════════════════════════════════════════════════════════════════════════
# WORKSPACES
# ═══════════════════════════════════════════════════════════════════════════════

def create_workspace(user_id: int, name: str, topic: str, description: str = "") -> int:
    """Create a new workspace. Returns its id."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q("INSERT INTO workspaces (user_id, name, topic, description, created_at) VALUES (?,?,?,?,?)"),
            (user_id, name.strip(), topic.strip(), description.strip(), time.time()),
        )
        if USE_POSTGRES:
            cur.execute("SELECT lastval()")
            return cur.fetchone()[0]
        return cur.lastrowid


async def create_workspace_async(user_id: int, name: str, topic: str, description: str = "") -> int:
    """Create a new workspace (async). Returns its id."""
    if not _async_pool:
        return create_workspace(user_id, name, topic, description)
    async with _async_pool.acquire() as conn:
        wid = await conn.fetchval(
            """
            INSERT INTO workspaces (user_id, name, topic, description, created_at)
            VALUES ($1, $2, $3, $4, $5)
            RETURNING id
            """,
            user_id, name.strip(), topic.strip(), description.strip(), time.time(),
        )
    return wid


def get_workspaces(user_id: int) -> list[dict]:
    """Return all workspaces for a user, newest-updated first."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q("""SELECT id, user_id, name, topic, description, created_at, updated_at
                  FROM workspaces WHERE user_id = ?
                  ORDER BY updated_at DESC NULLS LAST, created_at DESC"""),
            (user_id,),
        )
        return _fetchall(cur)


async def get_workspaces_async(user_id: int) -> list[dict]:
    """Return all workspaces for a user (async)."""
    if not _async_pool:
        return get_workspaces(user_id)
    async with _async_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, user_id, name, topic, description, created_at, updated_at
            FROM   workspaces
            WHERE  user_id = $1
            ORDER  BY updated_at DESC NULLS LAST, created_at DESC
            """,
            user_id,
        )
    return [dict(row) for row in rows]


def get_workspace(workspace_id: int) -> dict | None:
    """Return a single workspace by id (used for ownership check before delete)."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(_q("SELECT * FROM workspaces WHERE id = ?"), (workspace_id,))
        return _fetchone(cur)


async def get_workspace_async(workspace_id: int) -> dict | None:
    """Return a single workspace by id (async)."""
    if not _async_pool:
        return get_workspace(workspace_id)
    async with _async_pool.acquire() as conn:
        row = await conn.fetchrow("SELECT * FROM workspaces WHERE id = $1", workspace_id)
    return dict(row) if row else None


def delete_workspace(workspace_id: int) -> bool:
    """Delete a workspace. Returns True if deleted."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(_q("DELETE FROM workspaces WHERE id = ?"), (workspace_id,))
        return cur.rowcount > 0


async def delete_workspace_async(workspace_id: int) -> bool:
    """Delete a workspace (async). Returns True if deleted."""
    if not _async_pool:
        return delete_workspace(workspace_id)
    async with _async_pool.acquire() as conn:
        result = await conn.execute("DELETE FROM workspaces WHERE id = $1", workspace_id)
    return result.split()[-1] != "0"


def update_workspace(workspace_id: int, **kwargs) -> bool:
    """Update name/topic/description. Only updates provided fields."""
    allowed = {"name", "topic", "description"}
    fields = {k: v for k, v in kwargs.items() if k in allowed}
    if not fields:
        return False
    fields["updated_at"] = time.time()
    set_clause = ", ".join(f"{k} = ?" for k in fields)
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q(f"UPDATE workspaces SET {set_clause} WHERE id = ?"),
            (*fields.values(), workspace_id),
        )
        return cur.rowcount > 0


# ═══════════════════════════════════════════════════════════════════════════════
# ACTIVITY EVENTS — Powers the activity feed on Dashboard + each feature page
# ═══════════════════════════════════════════════════════════════════════════════

def log_activity(
    user_id: int,
    event_type: str,
    payload: dict,
    workspace_id: int | None = None,
) -> None:
    """
    Record a user action. Fire-and-forget — never raises, so activity logging
    never breaks the feature that triggered it.

    event_type examples: 'research_complete', 'pdf_upload', 'news_search'
    payload: any dict with context about the event (topic, filename, etc.)
    """
    try:
        with _conn() as con:
            cur = con.cursor()
            cur.execute(
                _q(
                    "INSERT INTO activity_events "
                    "(user_id, event_type, payload, workspace_id, created_at) VALUES (?,?,?,?,?)"
                ),
                (user_id, event_type, _json.dumps(payload), workspace_id, time.time()),
            )
    except Exception as exc:
        print(f"[Activity] Failed to log '{event_type}' for user {user_id}: {exc}")


async def log_activity_async(
    user_id: int,
    event_type: str,
    payload: dict,
    workspace_id: int | None = None,
) -> None:
    """Log a user action without blocking the event loop. Never raises."""
    if not _async_pool:
        log_activity(user_id, event_type, payload, workspace_id)
        return
    try:
        async with _async_pool.acquire() as conn:
            await conn.execute(
                """
                INSERT INTO activity_events
                    (user_id, event_type, payload, workspace_id, created_at)
                VALUES ($1, $2, $3, $4, $5)
                """,
                user_id, event_type, _json.dumps(payload), workspace_id, time.time(),
            )
    except Exception as exc:
        print(f"[Activity] Failed to log '{event_type}' for user {user_id}: {exc}")


def get_activity(user_id: int, limit: int = 20) -> list[dict]:
    """Return recent activity events for a user with payload parsed from JSON."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q(
                "SELECT id, event_type, payload, workspace_id, created_at "
                "FROM activity_events WHERE user_id = ? "
                "ORDER BY created_at DESC LIMIT ?"
            ),
            (user_id, limit),
        )
        rows = _fetchall(cur)
    for row in rows:
        if isinstance(row.get("payload"), str):
            try:
                row["payload"] = _json.loads(row["payload"])
            except (ValueError, TypeError):
                row["payload"] = {}
    return rows


async def get_activity_async(user_id: int, limit: int = 20) -> list[dict]:
    """Return recent activity events (async) with payload parsed from JSON."""
    if not _async_pool:
        return get_activity(user_id, limit)
    async with _async_pool.acquire() as conn:
        rows = await conn.fetch(
            """
            SELECT id, event_type, payload, workspace_id, created_at
            FROM   activity_events
            WHERE  user_id = $1
            ORDER  BY created_at DESC
            LIMIT  $2
            """,
            user_id, limit,
        )
    result = [dict(row) for row in rows]
    for row in result:
        if isinstance(row.get("payload"), str):
            try:
                row["payload"] = _json.loads(row["payload"])
            except (ValueError, TypeError):
                row["payload"] = {}
    return result


# ═══════════════════════════════════════════════════════════════════════════════
# NEWS TRACKED TOPICS
# ═══════════════════════════════════════════════════════════════════════════════

def track_news_topic(
    user_id: int,
    topic: str,
    category: str = "general",
    workspace_id: int | None = None,
) -> int:
    """
    Save a news topic for a user.
    ON CONFLICT DO NOTHING prevents duplicates — safe to call repeatedly.
    Returns the topic id (0 if it already existed and was ignored).
    """
    with _conn() as con:
        cur = con.cursor()
        if USE_POSTGRES:
            cur.execute(
                """INSERT INTO news_tracked_topics (user_id, topic, category, workspace_id, created_at)
                   VALUES (%s, %s, %s, %s, %s)
                   ON CONFLICT (user_id, topic, category) DO NOTHING""",
                (user_id, topic.strip(), category.strip(), workspace_id, time.time()),
            )
            cur.execute(
                "SELECT id FROM news_tracked_topics WHERE user_id=%s AND topic=%s AND category=%s",
                (user_id, topic.strip(), category.strip()),
            )
            row = cur.fetchone()
            return row[0] if row else 0
        else:
            cur.execute(
                "INSERT OR IGNORE INTO news_tracked_topics "
                "(user_id, topic, category, workspace_id, created_at) VALUES (?,?,?,?,?)",
                (user_id, topic.strip(), category.strip(), workspace_id, time.time()),
            )
            return cur.lastrowid or 0


async def track_news_topic_async(
    user_id: int,
    topic: str,
    category: str = "general",
    workspace_id: int | None = None,
) -> int:
    """Save a news topic for a user (async). Safe to call repeatedly."""
    if not _async_pool:
        return track_news_topic(user_id, topic, category, workspace_id)
    async with _async_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO news_tracked_topics
                (user_id, topic, category, workspace_id, created_at)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (user_id, topic, category) DO NOTHING
            """,
            user_id, topic.strip(), category.strip(), workspace_id, time.time(),
        )
        row = await conn.fetchrow(
            """SELECT id FROM news_tracked_topics
               WHERE user_id = $1 AND topic = $2 AND category = $3""",
            user_id, topic.strip(), category.strip(),
        )
    return row["id"] if row else 0


def get_tracked_topics(user_id: int) -> list[dict]:
    """Return all tracked news topics for a user."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q("SELECT * FROM news_tracked_topics WHERE user_id = ? ORDER BY created_at DESC"),
            (user_id,),
        )
        return _fetchall(cur)


async def get_tracked_topics_async(user_id: int) -> list[dict]:
    """Return all tracked news topics for a user (async)."""
    if not _async_pool:
        return get_tracked_topics(user_id)
    async with _async_pool.acquire() as conn:
        rows = await conn.fetch(
            "SELECT * FROM news_tracked_topics WHERE user_id = $1 ORDER BY created_at DESC",
            user_id,
        )
    return [dict(row) for row in rows]


def delete_tracked_topic(topic_id: int) -> bool:
    """Delete a tracked topic. Returns True if deleted."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(_q("DELETE FROM news_tracked_topics WHERE id = ?"), (topic_id,))
        return cur.rowcount > 0


async def delete_tracked_topic_async(topic_id: int) -> bool:
    """Delete a tracked topic (async). Returns True if deleted."""
    if not _async_pool:
        return delete_tracked_topic(topic_id)
    async with _async_pool.acquire() as conn:
        result = await conn.execute("DELETE FROM news_tracked_topics WHERE id = $1", topic_id)
    return result.split()[-1] != "0"


# ═══════════════════════════════════════════════════════════════════════════════
# RAG SESSIONS — PDF upload metadata
# ═══════════════════════════════════════════════════════════════════════════════

def save_rag_session(
    session_id: str,
    user_id: int,
    filename: str,
    source_type: str = "pdf",
    run_id: int | None = None,
    workspace_id: int | None = None,
) -> None:
    """Persist RAG session to DB. Safe to call multiple times (ON CONFLICT DO NOTHING)."""
    with _conn() as con:
        cur = con.cursor()
        if USE_POSTGRES:
            cur.execute(
                """INSERT INTO rag_sessions
                   (id, user_id, filename, source_type, run_id, workspace_id, created_at)
                   VALUES (%s,%s,%s,%s,%s,%s,%s)
                   ON CONFLICT (id) DO NOTHING""",
                (session_id, user_id, filename, source_type, run_id, workspace_id, time.time()),
            )
        else:
            cur.execute(
                "INSERT OR IGNORE INTO rag_sessions "
                "(id, user_id, filename, source_type, run_id, workspace_id, created_at) "
                "VALUES (?,?,?,?,?,?,?)",
                (session_id, user_id, filename, source_type, run_id, workspace_id, time.time()),
            )


async def save_rag_session_async(
    session_id: str,
    user_id: int,
    filename: str,
    source_type: str = "pdf",
    run_id: int | None = None,
    workspace_id: int | None = None,
) -> None:
    """Persist RAG session to DB (async). Safe to call multiple times."""
    if not _async_pool:
        save_rag_session(session_id, user_id, filename, source_type, run_id, workspace_id)
        return
    async with _async_pool.acquire() as conn:
        await conn.execute(
            """
            INSERT INTO rag_sessions
                (id, user_id, filename, source_type, run_id, workspace_id, created_at)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (id) DO NOTHING
            """,
            session_id, user_id, filename, source_type, run_id, workspace_id, time.time(),
        )


def update_rag_session_status(
    session_id: str,
    status: str,
    page_count: int = 0,
    chunk_count: int = 0,
    error_msg: str | None = None,
) -> None:
    """Update RAG session after PDF processing completes or fails."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q("UPDATE rag_sessions SET status=?, page_count=?, chunk_count=?, error_msg=? WHERE id=?"),
            (status, page_count, chunk_count, error_msg, session_id),
        )


async def update_rag_session_status_async(
    session_id: str,
    status: str,
    page_count: int = 0,
    chunk_count: int = 0,
    error_msg: str | None = None,
) -> None:
    """Update RAG session status (async)."""
    if not _async_pool:
        update_rag_session_status(session_id, status, page_count, chunk_count, error_msg)
        return
    async with _async_pool.acquire() as conn:
        await conn.execute(
            """
            UPDATE rag_sessions
            SET    status=$1, page_count=$2, chunk_count=$3, error_msg=$4
            WHERE  id = $5
            """,
            status, page_count, chunk_count, error_msg, session_id,
        )


def get_all_rag_sessions() -> list[dict]:
    """Return ALL rag sessions (all users). Used on startup to reload into memory dict."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(_q("SELECT * FROM rag_sessions ORDER BY created_at DESC"))
        return _fetchall(cur)


def get_rag_sessions_for_user(user_id: int) -> list[dict]:
    """Return RAG sessions for a specific user."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q("SELECT * FROM rag_sessions WHERE user_id = ? ORDER BY created_at DESC"),
            (user_id,),
        )
        return _fetchall(cur)


def delete_rag_session_db(session_id: str) -> bool:
    """Remove a RAG session from the DB."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(_q("DELETE FROM rag_sessions WHERE id = ?"), (session_id,))
        return cur.rowcount > 0


# ═══════════════════════════════════════════════════════════════════════════════
# AGENTS
# ═══════════════════════════════════════════════════════════════════════════════

def create_agent(owner_id: int, name: str, system_prompt: str, tools: list[str], model: str) -> int:
    """Create a custom AI agent. Returns its id."""
    tools_str = ",".join(tools)
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q("INSERT INTO agents (owner_id, name, system_prompt, tools, model, created_at) VALUES (?,?,?,?,?,?)"),
            (owner_id, name, system_prompt, tools_str, model, time.time()),
        )
        if USE_POSTGRES:
            cur.execute("SELECT lastval()")
            return cur.fetchone()[0]
        return cur.lastrowid


def delete_agent(agent_id: int) -> bool:
    """Delete an agent. Returns True if deleted."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(_q("DELETE FROM agents WHERE id = ?"), (agent_id,))
        return cur.rowcount > 0


def get_agents_by_user(owner_id: int) -> list[dict]:
    """Return all agents for a user with tools parsed to list."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q("SELECT * FROM agents WHERE owner_id = ? ORDER BY created_at DESC"),
            (owner_id,),
        )
        rows = _fetchall(cur)
    for d in rows:
        d["tools"] = d["tools"].split(",") if d.get("tools") else []
    return rows


def get_agent_by_id(agent_id: int) -> dict | None:
    """Return one agent by id with tools parsed to list."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(_q("SELECT * FROM agents WHERE id = ?"), (agent_id,))
        d = _fetchone(cur)
    if not d:
        return None
    d["tools"] = d["tools"].split(",") if d.get("tools") else []
    return d


# ═══════════════════════════════════════════════════════════════════════════════
# SUPPORT TICKETS
# ═══════════════════════════════════════════════════════════════════════════════

def create_support_ticket(name: str, email: str, subject: str, message: str) -> int:
    """Save a support ticket. Returns its id."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q("INSERT INTO support_tickets (name, email, subject, message, created_at) VALUES (?,?,?,?,?)"),
            (name, email, subject, message, time.time()),
        )
        if USE_POSTGRES:
            cur.execute("SELECT lastval()")
            return cur.fetchone()[0]
        return cur.lastrowid


def get_support_tickets(limit: int = 100) -> list[dict]:
    """Return recent support tickets."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q("SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT ?"),
            (limit,),
        )
        return _fetchall(cur)
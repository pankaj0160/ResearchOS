"""
database.py — PostgreSQL handler for ResearchOS.

Replaces SQLite with PostgreSQL via psycopg2.
Connection URL read from DATABASE_URL env var.

Falls back to SQLite if DATABASE_URL is not set —
this keeps local development working without Supabase.

Schema (PostgreSQL):
  users(id, email, username, password_hash, is_verified, created_at)
  runs(id, topic, report, feedback, score, user_id, created_at)
  reset_tokens(id, user_id, token, expires_at, used)
  agents(id, owner_id, name, system_prompt, tools, model, created_at)
  support_tickets(id, name, email, subject, message, created_at)
"""

from __future__ import annotations

import os
import re
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Generator

# ── Config ────────────────────────────────────────────────────────────────────

DATABASE_URL = os.getenv("DATABASE_URL", "")
DB_PATH      = Path(__file__).parent / "researchos.db"   # SQLite fallback

# True = use PostgreSQL, False = use SQLite fallback
USE_POSTGRES = bool(DATABASE_URL)

# ── Schema ────────────────────────────────────────────────────────────────────

# PostgreSQL version — uses SERIAL and %s
_PG_SCHEMA_STATEMENTS = [
    """
    CREATE TABLE IF NOT EXISTS users (
        id            SERIAL PRIMARY KEY,
        email         TEXT   NOT NULL UNIQUE,
        username      TEXT   NOT NULL UNIQUE,
        password_hash TEXT   NOT NULL,
        is_verified   INTEGER NOT NULL DEFAULT 0,
        created_at    REAL   NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS runs (
        id         SERIAL PRIMARY KEY,
        topic      TEXT  NOT NULL,
        report     TEXT  NOT NULL DEFAULT '',
        feedback   TEXT  NOT NULL DEFAULT '',
        score      REAL,
        user_id    INTEGER REFERENCES users(id),
        created_at REAL  NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS reset_tokens (
        id         SERIAL PRIMARY KEY,
        user_id    INTEGER NOT NULL REFERENCES users(id),
        token      TEXT    NOT NULL UNIQUE,
        expires_at REAL    NOT NULL,
        used       INTEGER NOT NULL DEFAULT 0
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS agents (
        id            SERIAL PRIMARY KEY,
        owner_id      INTEGER NOT NULL REFERENCES users(id),
        name          TEXT    NOT NULL,
        system_prompt TEXT    NOT NULL,
        tools         TEXT    NOT NULL DEFAULT '',
        model         TEXT    NOT NULL DEFAULT 'llama-3.1-70b-versatile',
        created_at    REAL    NOT NULL
    )
    """,
    """
    CREATE TABLE IF NOT EXISTS support_tickets (
        id         SERIAL PRIMARY KEY,
        name       TEXT NOT NULL,
        email      TEXT NOT NULL,
        subject    TEXT NOT NULL,
        message    TEXT NOT NULL,
        created_at REAL NOT NULL
    )
    """,
]

# SQLite version — uses AUTOINCREMENT and ? (unchanged from before)
_SQLITE_CREATE_SQL = """
CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    email         TEXT    NOT NULL UNIQUE,
    username      TEXT    NOT NULL UNIQUE,
    password_hash TEXT    NOT NULL,
    is_verified   INTEGER NOT NULL DEFAULT 0,
    created_at    REAL    NOT NULL
);
CREATE TABLE IF NOT EXISTS runs (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    topic       TEXT    NOT NULL,
    report      TEXT    NOT NULL DEFAULT '',
    feedback    TEXT    NOT NULL DEFAULT '',
    score       REAL,
    user_id     INTEGER REFERENCES users(id),
    created_at  REAL    NOT NULL
);
CREATE TABLE IF NOT EXISTS reset_tokens (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id    INTEGER NOT NULL,
    token      TEXT    NOT NULL UNIQUE,
    expires_at REAL    NOT NULL,
    used       INTEGER NOT NULL DEFAULT 0,
    FOREIGN KEY (user_id) REFERENCES users(id)
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
"""

# ── Connection context managers ───────────────────────────────────────────────

@contextmanager
def _conn() -> Generator:
    """
    Returns a connection to PostgreSQL (if DATABASE_URL is set)
    or SQLite (fallback for local dev without Supabase).
    Automatically commits on success, rolls back on exception.
    """
    if USE_POSTGRES:
        with _pg_conn() as con:
            yield con
    else:
        with _sqlite_conn() as con:
            yield con


@contextmanager
def _pg_conn() -> Generator:
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
    """Normalize a cursor row to a plain dict regardless of DB backend."""
    row = cur.fetchone()
    if row is None:
        return None
    if hasattr(row, "keys"):
        return dict(row)                        # sqlite3.Row
    if hasattr(cur, "description") and cur.description:
        cols = [d[0] for d in cur.description]  # psycopg2 tuple
        return dict(zip(cols, row))
    return None


def _fetchall(cur) -> list[dict]:
    """Normalize all cursor rows to a list of plain dicts."""
    rows = cur.fetchall()
    if not rows:
        return []
    if hasattr(rows[0], "keys"):
        return [dict(r) for r in rows]          # sqlite3.Row
    if hasattr(cur, "description") and cur.description:
        cols = [d[0] for d in cur.description]  # psycopg2 tuples
        return [dict(zip(cols, r)) for r in rows]
    return []


def _q(sql: str) -> str:
    """
    Convert SQLite-style ? placeholders to PostgreSQL %s placeholders.
    Only applied when USE_POSTGRES is True.
    """
    if USE_POSTGRES:
        return sql.replace("?", "%s")
    return sql


# ── Init ──────────────────────────────────────────────────────────────────────

def init_db() -> None:
    """Create all tables if they don't exist. Called once at startup."""
    if USE_POSTGRES:
        import psycopg2
        con = psycopg2.connect(DATABASE_URL)
        con.autocommit = False
        try:
            cur = con.cursor()
            for statement in _PG_SCHEMA_STATEMENTS:
                cur.execute(statement)
            con.commit()
            print(f"[DB] ResearchOS initialised (PostgreSQL — Supabase)")
        except Exception:
            con.rollback()
            raise
        finally:
            con.close()
    else:
        import sqlite3
        con = sqlite3.connect(DB_PATH, check_same_thread=False)
        con.executescript(_SQLITE_CREATE_SQL)
        con.commit()
        con.close()
        print(f"[DB] ResearchOS initialised (SQLite at {DB_PATH})")


# ── Runs — Write (UPDATED) ────────────────────────────────────────────────────
# Changes from original:
#   + accepts workspace_id parameter
#   + auto-calculates word_count from report text
#   + auto-calculates source_count by counting markdown links in report

def save_run(
    topic: str,
    report: str,
    feedback: str,
    user_id: int | None = None,
    workspace_id: int | None = None,  # NEW param
) -> int:
    # Extract score from critic feedback (same as before)
    score: float | None = None
    m = re.search(r"Score:\s*(\d+(?:\.\d+)?)/10", feedback, re.IGNORECASE)
    if m:
        score = float(m.group(1))

    # NEW: calculate word count and source count automatically
    word_count = len(report.split())
    source_count = len(re.findall(r'\[.*?\]\(https?://', report))

    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q(
                "INSERT INTO runs (topic, report, feedback, score, user_id, workspace_id, word_count, source_count, created_at) "
                "VALUES (?,?,?,?,?,?,?,?,?)"
            ),
            (topic, report, feedback, score, user_id, workspace_id, word_count, source_count, time.time()),
        )
        if USE_POSTGRES:
            cur.execute("SELECT lastval()")
            return cur.fetchone()[0]
        return cur.lastrowid

# ── Runs — Read ───────────────────────────────────────────────────────────────

def get_history(limit: int = 50, user_id: int | None = None) -> list[dict]:
    with _conn() as con:
        cur = con.cursor()
        if user_id is not None:
            cur.execute(
                _q("""SELECT id, topic, score, created_at,
                             substr(report, 1, 200) AS excerpt
                      FROM runs WHERE user_id = ?
                      ORDER BY created_at DESC LIMIT ?"""),
                (user_id, limit),
            )
        else:
            cur.execute(
                _q("""SELECT id, topic, score, created_at,
                             substr(report, 1, 200) AS excerpt
                      FROM runs ORDER BY created_at DESC LIMIT ?"""),
                (limit,),
            )
        return _fetchall(cur)


def get_run(run_id: int) -> dict | None:
    with _conn() as con:
        cur = con.cursor()
        cur.execute(_q("SELECT * FROM runs WHERE id = ?"), (run_id,))
        return _fetchone(cur)


def delete_run(run_id: int) -> bool:
    with _conn() as con:
        cur = con.cursor()
        cur.execute(_q("DELETE FROM runs WHERE id = ?"), (run_id,))
        return cur.rowcount > 0


# ── Users — Write ─────────────────────────────────────────────────────────────

def create_user(email: str, username: str, password_hash: str) -> int:
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


def save_reset_token(user_id: int, token: str, ttl_seconds: int = 3600) -> None:
    expires_at = time.time() + ttl_seconds
    with _conn() as con:
        cur = con.cursor()
        cur.execute(_q("UPDATE reset_tokens SET used = 1 WHERE user_id = ? AND used = 0"), (user_id,))
        cur.execute(
            _q("INSERT INTO reset_tokens (user_id, token, expires_at) VALUES (?,?,?)"),
            (user_id, token, expires_at),
        )


def use_reset_token(token: str) -> int | None:
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


def update_password(user_id: int, password_hash: str) -> None:
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q("UPDATE users SET password_hash = ? WHERE id = ?"),
            (password_hash, user_id),
        )


# ── Users — Read ──────────────────────────────────────────────────────────────

def get_user_by_email(email: str) -> dict | None:
    with _conn() as con:
        cur = con.cursor()
        cur.execute(_q("SELECT * FROM users WHERE email = ?"), (email,))
        return _fetchone(cur)


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


# ── Agents — Write ────────────────────────────────────────────────────────────

def create_agent(owner_id: int, name: str, system_prompt: str, tools: list[str], model: str) -> int:
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
    with _conn() as con:
        cur = con.cursor()
        cur.execute(_q("DELETE FROM agents WHERE id = ?"), (agent_id,))
        return cur.rowcount > 0


# ── Agents — Read ─────────────────────────────────────────────────────────────

def get_agents_by_user(owner_id: int) -> list[dict]:
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q("SELECT * FROM agents WHERE owner_id = ? ORDER BY created_at DESC"),
            (owner_id,),
        )
        rows = _fetchall(cur)
    for d in rows:
        d["tools"] = d["tools"].split(",") if d["tools"] else []
    return rows


def get_agent_by_id(agent_id: int) -> dict | None:
    with _conn() as con:
        cur = con.cursor()
        cur.execute(_q("SELECT * FROM agents WHERE id = ?"), (agent_id,))
        d = _fetchone(cur)
    if not d:
        return None
    d["tools"] = d["tools"].split(",") if d["tools"] else []
    return d


# ── Support Tickets — Write ───────────────────────────────────────────────────

def create_support_ticket(name: str, email: str, subject: str, message: str) -> int:
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


# ── Support Tickets — Read ────────────────────────────────────────────────────

def get_support_tickets(limit: int = 100) -> list[dict]:
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q("SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT ?"),
            (limit,),
        )
        return _fetchall(cur)



# ── User Profile — Read (enhanced) ────────────────────────────────────────────
# Why: The existing get_user_by_id() doesn't return new profile columns (city,
# default_topic). This new function returns the full profile including them.
# Used by the updated /api/auth/me route so the frontend gets city + topic.

def get_user_full(user_id: int) -> dict | None:
    """Return user row including new profile fields (city, default_topic)."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q("SELECT id, email, username, city, default_topic, created_at FROM users WHERE id = ?"),
            (user_id,),
        )
        return _fetchone(cur)


# ── User Profile — Write ──────────────────────────────────────────────────────
# Why: Users need to set their city (for weather) and default_topic (for
# headlines). This is called by PATCH /api/auth/me which you'll add in Step 4.

def update_user_profile(
    user_id: int,
    city: str | None = None,
    default_topic: str | None = None,
) -> bool:
    """Update city and/or default_topic for a user. Only updates fields provided."""
    fields: dict = {}
    if city is not None:
        fields["city"] = city.strip()
    if default_topic is not None:
        fields["default_topic"] = default_topic.strip()
    if not fields:
        return False  # nothing to update

    fields["updated_at"] = time.time()
    set_clause = ", ".join(f"{k} = ?" for k in fields)

    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q(f"UPDATE users SET {set_clause} WHERE id = ?"),
            (*fields.values(), user_id),
        )
        return cur.rowcount > 0
    



# ── Workspaces — Write ────────────────────────────────────────────────────────
# Why: These are the 4 database operations every workspace API route needs.
# create = POST /api/workspaces
# get_workspaces = GET /api/workspaces (list all for user)
# get_workspace = used to verify ownership before delete
# delete_workspace = DELETE /api/workspaces/{id}
# update_workspace = future PATCH support

def create_workspace(
    user_id: int,
    name: str,
    topic: str,
    description: str = "",
) -> int:
    """Create a new workspace. Returns the new workspace id."""
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


def get_workspaces(user_id: int) -> list[dict]:
    """Return all workspaces for a user, newest first."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q("""SELECT id, user_id, name, topic, description, created_at, updated_at
                  FROM workspaces WHERE user_id = ?
                  ORDER BY updated_at DESC NULLS LAST, created_at DESC"""),
            (user_id,),
        )
        return _fetchall(cur)


def get_workspace(workspace_id: int) -> dict | None:
    """Return a single workspace by id (used for ownership check before delete)."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(_q("SELECT * FROM workspaces WHERE id = ?"), (workspace_id,))
        return _fetchone(cur)


def delete_workspace(workspace_id: int) -> bool:
    """Delete a workspace. Returns True if a row was deleted."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(_q("DELETE FROM workspaces WHERE id = ?"), (workspace_id,))
        return cur.rowcount > 0


def update_workspace(workspace_id: int, **kwargs) -> bool:
    """Update name/topic/description of a workspace."""
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
    




# ── Activity Events ───────────────────────────────────────────────────────────
# Why: log_activity() is called after every major user action (research run,
# PDF upload, news search, workspace created). It NEVER crashes the caller —
# activity logging is fire-and-forget. get_activity() powers the Dashboard
# activity feed that shows what the user has done across all features.

import json as _json  # use alias to avoid conflicts with main.py's json import


def log_activity(
    user_id: int,
    event_type: str,
    payload: dict,
    workspace_id: int | None = None,
) -> None:
    """
    Record a user action in the activity_events table.
    Fire-and-forget — never raises an exception, so callers always succeed
    even if activity logging fails.

    event_type examples:
      'research_run'      payload: {run_id, topic, word_count}
      'pdf_upload'        payload: {session_id, filename}
      'news_search'       payload: {topic, category, article_count}
      'workspace_created' payload: {workspace_id, name, topic}
      'text_ingested'     payload: {session_id, title}
    """
    try:
        with _conn() as con:
            cur = con.cursor()
            cur.execute(
                _q(
                    "INSERT INTO activity_events (user_id, event_type, payload, workspace_id, created_at) "
                    "VALUES (?,?,?,?,?)"
                ),
                (user_id, event_type, _json.dumps(payload), workspace_id, time.time()),
            )
    except Exception as exc:
        # Log to console but never raise — activity failure must not break features
        print(f"[Activity] Failed to log '{event_type}' for user {user_id}: {exc}")


def get_activity(user_id: int, limit: int = 20) -> list[dict]:
    """
    Return recent activity events for a user, newest first.
    Parses payload from JSON string back to dict before returning.
    """
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

    # Parse payload JSON string → dict (psycopg2 may return it already parsed)
    for row in rows:
        if isinstance(row.get("payload"), str):
            try:
                row["payload"] = _json.loads(row["payload"])
            except (ValueError, TypeError):
                row["payload"] = {}
    return rows



# ── News Tracked Topics ───────────────────────────────────────────────────────
# Why: Users should be able to save news topics they follow.
# The UNIQUE constraint means tracking the same topic twice is a no-op
# (ON CONFLICT DO NOTHING) rather than an error — safe to call repeatedly.

def track_news_topic(
    user_id: int,
    topic: str,
    category: str = "general",
    workspace_id: int | None = None,
) -> int:
    """
    Save a news topic for a user. Safe to call multiple times —
    UNIQUE(user_id, topic, category) prevents duplicates.
    Returns the id of the tracked topic row.
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
            # SQLite doesn't support ON CONFLICT ... DO NOTHING in the same way
            cur.execute(
                "INSERT OR IGNORE INTO news_tracked_topics (user_id, topic, category, workspace_id, created_at) VALUES (?,?,?,?,?)",
                (user_id, topic.strip(), category.strip(), workspace_id, time.time()),
            )
            return cur.lastrowid or 0


def get_tracked_topics(user_id: int) -> list[dict]:
    """Return all tracked news topics for a user."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q("SELECT * FROM news_tracked_topics WHERE user_id = ? ORDER BY created_at DESC"),
            (user_id,),
        )
        return _fetchall(cur)


def delete_tracked_topic(topic_id: int) -> bool:
    """Remove a tracked topic. Returns True if row was deleted."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(_q("DELETE FROM news_tracked_topics WHERE id = ?"), (topic_id,))
        return cur.rowcount > 0
    


# ── RAG Sessions — DB persistence ─────────────────────────────────────────────
# Why: Right now RAG sessions only live in the Python _rag_sessions dict.
# When the server restarts, all session metadata is lost (users see empty list).
# These functions persist session metadata to Supabase so sessions survive restarts.
# NOTE: ChromaDB still stores vectors locally — these functions only handle metadata.

def save_rag_session(
    session_id: str,
    user_id: int,
    filename: str,
    source_type: str = "pdf",
    run_id: int | None = None,
    workspace_id: int | None = None,
) -> None:
    """Persist RAG session metadata to DB. ON CONFLICT DO NOTHING = safe to call twice."""
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
                "INSERT OR IGNORE INTO rag_sessions (id, user_id, filename, source_type, run_id, workspace_id, created_at) VALUES (?,?,?,?,?,?,?)",
                (session_id, user_id, filename, source_type, run_id, workspace_id, time.time()),
            )


def update_rag_session_status(
    session_id: str,
    status: str,
    page_count: int = 0,
    chunk_count: int = 0,
    error_msg: str | None = None,
) -> None:
    """Update RAG session status after ingestion completes (or fails)."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q(
                "UPDATE rag_sessions SET status=?, page_count=?, chunk_count=?, error_msg=? WHERE id=?"
            ),
            (status, page_count, chunk_count, error_msg, session_id),
        )


def get_all_rag_sessions() -> list[dict]:
    """Return ALL rag sessions (all users). Used on startup to reload into memory dict."""
    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q("SELECT * FROM rag_sessions ORDER BY created_at DESC")
        )
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
    





# ── Research History — Full Text Search ───────────────────────────────────────
# Uses PostgreSQL's native tsvector for full-text search on Supabase.
# Falls back to simple LIKE search for SQLite (local dev).
# Returns lightweight summary rows — no full report text (too large).

def search_runs(
    user_id: int,
    query: str,
    limit: int = 20,
) -> list[dict]:
    """
    Full-text search over research run topics and report content.

    Args:
        user_id: only return runs belonging to this user
        query:   search string
        limit:   max results (default 20)

    Returns:
        List of dicts with: id, topic, score, word_count,
        source_count, created_at, excerpt (first 300 chars of report)
    """
    if not query or not query.strip():
        return []

    q = query.strip()

    if USE_POSTGRES:
        # PostgreSQL full-text search using plainto_tsquery
        # plainto_tsquery handles multi-word phrases and ignores punctuation
        # ts_rank orders results by relevance
        sql = """
            SELECT
                id, topic, score, word_count, source_count, created_at,
                LEFT(report, 300) AS excerpt,
                ts_rank(
                    to_tsvector('english', COALESCE(topic,'') || ' ' || COALESCE(report,'')),
                    plainto_tsquery('english', %s)
                ) AS rank
            FROM runs
            WHERE
                user_id = %s
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
        # SQLite fallback: simple LIKE on both topic and report
        sql = ("SELECT id, topic, score, word_count, source_count, created_at, "
               "substr(report, 1, 300) AS excerpt "
               "FROM runs WHERE user_id = ? AND (topic LIKE ? OR report LIKE ?) "
               "ORDER BY created_at DESC LIMIT ?")
        with _conn() as con:
            cur = con.cursor()
            like = f"%{q}%"
            cur.execute(sql, (user_id, like, like, limit))
            return _fetchall(cur)
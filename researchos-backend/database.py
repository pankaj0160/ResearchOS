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


# ── Runs — Write ──────────────────────────────────────────────────────────────

def save_run(topic: str, report: str, feedback: str, user_id: int | None = None) -> int:
    score: float | None = None
    m = re.search(r"Score:\s*(\d+(?:\.\d+)?)/10", feedback, re.IGNORECASE)
    if m:
        score = float(m.group(1))

    with _conn() as con:
        cur = con.cursor()
        cur.execute(
            _q("INSERT INTO runs (topic, report, feedback, score, user_id, created_at) VALUES (?,?,?,?,?,?)"),
            (topic, report, feedback, score, user_id, time.time()),
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
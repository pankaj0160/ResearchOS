"""
database.py — SQLite handler for ResearchOS.

Schema:
  users(id, email, username, password_hash, is_verified, created_at)
  runs(id, topic, report, feedback, score, user_id, created_at)
  reset_tokens(id, user_id, token, expires_at, used)
  agents(id, owner_id, name, system_prompt, tools, model, created_at)       ← NEW
  support_tickets(id, name, email, subject, message, created_at)             ← NEW
"""

from __future__ import annotations

import json
import sqlite3
import time
from contextlib import contextmanager
from pathlib import Path
from typing import Generator

DB_PATH = Path(__file__).parent / "researchos.db"

# ── Schema ────────────────────────────────────────────────────────────────────

_CREATE_SQL = """
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


@contextmanager
def _conn() -> Generator[sqlite3.Connection, None, None]:
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


def init_db() -> None:
    """Create all tables if they don't exist. Call once at startup."""
    with _conn() as con:
        con.executescript(_CREATE_SQL)
    print(f"[DB] ResearchOS initialised at {DB_PATH}")


# ── Runs — Write ──────────────────────────────────────────────────────────────

def save_run(topic: str, report: str, feedback: str, user_id: int | None = None) -> int:
    import re
    score: float | None = None
    m = re.search(r"Score:\s*(\d+(?:\.\d+)?)\/10", feedback, re.IGNORECASE)
    if m:
        score = float(m.group(1))
    with _conn() as con:
        cur = con.execute(
            "INSERT INTO runs (topic, report, feedback, score, user_id, created_at) VALUES (?,?,?,?,?,?)",
            (topic, report, feedback, score, user_id, time.time()),
        )
        return cur.lastrowid


# ── Runs — Read ───────────────────────────────────────────────────────────────

def get_history(limit: int = 50, user_id: int | None = None) -> list[dict]:
    with _conn() as con:
        if user_id is not None:
            rows = con.execute(
                """SELECT id, topic, score, created_at,
                          substr(report, 1, 200) AS excerpt
                   FROM runs WHERE user_id = ?
                   ORDER BY created_at DESC LIMIT ?""",
                (user_id, limit),
            ).fetchall()
        else:
            rows = con.execute(
                """SELECT id, topic, score, created_at,
                          substr(report, 1, 200) AS excerpt
                   FROM runs ORDER BY created_at DESC LIMIT ?""",
                (limit,),
            ).fetchall()
    return [dict(r) for r in rows]


def get_run(run_id: int) -> dict | None:
    with _conn() as con:
        row = con.execute("SELECT * FROM runs WHERE id = ?", (run_id,)).fetchone()
    return dict(row) if row else None


def delete_run(run_id: int) -> bool:
    with _conn() as con:
        cur = con.execute("DELETE FROM runs WHERE id = ?", (run_id,))
        return cur.rowcount > 0


# ── Users — Write ─────────────────────────────────────────────────────────────

def create_user(email: str, username: str, password_hash: str) -> int:
    with _conn() as con:
        cur = con.execute(
            "INSERT INTO users (email, username, password_hash, created_at) VALUES (?,?,?,?)",
            (email, username, password_hash, time.time()),
        )
        return cur.lastrowid


def save_reset_token(user_id: int, token: str, ttl_seconds: int = 3600) -> None:
    expires_at = time.time() + ttl_seconds
    with _conn() as con:
        con.execute("UPDATE reset_tokens SET used = 1 WHERE user_id = ? AND used = 0", (user_id,))
        con.execute(
            "INSERT INTO reset_tokens (user_id, token, expires_at) VALUES (?,?,?)",
            (user_id, token, expires_at),
        )


def use_reset_token(token: str) -> int | None:
    now = time.time()
    with _conn() as con:
        row = con.execute(
            "SELECT user_id, expires_at, used FROM reset_tokens WHERE token = ?", (token,)
        ).fetchone()
        if not row or row["used"] or row["expires_at"] < now:
            return None
        con.execute("UPDATE reset_tokens SET used = 1 WHERE token = ?", (token,))
        return row["user_id"]


def update_password(user_id: int, password_hash: str) -> None:
    with _conn() as con:
        con.execute("UPDATE users SET password_hash = ? WHERE id = ?", (password_hash, user_id))


# ── Users — Read ──────────────────────────────────────────────────────────────

def get_user_by_email(email: str) -> dict | None:
    with _conn() as con:
        row = con.execute("SELECT * FROM users WHERE email = ?", (email,)).fetchone()
    return dict(row) if row else None


def get_user_by_username(username: str) -> dict | None:
    with _conn() as con:
        row = con.execute("SELECT * FROM users WHERE username = ?", (username,)).fetchone()
    return dict(row) if row else None


def get_user_by_id(user_id: int) -> dict | None:
    with _conn() as con:
        row = con.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return dict(row) if row else None


# ── Agents — Write ────────────────────────────────────────────────────────────

def create_agent(
    owner_id: int,
    name: str,
    system_prompt: str,
    tools: list[str],
    model: str,
) -> int:
    """Create a custom agent. Returns new agent id."""
    tools_str = ",".join(tools)
    with _conn() as con:
        cur = con.execute(
            "INSERT INTO agents (owner_id, name, system_prompt, tools, model, created_at) VALUES (?,?,?,?,?,?)",
            (owner_id, name, system_prompt, tools_str, model, time.time()),
        )
        return cur.lastrowid


def delete_agent(agent_id: int) -> bool:
    with _conn() as con:
        cur = con.execute("DELETE FROM agents WHERE id = ?", (agent_id,))
        return cur.rowcount > 0


# ── Agents — Read ─────────────────────────────────────────────────────────────

def get_agents_by_user(owner_id: int) -> list[dict]:
    with _conn() as con:
        rows = con.execute(
            "SELECT * FROM agents WHERE owner_id = ? ORDER BY created_at DESC",
            (owner_id,),
        ).fetchall()
    result = []
    for r in rows:
        d = dict(r)
        d["tools"] = d["tools"].split(",") if d["tools"] else []
        result.append(d)
    return result


def get_agent_by_id(agent_id: int) -> dict | None:
    with _conn() as con:
        row = con.execute("SELECT * FROM agents WHERE id = ?", (agent_id,)).fetchone()
    if not row:
        return None
    d = dict(row)
    d["tools"] = d["tools"].split(",") if d["tools"] else []
    return d


# ── Support Tickets — Write ───────────────────────────────────────────────────

def create_support_ticket(name: str, email: str, subject: str, message: str) -> int:
    """Save a support ticket. Returns new ticket id."""
    with _conn() as con:
        cur = con.execute(
            "INSERT INTO support_tickets (name, email, subject, message, created_at) VALUES (?,?,?,?,?)",
            (name, email, subject, message, time.time()),
        )
        return cur.lastrowid


# ── Support Tickets — Read ────────────────────────────────────────────────────

def get_support_tickets(limit: int = 100) -> list[dict]:
    """Admin helper — list recent tickets."""
    with _conn() as con:
        rows = con.execute(
            "SELECT * FROM support_tickets ORDER BY created_at DESC LIMIT ?", (limit,)
        ).fetchall()
    return [dict(r) for r in rows]
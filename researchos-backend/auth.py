"""
auth.py — Authentication utilities for ResearchOS.

Provides:
  - Password hashing & verification (bcrypt)
  - Access-token JWT creation & decoding (python-jose)
  - Refresh-token generation & hashing (opaque, rotated, revocable)
  - FastAPI dependency: get_current_user

TOKEN MODEL:
  Access token  — short-lived (15 min) JWT, stateless, never revocable on its
                  own. If stolen, it's only useful for 15 minutes.
  Refresh token — long-lived (30 days) opaque random string. The RAW value is
                  only ever sent to the client once (at login/refresh) and is
                  never stored server-side — only its SHA-256 hash is, in the
                  refresh_tokens table. This is what makes revocation possible:
                  we can invalidate a specific device's session (logout) or
                  every session (logout-all / password reset) by flipping a
                  `revoked_at` flag, something a stateless JWT alone can't do.
  Rotation      — every time a refresh token is used at POST /api/auth/refresh,
                  it is revoked and a new one is issued. A leaked refresh token
                  that gets replayed after the legitimate client already used
                  it will be rejected (see routers/auth_router.py::refresh).

FIX (this version):
  get_current_user() previously called database.get_user_by_id() — a SYNC
  function that opens a brand-new psycopg2 connection to Supabase on every
  single call. Since get_current_user runs on EVERY authenticated request
  and this call was never wrapped in run_in_executor, it blocked the whole
  asyncio event loop for the duration of that connection (TCP + SSL handshake
  + query, over a real network round trip). With a single uvicorn worker,
  every other in-flight request queued up behind it — this is what caused
  the escalating multi-second delays across /api/auth/me, /api/activity,
  /api/workspaces, /api/history/recent, and /api/dashboard/* seen in testing.

  Fix: use database.get_user_by_id_async(), which reuses the shared,
  already-warm asyncpg connection pool set up at startup instead of opening
  a fresh connection per request. No other behavior changes.
"""

from __future__ import annotations

import hashlib
import os
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

import database


# ── Config ────────────────────────────────────────────────────────────────────

SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "researchos-dev-secret-change-in-production")
ALGORITHM: str = "HS256"

# Access tokens are intentionally short-lived now that refresh tokens exist —
# a stolen access token used to be valid for 7 days with no way to revoke it.
# Now it's valid for 15 minutes, and the refresh token (which CAN be revoked)
# is what keeps the user logged in beyond that.
ACCESS_TOKEN_EXPIRE_MINUTES: int = 15
REFRESH_TOKEN_EXPIRE_DAYS: int = 30

# ── Password hashing ──────────────────────────────────────────────────────────

import bcrypt

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

# ── Access token (JWT) ──────────────────────────────────────────────────────────

def create_access_token(data: dict[str, Any]) -> str:
    """
    Create a signed JWT containing `data` plus an `exp` claim.
    The token is valid for ACCESS_TOKEN_EXPIRE_MINUTES minutes.
    """
    expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)
    payload = {**data, "exp": expire}
    return jwt.encode(payload, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> dict | None:
    """
    Decode and verify a JWT.
    Returns the payload dict, or None if the token is invalid/expired.
    """
    try:
        return jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
    except JWTError:
        return None


# ── Refresh token (opaque, hashed at rest) ──────────────────────────────────────

def generate_refresh_token() -> str:
    """
    Generate a new raw refresh token — 48 bytes of CSPRNG randomness,
    URL-safe encoded. This is the value sent to the client. It is never
    stored anywhere server-side; only its hash is (see hash_refresh_token).
    """
    return secrets.token_urlsafe(48)


def hash_refresh_token(raw_token: str) -> str:
    """
    SHA-256 hash of a refresh token, for storage/lookup in the database.

    Why SHA-256 and not bcrypt (unlike passwords): bcrypt's per-hash salt and
    deliberate slowness exist to defend against offline brute-forcing of a
    LOW-entropy human password. A refresh token is already a 48-byte CSPRNG
    value — brute-forcing it is computationally infeasible regardless of hash
    speed, so a fast, deterministic hash is both correct and necessary here
    (we need to look it up by exact hash match, which a salted bcrypt hash
    can't do without storing the salt separately and re-deriving per lookup).
    """
    return hashlib.sha256(raw_token.encode("utf-8")).hexdigest()


def refresh_token_expiry_timestamp() -> float:
    """Unix timestamp for when a freshly-issued refresh token should expire."""
    return (datetime.now(timezone.utc) + timedelta(days=REFRESH_TOKEN_EXPIRE_DAYS)).timestamp()


# ── FastAPI dependency ────────────────────────────────────────────────────────

# auto_error=False so we can fall through to the ?token= query param fallback
# instead of getting an automatic 403 when the header is absent.
_bearer = HTTPBearer(auto_error=False)

_CREDENTIALS_EXCEPTION = HTTPException(
    status_code=status.HTTP_401_UNAUTHORIZED,
    detail="Invalid or expired token",
    headers={"WWW-Authenticate": "Bearer"},
)


async def get_current_user(
    request: Request,
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer),
) -> dict:
    """
    FastAPI dependency that extracts and validates the JWT from either:
      1. Authorization: Bearer <token>  header  (standard REST calls)
      2. ?token=<token>                 query param (SSE streams via EventSource)

    EventSource / browser SSE cannot set custom headers, so the frontend
    appends the JWT as a query parameter for streaming endpoints.

    Returns the user row dict from the database.
    Raises HTTP 401 if the token is missing, invalid, or the user doesn't exist.
    """
    # 1. Try Authorization header first
    token: str | None = None
    if creds and creds.credentials:
        token = creds.credentials

    # 2. Fall back to ?token= query parameter (used by SSE / EventSource)
    if not token:
        token = request.query_params.get("token")

    if not token:
        raise _CREDENTIALS_EXCEPTION

    payload = decode_token(token)
    if not payload:
        raise _CREDENTIALS_EXCEPTION

    user_id = payload.get("sub")
    if not user_id:
        raise _CREDENTIALS_EXCEPTION

    # FIX: was database.get_user_by_id(int(user_id)) — a blocking sync call
    # that opened a fresh psycopg2 connection on every request and stalled
    # the whole event loop. Now uses the async, pooled lookup instead.
    user = await database.get_user_by_id_async(int(user_id))
    if not user:
        raise _CREDENTIALS_EXCEPTION

    return user
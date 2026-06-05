"""
auth.py — Authentication utilities for ResearchOS.

Provides:
  - Password hashing & verification (bcrypt via passlib)
  - JWT creation & decoding (python-jose)
  - FastAPI dependency: get_current_user
"""

from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone
from typing import Any

from fastapi import Depends, HTTPException, Request, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jose import JWTError, jwt

import database


# ── Config ────────────────────────────────────────────────────────────────────

SECRET_KEY: str = os.getenv("JWT_SECRET_KEY", "researchos-dev-secret-change-in-production")
ALGORITHM: str = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24 * 7  # 7 days

# ── Password hashing ──────────────────────────────────────────────────────────

import bcrypt

def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")

def verify_password(plain: str, hashed: str) -> bool:
    return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))

# ── JWT ───────────────────────────────────────────────────────────────────────

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

    user = database.get_user_by_id(int(user_id))
    if not user:
        raise _CREDENTIALS_EXCEPTION

    return user
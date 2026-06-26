"""
routers/auth_router.py

All authentication routes for ResearchOS.
Handles: register, login, forgot-password, reset-password, get profile, update profile.

This file only knows about auth. It does not know about RAG, news, or research.
That separation is the whole point.
"""

import secrets                          # for generating secure random reset tokens
from typing import Annotated            # for cleaner type hints

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, EmailStr, field_validator

import auth                             # your existing auth.py (JWT + bcrypt)
import database                         # your existing database.py
from auth import get_current_user       # the dependency that reads the JWT token
from database import (
    get_user_by_email_async, create_user_async,
    get_user_full_async, update_user_profile_async,
)

from error_models import STANDARD_ERROR_RESPONSES, ErrorResponse

# ── Create the router ─────────────────────────────────────────────────────────
# Think of this like creating a mini-app.
# prefix="/api/auth" means every route here automatically starts with /api/auth
# tags=["Auth"] groups these routes together in the auto-generated API docs

router = APIRouter(prefix="/api/auth", tags=["Auth"])

# ── Shortcut type — reads JWT from every protected request ────────────────────
# Annotated[dict, Depends(get_current_user)] means:
# "before running this function, call get_current_user() and pass the result in"
# This is FastAPI's dependency injection system.
CurrentUser = Annotated[dict, Depends(get_current_user)]


# ── Request body models ───────────────────────────────────────────────────────
# These tell FastAPI exactly what JSON shape to expect in the request body.
# If the frontend sends the wrong shape, FastAPI rejects it automatically.

class RegisterRequest(BaseModel):
    email: EmailStr                     # validates it looks like an email
    username: str
    password: str

    @field_validator("username")
    @classmethod
    def username_clean(cls, v: str) -> str:
        # strip whitespace, lowercase — so "  Alice  " becomes "alice"
        return v.strip().lower()


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class ForgotPasswordRequest(BaseModel):
    email: EmailStr


class ResetPasswordRequest(BaseModel):
    token: str                          # the reset token from the email link
    new_password: str


# ── POST /api/auth/register ───────────────────────────────────────────────────

@router.post(
    "/register",
    status_code=status.HTTP_201_CREATED,
    responses=STANDARD_ERROR_RESPONSES,
)
async def register(req: RegisterRequest):
    # Check if email already exists in the database
    if await get_user_by_email_async(req.email):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "An account with that email already exists"
        )

    # Check if username is already taken (rare call — sync is fine)
    if database.get_user_by_username(req.username):
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "That username is already taken"
        )

    # Create the user — password is hashed inside hash_password(), never stored raw
    user_id = await create_user_async(
        email=req.email,
        username=req.username,
        password_hash=auth.hash_password(req.password),
    )

    # Create a JWT token so the user is immediately logged in after registering
    token = auth.create_access_token({"sub": str(user_id)})

    return {
        "token": token,
        "user": {
            "id": user_id,
            "email": req.email,
            "username": req.username,
        }
    }


# ── POST /api/auth/login ──────────────────────────────────────────────────────

@router.post(
    "/login",
    responses=STANDARD_ERROR_RESPONSES,
)
async def login(req: LoginRequest):
    # Look up the user by email
    user = await get_user_by_email_async(req.email)

    # verify_password() compares the raw password against the stored bcrypt hash
    # We check both conditions together to prevent "email not found" info leaks
    if not user or not auth.verify_password(req.password, user["password_hash"]):
        raise HTTPException(
            status.HTTP_401_UNAUTHORIZED,
            "Invalid email or password"
        )

    # Create a new JWT token valid for 7 days (set in auth.py)
    token = auth.create_access_token({"sub": str(user["id"])})

    return {
        "token": token,
        "user": {
            "id": user["id"],
            "email": user["email"],
            "username": user["username"],
        }
    }


# ── POST /api/auth/forgot-password ───────────────────────────────────────────

@router.post("/forgot-password")
async def forgot_password(req: ForgotPasswordRequest):
    user = database.get_user_by_email(req.email)

    if user:
        # Generate a secure random token (32 bytes = 256 bits of randomness)
        reset_token = secrets.token_urlsafe(32)

        # Save the token in the database linked to this user's ID
        database.save_reset_token(user["id"], reset_token)

        # In production this would send an email.
        # For now we print it so you can test via terminal.
        print(f"[DEV] Reset token for {req.email}: {reset_token}")

    # We always return the same message whether the email exists or not.
    # This prevents attackers from discovering which emails are registered.
    return {"message": "If that email exists, a reset link has been sent."}


# ── POST /api/auth/reset-password ────────────────────────────────────────────

@router.post("/reset-password")
async def reset_password(req: ResetPasswordRequest):
    # use_reset_token() validates the token and returns the user_id if valid
    # It also deletes the token so it can't be used again (one-time use)
    user_id = database.use_reset_token(req.token)

    if not user_id:
        raise HTTPException(
            status.HTTP_400_BAD_REQUEST,
            "Invalid or expired reset token"
        )

    # Hash the new password before saving — never store raw passwords
    database.update_password(user_id, auth.hash_password(req.new_password))

    return {"message": "Password updated successfully"}


# ── GET /api/auth/me ──────────────────────────────────────────────────────────
# Protected route — requires a valid JWT token.
# current_user is automatically populated by get_current_user() dependency.

@router.get(
    "/me",
    responses=STANDARD_ERROR_RESPONSES,
)
async def me(current_user: CurrentUser):
    # get_user_full() returns everything including city and default_topic
    # (used by the Dashboard to show local weather and relevant headlines)
    user = await get_user_full_async(current_user["id"])

    if user:
        return user

    # Fallback if the database lookup fails for any reason
    return {
        "id":            current_user["id"],
        "email":         current_user["email"],
        "username":      current_user["username"],
        "city":          "Mumbai",
        "default_topic": "technology",
    }


# ── PATCH /api/auth/me ────────────────────────────────────────────────────────
# Lets users update their city (for weather) and default_topic (for headlines)

@router.patch(
    "/me",
    responses=STANDARD_ERROR_RESPONSES,
)
async def update_me(body: dict, current_user: CurrentUser):
    city          = body.get("city")
    default_topic = body.get("default_topic")

    # Reject the request if neither field was provided — nothing to update
    if not city and not default_topic:
        raise HTTPException(422, "Provide city or default_topic to update")

    await update_user_profile_async(
        current_user["id"],
        city=city,
        default_topic=default_topic,
    )

    return {"updated": True}
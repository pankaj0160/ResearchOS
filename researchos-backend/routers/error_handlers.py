"""
routers/error_handlers.py

Global error handling for ResearchOS.

WHY THIS FILE EXISTS:
Without this, every error in FastAPI returns a different shape:
  - HTTPException  → { "detail": "Not found" }
  - Validation err → { "detail": [{"loc": [...], "msg": "..."}] }
  - Unexpected crash → HTTP 500 with no body

The frontend has to guess the shape of every error. That breaks things.

AFTER THIS FILE:
Every single error — intentional or unexpected — returns this exact shape:
  {
    "error":       true,
    "message":     "Human-friendly description",
    "code":        "MACHINE_READABLE_CODE",
    "status_code": 404,
    "details":     null   ← only populated for validation errors
  }

The frontend always knows how to read it. No guessing. No blank screens.

HOW TO USE:
Call register_error_handlers(app) once in main.py after app = FastAPI(...).
That's it. All errors are automatically caught from that point.
"""

from __future__ import annotations

import traceback
from typing import Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse


# ── The single error response shape ──────────────────────────────────────────
# Every error in the entire app returns this exact structure.
# Having one shape means the frontend's error handling is also one function.

def _error_response(
    status_code: int,
    message:     str,
    code:        str,
    details:     Any = None,
) -> JSONResponse:
    """
    Builds a consistent JSON error response.

    Args:
        status_code: HTTP status code (404, 422, 500, etc.)
        message:     Human-readable description shown to the user
        code:        Machine-readable string used by the frontend to decide behaviour
                     e.g. "NOT_FOUND" → show 404 page
                          "UNAUTHORIZED" → redirect to login
                          "RATE_LIMITED" → show "slow down" message
        details:     Optional extra info (used for validation errors to show
                     which field failed and why)

    Returns:
        A FastAPI JSONResponse with the correct status code and body.
    """
    return JSONResponse(
        status_code = status_code,
        content     = {
            "error":       True,                # always True — easy to check on frontend
            "message":     message,             # show this to the user
            "code":        code,                # use this in frontend switch/if logic
            "status_code": status_code,         # mirrors the HTTP status for convenience
            "details":     details,             # None unless there's extra context
        },
    )


# ── Map HTTP status codes to machine-readable codes ───────────────────────────
# When a route raises HTTPException(404, "Run not found"),
# we automatically translate 404 → "NOT_FOUND" for the frontend.

_STATUS_TO_CODE: dict[int, str] = {
    400: "BAD_REQUEST",
    401: "UNAUTHORIZED",
    403: "FORBIDDEN",
    404: "NOT_FOUND",
    405: "METHOD_NOT_ALLOWED",
    408: "TIMEOUT",
    409: "CONFLICT",
    413: "PAYLOAD_TOO_LARGE",
    415: "UNSUPPORTED_MEDIA_TYPE",
    422: "VALIDATION_ERROR",
    425: "TOO_EARLY",
    429: "RATE_LIMITED",
    500: "INTERNAL_ERROR",
    502: "BAD_GATEWAY",
    503: "SERVICE_UNAVAILABLE",
}


def _code_for_status(status_code: int) -> str:
    """Returns the machine-readable code for a given HTTP status."""
    return _STATUS_TO_CODE.get(status_code, "UNKNOWN_ERROR")


# ── Handler 1: HTTPException ──────────────────────────────────────────────────
# Catches every raise HTTPException(...) in your routers.
# These are intentional errors you raise yourself.
#
# Example: raise HTTPException(404, "Run not found")
# Before:  { "detail": "Run not found" }
# After:   { "error": true, "message": "Run not found", "code": "NOT_FOUND", ... }

async def http_exception_handler(
    request:   Request,
    exc:       HTTPException,
) -> JSONResponse:
    """
    Handles all intentional HTTP errors raised in route handlers.
    Converts FastAPI's default {"detail": "..."} into our standard shape.
    """
    # exc.detail can be a string or a dict — normalise to string
    if isinstance(exc.detail, dict):
        message = exc.detail.get("message", str(exc.detail))
    elif isinstance(exc.detail, str):
        message = exc.detail
    else:
        message = str(exc.detail) if exc.detail else "An error occurred"

    return _error_response(
        status_code = exc.status_code,
        message     = message,
        code        = _code_for_status(exc.status_code),
    )


# ── Handler 2: RequestValidationError ────────────────────────────────────────
# Catches Pydantic validation failures — when the frontend sends wrong data.
# Example: POST /api/auth/register with no "email" field.
# Before:  Pydantic returns a nested list of errors — hard to parse
# After:   { "error": true, "message": "Invalid request data", "details": [...] }

async def validation_exception_handler(
    request: Request,
    exc:     RequestValidationError,
) -> JSONResponse:
    """
    Handles Pydantic/FastAPI request body validation errors.
    Flattens the nested Pydantic error structure into something readable.
    """
    # Each error has: loc (where), msg (what), type (error kind)
    # We simplify to: field name + human message
    simplified_errors = []
    for error in exc.errors():
        # loc is a tuple like ("body", "email") — we join to "body → email"
        location = " → ".join(str(part) for part in error.get("loc", []))
        simplified_errors.append({
            "field":   location,
            "message": error.get("msg", "Invalid value"),
            "type":    error.get("type", ""),
        })

    # Build one human-readable summary from the first error
    first_msg = simplified_errors[0]["message"] if simplified_errors else "Invalid request data"

    return _error_response(
        status_code = status.HTTP_422_UNPROCESSABLE_ENTITY,
        message     = f"Invalid request: {first_msg}",
        code        = "VALIDATION_ERROR",
        details     = simplified_errors,    # full list so frontend can highlight fields
    )


# ── Handler 3: Catch-all for unexpected crashes ───────────────────────────────
# Catches any Exception that wasn't an HTTPException or ValidationError.
# These are bugs — things that should never happen but sometimes do.
# Example: database.py crashes, Groq returns unexpected format, etc.
#
# CRITICAL: We NEVER send the raw traceback to the user.
# That would leak internal implementation details (file paths, variable names,
# library versions) that attackers use to find vulnerabilities.
# We log it server-side and send a generic message to the user.

async def unhandled_exception_handler(
    request: Request,
    exc:     Exception,
) -> JSONResponse:
    """
    Safety net for any unexpected crash anywhere in the app.
    Logs the full traceback server-side, returns a safe generic message to client.
    """
    # Log the full error server-side so you can debug it
    # In production this would go to a logging service like Sentry or Datadog
    print(
        f"[UNHANDLED ERROR] {request.method} {request.url}\n"
        f"{traceback.format_exc()}"
    )

    # Never send internal details to the client
    # "Something went wrong" is intentionally vague for security
    return _error_response(
        status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,
        message     = "Something went wrong on our end. Please try again.",
        code        = "INTERNAL_ERROR",
        details     = None,
    )


# ── Registration function ─────────────────────────────────────────────────────
# One function to register all three handlers on the FastAPI app.
# Called once in main.py — keeps main.py clean.

def register_error_handlers(app: FastAPI) -> None:
    """
    Registers all global error handlers on the FastAPI application.

    Call this ONCE in main.py right after app = FastAPI(...):

        app = FastAPI(...)
        register_error_handlers(app)

    After this call, every error in every router is automatically
    caught and returned in the standard error shape.
    """
    # Handler 1: intentional HTTP errors (404, 401, 403, 429, etc.)
    app.add_exception_handler(HTTPException, http_exception_handler)

    # Handler 2: Pydantic validation failures (missing fields, wrong types)
    app.add_exception_handler(RequestValidationError, validation_exception_handler)

    # Handler 3: unexpected crashes (bugs, external API failures, etc.)
    # Exception is the base class — catches everything not caught above
    app.add_exception_handler(Exception, unhandled_exception_handler)

    print("[Error Handlers] Global exception handlers registered")
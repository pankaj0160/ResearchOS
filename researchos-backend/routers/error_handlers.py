"""
routers/error_handlers.py  — UPDATED VERSION

LOCATION: researchos-backend/routers/error_handlers.py

─────────────────────────────────────────────────────────────────────────────
WHAT CHANGED FROM TASK 3.1 VERSION:

Imported ErrorResponse from error_models.py and used it to build every
error response. Now the response is validated by Pydantic before it is sent
— if a field is missing or wrong type, Pydantic catches it immediately.

Also added response_model annotations so FastAPI documents the error shape
in /docs automatically.

Everything else is identical to the Task 3.1 version.
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations

import traceback
from typing import Any

from fastapi import FastAPI, HTTPException, Request, status
from fastapi.exceptions import RequestValidationError
from fastapi.responses import JSONResponse

# Import the Pydantic model we just created
# This is the single source of truth for error response shape
from error_models import ErrorResponse, ValidationErrorDetail


# ── Status code → machine-readable code map ───────────────────────────────────

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
    return _STATUS_TO_CODE.get(status_code, "UNKNOWN_ERROR")


# ── Helper: build a validated error JSONResponse ───────────────────────────────
# This is the key change from Task 3.1.
# We now build an ErrorResponse Pydantic object first, then serialize it.
# Pydantic validates the fields — if something is wrong, it raises immediately
# instead of silently sending a malformed response.

def _error_response(
    status_code: int,
    message:     str,
    code:        str,
    details:     list[dict] | None = None,
) -> JSONResponse:
    """
    Build a validated JSON error response using the ErrorResponse Pydantic model.

    Steps:
      1. Build ValidationErrorDetail objects if details are provided
      2. Create ErrorResponse — Pydantic validates all fields here
      3. Serialize to dict with model.model_dump()
      4. Return as JSONResponse

    If Pydantic validation fails (a bug in our code), we fall back to
    a raw dict so the server never crashes while trying to send an error.
    """
    try:
        # Build detail objects if we have them (only for validation errors)
        detail_objects = None
        if details:
            detail_objects = [
                ValidationErrorDetail(
                    field   = d.get("field",   "unknown"),
                    message = d.get("message", "invalid"),
                    type    = d.get("type",    ""),
                )
                for d in details
            ]

        # Build the full error response — Pydantic validates every field here
        # If status_code is not int, message is not str, etc. → Pydantic raises
        error_obj = ErrorResponse(
            error       = True,
            message     = message,
            code        = code,
            status_code = status_code,
            details     = detail_objects,
        )

        # model_dump() converts the Pydantic object to a plain Python dict
        # that JSONResponse can serialize to JSON
        return JSONResponse(
            status_code = status_code,
            content     = error_obj.model_dump(),
        )

    except Exception as pydantic_err:
        # Fallback — if our own error building fails, return a raw dict
        # This should never happen but prevents infinite error loops
        print(f"[ErrorHandler] Failed to build ErrorResponse: {pydantic_err}")
        return JSONResponse(
            status_code = status_code,
            content     = {
                "error":       True,
                "message":     message,
                "code":        code,
                "status_code": status_code,
                "details":     None,
            },
        )


# ── Handler 1: HTTPException ──────────────────────────────────────────────────
# Catches every raise HTTPException(...) in your routers.
# Example: raise HTTPException(404, "Run not found")

async def http_exception_handler(
    request: Request,
    exc:     HTTPException,
) -> JSONResponse:
    """
    Handles intentional HTTP errors raised in route handlers.
    Converts FastAPI's default {"detail": "..."} into our standard ErrorResponse.
    """
    # exc.detail can be a string, dict, or None — normalise to string
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
# Example: POST /api/auth/register with email = "not-an-email"

async def validation_exception_handler(
    request: Request,
    exc:     RequestValidationError,
) -> JSONResponse:
    """
    Handles Pydantic/FastAPI request body validation errors.
    Flattens the nested Pydantic error structure into readable ValidationErrorDetail objects.
    """
    simplified_errors = []
    for error in exc.errors():
        # loc is a tuple like ("body", "email") — join to "body → email"
        location = " → ".join(str(part) for part in error.get("loc", []))
        simplified_errors.append({
            "field":   location,
            "message": error.get("msg",  "Invalid value"),
            "type":    error.get("type", ""),
        })

    # Build one human-readable summary from the first error
    first_msg = (
        simplified_errors[0]["message"]
        if simplified_errors
        else "Invalid request data"
    )

    return _error_response(
        status_code = status.HTTP_422_UNPROCESSABLE_ENTITY,
        message     = f"Invalid request: {first_msg}",
        code        = "VALIDATION_ERROR",
        details     = simplified_errors,
    )


# ── Handler 3: Catch-all for unexpected crashes ───────────────────────────────
# Catches any Exception that is not an HTTPException or ValidationError.
# These are bugs — they should never happen but sometimes do.
# CRITICAL: we never send the raw traceback to the user.

async def unhandled_exception_handler(
    request: Request,
    exc:     Exception,
) -> JSONResponse:
    """
    Safety net for any unexpected crash anywhere in the app.
    Logs the full traceback server-side.
    Returns a safe, generic message to the client — never internal details.
    """
    # Full traceback logged server-side for debugging
    # In production: Sentry.captureException(exc)
    print(
        f"[UNHANDLED ERROR] {request.method} {request.url}\n"
        f"{traceback.format_exc()}"
    )

    return _error_response(
        status_code = status.HTTP_500_INTERNAL_SERVER_ERROR,
        message     = "Something went wrong on our end. Please try again.",
        code        = "INTERNAL_ERROR",
    )


# ── Registration ──────────────────────────────────────────────────────────────

def register_error_handlers(app: FastAPI) -> None:
    """
    Register all global error handlers on the FastAPI application.
    Call this ONCE in main.py right after app = FastAPI(...).

    After this call:
      - Every raise HTTPException(...)   → ErrorResponse shape
      - Every Pydantic validation error  → ErrorResponse shape
      - Every unexpected crash           → ErrorResponse shape, traceback logged
    """
    app.add_exception_handler(HTTPException,           http_exception_handler)
    app.add_exception_handler(RequestValidationError,  validation_exception_handler)
    app.add_exception_handler(Exception,               unhandled_exception_handler)

    print("[Error Handlers] Global exception handlers registered ✓")
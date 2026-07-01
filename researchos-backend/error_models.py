"""
error_models.py

LOCATION: researchos-backend/error_models.py
(Put this in the root of researchos-backend/ — same level as main.py)

─────────────────────────────────────────────────────────────────────────────
WHAT THIS FILE IS:

Pydantic models that define the exact shape of every error response
in the ResearchOS API.

WHY THIS EXISTS:
Without this file, FastAPI's /docs page shows vague error responses like:
  "422 Unprocessable Entity" ← no schema, no detail, developer has to guess

After this file, /docs shows the exact JSON shape:
  {
    "error":       true,
    "message":     "Run not found",
    "code":        "NOT_FOUND",
    "status_code": 404,
    "details":     null
  }

WHAT PYDANTIC DOES HERE:
Pydantic models are Python classes that describe data shapes.
FastAPI reads them and automatically generates OpenAPI documentation.
The same model also validates that our error handler is returning
the right shape — if we accidentally return wrong fields, Pydantic
catches it at runtime before the response reaches the user.

HOW IT CONNECTS:
  error_models.py    → defines the shapes (this file)
  error_handlers.py  → uses the shapes when building responses
  main.py            → tells FastAPI which shape each route returns
  /docs              → shows the shapes to API consumers automatically
─────────────────────────────────────────────────────────────────────────────
"""

from __future__ import annotations
from typing import Any
from pydantic import BaseModel, Field


# ── Validation error detail item ──────────────────────────────────────────────
# Used inside ErrorResponse.details for 422 Validation errors.
# Each item describes one field that failed validation.

class ValidationErrorDetail(BaseModel):
    """
    Describes one field validation failure.

    Example:
        {
          "field":   "body → email",
          "message": "value is not a valid email address",
          "type":    "value_error.email"
        }
    """
    field:   str = Field(..., description="Which field failed — e.g. 'body → email'")
    message: str = Field(..., description="What was wrong — e.g. 'value is not a valid email'")
    type:    str = Field("", description="Pydantic error type code — e.g. 'value_error.email'")

    model_config = {
        "json_schema_extra": {
            "example": {
                "field":   "body → email",
                "message": "value is not a valid email address",
                "type":    "value_error.email",
            }
        }
    }


# ── Main error response model ──────────────────────────────────────────────────
# This is the shape of EVERY error in the entire ResearchOS API.
# error_handlers.py builds responses using this shape.
# Routers declare this as their error response in the route decorator.

class ErrorResponse(BaseModel):
    """
    Standard error response returned by all ResearchOS API endpoints.

    Every error — whether intentional (404 not found) or unexpected (500 crash)
    — returns exactly this shape. The frontend never has to guess.

    Fields:
        error:       Always True — easy to check: if (result.error) { ... }
        message:     Human-readable description safe to show users
        code:        Machine-readable string for frontend switch/if logic
        status_code: Mirrors the HTTP status code for convenience
        details:     Only populated for validation errors (list of field errors)
                     null for all other error types
    """

    error: bool = Field(
        True,
        description="Always True for error responses. Use this to distinguish errors from success."
    )
    message: str = Field(
        ...,
        description="Human-readable error message. Safe to display directly to users."
    )
    code: str = Field(
        ...,
        description=(
            "Machine-readable error code for frontend logic. "
            "Possible values: NOT_FOUND, UNAUTHORIZED, FORBIDDEN, "
            "VALIDATION_ERROR, RATE_LIMITED, INTERNAL_ERROR, "
            "BAD_REQUEST, CONFLICT, NETWORK_ERROR, UNKNOWN_ERROR"
        )
    )
    status_code: int = Field(
        ...,
        description="HTTP status code — mirrors the response status for convenience."
    )
    details: list[ValidationErrorDetail] | None = Field(
        None,
        description=(
            "Only present for VALIDATION_ERROR (422). "
            "Lists each field that failed and why. "
            "null for all other error types."
        )
    )

    model_config = {
        "json_schema_extra": {
            "examples": [
                {
                    "error":       True,
                    "message":     "Run not found",
                    "code":        "NOT_FOUND",
                    "status_code": 404,
                    "details":     None,
                }
            ]
        }
    }


# ── Shortcut: standard error responses dict ───────────────────────────────────
# Use this in route decorators to document all possible error responses at once.
#
# Usage in any router:
#
#   from error_models import STANDARD_ERROR_RESPONSES
#
#   @router.get("/api/history/{run_id}", responses=STANDARD_ERROR_RESPONSES)
#   async def get_run(run_id: int, current_user: CurrentUser):
#       ...
#
# This makes /docs show 401, 403, 404, 429, 500 sections automatically.

STANDARD_ERROR_RESPONSES: dict[int | str, dict] = {
    401: {
        "model":       ErrorResponse,
        "description": "Unauthorized — token missing, expired, or invalid",
    },
    403: {
        "model":       ErrorResponse,
        "description": "Forbidden — you do not have access to this resource",
    },
    404: {
        "model":       ErrorResponse,
        "description": "Not Found — the requested resource does not exist",
    },
    422: {
        "model":       ErrorResponse,
        "description": "Validation Error — request body or query params are invalid",
    },
    429: {
        "model":       ErrorResponse,
        "description": "Rate Limited — too many requests, please slow down",
    },
    500: {
        "model":       ErrorResponse,
        "description": "Internal Server Error — unexpected failure on the server",
    },
}
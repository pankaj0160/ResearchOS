"""
routers/calendar_router.py

Real calendar events for ResearchOS — deadlines, reminders, meetings that the
USER creates directly, as opposed to `activity_events` (the automatic log of
things other features did, e.g. "research run completed").

Before this router existed, /api/calendar/* had no backend at all —
CalendarPage.jsx only rendered activity_events, so it functioned as an
activity log with a calendar layout, not a calendar you could actually put
a deadline or meeting on. This router adds that missing capability.

Routes:
  GET    /api/calendar/events        — list events (optional time range + workspace filter)
  POST   /api/calendar/events        — create an event
  PATCH  /api/calendar/events/{id}   — update an event (owner only)
  DELETE /api/calendar/events/{id}   — delete an event (owner only)
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel, Field, field_validator

import database
from auth import get_current_user
from database import (
    create_calendar_event_async,
    get_calendar_events_async,
    get_calendar_event_async,
    update_calendar_event_async,
    delete_calendar_event_async,
    log_activity_async,
)

router = APIRouter(tags=["Calendar"])

CurrentUser = Annotated[dict, Depends(get_current_user)]


# ── Request/response models ─────────────────────────────────────────────────

class CalendarEventCreate(BaseModel):
    title:        str
    description:  str = ""
    start_time:   float                 # unix timestamp (seconds)
    end_time:     float | None = None   # unix timestamp; None = point-in-time event
    all_day:      bool = False
    color:        str = "#3B82F6"
    workspace_id: int | None = None

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str) -> str:
        if not v.strip():
            raise ValueError("Title cannot be empty")
        if len(v.strip()) > 200:
            raise ValueError("Title must be 200 characters or fewer")
        return v

    @field_validator("end_time")
    @classmethod
    def end_after_start(cls, v: float | None, info) -> float | None:
        start = info.data.get("start_time")
        if v is not None and start is not None and v < start:
            raise ValueError("end_time cannot be before start_time")
        return v


class CalendarEventUpdate(BaseModel):
    title:        str | None = None
    description:  str | None = None
    start_time:   float | None = None
    end_time:     float | None = None
    all_day:      bool | None = None
    color:        str | None = None
    workspace_id: int | None = Field(default=None)

    @field_validator("title")
    @classmethod
    def title_not_blank(cls, v: str | None) -> str | None:
        if v is not None and not v.strip():
            raise ValueError("Title cannot be empty")
        return v


def _serialize(ev: dict) -> dict:
    """Normalize a DB row into the shape the frontend expects."""
    return {
        "id":           ev["id"],
        "title":        ev["title"],
        "description":  ev.get("description") or "",
        "start_time":   ev["start_time"],
        "end_time":     ev.get("end_time"),
        "all_day":      bool(ev.get("all_day")),
        "color":        ev.get("color") or "#3B82F6",
        "workspace_id": ev.get("workspace_id"),
        "created_at":   ev["created_at"],
        "updated_at":   ev.get("updated_at"),
    }


# ── Routes ────────────────────────────────────────────────────────────────────

@router.get("/api/calendar/events")
async def list_calendar_events(
    current_user: CurrentUser,
    start: float | None = Query(default=None, description="Unix timestamp — start of range"),
    end:   float | None = Query(default=None, description="Unix timestamp — end of range"),
    workspace_id: int | None = Query(default=None, description="Filter to one workspace; omit for all"),
):
    """Return the logged-in user's calendar events, optionally scoped to a
    time range and/or workspace."""
    events = await get_calendar_events_async(
        current_user["id"], start_range=start, end_range=end, workspace_id=workspace_id,
    )
    return {"events": [_serialize(e) for e in events]}


@router.post("/api/calendar/events", status_code=201)
async def create_calendar_event(body: CalendarEventCreate, current_user: CurrentUser):
    """Create a new calendar event for the logged-in user."""
    event_id = await create_calendar_event_async(
        user_id=current_user["id"],
        title=body.title,
        start_time=body.start_time,
        end_time=body.end_time,
        description=body.description,
        all_day=body.all_day,
        color=body.color,
        workspace_id=body.workspace_id,
    )

    # Log to the activity feed too, so it shows up in the unified history
    # timeline alongside research runs, uploads, etc. Never blocks/raises.
    await log_activity_async(
        current_user["id"],
        "calendar_event_created",
        {"event_id": event_id, "title": body.title},
        workspace_id=body.workspace_id,
    )

    event = await get_calendar_event_async(event_id)
    return {"event": _serialize(event)}


@router.patch("/api/calendar/events/{event_id}")
async def update_calendar_event(event_id: int, body: CalendarEventUpdate, current_user: CurrentUser):
    """Update an existing calendar event. Only the owner may update it."""
    existing = await get_calendar_event_async(event_id)
    if not existing:
        raise HTTPException(404, "Event not found")
    if existing["user_id"] != current_user["id"]:
        raise HTTPException(403, "You don't own this event")

    # exclude_unset=True → only fields the client actually sent are included,
    # and explicit nulls (e.g. clearing end_time or workspace_id) are respected.
    updates = body.model_dump(exclude_unset=True)
    # Validate end_time vs start_time when either is being changed
    new_start = updates.get("start_time", existing["start_time"])
    new_end   = updates.get("end_time", existing.get("end_time"))
    if new_end is not None and new_start is not None and new_end < new_start:
        raise HTTPException(422, "end_time cannot be before start_time")

    if updates:
        await update_calendar_event_async(event_id, **updates)

    fresh = await get_calendar_event_async(event_id)
    return {"event": _serialize(fresh)}


@router.delete("/api/calendar/events/{event_id}")
async def delete_calendar_event(event_id: int, current_user: CurrentUser):
    """Delete a calendar event. Only the owner may delete it."""
    existing = await get_calendar_event_async(event_id)
    if not existing:
        raise HTTPException(404, "Event not found")
    if existing["user_id"] != current_user["id"]:
        raise HTTPException(403, "You don't own this event")

    await delete_calendar_event_async(event_id)
    return {"deleted": True, "event_id": event_id}
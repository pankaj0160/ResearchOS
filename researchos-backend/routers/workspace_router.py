"""
routers/workspace_router.py

Workspace management, activity feed, and global search routes.

Workspaces = named folders that group research runs together.
Activity feed = timeline of everything the user has done (research, uploads, etc.)
Global search = the Cmd+K command palette — searches across all features at once.
"""

from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

import database
from auth import get_current_user
from database import get_history, get_run
from database import (
    get_workspaces_async, create_workspace_async,
    delete_workspace_async, get_workspace_async,
    get_activity_async,
)

# Import the shared RAG sessions dict so global search can include PDF sessions
from routers.rag_router import _rag_sessions

# ── Router ────────────────────────────────────────────────────────────────────
router = APIRouter(tags=["Workspaces"])

CurrentUser = Annotated[dict, Depends(get_current_user)]


# ── Request body model ────────────────────────────────────────────────────────

class WorkspaceCreate(BaseModel):
    name:        str
    topic:       str
    description: str = ""   # optional — defaults to empty string


# ── GET /api/workspaces ───────────────────────────────────────────────────────

@router.get("/api/workspaces")
async def list_workspaces(current_user: CurrentUser):
    """Return all workspaces for the logged-in user."""
    workspaces = await get_workspaces_async(current_user["id"])
    return {"workspaces": workspaces}


# ── POST /api/workspaces ──────────────────────────────────────────────────────

@router.post("/api/workspaces", status_code=201)
async def create_workspace(body: WorkspaceCreate, current_user: CurrentUser):
    """Create a new workspace and log the activity."""
    if not body.name.strip():
        raise HTTPException(422, "Workspace name cannot be empty")
    if not body.topic.strip():
        raise HTTPException(422, "Topic cannot be empty")

    wid = await create_workspace_async(
        current_user["id"], body.name, body.topic, body.description
    )

    # Log so this creation event appears in the Dashboard activity feed
    database.log_activity(
        current_user["id"],
        "workspace_created",
        {"workspace_id": wid, "name": body.name, "topic": body.topic},
        workspace_id=wid,
    )

    return {"workspace_id": wid, "name": body.name, "topic": body.topic}


# ── DELETE /api/workspaces/{wid} ──────────────────────────────────────────────

@router.delete("/api/workspaces/{wid}")
async def delete_workspace(wid: int, current_user: CurrentUser):
    """Delete a workspace. Only the owner can delete it."""
    ws = await get_workspace_async(wid)
    if not ws:
        raise HTTPException(404, "Workspace not found")
    if ws["user_id"] != current_user["id"]:
        raise HTTPException(403, "You don't own this workspace")
    await delete_workspace_async(wid)
    return {"deleted": True, "workspace_id": wid}


# ── GET /api/activity ─────────────────────────────────────────────────────────

@router.get("/api/activity")
async def get_activity(
    current_user: CurrentUser,
    limit: int = Query(default=20, ge=1, le=50),
):
    """
    Return the user's recent activity across all features.
    Powers the activity feed on the Dashboard.
    limit: how many events to return (1-50, default 20)
    """
    events = await get_activity_async(current_user["id"], limit=limit)
    return {"events": events}


# ── GET /api/search ───────────────────────────────────────────────────────────
# The global Cmd+K command palette search.
# Fans out to research runs, RAG sessions, news topics, and workspaces
# in one single call, returns grouped results.

@router.get("/api/search")
async def global_search(
    q:            str = Query(..., min_length=2, max_length=200),
    current_user: CurrentUser = None,
):
    """
    Search across all ResearchOS features in one call.
    Returns results grouped by type: research, pdf, news, workspaces.
    Used by the CommandPalette (Cmd+K).
    """
    uid = current_user["id"]
    kw  = q.lower().strip()

    # ── Research runs ─────────────────────────────────────────────────────────
    all_runs    = get_history(limit=100, user_id=uid)
    run_results = [
        {
            "type":     "research",
            "id":       r["id"],
            "title":    r["topic"],
            "subtitle": f"{r.get('word_count', 0)} words · score {r.get('score') or '?'}/10",
            "url":      f"/research?run_id={r['id']}",
        }
        for r in all_runs
        if kw in r["topic"].lower()
    ][:6]

    # ── RAG / PDF sessions ─────────────────────────────────────────────────────
    # Imported from rag_router so we search the same live session dict
    pdf_results = [
        {
            "type":     "pdf",
            "id":       sid,
            "title":    s.get("filename", "Untitled"),
            "subtitle": f"PDF · {s.get('page_count', 0)} pages",
            "url":      f"/pdf-chat?session={sid}",
        }
        for sid, s in _rag_sessions.items()
        if s.get("user_id") == uid
        and s.get("status") == "ready"
        and kw in (s.get("filename") or "").lower()
    ][:6]

    # ── Tracked news topics ───────────────────────────────────────────────────
    all_tracked  = database.get_tracked_topics(uid)
    news_results = [
        {
            "type":     "news",
            "id":       t["id"],
            "title":    t["topic"],
            "subtitle": f"News · {t.get('category', 'general')}",
            "url":      f"/news?topic={t['topic']}",
        }
        for t in all_tracked
        if kw in t["topic"].lower()
    ][:6]

    # ── Workspaces ────────────────────────────────────────────────────────────
    all_workspaces = database.get_workspaces(uid)
    ws_results     = [
        {
            "type":     "workspace",
            "id":       w["id"],
            "title":    w["name"],
            "subtitle": f"Workspace · {w.get('topic', '')}",
            "url":      f"/workspace/{w['id']}",
        }
        for w in all_workspaces
        if kw in w["name"].lower() or kw in (w.get("topic") or "").lower()
    ][:6]

    total = len(run_results) + len(pdf_results) + len(news_results) + len(ws_results)

    return {
        "query": q,
        "total": total,
        "results": {
            "research":   run_results,
            "pdf":        pdf_results,
            "news":       news_results,
            "workspaces": ws_results,
        },
    }


# ── GET /api/history/unified ──────────────────────────────────────────────────
# Returns research history + RAG sessions merged into one timeline.
# Used by CalendarPage and HistoryPage to show all activity together.

@router.get("/api/history/unified")
async def unified_history(
    current_user: CurrentUser,
    limit:        int = Query(default=50, ge=1, le=200),
):
    """
    Merged timeline of research runs + RAG sessions.
    Each item has a type field: 'research' or 'rag'
    so the frontend can render them differently.
    """
    uid = current_user["id"]

    # Research runs from database
    runs = get_history(limit=limit, user_id=uid)
    run_items = [
        {
            "type":       "research",
            "id":         r["id"],
            "title":      r["topic"],
            "created_at": r.get("created_at"),
            "score":      r.get("score"),
            "word_count": r.get("word_count", 0),
        }
        for r in runs
    ]

    # RAG sessions from in-memory store
    rag_items = [
        {
            "type":        "rag",
            "id":          sid,
            "title":       s.get("filename", "Untitled"),
            "created_at":  s.get("created_at"),
            "source_type": s.get("source_type", "pdf"),
            "status":      s.get("status", "ready"),
        }
        for sid, s in _rag_sessions.items()
        if s.get("user_id") == uid
    ]

    # Merge and sort by created_at descending (newest first)
    all_items = run_items + rag_items
    all_items.sort(key=lambda x: x.get("created_at") or "", reverse=True)

    return {"items": all_items[:limit], "total": len(all_items)}
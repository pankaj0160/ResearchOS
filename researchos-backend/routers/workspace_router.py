"""
routers/workspace_router.py

Workspace management, activity feed, and unified history for ResearchOS.

What this file handles:
  /api/workspaces          — create, list, delete workspaces
  /api/workspaces/{id}     — update a workspace
  /api/activity            — recent user activity (powers Dashboard feed)
  /api/history/unified     — merged timeline of all features (History page)
  /api/history/recent      — last 5 items per feature (sidebar quick-access)
  /api/search              — global Cmd+K search across all features
"""

from __future__ import annotations

import asyncio
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

import database
from auth import get_current_user
from database import (
    get_history_async,
    get_workspaces_async,
    create_workspace_async,
    delete_workspace_async,
    get_workspace_async,
    get_activity_async,
    get_tracked_topics_async,
    get_rag_sessions_for_user,
)

# _rag_sessions is imported lazily inside route handlers to avoid
# circular import (workspace_router now registers before rag_router)

# ── Router setup ──────────────────────────────────────────────────────────────
router = APIRouter(tags=["Workspaces"])

def _get_rag_sessions() -> dict:
    """
    Lazy import of _rag_sessions from rag_router.
    Avoids circular import: workspace_router is registered before rag_router
    in main.py (to fix route ordering), so we can't import at module level.
    Lazy import inside functions works because by the time any request arrives,
    all modules are fully loaded.
    """
    from routers.rag_router import _rag_sessions
    return _rag_sessions

# This type shortcut reads the JWT token and returns the logged-in user dict
CurrentUser = Annotated[dict, Depends(get_current_user)]


# ── Request body models ───────────────────────────────────────────────────────

class WorkspaceCreate(BaseModel):
    name:        str
    topic:       str
    description: str = ""


class WorkspaceUpdate(BaseModel):
    name:        str | None = None
    topic:       str | None = None
    description: str | None = None


# =============================================================================
# WORKSPACE ROUTES
# =============================================================================

@router.get("/api/workspaces")
async def list_workspaces(current_user: CurrentUser):
    """Return all workspaces for the logged-in user."""
    workspaces = await get_workspaces_async(current_user["id"])
    return {"workspaces": workspaces}


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

    # Log to activity feed — never raises, never blocks
    await database.log_activity_async(
        current_user["id"],
        "workspace_created",
        {"workspace_id": wid, "name": body.name, "topic": body.topic},
        workspace_id=wid,
    )

    return {
        "workspace_id": wid,
        "name":         body.name,
        "topic":        body.topic,
        "description":  body.description,
    }


@router.patch("/api/workspaces/{wid}")
async def update_workspace(wid: int, body: WorkspaceUpdate, current_user: CurrentUser):
    """Update workspace name, topic, or description. Only owner can update."""
    ws = await get_workspace_async(wid)
    if not ws:
        raise HTTPException(404, "Workspace not found")
    if ws["user_id"] != current_user["id"]:
        raise HTTPException(403, "You don't own this workspace")

    updates = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.topic is not None:
        updates["topic"] = body.topic
    if body.description is not None:
        updates["description"] = body.description

    if updates:
        database.update_workspace(wid, **updates)

    return {"updated": True, "workspace_id": wid, **updates}


@router.delete("/api/workspaces/{wid}")
async def delete_workspace(wid: int, current_user: CurrentUser):
    """Delete a workspace. Only owner can delete."""
    ws = await get_workspace_async(wid)
    if not ws:
        raise HTTPException(404, "Workspace not found")
    if ws["user_id"] != current_user["id"]:
        raise HTTPException(403, "You don't own this workspace")

    await delete_workspace_async(wid)
    return {"deleted": True, "workspace_id": wid}


# =============================================================================
# ACTIVITY FEED
# =============================================================================

@router.get("/api/activity")
async def get_activity(
    current_user: CurrentUser,
    limit: int = Query(default=20, ge=1, le=50),
):
    """
    Return recent user activity across ALL features.
    Powers the activity feed on the Dashboard page.

    event_type values:
      'research_run'      — completed a research pipeline
      'pdf_upload'        — uploaded a PDF
      'news_search'       — searched for news
      'workspace_created' — created a workspace
    """
    events = await get_activity_async(current_user["id"], limit=limit)
    return {"events": events, "count": len(events)}


# =============================================================================
# UNIFIED HISTORY — All features merged into one timeline
# =============================================================================

@router.get("/api/history/unified")
async def unified_history(
    current_user: CurrentUser,
    limit:   int = Query(default=50, ge=1, le=200),
    feature: str = Query(default="all"),
):
    """
    Merged timeline of all user activity across every ResearchOS feature.
    Used by HistoryPage and CalendarPage.

    ?feature=all        → everything
    ?feature=research   → only research runs
    ?feature=pdf        → only PDF sessions
    ?feature=news       → only news topics

    Uses asyncio.gather() to fetch research + news simultaneously.
    This is 2x faster than fetching one after the other.
    """
    uid = current_user["id"]

    # Fetch research + news in PARALLEL
    runs, tracked_news = await asyncio.gather(
        get_history_async(limit=limit, user_id=uid),
        get_tracked_topics_async(uid),
    )

    # Research runs
    run_items = [
        {
            "type":         "research",
            "id":           r["id"],
            "title":        r["topic"],
            "created_at":   r.get("created_at"),
            "score":        r.get("score"),
            "word_count":   r.get("word_count", 0),
            "source_count": r.get("source_count", 0),
            "excerpt":      r.get("excerpt", ""),
        }
        for r in runs
    ]

    # RAG sessions — merge in-memory + DB (so restarts don't wipe history)
    db_rag = get_rag_sessions_for_user(uid)
    combined_rag: dict[str, dict] = {s["id"]: s for s in db_rag}
    for sid, s in _get_rag_sessions().items():
        if s.get("user_id") == uid:
            combined_rag[sid] = {**s, "id": sid}

    rag_items = [
        {
            "type":        "rag",
            "id":          sid,
            "title":       s.get("filename", "Untitled"),
            "created_at":  s.get("created_at"),
            "source_type": s.get("source_type", "pdf"),
            "status":      s.get("status", "ready"),
            "page_count":  s.get("page_count", 0),
            "chunk_count": s.get("chunk_count", 0),
        }
        for sid, s in combined_rag.items()
    ]

    # News topics
    news_items = [
        {
            "type":       "news",
            "id":         t["id"],
            "title":      t["topic"],
            "created_at": t.get("created_at"),
            "category":   t.get("category", "general"),
        }
        for t in tracked_news
    ]

    # Filter by feature
    all_items: list[dict] = []
    if feature in ("all", "research"):
        all_items.extend(run_items)
    if feature in ("all", "pdf"):
        all_items.extend(rag_items)
    if feature in ("all", "news"):
        all_items.extend(news_items)

    # Sort newest first
    all_items.sort(key=lambda x: x.get("created_at") or 0, reverse=True)

    return {
        "items":   all_items[:limit],
        "total":   len(all_items),
        "feature": feature,
    }


# =============================================================================
# PER-FEATURE RECENT HISTORY — Last 5 items per feature (fast sidebar)
# =============================================================================

@router.get("/api/history/recent")
async def recent_per_feature(current_user: CurrentUser):
    """
    Return the last 5 items from EACH feature in one fast parallel call.
    Powers the 'Recent' sidebar shown on Research, PDF Chat, and News pages.

    Returns:
      {
        research: [...last 5 runs with excerpt],
        pdf:      [...last 5 PDF sessions],
        news:     [...last 5 tracked topics]
      }
    """
    uid = current_user["id"]

    # Fetch research + news in parallel
    runs, tracked_news = await asyncio.gather(
        get_history_async(limit=5, user_id=uid),
        get_tracked_topics_async(uid),
    )

    # PDF sessions: from in-memory store (no DB call needed — already in memory)
    pdf_sessions = sorted(
        [
            {
                "id":         sid,
                "filename":   s.get("filename", "Untitled"),
                "status":     s.get("status", "ready"),
                "created_at": s.get("created_at"),
                "page_count": s.get("page_count", 0),
            }
            for sid, s in _get_rag_sessions().items()
            if s.get("user_id") == uid and s.get("status") == "ready"
        ],
        key=lambda x: x.get("created_at") or 0,
        reverse=True,
    )[:5]

    return {
        "research": [
            {
                "id":         r["id"],
                "title":      r["topic"],
                "score":      r.get("score"),
                "word_count": r.get("word_count", 0),
                "created_at": r.get("created_at"),
                "excerpt":    r.get("excerpt", ""),
            }
            for r in runs
        ],
        "pdf":  pdf_sessions,
        "news": [
            {
                "id":         t["id"],
                "title":      t["topic"],
                "category":   t.get("category", "general"),
                "created_at": t.get("created_at"),
            }
            for t in tracked_news[:5]
        ],
    }


# =============================================================================
# GLOBAL SEARCH — Cmd+K command palette
# =============================================================================

@router.get("/api/search")
async def global_search(
    q:            str = Query(..., min_length=2, max_length=200),
    current_user: CurrentUser = None,
):
    """
    Search across ALL ResearchOS features in one call.
    Returns results grouped by type: research, pdf, news, workspaces.
    Used by the CommandPalette (Cmd+K).

    Fetches research + workspaces in parallel for speed.
    """
    uid = current_user["id"]
    kw  = q.lower().strip()

    # Fetch research + workspaces in parallel
    all_runs, all_workspaces = await asyncio.gather(
        get_history_async(limit=100, user_id=uid),
        get_workspaces_async(uid),
    )

    # Research runs — match on topic text
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

    # PDF sessions — match on filename
    pdf_results = [
        {
            "type":     "pdf",
            "id":       sid,
            "title":    s.get("filename", "Untitled"),
            "subtitle": f"PDF · {s.get('page_count', 0)} pages",
            "url":      f"/pdf-chat?session={sid}",
        }
        for sid, s in _get_rag_sessions().items()
        if s.get("user_id") == uid
        and s.get("status") == "ready"
        and kw in (s.get("filename") or "").lower()
    ][:6]

    # News topics — match on topic name
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

    # Workspaces — match on name or topic
    ws_results = [
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
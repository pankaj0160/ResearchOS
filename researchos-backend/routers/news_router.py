"""
routers/news_router.py

News search, summarization, tracked topics, and dashboard routes.

Why are dashboard routes here and not in a separate file?
Dashboard only has 4 small routes. Combining with news keeps
the file count manageable — both are "data display" features.
"""

from __future__ import annotations

import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

import database
import dashboard_agent as _dash
import news as _news_module
from auth import get_current_user

# ── Router ────────────────────────────────────────────────────────────────────
router = APIRouter(tags=["News"])

CurrentUser = Annotated[dict, Depends(get_current_user)]


# ── GET /api/news/search ──────────────────────────────────────────────────────

@router.get("/api/news/search")
async def news_search(
    topic:        str = Query(..., min_length=2, max_length=200),
    category:     str = Query(default="general"),
    days:         int = Query(default=7, ge=1, le=30),
    current_user: CurrentUser = None,
):
    cat = category.lower().strip()

    # Validate category against the allowed list defined in news.py
    if cat not in _news_module.VALID_CATEGORIES:
        raise HTTPException(
            400,
            f"Invalid category '{cat}'. Valid: {sorted(_news_module.VALID_CATEGORIES)}"
        )

    try:
        articles = _news_module.search_news(topic, category=cat, days=days)
    except RuntimeError as exc:
        # RuntimeError means Tavily API is down or misconfigured
        raise HTTPException(503, f"News search unavailable: {exc}")

    return {
        "articles": articles,
        "count":    len(articles),
        "topic":    topic,
        "category": cat,
        "days":     days,
    }


# ── GET /api/news/summarize ───────────────────────────────────────────────────
# Streams an AI-written summary of the search results.
# First event sends all articles, then streams the summary word by word.

@router.get("/api/news/summarize")
async def news_summarize(
    topic:        str = Query(..., min_length=2, max_length=200),
    category:     str = Query(default="general"),
    days:         int = Query(default=7, ge=1, le=30),
    current_user: CurrentUser = None,
):
    cat = category.lower().strip()
    if cat not in _news_module.VALID_CATEGORIES:
        raise HTTPException(400, f"Invalid category '{cat}'.")

    try:
        articles = _news_module.search_news(topic, category=cat, days=days)
    except RuntimeError as exc:
        raise HTTPException(503, f"News search unavailable: {exc}")

    def stream():
        try:
            # Send all articles first so the frontend can render cards immediately
            yield f"data: {json.dumps({'type': 'articles', 'articles': articles, 'count': len(articles)})}\n\n"

            # Then stream the AI summary token by token
            for chunk in _news_module.summarize_news(articles, topic):
                yield f"data: {json.dumps({'type': 'chunk', 'chunk': chunk})}\n\n"

            yield f"data: {json.dumps({'type': 'done', 'article_count': len(articles)})}\n\n"

            # Log to activity feed after stream completes
            if current_user:
                database.log_activity(
                    current_user["id"],
                    "news_search",
                    {"topic": topic, "category": cat, "article_count": len(articles)},
                )
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'msg': str(exc)})}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache",
            "X-Accel-Buffering": "no",
            "Connection":        "keep-alive",
        },
    )


# ── GET /api/news/tracked ─────────────────────────────────────────────────────

@router.get("/api/news/tracked")
async def get_tracked_topics(current_user: CurrentUser):
    """Return all news topics the user is tracking."""
    topics = database.get_tracked_topics(current_user["id"])
    return {"topics": topics}


# ── POST /api/news/track ──────────────────────────────────────────────────────

@router.post("/api/news/track", status_code=201)
async def track_topic(body: dict, current_user: CurrentUser):
    """
    Save a news topic for tracking.
    Safe to call multiple times — duplicates are silently ignored.
    """
    topic    = body.get("topic", "").strip()
    category = body.get("category", "general").strip()
    wid      = body.get("workspace_id")

    if not topic:
        raise HTTPException(422, "topic is required")

    tid = database.track_news_topic(current_user["id"], topic, category, wid)
    return {"tracked": True, "id": tid, "topic": topic, "category": category}


# ── DELETE /api/news/tracked/{tid} ───────────────────────────────────────────

@router.delete("/api/news/tracked/{tid}")
async def untrack_topic(tid: int, current_user: CurrentUser):
    """Remove a tracked news topic by its ID."""
    deleted = database.delete_tracked_topic(tid)
    if not deleted:
        raise HTTPException(404, "Topic not found")
    return {"deleted": True, "id": tid}


# ══════════════════════════════════════════════════════════════════════════════
# DASHBOARD ROUTES
# Small enough to live here alongside news — both are "data display" features.
# ══════════════════════════════════════════════════════════════════════════════

@router.get("/api/dashboard/weather", tags=["Dashboard"])
async def dashboard_weather(
    city:         str = Query(..., min_length=1, max_length=100),
    current_user: CurrentUser = None,
):
    """Returns current weather for a city via Open-Meteo (free, no API key)."""
    try:
        raw  = _dash.get_weather.invoke({"city": city})
        data = json.loads(raw)
        if "error" in data:
            raise HTTPException(404, data["error"])
        return data
    except json.JSONDecodeError:
        raise HTTPException(502, "Weather service returned invalid data")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, f"Weather service unavailable: {exc}")


@router.get("/api/dashboard/travel-safety", tags=["Dashboard"])
async def dashboard_travel_safety(
    destination:  str = Query(..., min_length=1, max_length=100),
    current_user: CurrentUser = None,
):
    """AI-generated travel safety briefing for any destination."""
    try:
        result = _dash.get_travel_safety.invoke({"destination": destination})
        return {"destination": destination, "analysis": result}
    except Exception as exc:
        raise HTTPException(503, f"Travel safety service unavailable: {exc}")


@router.get("/api/dashboard/headlines", tags=["Dashboard"])
async def dashboard_headlines(
    topic:        str = Query(default="world news", max_length=200),
    current_user: CurrentUser = None,
):
    """Top 5 news headlines for a given topic."""
    try:
        raw       = _dash.get_headlines.invoke({"topic": topic})
        headlines = json.loads(raw)
        if isinstance(headlines, dict) and "error" in headlines:
            raise HTTPException(503, headlines["error"])
        return {"headlines": headlines, "topic": topic}
    except json.JSONDecodeError:
        raise HTTPException(502, "Headlines service returned invalid data")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, f"Headlines service unavailable: {exc}")


@router.post("/api/dashboard/chat", tags=["Dashboard"])
async def dashboard_chat(body: dict, current_user: CurrentUser = None):
    """AI assistant chat for the dashboard — streams the response."""
    query = body.get("query", "").strip()
    if not query:
        raise HTTPException(422, "query cannot be empty")

    def stream():
        try:
            result     = _dash.run_dashboard_agent(query)
            # Break result into chunks so it streams instead of appearing all at once
            chunk_size = 80
            for i in range(0, len(result), chunk_size):
                yield f"data: {json.dumps({'type': 'chunk', 'chunk': result[i:i+chunk_size]})}\n\n"
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'msg': str(exc)})}\n\n"

    return StreamingResponse(
        stream(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )
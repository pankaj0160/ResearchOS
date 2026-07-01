"""
routers/news_router.py

News search, summarization, tracked topics, and dashboard routes.

What changed from v1:
  - /api/news/summarize now uses summarize_news_async() so it NEVER blocks
  - Weather + Headlines routes now use in-memory cache (5 min TTL)
  - All dashboard routes use asyncio.run_in_executor for blocking external API calls
  - Proper Transfer-Encoding: chunked header added to all SSE responses
  - Clear error messages for every failure mode
"""

from __future__ import annotations

import asyncio
import json
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse

import database
import dashboard_agent as _dash
import news as _news_module
from auth import get_current_user
from rate_limit import news_limiter, dashboard_limiter
from database import (
    cache_get, cache_set,
    get_tracked_topics_async,
    track_news_topic_async,
    delete_tracked_topic_async,
    log_activity_async,
)

# ── Router ────────────────────────────────────────────────────────────────────
router = APIRouter(tags=["News"])

CurrentUser = Annotated[dict, Depends(get_current_user)]

# SSE response headers — same for every streaming endpoint
_SSE_HEADERS = {
    "Cache-Control":     "no-cache, no-transform",
    "X-Accel-Buffering": "no",        # tell nginx: don't buffer this stream
    "Connection":        "keep-alive",
    "Transfer-Encoding": "chunked",   # send data in pieces, not all at once
}


# ── GET /api/news/search ──────────────────────────────────────────────────────

@router.get("/api/news/search")
async def news_search(
    topic:        str = Query(..., min_length=2, max_length=200),
    category:     str = Query(default="general"),
    days:         int = Query(default=7, ge=1, le=30),
    current_user: CurrentUser = None,
):
    """
    Search for recent news articles.
    Results are cached for 10 minutes in news.py — same query returns instantly.
    """
    cat = category.lower().strip()

    if cat not in _news_module.VALID_CATEGORIES:
        raise HTTPException(
            400,
            f"Invalid category '{cat}'. "
            f"Valid categories: {sorted(_news_module.VALID_CATEGORIES)}"
        )

    try:
        # run_in_executor moves the blocking Tavily API call to a background thread
        # so FastAPI stays responsive to other users while we wait for Tavily
        loop     = asyncio.get_event_loop()
        articles = await loop.run_in_executor(
            None,
            lambda: _news_module.search_news(topic, category=cat, days=days),
        )
    except RuntimeError as exc:
        raise HTTPException(503, f"News search unavailable: {exc}")

    # Log to activity feed (non-blocking, never raises)
    await log_activity_async(
        current_user["id"],
        "news_search",
        {"topic": topic, "category": cat, "article_count": len(articles)},
    )

    return {
        "articles": articles,
        "count":    len(articles),
        "topic":    topic,
        "category": cat,
        "days":     days,
    }


# ── GET /api/news/summarize ───────────────────────────────────────────────────
# This is the most complex route. Here is the flow:
#   1. Fetch articles from Tavily (cached if already searched recently)
#   2. Send all articles to frontend immediately as first SSE event
#   3. Start async LLM summary (in background thread — never blocks)
#   4. Stream summary chunks to frontend one by one
#   5. Send 'done' event so frontend knows to stop spinner
#
# WHY SSE (Server-Sent Events)?
# SSE = the server keeps the connection open and sends data in pieces.
# This way the user sees words appearing one by one (like ChatGPT)
# instead of staring at a spinner for 10 seconds.

@router.get("/api/news/summarize")
async def news_summarize(
    topic:        str = Query(..., min_length=2, max_length=200),
    category:     str = Query(default="general"),
    days:         int = Query(default=7, ge=1, le=30),
    current_user: CurrentUser = None,
):
    # Rate limit: 10 news summaries per 60 seconds per user
    news_limiter.check(current_user["id"])
    cat = category.lower().strip()
    if cat not in _news_module.VALID_CATEGORIES:
        raise HTTPException(400, f"Invalid category '{cat}'.")

    # Fetch articles BEFORE starting the stream
    # If Tavily fails here, we return a proper HTTP error (not a broken stream)
    try:
        loop     = asyncio.get_event_loop()
        articles = await loop.run_in_executor(
            None,
            lambda: _news_module.search_news(topic, category=cat, days=days),
        )
    except RuntimeError as exc:
        raise HTTPException(503, f"News search unavailable: {exc}")

    async def event_stream():
        try:
            # Event 1: Send all articles immediately so cards appear on screen
            # User sees content right away while AI summary is being generated
            yield f"data: {json.dumps({'type': 'articles', 'articles': articles, 'count': len(articles)})}\n\n"

            if not articles:
                yield f"data: {json.dumps({'type': 'done', 'article_count': 0})}\n\n"
                return

            # Events 2..N: Stream the AI summary chunk by chunk
            # summarize_news_async() runs Groq in a background thread
            # so FastAPI can handle other requests while we stream
            async for chunk in _news_module.summarize_news_async(articles, topic):
                yield f"data: {json.dumps({'type': 'chunk', 'chunk': chunk})}\n\n"

            # Final event: tells frontend "spinner off, we're done"
            yield f"data: {json.dumps({'type': 'done', 'article_count': len(articles)})}\n\n"

            # Log to activity feed after stream completes
            await log_activity_async(
                current_user["id"],
                "news_summarize",
                {"topic": topic, "category": cat, "article_count": len(articles)},
            )

        except Exception as exc:
            # Send error as SSE event so the frontend can show a proper message
            yield f"data: {json.dumps({'type': 'error', 'msg': str(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )


# ── GET /api/news/tracked ─────────────────────────────────────────────────────

@router.get("/api/news/tracked")
async def get_tracked_topics(current_user: CurrentUser):
    """Return all news topics the user is tracking."""
    topics = await get_tracked_topics_async(current_user["id"])
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
    if category not in _news_module.VALID_CATEGORIES:
        category = "general"

    tid = await track_news_topic_async(current_user["id"], topic, category, wid)
    return {"tracked": True, "id": tid, "topic": topic, "category": category}


# ── DELETE /api/news/tracked/{tid} ───────────────────────────────────────────

@router.delete("/api/news/tracked/{tid}")
async def untrack_topic(tid: int, current_user: CurrentUser):
    """Remove a tracked news topic by its ID."""
    deleted = await delete_tracked_topic_async(tid)
    if not deleted:
        raise HTTPException(404, "Topic not found")
    return {"deleted": True, "id": tid}


# =============================================================================
# DASHBOARD ROUTES
# All external API calls (weather, headlines) are cached for 5 minutes.
# WHY: Weather/headlines don't change every second.
# Without cache: every Dashboard load = 1 external API call = ~500ms delay.
# With cache: Dashboard loads in <50ms for 5 minutes after first call.
# =============================================================================

@router.get("/api/dashboard/weather", tags=["Dashboard"])
async def dashboard_weather(
    city:         str = Query(..., min_length=1, max_length=100),
    current_user: CurrentUser = None,
):
    """
    Current weather for a city via Open-Meteo (free, no API key required).
    Cached for 5 minutes per city — same city returns instantly.
    """
    cache_key = f"weather:{city.lower().strip()}"
    cached    = cache_get(cache_key)
    if cached:
        return cached  # instant response — no external API call

    try:
        loop = asyncio.get_event_loop()
        # run_in_executor prevents this blocking HTTP call from freezing the server
        raw  = await loop.run_in_executor(
            None, lambda: _dash.get_weather.invoke({"city": city})
        )
        data = json.loads(raw)
        if "error" in data:
            raise HTTPException(404, data["error"])

        # Cache the result for 5 minutes
        cache_set(cache_key, data, ttl_seconds=300)
        return data

    except json.JSONDecodeError:
        raise HTTPException(502, "Weather service returned invalid data")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, f"Weather service unavailable: {exc}")


@router.get("/api/dashboard/headlines", tags=["Dashboard"])
async def dashboard_headlines(
    topic:        str = Query(default="world news", max_length=200),
    current_user: CurrentUser = None,
):
    """
    Top 5 news headlines for a given topic.
    Cached for 5 minutes per topic — avoids Tavily API call on every page load.
    """
    cache_key = f"headlines:{topic.lower().strip()}"
    cached    = cache_get(cache_key)
    if cached:
        return cached  # instant — from cache

    try:
        loop = asyncio.get_event_loop()
        raw  = await loop.run_in_executor(
            None, lambda: _dash.get_headlines.invoke({"topic": topic})
        )
        headlines = json.loads(raw)
        if isinstance(headlines, dict) and "error" in headlines:
            raise HTTPException(503, headlines["error"])

        result = {"headlines": headlines, "topic": topic}
        cache_set(cache_key, result, ttl_seconds=300)
        return result

    except json.JSONDecodeError:
        raise HTTPException(502, "Headlines service returned invalid data")
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(503, f"Headlines service unavailable: {exc}")


@router.get("/api/dashboard/travel-safety", tags=["Dashboard"])
async def dashboard_travel_safety(
    destination:  str = Query(..., min_length=1, max_length=100),
    current_user: CurrentUser = None,
):
    """AI-generated travel safety briefing. Cached for 10 minutes per destination."""
    cache_key = f"travel:{destination.lower().strip()}"
    cached    = cache_get(cache_key)
    if cached:
        return cached

    try:
        loop   = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, lambda: _dash.get_travel_safety.invoke({"destination": destination})
        )
        data = {"destination": destination, "analysis": result}
        cache_set(cache_key, data, ttl_seconds=600)
        return data
    except Exception as exc:
        raise HTTPException(503, f"Travel safety service unavailable: {exc}")


@router.post("/api/dashboard/chat", tags=["Dashboard"])
async def dashboard_chat(body: dict, current_user: CurrentUser = None):
    """
    AI assistant chat for the Dashboard — streams response token by token.
    Uses run_in_executor so the blocking LLM call never freezes the server.
    """
    # Rate limit: 20 dashboard chats per 60 seconds per user
    if current_user:
        dashboard_limiter.check(current_user["id"])
    query = body.get("query", "").strip()
    if not query:
        raise HTTPException(422, "query cannot be empty")

    async def event_stream():
        try:
            loop   = asyncio.get_event_loop()
            result = await loop.run_in_executor(
                None, lambda: _dash.run_dashboard_agent(query)
            )
            # Stream in 80-char chunks for a smooth typing effect
            chunk_size = 80
            for i in range(0, len(result), chunk_size):
                yield f"data: {json.dumps({'type': 'chunk', 'chunk': result[i:i+chunk_size]})}\n\n"
                await asyncio.sleep(0.01)   # let event loop breathe between chunks
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except Exception as exc:
            yield f"data: {json.dumps({'type': 'error', 'msg': str(exc)})}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers=_SSE_HEADERS,
    )
# eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxIiwiZXhwIjoxNzgzMTQ0NTA2fQ.LK5ltljy0CtkKkCvvpf7IECUV7-0GRVmHZDTZH1lgtg
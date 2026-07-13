"""
routers/research_router.py

All research pipeline and history routes for ResearchOS.
Handles: SSE streaming pipeline, research history CRUD, export, related content.

The SSE stream is the most complex route in the project.
It runs 4 AI agents, streams events live to the browser,
saves the result, and auto-ingests into RAG — all in one request.
"""

from __future__ import annotations

import asyncio
import gc                               # garbage collector — frees memory after heavy pipeline
import json
import re
from datetime import datetime
from pathlib import Path
from typing import Annotated
from uuid import uuid4

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import Response, StreamingResponse
from pydantic import BaseModel, Field

import database
from auth import get_current_user
from database import (
    delete_run,
    get_history,
    get_history_async,   # Task 2.3: async version for the /history route handler
    get_run,
    save_run,
    save_run_async,      # Task 2.3: async version for the SSE stream save
    search_runs_async, get_run_async, delete_run_async,
    set_run_share_token_async, clear_run_share_token_async, get_run_by_share_token_async,
    add_followup_message_async, get_followups_async,
)
from pipeline import run_pipeline_async
from rag import ingest_text_content
from rate_limit import research_limiter, followup_limiter
from error_models import STANDARD_ERROR_RESPONSES, ErrorResponse

# ── Create the router ─────────────────────────────────────────────────────────
# Two prefixes needed here because this router handles TWO url groups:
#   /api/research/* — the streaming pipeline
#   /api/history/*  — reading/managing past runs
# We use prefix="" and write full paths. Cleaner than splitting into two routers.

router = APIRouter(tags=["Research"])

# Shortcut type — reads JWT and returns the current user dict
CurrentUser = Annotated[dict, Depends(get_current_user)]


# ── Shared state — _rag_sessions lives in rag_router ─────────────────────────
# Import the single shared dict. Do NOT import _ingest_text_background from
# rag_router — that version is for PDF/text ingestion triggered by the RAG
# upload endpoint. We define our own below, tailored for research reports.
from routers.rag_router import _rag_sessions


# ── Background helper — ingest report text into ChromaDB ─────────────────────
# After the pipeline finishes, the report is auto-ingested into RAG so the
# user can immediately "Chat with this report" without uploading anything.
# This runs as an asyncio background task — it never blocks the SSE stream.

async def _ingest_text_background(
    session_id: str,
    title: str,
    text: str,
) -> None:
    """
    Background coroutine: ingest plain text into ChromaDB for a RAG session.
    Updates _rag_sessions[session_id] status when done.
    Never raises — failures are logged to console only.
    """
    loop = asyncio.get_event_loop()
    try:
        # run_in_executor moves blocking ChromaDB/embedding code off the event loop
        # so the server can handle other requests while this runs
        result = await loop.run_in_executor(
            None,
            lambda: ingest_text_content(text, session_id, title),
        )
        chunk_count = result.get("chunk_count", 0)

        # Update the in-memory session so /api/rag/status returns "ready"
        if session_id in _rag_sessions:
            _rag_sessions[session_id].update({
                "status":      "ready",
                "chunk_count": chunk_count,
                "page_count":  1,
            })

        # Also persist the status to the database (survives server restarts)
        database.update_rag_session_status(
            session_id, "ready",
            page_count=1, chunk_count=chunk_count,
        )
        print(f"[TextIngest BG] session={session_id} ready — {chunk_count} chunks")

    except Exception as exc:
        print(f"[TextIngest BG] session={session_id} failed: {exc}")
        if session_id in _rag_sessions:
            _rag_sessions[session_id].update({
                "status": "error",
                "error":  str(exc),
            })
        database.update_rag_session_status(
            session_id, "error", error_msg=str(exc)
        )


# ── GET /api/research/stream ──────────────────────────────────────────────────
# The heart of ResearchOS. Runs 4 AI agents and streams events live.
# Uses SSE (Server-Sent Events) — connection stays open, server pushes data.

@router.get("/api/research/stream")
async def research_stream(
    topic:        str = Query(..., min_length=3, max_length=300),
    workspace_id: int = Query(default=None),   # optional — links run to a workspace
    focus_mode:   str = Query(default="balanced", max_length=32),  # Quick/Academic/News/Technical
    current_user: CurrentUser = None,
):
    # Check rate limit — max 5 research runs per 60 seconds per user
    research_limiter.check(current_user["id"])
    user_id = current_user["id"]

    # Deduplication — prevent same user running same topic twice at once
    # Lazy import avoids circular import (main imports research_router)
    try:
        from main import is_research_in_flight, mark_research_started, mark_research_done
        if is_research_in_flight(user_id, topic):
            from fastapi import HTTPException
            raise HTTPException(
                409,
                f"Research on '{topic}' is already in progress. Please wait for it to finish."
            )
        mark_research_started(user_id, topic)
    except ImportError:
        mark_research_started = mark_research_done = lambda *a: None

    async def event_stream():
        report    = ""                  # accumulates the writer agent's output
        feedback  = ""                  # accumulates the critic agent's output
        run_sources: list[dict] = []    # NEW: captured from the "sources" event, persisted with the run
        last_ping = asyncio.get_event_loop().time()

        try:
            # run_pipeline_async is an async generator — it yields one event at a time
            # Each yielded event is immediately sent to the browser as an SSE message
            async for event in run_pipeline_async(topic, focus_mode=focus_mode):
                now = asyncio.get_event_loop().time()

                # Send a ping every 15 seconds so the browser connection stays alive
                # (browsers close SSE connections that are silent for too long)
                if now - last_ping > 15:
                    yield f"data: {json.dumps({'type': 'ping'})}\n\n"
                    last_ping = now

                # Accumulate the report text as it streams in word by word
                if event.get("agent") == "writer" and event.get("type") in ("chunk", "streaming"):
                    report += event.get("msg", "")

                # Accumulate the critic's feedback
                if event.get("agent") == "critic" and event.get("type") in ("chunk", "streaming"):
                    feedback += event.get("msg", "")

                # Capture structured sources for persistence (powers follow-up Q&A later)
                if event.get("agent") == "search" and event.get("type") == "sources":
                    run_sources = event.get("sources") or []

                # Send every event to the browser immediately
                yield f"data: {json.dumps(event)}\n\n"
                last_ping = asyncio.get_event_loop().time()

            # Pipeline finished — save the run if we got a report
            if report:
                # Task 2.3: use async version so the event loop is not blocked
                # while writing to the database. Falls back to sync save_run()
                # automatically if the async pool is unavailable (local dev).
                run_id = await save_run_async(
                    topic,
                    report,
                    feedback,
                    user_id=user_id,
                    workspace_id=workspace_id,
                    sources=run_sources,
                )

                # Auto-ingest the report into RAG as a background task
                # So the user can immediately "Chat with this report"
                rag_session_id = None
                try:
                    rag_session_id = str(uuid4())
                    created_at     = datetime.utcnow().isoformat()

                    # Register session in memory immediately (status=processing)
                    _rag_sessions[rag_session_id] = {
                        "user_id":     user_id,
                        "filename":    f"Research: {topic[:60]}",
                        "file_path":   None,
                        "created_at":  created_at,
                        "history":     [],
                        "status":      "processing",
                        "source_type": "research_run",
                        "run_id":      run_id,
                    }

                    # Persist to DB so it survives server restarts
                    database.save_rag_session(
                        rag_session_id,
                        user_id,
                        f"Research: {topic[:60]}",
                        source_type="research_run",
                        run_id=run_id,
                        workspace_id=workspace_id,
                    )

                    # Start background ingestion — does NOT block this SSE response
                    asyncio.create_task(
                        _ingest_text_background(rag_session_id, topic, report)
                    )

                except Exception as exc:
                    print(f"[RAG auto-ingest] Failed to start: {exc}")
                    rag_session_id = None   # don't send a broken id to the frontend

                # Log this activity so it shows in the Dashboard activity feed
                database.log_activity(
                    user_id,
                    "research_run",
                    {
                        "run_id":         run_id,
                        "topic":          topic,
                        "word_count":     len(report.split()),
                        "rag_session_id": rag_session_id,
                    },
                    workspace_id=workspace_id,
                )

                # Tell the frontend the run is saved and give it the IDs
                yield f"data: {json.dumps({'type': 'saved', 'run_id': run_id, 'rag_session_id': rag_session_id})}\n\n"

            # Signal the frontend that the stream is completely done
            yield f"data: {json.dumps({'type': 'done'})}\n\n"

        except Exception as exc:
            # If anything crashes mid-stream, send an error event to the browser
            yield f"data: {json.dumps({'type': 'error', 'msg': str(exc)})}\n\n"

        finally:
            # Free memory held by potentially large report strings
            del report, feedback
            gc.collect()
            # Always clear dedup key — even if pipeline crashed
            try:
                from main import mark_research_done
                mark_research_done(user_id, topic)
            except ImportError:
                pass

    # Wrap the generator in a StreamingResponse with SSE headers
    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control":     "no-cache, no-transform",  # never cache a stream
            "X-Accel-Buffering": "no",                      # tells nginx not to buffer
            "Connection":        "keep-alive",               # keep the socket open
            "Transfer-Encoding": "chunked",                  # send in pieces
        },
    )


# ── GET /api/history ──────────────────────────────────────────────────────────

@router.get("/api/history")
async def history(current_user: CurrentUser):
    # Task 2.3: use async version so the History page load never blocks the
    # event loop. Falls back to sync get_history() if pool is unavailable.
    return {"runs": await get_history_async(limit=50, user_id=current_user["id"])}


# ── GET /api/history/search ───────────────────────────────────────────────────
# Full-text search across topic AND report content.
# IMPORTANT: this route must be defined BEFORE /history/{run_id}
# because FastAPI matches routes top to bottom — "search" would be treated
# as a run_id integer and fail with a 422 if order is wrong.

@router.get("/api/history/search")
async def search_history(
    q:            str = Query(..., min_length=2, max_length=200),
    current_user: CurrentUser = None,
    limit:        int = Query(default=20, ge=1, le=50),
):
    results = await search_runs_async(current_user["id"], q, limit=limit)
    return {"results": results, "query": q, "count": len(results)}


# ── GET /api/history/{run_id} ─────────────────────────────────────────────────

@router.get(
    "/api/history/{run_id}",
    responses=STANDARD_ERROR_RESPONSES,
)
async def get_run_route(run_id: int, current_user: CurrentUser):
    run = await get_run_async(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    # Security check — users can only access their own runs
    if run.get("user_id") != current_user["id"]:
        raise HTTPException(403, "Access denied")
    return run


# ── DELETE /api/history/{run_id} ──────────────────────────────────────────────

@router.delete(
    "/api/history/{run_id}",
    responses=STANDARD_ERROR_RESPONSES,
)
async def delete_run_route(run_id: int, current_user: CurrentUser):
    run = await get_run_async(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    if run.get("user_id") != current_user["id"]:
        raise HTTPException(403, "Access denied")
    await delete_run_async(run_id)
    return {"deleted": True}


# ── GET /api/history/{run_id}/export ─────────────────────────────────────────
# Returns the report as a downloadable .md file.
# The browser triggers a file download automatically from the Content-Disposition header.

@router.get(
    "/api/history/{run_id}/export",
    responses=STANDARD_ERROR_RESPONSES,
)
async def export_run(run_id: int, current_user: CurrentUser):
    run = get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    if run.get("user_id") != current_user["id"]:
        raise HTTPException(403, "Access denied")
    if not run.get("report", "").strip():
        raise HTTPException(422, "This run has no report content to export")

    topic    = run.get("topic", "research")
    report   = run.get("report", "").strip()
    feedback = run.get("feedback", "").strip()

    # Build the markdown file content
    content = f"# {topic}\n\n{report}"
    if feedback:
        content += f"\n\n---\n\n## Critic Review\n\n{feedback}"

    # Create a safe filename from the topic — removes special characters
    slug     = re.sub(r"[^a-z0-9]+", "-", topic.lower()).strip("-") or "report"
    filename = f"researchos-{slug}.md"

    return Response(
        content    = content.encode("utf-8"),
        media_type = "text/markdown",
        headers    = {"Content-Disposition": f'attachment; filename="{filename}"'},
    )


# ── POST /api/history/{run_id}/share ──────────────────────────────────────────
# Creates (or rotates) a public share link for one report. Anyone with the
# resulting token can view a read-only version of the report without an
# account — see the public GET route below.

@router.post(
    "/api/history/{run_id}/share",
    responses=STANDARD_ERROR_RESPONSES,
)
async def create_share_link(run_id: int, current_user: CurrentUser):
    run = await get_run_async(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    if run.get("user_id") != current_user["id"]:
        raise HTTPException(403, "Access denied")
    if not run.get("report", "").strip():
        raise HTTPException(422, "This run has no report content to share")

    token  = uuid4().hex
    ok = await set_run_share_token_async(run_id, current_user["id"], token)
    if not ok:
        raise HTTPException(500, "Could not create share link — please try again")
    return {"share_token": token}


# ── DELETE /api/history/{run_id}/share ────────────────────────────────────────
# Revokes an existing share link. The old token stops working immediately.

@router.delete(
    "/api/history/{run_id}/share",
    responses=STANDARD_ERROR_RESPONSES,
)
async def revoke_share_link(run_id: int, current_user: CurrentUser):
    run = await get_run_async(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    if run.get("user_id") != current_user["id"]:
        raise HTTPException(403, "Access denied")
    await clear_run_share_token_async(run_id, current_user["id"])
    return {"revoked": True}


# ── GET /api/public/reports/{token} ───────────────────────────────────────────
# Unauthenticated — the token itself is the access control. Only returns the
# fields safe to show a stranger: no user_id, no workspace_id, no internal ids
# beyond what's needed to render the report.

@router.get(
    "/api/public/reports/{token}",
    responses=STANDARD_ERROR_RESPONSES,
)
async def get_public_report(token: str):
    run = await get_run_by_share_token_async(token)
    if not run:
        raise HTTPException(404, "This link doesn't exist or has been revoked")

    return {
        "topic":        run.get("topic", ""),
        "report":       run.get("report", ""),
        "word_count":   run.get("word_count", 0),
        "source_count": run.get("source_count", 0),
        "score":        run.get("score"),
        "created_at":   run.get("created_at"),
    }


# ── GET /api/history/{run_id}/followups ───────────────────────────────────────
# Returns the full follow-up thread for a report, oldest first — used to
# restore the conversation when a user reopens a past report.

@router.get(
    "/api/history/{run_id}/followups",
    responses=STANDARD_ERROR_RESPONSES,
)
async def list_followups(run_id: int, current_user: CurrentUser):
    run = await get_run_async(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    if run.get("user_id") != current_user["id"]:
        raise HTTPException(403, "Access denied")

    messages = await get_followups_async(run_id)
    return {"messages": messages}


# ── POST /api/history/{run_id}/followup ───────────────────────────────────────
# Ask a question about a completed report. Answered from the report + saved
# sources plus prior thread turns — does NOT re-run the search/reader/writer/
# critic pipeline. See agents.py's answer_followup().

class FollowupRequest(BaseModel):
    question: str = Field(..., min_length=1, max_length=1000)


@router.post(
    "/api/history/{run_id}/followup",
    responses=STANDARD_ERROR_RESPONSES,
)
async def ask_followup(run_id: int, body: FollowupRequest, current_user: CurrentUser):
    followup_limiter.check(current_user["id"])

    run = await get_run_async(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    if run.get("user_id") != current_user["id"]:
        raise HTTPException(403, "Access denied")
    if not run.get("report", "").strip():
        raise HTTPException(422, "This run has no report to ask questions about")

    question = body.question.strip()

    # Lazy imports — avoid pulling agents.py's LLM setup into every request to this router
    from agents import answer_followup, get_chain_llm

    sources_raw = run.get("sources_json")
    sources = json.loads(sources_raw) if sources_raw else []

    history = await get_followups_async(run_id)

    try:
        loop = asyncio.get_event_loop()
        answer = await loop.run_in_executor(
            None,
            lambda: answer_followup(
                topic=run["topic"],
                report=run["report"],
                sources=sources,
                history=history,
                question=question,
                llm=get_chain_llm(),
            ),
        )
    except Exception as exc:
        raise HTTPException(502, f"Follow-up failed: {exc}")

    await add_followup_message_async(run_id, "user", question)
    await add_followup_message_async(run_id, "assistant", answer)

    return {"answer": answer}


# ── GET /api/history/{run_id}/related ────────────────────────────────────────
# Finds other content related to this research run by keyword overlap.
# Checks: other research runs, RAG sessions, tracked news topics.
# Intentionally uses sync get_history() here — the bottleneck in this route
# is the Python keyword-matching loop, not the DB query. Async upgrade deferred
# to Task 2.4 when all DB calls are converted.

@router.get("/api/history/{run_id}/related")
async def get_related_content(run_id: int, current_user: CurrentUser):
    run = get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    if run.get("user_id") != current_user["id"]:
        raise HTTPException(403, "Access denied")

    topic = run["topic"]
    uid   = current_user["id"]

    # Extract meaningful keywords — skip short words and common stopwords
    stopwords = {"with", "that", "this", "from", "what", "about", "does", "have"}
    keywords  = [
        w.lower() for w in topic.split()
        if len(w) > 3 and w.lower() not in stopwords
    ][:5]

    def matches(text: str) -> bool:
        """Returns True if any keyword appears in the text."""
        t = text.lower()
        return any(kw in t for kw in keywords)

    # Find related research runs (sync — bottleneck is keyword loop, not DB)
    all_runs     = get_history(limit=100, user_id=uid)
    related_runs = [
        {
            "id":         r["id"],
            "topic":      r["topic"],
            "score":      r.get("score"),
            "created_at": r.get("created_at"),
        }
        for r in all_runs
        if r["id"] != run_id and matches(r["topic"])
    ][:5]

    # Find related RAG sessions (from shared in-memory dict — no DB call needed)
    related_rag = [
        {
            "session_id":  sid,
            "filename":    s.get("filename", ""),
            "source_type": s.get("source_type", "pdf"),
            "created_at":  s.get("created_at"),
        }
        for sid, s in _rag_sessions.items()
        if s.get("user_id") == uid
        and s.get("status") == "ready"
        and matches(s.get("filename") or "")
    ][:5]

    # Find related tracked news topics
    all_tracked  = database.get_tracked_topics(uid)
    related_news = [
        {
            "id":       t["id"],
            "topic":    t["topic"],
            "category": t["category"],
        }
        for t in all_tracked
        if matches(t["topic"])
    ][:5]

    return {
        "run_id":               run_id,
        "topic":                topic,
        "keywords":             keywords,
        "related_runs":         related_runs,
        "related_rag_sessions": related_rag,
        "related_news_topics":  related_news,
    }
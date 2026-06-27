"""
news.py — News search and AI summarization for ResearchOS.

Uses Tavily's news-optimised search endpoint to fetch recent articles,
then streams a structured briefing via Groq.

Key improvements over v1:
  - summarize_news_async() runs Groq in a thread so it never blocks the event loop
  - search_news_cached() returns cached results for 10 minutes (saves Tavily API calls)
  - Better error messages with actionable suggestions
  - Proper generator typing for SSE streaming
"""

from __future__ import annotations

import asyncio
import os
import time
from pathlib import Path
from typing import AsyncGenerator, Generator

from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env", override=True)


# ── Config ─────────────────────────────────────────────────────────────────────

VALID_CATEGORIES = {
    "general", "technology", "finance", "science",
    "health", "politics", "sports", "world", "business",
}

MAX_ARTICLES     = 10   # fetch up to 10 per search
SUMMARY_ARTICLES = 8    # use top-N for AI summary

# Cache TTL for search results: 10 minutes
# Same user searching the same topic within 10 min gets instant response
CACHE_TTL_SECONDS = 600


# ── Simple search result cache ────────────────────────────────────────────────
# dict of {cache_key: (articles_list, expires_at)}
_search_cache: dict[str, tuple[list, float]] = {}


def _cache_get(key: str) -> list | None:
    entry = _search_cache.get(key)
    if entry and time.time() < entry[1]:
        return entry[0]
    return None


def _cache_set(key: str, articles: list) -> None:
    _search_cache[key] = (articles, time.time() + CACHE_TTL_SECONDS)


# ── Tavily key pool ────────────────────────────────────────────────────────────

def _load_keys(env_var: str) -> list[str]:
    raw = os.getenv(env_var, "")
    return [k.strip() for k in raw.split(",") if k.strip()]


_TAVILY_KEYS: list[str] = _load_keys("TAVILY_API_KEYS")


def _tavily_news_search(query: str, days: int = 7, max_results: int = MAX_ARTICLES) -> dict:
    """
    Call Tavily with topic='news' for recency-optimised results.
    Rotates through all API keys before raising.
    Raises RuntimeError with a clear message if all keys fail.
    """
    try:
        from tavily import TavilyClient
    except ImportError as exc:
        raise ImportError(
            "tavily-python not installed. Run: pip install tavily-python"
        ) from exc

    if not _TAVILY_KEYS:
        raise RuntimeError(
            "TAVILY_API_KEYS is not set in your .env file.\n"
            "Add it like this:\n  TAVILY_API_KEYS=tvly_key1,tvly_key2\n"
            "Get a free key at: https://tavily.com"
        )

    last_err: Exception | None = None
    for key in _TAVILY_KEYS:
        try:
            client = TavilyClient(api_key=key)
            return client.search(
                query=query,
                search_depth="advanced",
                topic="news",
                days=days,
                max_results=max_results,
                include_raw_content=False,
            )
        except Exception as exc:
            print(f"[Tavily-News] key failed ({key[:10]}…): {exc}")
            last_err = exc

    raise RuntimeError(
        f"News search failed — all Tavily API keys returned errors.\n"
        f"Last error: {last_err}\n"
        f"Check your TAVILY_API_KEYS in .env"
    )


# ── Article normalisation ──────────────────────────────────────────────────────

def _normalise(raw: dict) -> dict:
    """Convert raw Tavily result to clean article dict."""
    url = raw.get("url", "")
    try:
        domain = url.split("/")[2]
        if domain.startswith("www."):
            domain = domain[4:]
    except IndexError:
        domain = url

    return {
        "title":          raw.get("title", "Untitled"),
        "url":            url,
        "published_date": raw.get("published_date", ""),
        "snippet":        (raw.get("content") or raw.get("snippet") or "")[:450],
        "source":         domain,
        "score":          round(raw.get("score", 0), 3),
    }


# ── Public API — Search ────────────────────────────────────────────────────────

def search_news(
    topic:    str,
    category: str = "general",
    days:     int = 7,
) -> list[dict]:
    """
    Search for recent news articles.
    Results are cached for 10 minutes — same query returns instantly.

    Returns list of normalised article dicts:
        { title, url, published_date, snippet, source, score }

    Raises RuntimeError if all Tavily keys fail.
    """
    query = topic.strip()
    if category and category != "general":
        query = f"{query} {category}"

    # Check cache first — avoids Tavily API call for repeated queries
    cache_key = f"{query}:{days}"
    cached = _cache_get(cache_key)
    if cached is not None:
        print(f"[News Cache] HIT for '{query}' ({len(cached)} articles)")
        return cached

    print(f"[News Cache] MISS for '{query}' — fetching from Tavily")
    results  = _tavily_news_search(query, days=days, max_results=MAX_ARTICLES)
    articles = [_normalise(r) for r in results.get("results", [])]

    # Sort by Tavily relevance score descending
    articles.sort(key=lambda a: a["score"], reverse=True)

    # Store in cache so the next request is instant
    _cache_set(cache_key, articles)

    return articles


# ── Public API — Summarize (sync generator, for sync contexts) ─────────────────

def summarize_news(articles: list[dict], topic: str) -> Generator[str, None, None]:
    """
    Stream an AI news briefing for the given articles.
    This is a sync generator — used only in sync contexts.

    For async route handlers, use summarize_news_async() instead.
    Yields string chunks suitable for SSE streaming.
    """
    from agents import get_chain_llm

    if not articles:
        yield "No articles found for this topic. Try a different query or extend the date range."
        return

    prompt = _build_summary_prompt(articles, topic)
    llm    = get_chain_llm(temperature=0.1)

    try:
        for chunk in llm.stream(prompt):
            if hasattr(chunk, "content"):
                yield chunk.content
    except Exception as exc:
        yield f"\n\n⚠️ Summary generation failed: {exc}"


# ── Public API — Summarize ASYNC (for async route handlers) ───────────────────

async def summarize_news_async(
    articles: list[dict],
    topic:    str,
) -> AsyncGenerator[str, None]:
    """
    Async version of summarize_news.

    WHY THIS EXISTS:
    The Groq LLM call is blocking (it waits for the network).
    In an async FastAPI route, blocking calls freeze the entire server.
    run_in_executor() moves the blocking call to a separate thread,
    so the server stays free to handle other requests while Groq responds.

    This is an async generator — use it with 'async for chunk in ...'
    """
    from agents import get_chain_llm

    if not articles:
        yield "No articles found for this topic. Try a different query or extend the date range."
        return

    prompt = _build_summary_prompt(articles, topic)
    loop   = asyncio.get_event_loop()

    # Collect full summary in a thread (blocking) then stream it in chunks
    # This prevents the LLM call from freezing FastAPI's event loop
    def _run_llm() -> str:
        llm    = get_chain_llm(temperature=0.1)
        result = ""
        for chunk in llm.stream(prompt):
            if hasattr(chunk, "content"):
                result += chunk.content
        return result

    try:
        # run_in_executor = "run this blocking function in a background thread"
        full_text = await loop.run_in_executor(None, _run_llm)

        # Stream the result back in small chunks so the UI updates progressively
        # 60 chars per chunk = smooth word-by-word feel in the frontend
        chunk_size = 60
        for i in range(0, len(full_text), chunk_size):
            yield full_text[i : i + chunk_size]
            # Small sleep lets the event loop breathe between chunks
            await asyncio.sleep(0.01)

    except Exception as exc:
        yield f"\n\n⚠️ Summary generation failed: {str(exc)}"


# ── Internal helper — build the summary prompt ─────────────────────────────────

def _build_summary_prompt(articles: list[dict], topic: str) -> str:
    """
    Build the LLM prompt for news summarization.
    Extracted as a separate function so both sync and async versions use the same prompt.
    """
    articles_text = "\n\n".join(
        f"[{i + 1}] {a['title']}\n"
        f"Source: {a['source']}  |  Date: {a['published_date'] or 'recent'}\n"
        f"{a['snippet']}"
        for i, a in enumerate(articles[:SUMMARY_ARTICLES])
    )

    return f"""You are a senior news analyst producing a structured intelligence briefing.
Analyse the following news articles about "{topic}" and write a clear, concise briefing.

Articles:
{articles_text}

Write a structured briefing with these exact sections (use ## headings):

## Situation Overview
2-3 sentences summarising the current situation.

## Key Developments
Bullet list of the 3-5 most significant recent developments.

## Context & Background
Why this topic matters; relevant history or trends in 2-3 sentences.

## Key Players
Who is involved — organisations, governments, individuals (if applicable).

## What to Watch
2-3 forward-looking signals or upcoming events to monitor.

Keep the tone factual and neutral. Cite source names inline where relevant (e.g. "According to Reuters...").
Do not invent information not present in the articles."""
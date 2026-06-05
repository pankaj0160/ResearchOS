"""
news.py — News search and AI summarization for ResearchOS.

Uses Tavily's news-optimised search endpoint to fetch recent articles,
then streams a structured briefing via Groq.
"""

from __future__ import annotations

import os
from typing import Generator

from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env", override=True)

# DEBUG - remove after fixing
print(f"[DEBUG] .env path: {Path(__file__).parent / '.env'}")
print(f"[DEBUG] TAVILY_API_KEYS raw: {os.getenv('TAVILY_API_KEYS', 'NOT FOUND')}")


# ── Config ─────────────────────────────────────────────────────────────────────

VALID_CATEGORIES = {
    "general", "technology", "finance", "science",
    "health", "politics", "sports", "world", "business",
}

MAX_ARTICLES      = 10   # fetch up to 10 per search
SUMMARY_ARTICLES  = 8    # use top-N for AI summary


# ── Tavily key pool (mirrors tools.py pattern) ────────────────────────────────

def _load_keys(env_var: str) -> list[str]:
    raw = os.getenv(env_var, "")
    return [k.strip() for k in raw.split(",") if k.strip()]


_TAVILY_KEYS: list[str] = _load_keys("TAVILY_API_KEYS")


def _tavily_news_search(query: str, days: int = 7, max_results: int = MAX_ARTICLES) -> dict:
    """
    Call Tavily with topic='news' for recency-optimised results.
    Rotates through all configured API keys before raising.
    """
    try:
        from tavily import TavilyClient
    except ImportError as exc:
        raise ImportError("tavily-python not installed. Run: pip install tavily-python") from exc

    if not _TAVILY_KEYS:
        raise RuntimeError(
            "TAVILY_API_KEYS is not set. "
            "Add it to .env:\n  TAVILY_API_KEYS=tvly_key1,tvly_key2"
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

    raise RuntimeError(f"All Tavily keys exhausted. Last error: {last_err}")


# ── Article normalisation ──────────────────────────────────────────────────────

def _normalise(raw: dict) -> dict:
    url = raw.get("url", "")
    try:
        domain = url.split("/")[2]
        # strip www.
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


# ── Public API ─────────────────────────────────────────────────────────────────

def search_news(
    topic:    str,
    category: str = "general",
    days:     int = 7,
) -> list[dict]:
    """
    Search for recent news articles using Tavily.

    Returns a list of normalised article dicts:
        { title, url, published_date, snippet, source, score }

    Raises RuntimeError if all Tavily keys fail.
    """
    query = topic.strip()
    if category and category != "general":
        query = f"{query} {category}"

    results = _tavily_news_search(query, days=days, max_results=MAX_ARTICLES)
    articles = [_normalise(r) for r in results.get("results", [])]

    # Sort by Tavily relevance score descending
    articles.sort(key=lambda a: a["score"], reverse=True)
    return articles


def summarize_news(articles: list[dict], topic: str) -> Generator[str, None, None]:
    """
    Stream a structured AI news briefing for the given articles.

    Yields string chunks suitable for SSE streaming.
    """
    from agents import get_chain_llm

    if not articles:
        yield "No articles found for this topic. Try a different query or extend the date range."
        return

    articles_text = "\n\n".join(
        f"[{i + 1}] {a['title']}\n"
        f"Source: {a['source']}  |  Date: {a['published_date'] or 'recent'}\n"
        f"{a['snippet']}"
        for i, a in enumerate(articles[:SUMMARY_ARTICLES])
    )

    prompt = f"""You are a senior news analyst producing a structured intelligence briefing.
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

    llm = get_chain_llm(temperature=0.1)
    for chunk in llm.stream(prompt):
        yield chunk.content

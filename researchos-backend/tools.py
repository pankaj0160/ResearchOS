"""
tools.py — Search & Scraper tools for OrchestrAI agents.

- web_search  : Tavily-powered search with key failover
- scrape_url  : BeautifulSoup HTML extractor with fallback handling
- brave_search: Alias for web_search (model compatibility)
"""

import os
import re
from dotenv import load_dotenv
from langchain.tools import tool
import requests
from bs4 import BeautifulSoup
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env", override=True)

# ── Tavily key pool ──────────────────────────────────────────────────────────

def _load_keys(env_var: str) -> list[str]:
    raw = os.getenv(env_var, "")
    return [k.strip() for k in raw.split(",") if k.strip()]


TAVILY_KEYS = _load_keys("TAVILY_API_KEYS")


def _tavily_search(
    query: str,
    max_results: int = 5,
    search_depth: str = "basic",
    topic: str = "general",
) -> dict:
    """
    Try each Tavily key in sequence; raise only when all fail.

    search_depth: "basic" | "advanced" — Tavily's own quality/depth knob.
    topic:        "general" | "news"   — biases Tavily's ranking toward
                  recency and news sources when set to "news".
    """
    try:
        from tavily import TavilyClient
    except ImportError as exc:
        raise ImportError("tavily-python not installed. Run: pip install tavily-python") from exc

    last_err: Exception | None = None
    for key in TAVILY_KEYS:
        try:
            client = TavilyClient(api_key=key)
            return client.search(
                query=query,
                max_results=max_results,
                search_depth=search_depth,
                topic=topic,
            )
        except Exception as exc:
            print(f"[Tavily] key failed ({key[:10]}…): {exc}")
            last_err = exc

    raise RuntimeError(f"All Tavily API keys exhausted. Last error: {last_err}")


# ── Search tool ──────────────────────────────────────────────────────────────

@tool
def web_search(query: str) -> str:
    """Search the web for recent, reliable information on a topic."""
    try:
        results = _tavily_search(query, max_results=5)
        if not results.get("results"):
            return "No results found."

        lines: list[str] = []
        for r in results["results"]:
            lines.append(
                f"Title:   {r.get('title', 'N/A')}\n"
                f"URL:     {r.get('url', 'N/A')}\n"
                f"Snippet: {r.get('content', '')[:400]}\n"
            )
        return "\n----\n".join(lines)

    except Exception as exc:
        return f"[web_search error] {exc}"


def make_web_search_tool(max_results: int = 5, search_depth: str = "basic", topic: str = "general"):
    """
    Build a focus-mode-parameterized web_search tool.

    The LLM only ever sees and controls `query` — max_results/search_depth/
    topic are baked in at tool-creation time by the pipeline based on the
    user's chosen focus mode (Quick/Academic/News/Technical), so the model's
    tool schema and prompting stay identical across modes; only what Tavily
    actually does under the hood changes.
    """
    @tool("web_search")
    def _web_search(query: str) -> str:
        """Search the web for recent, reliable information on a topic."""
        try:
            results = _tavily_search(query, max_results=max_results, search_depth=search_depth, topic=topic)
            if not results.get("results"):
                return "No results found."

            lines: list[str] = []
            for r in results["results"]:
                lines.append(
                    f"Title:   {r.get('title', 'N/A')}\n"
                    f"URL:     {r.get('url', 'N/A')}\n"
                    f"Snippet: {r.get('content', '')[:400]}\n"
                )
            return "\n----\n".join(lines)

        except Exception as exc:
            return f"[web_search error] {exc}"

    return _web_search


@tool
def brave_search(query: str) -> str:
    """Alias for web_search — handles model tool calls that use this name."""
    try:
        # Call the underlying Tavily function directly (not the @tool wrapper)
        # to avoid LangChain tool invocation signature issues
        return _do_web_search(query)
    except Exception as exc:
        return f"[brave_search error] {exc}"


def _do_web_search(query: str) -> str:
    """Shared implementation used by both web_search and brave_search."""
    try:
        results = _tavily_search(query, max_results=5)
        if not results.get("results"):
            return "No results found."

        lines: list[str] = []
        for r in results["results"]:
            lines.append(
                f"Title:   {r.get('title', 'N/A')}\n"
                f"URL:     {r.get('url', 'N/A')}\n"
                f"Snippet: {r.get('content', '')[:400]}\n"
            )
        return "\n----\n".join(lines)

    except Exception as exc:
        return f"[web_search error] {exc}"


# ── Scraper tool ─────────────────────────────────────────────────────────────

_REMOVE_TAGS = {"script", "style", "nav", "footer", "header",
                "aside", "noscript", "form", "button", "svg", "img"}

_HEADERS = {
    "User-Agent": (
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
        "AppleWebKit/537.36 (KHTML, like Gecko) "
        "Chrome/124.0.0.0 Safari/537.36"
    ),
    "Accept-Language": "en-US,en;q=0.9",
}


@tool
def scrape_url(url: str) -> str:
    """Scrape and return clean text content (≤4 000 chars) from a given URL."""
    try:
        resp = requests.get(url, timeout=12, headers=_HEADERS)
        resp.raise_for_status()

        soup = BeautifulSoup(resp.text, "lxml")

        for tag in soup(_REMOVE_TAGS):
            tag.decompose()

        body = soup.find("article") or soup.find("main") or soup.body or soup
        text = body.get_text(separator=" ", strip=True)
        text = re.sub(r"\s{2,}", " ", text)

        return text[:4_000]

    except requests.exceptions.Timeout:
        return f"[scrape_url] Request timed out for: {url}"
    except requests.exceptions.HTTPError as exc:
        return f"[scrape_url] HTTP error {exc.response.status_code} for: {url}"
    except Exception as exc:
        return f"[scrape_url] Could not scrape {url}: {exc}"
"""
Tests for ResearchOS tools (web_search, scrape_url, brave_search).

Key facts about tools.py that shape these tests:
1. TavilyClient is imported INSIDE _tavily_search() — so we patch _tavily_search directly.
2. @tool decorator wraps functions into StructuredTool objects — not directly callable.
   We test via .invoke() for tool behavior, or patch the underlying helper functions.
"""

import pytest
from unittest.mock import patch, MagicMock


# ── web_search ────────────────────────────────────────────────────────────────

class TestWebSearch:

    def test_web_search_returns_results(self):
        """web_search tool should return a formatted string of search results."""
        fake_tavily_response = {
            "results": [
                {
                    "title": "Quantum Computing Explained",
                    "url": "https://example.com/quantum",
                    "content": "Quantum computers use qubits to process information.",
                },
                {
                    "title": "Quantum Breakthroughs 2025",
                    "url": "https://example.com/breakthroughs",
                    "content": "Recent advances in error correction.",
                },
            ]
        }

        # Patch _tavily_search (the internal helper) — TavilyClient lives inside it
        with patch("tools._tavily_search", return_value=fake_tavily_response):
            from tools import web_search
            # @tool objects are called via .invoke(), not directly
            result = web_search.invoke("quantum computing breakthroughs")

        assert isinstance(result, str)
        assert len(result) > 0
        assert "Quantum" in result or "quantum" in result

    def test_web_search_api_failure_returns_safe_string(self):
        """web_search must not crash when the search API fails.
        It should return a fallback error string, not raise an exception."""
        with patch("tools._tavily_search", side_effect=RuntimeError("All keys exhausted")):
            from tools import web_search
            result = web_search.invoke("test query")

        # Should not raise — web_search has a try/except that returns a string
        assert isinstance(result, str)
        assert len(result) > 0
        # The error message should be included in the return value
        assert "error" in result.lower() or "Error" in result


# ── scrape_url ────────────────────────────────────────────────────────────────

class TestScrapeUrl:

    def test_scrape_url_extracts_text(self):
        """scrape_url should strip HTML tags and return clean readable text."""
        fake_html = b"""
        <html>
          <head><title>Test Page</title></head>
          <body>
            <nav>Navigation garbage that should be removed</nav>
            <main>
              <h1>Quantum Computing</h1>
              <p>Quantum computers use quantum mechanical phenomena to compute.</p>
            </main>
          </body>
        </html>
        """
        mock_response = MagicMock()
        mock_response.status_code = 200
        mock_response.content = fake_html
        mock_response.text = fake_html.decode("utf-8")

        with patch("tools.requests.get", return_value=mock_response):
            from tools import scrape_url
            result = scrape_url.invoke("https://example.com/quantum")

        assert isinstance(result, str)
        assert len(result) > 0
        assert "Quantum" in result or "quantum" in result
        # HTML tags should be stripped
        assert "<html>" not in result
        assert "<p>" not in result

    def test_scrape_url_timeout_returns_safe_string(self):
        """scrape_url must handle network timeouts gracefully — no crash."""
        import requests as req

        with patch("tools.requests.get", side_effect=req.exceptions.Timeout("timed out")):
            from tools import scrape_url
            result = scrape_url.invoke("https://slow-server.example.com")

        # scrape_url has explicit Timeout handling — should return a message string
        assert isinstance(result, str)
        assert "timed out" in result.lower() or "timeout" in result.lower() or "scrape_url" in result


# ── brave_search ──────────────────────────────────────────────────────────────

class TestBraveSearch:

    def test_brave_search_returns_results(self):
        """brave_search is an alias for web_search via _do_web_search.
        Patch _tavily_search since brave_search calls _do_web_search which calls it."""
        fake_tavily_response = {
            "results": [
                {
                    "title": "AI Research 2025",
                    "url": "https://example.com/ai",
                    "content": "Latest advances in artificial intelligence research.",
                }
            ]
        }

        with patch("tools._tavily_search", return_value=fake_tavily_response):
            from tools import brave_search
            result = brave_search.invoke("AI research")

        assert isinstance(result, str)
        assert len(result) > 0
        assert "AI" in result or "ai" in result.lower()

    def test_brave_search_failure_returns_safe_string(self):
        """brave_search must handle errors gracefully, same as web_search."""
        with patch("tools._tavily_search", side_effect=RuntimeError("API down")):
            from tools import brave_search
            result = brave_search.invoke("test query")

        assert isinstance(result, str)
        assert len(result) > 0
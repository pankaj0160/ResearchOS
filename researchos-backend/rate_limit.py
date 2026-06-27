"""
rate_limit.py — Sliding window rate limiter for ResearchOS.

What is rate limiting?
  Imagine a coffee shop that only lets each customer order 5 coffees per hour.
  Rate limiting does the same — it limits how many times each user can call
  an expensive API endpoint per time window.

Why do we need it?
  Without it, one user could accidentally (or deliberately) call the research
  pipeline 100 times in a row — costing you $50 in Groq API credits and
  making the server slow for everyone else.

Algorithm used: Sliding Window Log
  - We keep a list of timestamps for each user's requests
  - On each new request: remove timestamps older than the window
  - If remaining count >= limit: reject with HTTP 429
  - Otherwise: record this timestamp and allow the request

  Example (5 requests per 60 seconds):
    10:00:01 — user makes request #1 → allowed (1/5)
    10:00:15 — user makes request #2 → allowed (2/5)
    10:00:30 — user makes request #3 → allowed (3/5)
    10:00:45 — user makes request #4 → allowed (4/5)
    10:00:58 — user makes request #5 → allowed (5/5)
    10:01:02 — user makes request #6 → REJECTED (5/5 still in window)
    10:01:05 — request #1 expires (61 seconds old) → now 4/5 → ALLOWED

  This is more accurate than fixed-window (which resets at :00 every minute)
  because it looks at the exact last N seconds, not calendar buckets.

Production note:
  This uses in-memory storage — it resets if the server restarts.
  For multi-server deployments, replace with Redis using the same interface.
  The SlidingWindowRateLimiter class is designed so you can swap the backend:
    self._log: dict → Redis hash  (only _log needs changing)
"""

from __future__ import annotations

import time
from collections import defaultdict
from fastapi import HTTPException, status


class SlidingWindowRateLimiter:
    """
    Per-user sliding window rate limiter.

    Usage:
        limiter = SlidingWindowRateLimiter(max_requests=5, window_seconds=60)
        limiter.check(user_id)   # raises HTTP 429 if over limit
        limiter.get_status(user_id)   # returns usage info
    """

    def __init__(self, max_requests: int, window_seconds: int, name: str = ""):
        self.max_requests   = max_requests
        self.window_seconds = window_seconds
        self.name           = name or f"{max_requests}/{window_seconds}s"
        # user_id → list of request timestamps
        self._log: dict[int, list[float]] = defaultdict(list)

    def check(self, user_id: int) -> None:
        """
        Check if user_id is within the rate limit.
        Raises HTTP 429 with Retry-After header if exceeded.
        Records this request's timestamp if allowed.
        """
        now    = time.time()
        window = now - self.window_seconds

        # Remove timestamps that are outside the sliding window
        self._log[user_id] = [t for t in self._log[user_id] if t > window]

        current_count = len(self._log[user_id])

        if current_count >= self.max_requests:
            # Calculate exactly how long until they can retry
            # (when the oldest request in the window will expire)
            oldest   = self._log[user_id][0]
            retry_in = int(oldest - window) + 1

            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "error":       "Rate limit exceeded",
                    "message": (
                        f"You've reached the limit of {self.max_requests} requests "
                        f"per {self.window_seconds} seconds. "
                        f"Please wait {retry_in} seconds before trying again."
                    ),
                    "retry_after": retry_in,
                    "limit":       self.max_requests,
                    "window":      self.window_seconds,
                    "limiter":     self.name,
                },
                headers={"Retry-After": str(retry_in)},
            )

        # Request is within limits — record this timestamp
        self._log[user_id].append(now)

    def get_status(self, user_id: int) -> dict:
        """
        Return current usage stats for a user.
        Used by /api/rate-limit/status endpoint so frontend can show
        "You have 3 research runs left this minute".
        """
        now    = time.time()
        window = now - self.window_seconds
        recent = [t for t in self._log.get(user_id, []) if t > window]

        # Calculate when the oldest request will expire (reset time)
        reset_in = 0
        if recent:
            oldest   = recent[0]
            reset_in = max(0, int(oldest - window) + 1)

        return {
            "limiter":            self.name,
            "requests_used":      len(recent),
            "requests_remaining": max(0, self.max_requests - len(recent)),
            "limit":              self.max_requests,
            "window_seconds":     self.window_seconds,
            "reset_in_seconds":   reset_in,
        }

    def clear(self, user_id: int) -> None:
        """Clear all rate limit history for a user. Used in testing."""
        self._log.pop(user_id, None)


# ═══════════════════════════════════════════════════════════════════════════════
# LIMITER INSTANCES — one per expensive endpoint group
# ═══════════════════════════════════════════════════════════════════════════════

# Research pipeline: 5 runs per 60 seconds per user
# Why: each run takes ~20s and uses ~9,400 Groq tokens ($0.03)
# 5/min allows normal use but stops runaway loops
research_limiter = SlidingWindowRateLimiter(
    max_requests=5, window_seconds=60, name="research"
)

# PDF upload: 10 uploads per 5 minutes per user
# Why: embedding costs API quota — prevents bulk/accidental uploads
upload_limiter = SlidingWindowRateLimiter(
    max_requests=10, window_seconds=300, name="pdf_upload"
)

# News summarize: 10 per 60 seconds per user
# Why: triggers Groq LLM + Tavily search — both cost quota
news_limiter = SlidingWindowRateLimiter(
    max_requests=10, window_seconds=60, name="news"
)

# Dashboard chat: 20 per 60 seconds per user
# Why: lighter than research but still triggers LLM — generous limit
dashboard_limiter = SlidingWindowRateLimiter(
    max_requests=20, window_seconds=60, name="dashboard_chat"
)

# Global registry — all limiters in one place for the status endpoint
ALL_LIMITERS: dict[str, SlidingWindowRateLimiter] = {
    "research":       research_limiter,
    "pdf_upload":     upload_limiter,
    "news":           news_limiter,
    "dashboard_chat": dashboard_limiter,
}
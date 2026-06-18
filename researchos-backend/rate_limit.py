"""
rate_limit.py — Sliding window rate limiter for ResearchOS.

Uses in-memory storage (dict of user_id → list of timestamps).
Suitable for single-process deployment (Render, Railway free tier).

For multi-process/multi-server deployments, replace with Redis-backed
rate limiting (e.g. slowapi + Redis). This is noted as a known limitation.
"""

from __future__ import annotations

import time
from collections import defaultdict
from fastapi import HTTPException, status


class SlidingWindowRateLimiter:
    """
    Per-user sliding window rate limiter.

    Algorithm:
    - Keep a list of timestamps (one per request) for each user
    - On each new request, remove all timestamps older than window_seconds
    - If remaining count >= max_requests: reject with 429
    - Otherwise: record this timestamp and allow

    This is a "sliding window log" — more accurate than fixed-window
    counters because it looks at the exact last N seconds, not calendar buckets.
    """

    def __init__(self, max_requests: int, window_seconds: int):
        self.max_requests    = max_requests
        self.window_seconds  = window_seconds
        # user_id (int) → list of request timestamps (float)
        self._log: dict[int, list[float]] = defaultdict(list)

    def check(self, user_id: int) -> None:
        """
        Check if user_id is within rate limit.
        Raises HTTP 429 if exceeded.
        Records the current request timestamp if allowed.
        """
        now    = time.time()
        window = now - self.window_seconds

        # Remove timestamps outside the sliding window
        self._log[user_id] = [t for t in self._log[user_id] if t > window]

        current_count = len(self._log[user_id])

        if current_count >= self.max_requests:
            # Calculate how many seconds until the oldest request
            # falls outside the window — that's when they can retry
            oldest    = self._log[user_id][0]
            retry_in  = int(oldest - window) + 1
            raise HTTPException(
                status_code=status.HTTP_429_TOO_MANY_REQUESTS,
                detail={
                    "error":       "Rate limit exceeded",
                    "message":     f"You can run {self.max_requests} research queries per {self.window_seconds} seconds. Please wait.",
                    "retry_after": retry_in,
                    "limit":       self.max_requests,
                    "window":      self.window_seconds,
                },
                headers={"Retry-After": str(retry_in)},
            )

        # Request is allowed — record this timestamp
        self._log[user_id].append(now)

    def get_status(self, user_id: int) -> dict:
        """
        Return current usage for a user — useful for debugging
        and for showing the user how many requests they have left.
        """
        now    = time.time()
        window = now - self.window_seconds
        recent = [t for t in self._log.get(user_id, []) if t > window]
        return {
            "requests_used":      len(recent),
            "requests_remaining": max(0, self.max_requests - len(recent)),
            "limit":              self.max_requests,
            "window_seconds":     self.window_seconds,
        }


# ── Singleton limiter instances ───────────────────────────────────────────────

# Research pipeline: 5 runs per 60 seconds per user
# Rationale: each run takes ~20s and ~9.4K tokens — 5/min is generous but safe
research_limiter = SlidingWindowRateLimiter(max_requests=5, window_seconds=60)

# PDF upload: 10 uploads per 5 minutes per user
# Rationale: embedding costs money — prevent accidental bulk uploads
upload_limiter = SlidingWindowRateLimiter(max_requests=10, window_seconds=300)
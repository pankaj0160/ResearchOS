"""
Tests for ResearchOS pipeline logic.

Covers: score parsing, quality gate threshold, and the review tool's
ability to extract a score from critic output.

All LLM calls are mocked — no API keys needed, runs in milliseconds.
"""

import pytest
import sys
import os

# Make sure Python can find the backend modules
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))


# ── Score parser ──────────────────────────────────────────────────────────────

class TestParseScore:
    """Tests for _parse_score() in pipeline.py — the function that reads
    'Score: X/10' from the critic's output and converts it to a 0-1 float."""

    def test_parse_score_standard_format(self):
        """Standard 'Score: 7/10' format should parse to 0.7."""
        from pipeline import _parse_score
        result = _parse_score("Score: 7/10\n\nStrengths:\n- Good structure")
        assert result == pytest.approx(0.7)

    def test_parse_score_decimal(self):
        """Decimal scores like 'Score: 7.5/10' should parse correctly."""
        from pipeline import _parse_score
        result = _parse_score("Score: 7.5/10\n\nStrengths:\n- Clear writing")
        assert result == pytest.approx(0.75)

    def test_parse_score_high(self):
        """Score of 9/10 should return 0.9."""
        from pipeline import _parse_score
        result = _parse_score("Score: 9/10\n\nStrengths:\n- Excellent")
        assert result == pytest.approx(0.9)

    def test_parse_score_missing_returns_none(self):
        """If 'Score: X/10' is not present, return None — don't crash."""
        from pipeline import _parse_score
        result = _parse_score("This report looks good overall.")
        assert result is None

    def test_parse_score_empty_string_returns_none(self):
        """Empty string should return None gracefully."""
        from pipeline import _parse_score
        result = _parse_score("")
        assert result is None


# ── Quality gate threshold ────────────────────────────────────────────────────

class TestQualityGate:
    """Tests for the quality gate decision logic.
    
    QUALITY_THRESHOLD = 0.7 means:
    - score >= 0.7 → pass (no retry needed)
    - score < 0.7  → fail (trigger retry)
    """

    def test_score_above_threshold_passes(self):
        from pipeline import QUALITY_THRESHOLD
        score = 0.8
        assert score >= QUALITY_THRESHOLD   # should NOT retry

    def test_score_exactly_at_threshold_passes(self):
        from pipeline import QUALITY_THRESHOLD
        score = 0.7
        assert score >= QUALITY_THRESHOLD   # exactly 7/10 should pass

    def test_score_below_threshold_fails(self):
        from pipeline import QUALITY_THRESHOLD
        score = 0.5
        assert score < QUALITY_THRESHOLD    # should trigger retry

    def test_score_zero_fails(self):
        from pipeline import QUALITY_THRESHOLD
        score = 0.0
        assert score < QUALITY_THRESHOLD    # absolute worst case should retry


# ── Review tool (critic output parsing) ──────────────────────────────────────

class TestReviewTool:
    """Tests that the critic's output format can be parsed to a usable score.
    This is a higher-level check: given what the critic actually outputs,
    can we extract a numeric score we can act on?"""

    def test_review_extracts_score_from_full_output(self, sample_critic_output_high):
        from pipeline import _parse_score
        score = _parse_score(sample_critic_output_high)
        assert score is not None
        assert 0.0 <= score <= 1.0
        assert score == pytest.approx(0.8)

    def test_review_low_score_triggers_gate(self, sample_critic_output_low):
        from pipeline import _parse_score, QUALITY_THRESHOLD
        score = _parse_score(sample_critic_output_low)
        assert score is not None
        assert score < QUALITY_THRESHOLD   # this output should cause a retry
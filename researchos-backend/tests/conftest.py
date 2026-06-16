"""
Shared fixtures for ResearchOS test suite.
Fixtures defined here are auto-available to all test files — no import needed.
"""

import pytest
from unittest.mock import MagicMock, patch
from langchain_core.messages import AIMessage


# ── Fake LLM that returns a scripted response ─────────────────────────────────

def make_mock_llm(response_text: str) -> MagicMock:
    """
    Build a mock ChatGroq that returns response_text on every .invoke() call.
    No real API call happens — purely in-memory.
    """
    mock = MagicMock()
    ai_message = AIMessage(content=response_text)
    mock.invoke.return_value = ai_message
    mock.bind_tools.return_value = mock   # agents call .bind_tools() before invoking
    mock.stream.return_value = iter([ai_message])
    return mock


@pytest.fixture
def mock_llm_high_score():
    """LLM that returns a critic score of 9/10 — simulates a great first draft."""
    return make_mock_llm(
        "Score: 9/10\n\nStrengths:\n- Well researched\n- Clear structure\n\n"
        "Areas to Improve:\n- Could add more examples\n\nOne line verdict:\nExcellent report."
    )


@pytest.fixture
def mock_llm_low_score():
    """LLM that returns a critic score of 5/10 — triggers the quality gate retry."""
    return make_mock_llm(
        "Score: 5/10\n\nStrengths:\n- Basic coverage\n\n"
        "Areas to Improve:\n- Lacks depth\n- No sources cited\n\nOne line verdict:\nNeeds improvement."
    )


@pytest.fixture
def mock_llm_writer():
    """LLM that returns a well-formed research report."""
    return make_mock_llm(
        "## Introduction\nQuantum computing uses quantum mechanics.\n\n"
        "## Key Findings\n- Qubits enable parallel computation.\n\n"
        "## Conclusion\nQuantum computing will transform industries.\n\n"
        "## Sources\n- https://example.com/quantum"
    )


@pytest.fixture
def sample_critic_output_high():
    return (
        "Score: 8/10\n\nStrengths:\n- Well structured\n- Factual\n\n"
        "Areas to Improve:\n- Add more citations\n\nOne line verdict:\nSolid research report."
    )


@pytest.fixture
def sample_critic_output_low():
    return (
        "Score: 5/10\n\nStrengths:\n- Basic overview provided\n\n"
        "Areas to Improve:\n- Lacks depth\n- Missing sources\n\nOne line verdict:\nNeeds revision."
    )
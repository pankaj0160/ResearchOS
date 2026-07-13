"""
Tests for pipeline_langgraph.py — the LangGraph StateGraph orchestration
of the Search -> Reader -> Writer -> Critic pipeline.

These tests build the compiled graph with fully mocked chains/agents (no
real Groq/Tavily calls, no API keys needed) and assert on the *behaviour*
of the graph — node execution order, the Reflexion-style retry loop, the
retry cap, and fatal-error short-circuiting — matching the exact behaviour
of the original run_real_pipeline() for-loop implementation in pipeline.py.

Runs in milliseconds, same as the rest of the suite.
"""

import os
import sys

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

import pipeline_langgraph as pg


class _FakeChain:
    """Mimics `prompt | llm | StrOutputParser()`'s .stream() interface."""

    def __init__(self, chunks_fn):
        self._chunks_fn = chunks_fn

    def stream(self, _input):
        for c in self._chunks_fn():
            yield c


def _initial_state(topic: str = "test topic") -> dict:
    return {
        "topic": topic,
        "focus_mode": "balanced",
        "search_results": "",
        "scraped_content": "",
        "report": "",
        "feedback": "",
        "last_score": 0.0,
        "attempt": 0,
        "next_action": "",
        "fatal_error": None,
    }


def _critic_chain_with_scores(scores: list[str]) -> _FakeChain:
    """Returns a fake critic chain that yields each score string in order,
    one per call — call N+1 reuses the last score if the list is shorter
    than the number of retries actually triggered."""
    calls = {"n": -1}

    def _next():
        calls["n"] = min(calls["n"] + 1, len(scores) - 1)
        return [f"Score: {scores[calls['n']]}/10\nAreas to Improve:\n- x\nOne line verdict:\nv"]

    return _FakeChain(_next)


def _patch_agents(monkeypatch, search_result="search stub", reader_result="scrape stub", search_raises=None):
    if search_raises is not None:
        def _boom(**kw):
            raise search_raises
        monkeypatch.setattr(pg, "run_search_agent", _boom)
    else:
        monkeypatch.setattr(pg, "run_search_agent", lambda **kw: search_result)
    monkeypatch.setattr(pg, "run_reader_agent", lambda **kw: reader_result)


# ── Happy path: single pass, high score, no retry ──────────────────────────

class TestGraphHappyPath:
    def test_all_four_nodes_run_once_on_high_score(self, monkeypatch):
        _patch_agents(monkeypatch)
        events = []
        graph = pg._build_graph(
            tool_llm="FAKE_LLM",
            writer_chain=_FakeChain(lambda: ["## Report\n", "content\n"]),
            revision_chain=_FakeChain(lambda: ["should not be called"]),
            critic_chain=_critic_chain_with_scores(["9"]),
            emit=events.append,
        )
        list(graph.stream(_initial_state(), config={"recursion_limit": 25}))

        agents_seen = [e["agent"] for e in events]
        assert "search" in agents_seen
        assert "reader" in agents_seen
        assert "writer" in agents_seen
        assert "critic" in agents_seen

        writer_completes = [e for e in events if e["agent"] == "writer" and e["type"] == "complete"]
        assert len(writer_completes) == 1, "high score on first attempt should not trigger a revision"

        critic_completes = [e for e in events if e["agent"] == "critic" and e["type"] == "complete"]
        assert "passed quality gate" in critic_completes[-1]["msg"]


# ── Reflexion retry loop ─────────────────────────────────────────────────────

class TestReflexionRetryLoop:
    def test_low_then_high_score_triggers_exactly_one_retry(self, monkeypatch):
        _patch_agents(monkeypatch)
        events = []
        graph = pg._build_graph(
            tool_llm="FAKE_LLM",
            writer_chain=_FakeChain(lambda: ["draft "]),
            revision_chain=_FakeChain(lambda: ["revised "]),
            critic_chain=_critic_chain_with_scores(["4", "8"]),
            emit=events.append,
        )
        list(graph.stream(_initial_state(), config={"recursion_limit": 25}))

        writer_completes = [e for e in events if e["agent"] == "writer" and e["type"] == "complete"]
        assert len(writer_completes) == 2  # 1 original draft + 1 revision
        assert writer_completes[0]["msg"] == "Report drafted successfully"
        assert writer_completes[1]["msg"] == "Report revised"

        critic_completes = [e for e in events if e["agent"] == "critic" and e["type"] == "complete"]
        assert "triggering retry" in critic_completes[0]["msg"]
        assert "passed quality gate" in critic_completes[1]["msg"]

    def test_always_low_score_stops_at_max_retries(self, monkeypatch):
        """MAX_RETRIES=2 means at most 3 total writer passes (1 draft + 2
        revisions), even if the critic never approves — must not loop forever."""
        _patch_agents(monkeypatch)
        events = []
        graph = pg._build_graph(
            tool_llm="FAKE_LLM",
            writer_chain=_FakeChain(lambda: ["draft "]),
            revision_chain=_FakeChain(lambda: ["revised "]),
            critic_chain=_critic_chain_with_scores(["3", "3", "3"]),
            emit=events.append,
        )
        list(graph.stream(_initial_state(), config={"recursion_limit": 25}))

        writer_completes = [e for e in events if e["agent"] == "writer" and e["type"] == "complete"]
        assert len(writer_completes) == 3, "should stop after MAX_RETRIES+1 writer passes, not loop forever"

        critic_completes = [e for e in events if e["agent"] == "critic" and e["type"] == "complete"]
        assert "max retries" in critic_completes[-1]["msg"]

    def test_unparseable_critic_score_ends_gracefully(self, monkeypatch):
        """If the critic's response has no 'Score: X/10', the graph should
        end cleanly rather than retry forever against an unparseable output."""
        _patch_agents(monkeypatch)
        events = []
        graph = pg._build_graph(
            tool_llm="FAKE_LLM",
            writer_chain=_FakeChain(lambda: ["draft "]),
            revision_chain=_FakeChain(lambda: ["revised "]),
            critic_chain=_FakeChain(lambda: ["no score here, just prose"]),
            emit=events.append,
        )
        list(graph.stream(_initial_state(), config={"recursion_limit": 25}))

        writer_completes = [e for e in events if e["agent"] == "writer" and e["type"] == "complete"]
        assert len(writer_completes) == 1
        critic_completes = [e for e in events if e["agent"] == "critic" and e["type"] == "complete"]
        assert critic_completes[-1]["msg"] == "Critique complete — pipeline finished"


# ── Fatal-error short-circuiting ─────────────────────────────────────────────

class TestFatalErrorHandling:
    def test_search_failure_short_circuits_before_reader(self, monkeypatch):
        """If the Search Agent raises, the graph must stop immediately —
        Reader/Writer/Critic should never run at all."""
        _patch_agents(monkeypatch, search_raises=RuntimeError("tavily down"))
        events = []
        graph = pg._build_graph(
            tool_llm="FAKE_LLM",
            writer_chain=_FakeChain(lambda: ["should not run"]),
            revision_chain=_FakeChain(lambda: ["should not run"]),
            critic_chain=_critic_chain_with_scores(["9"]),
            emit=events.append,
        )
        list(graph.stream(_initial_state(), config={"recursion_limit": 25}))

        agents_seen = {e["agent"] for e in events}
        assert agents_seen == {"search"}, f"expected only search-agent events, got {agents_seen}"
        assert any(e["type"] == "error" for e in events)

    def test_reader_failure_is_non_fatal_and_continues_to_writer(self, monkeypatch):
        """Unlike a search failure, a reader/scrape failure should NOT stop
        the pipeline — it should fall back to search-data-only and continue."""
        def _boom_reader(**kw):
            raise RuntimeError("scrape timeout")

        monkeypatch.setattr(pg, "run_search_agent", lambda **kw: "search stub")
        monkeypatch.setattr(pg, "run_reader_agent", _boom_reader)

        events = []
        graph = pg._build_graph(
            tool_llm="FAKE_LLM",
            writer_chain=_FakeChain(lambda: ["draft "]),
            revision_chain=_FakeChain(lambda: ["revised "]),
            critic_chain=_critic_chain_with_scores(["9"]),
            emit=events.append,
        )
        list(graph.stream(_initial_state(), config={"recursion_limit": 25}))

        agents_seen = [e["agent"] for e in events]
        assert "reader" in agents_seen and "writer" in agents_seen and "critic" in agents_seen
        reader_errors = [e for e in events if e["agent"] == "reader" and e["type"] == "error"]
        assert len(reader_errors) == 1
        writer_completes = [e for e in events if e["agent"] == "writer" and e["type"] == "complete"]
        assert len(writer_completes) == 1, "pipeline should still complete despite the reader failure"
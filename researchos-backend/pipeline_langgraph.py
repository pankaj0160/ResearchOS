"""
pipeline_langgraph.py
══════════════════════════════════════════════════════════════════════════════
LangGraph-based orchestration for the Search → Reader → Writer → Critic
research pipeline.

WHY THIS FILE EXISTS
---------------------
The original pipeline (pipeline.py :: run_real_pipeline) controls agent order
and the Reflexion-style retry loop with a plain Python `for` loop + `if`
statements. That works, but it's not what "LangGraph" refers to on a resume —
LangGraph specifically means modelling the flow as a *graph*: named nodes,
explicit edges between them, and conditional edges that route based on state
(e.g. "if the critic's score is low, go back to the writer node").

This file re-implements ONLY the orchestration layer using LangGraph's
StateGraph. It deliberately does NOT rewrite the agents themselves — it
imports and calls the exact same functions from agents.py
(run_search_agent, run_reader_agent, build_writer_chain, etc.) that the
original pipeline uses. Same LLM calls, same prompts, same tool loop, same
SSE event shape (`_ev()` from pipeline.py) — only *what decides the next
step* changes.

WHY NOT JUST REPLACE run_real_pipeline OUTRIGHT
-------------------------------------------------
Zero risk to what's already working. This file is 100% additive:
  - agents.py is not touched at all.
  - pipeline.py's run_real_pipeline (the original) is not touched at all.
  - pipeline.py gets exactly one small, guarded addition (see the bottom of
    that file / README note) so it can call this graph version *instead of*
    the original, controlled by an environment variable that defaults to
    "off". If anything about the graph version misbehaves, flipping that
    one env var back gets you the exact original behaviour with no other
    changes needed anywhere.

HOW STREAMING STILL WORKS
---------------------------
LangGraph's own `.stream()` yields state *snapshots* after each node
finishes — it does not, by itself, give you token-by-token text as an LLM
generates a report. To keep the exact same "watch the report type itself
out live" experience the frontend already has, each node still calls
`chain.stream(...)` internally (exactly like the original pipeline) and
pushes every chunk into a small event buffer via an `emit()` closure. The
outer generator drains that buffer after every LangGraph step. So: LangGraph
decides *which node runs next*; the nodes themselves still stream tokens
exactly as before.

CORE LANGGRAPH CONCEPTS USED HERE (explained simply)
-------------------------------------------------------
- StateGraph: a graph where every node is a Python function that receives
  the current "state" (a plain dict) and returns a partial update to merge
  into it — like a pipeline of assembly-line stations sharing one shared
  clipboard.
- Node: one step (search / reader / writer / critic). Each is just a
  function; LangGraph calls it and merges its return value into the state.
- Edge: "after node A finishes, always run node B next."
- Conditional edge: "after node A finishes, look at the state and DECIDE
  which node runs next" — this is what implements the retry loop: after the
  critic node runs, a routing function checks the score and either sends
  execution back to the writer node (retry) or to END (done).
- END: a special LangGraph marker meaning "the graph is finished."
"""

from __future__ import annotations

import traceback
from typing import Generator, Optional, TypedDict

from langgraph.graph import StateGraph, END
from langsmith import traceable

from agents import (
    get_tool_llm,
    get_chain_llm,
    run_search_agent,
    run_reader_agent,
    build_writer_chain,
    build_critic_chain,
    build_writer_revision_chain,
    resolve_focus_mode,
)
from pipeline import _ev, _parse_search_sources, _parse_score, QUALITY_THRESHOLD, MAX_RETRIES


# ─────────────────────────────────────────────────────────────────────────────
# Graph state — the "shared clipboard" every node reads from and writes to.
# Optional fields default to None/0 via the initial state built in
# run_real_pipeline_graph(); TypedDict here is just for editor/type-checker
# hints, it doesn't enforce anything at runtime.
# ─────────────────────────────────────────────────────────────────────────────

class ResearchState(TypedDict, total=False):
    topic: str
    focus_mode: str
    search_results: str
    scraped_content: str
    report: str
    feedback: str
    last_score: float
    attempt: int              # 0-based index of the draft currently being written
    next_action: str          # set by critic_node: "retry" | "end"
    fatal_error: Optional[str]


def _research_combined(state: ResearchState) -> str:
    return (
        f"SEARCH RESULTS:\n{state.get('search_results', '')}\n\n"
        f"SCRAPED PAGE CONTENT:\n{state.get('scraped_content', '')}"
    )


# ─────────────────────────────────────────────────────────────────────────────
# Graph builder — takes already-constructed LLMs/chains (built once per
# pipeline run, exactly like the original) and an `emit` callback that nodes
# use to push SSE events, and wires up the 4 nodes + edges.
# ─────────────────────────────────────────────────────────────────────────────

def _build_graph(tool_llm, writer_chain, revision_chain, critic_chain, emit):

    # ── Node: Search Agent ───────────────────────────────────────────────
    def search_node(state: ResearchState) -> dict:
        topic = state["topic"]
        focus_mode = state["focus_mode"]

        emit(_ev("search", "thinking", f'Formulating search strategy for: "{topic}"'))
        emit(_ev("search", "tool_call", f'web_search("{topic}")', tool="web_search"))

        raw_tool_results: dict[str, str] = {}

        def _capture_search(name: str, args: dict, result_str: str) -> None:
            if name in ("web_search", "brave_search") and "web_search" not in raw_tool_results:
                raw_tool_results["web_search"] = result_str

        try:
            search_results = run_search_agent(
                topic=topic, llm=tool_llm, on_tool_result=_capture_search, focus_mode=focus_mode
            )
        except Exception as exc:
            print(f"[Graph] search_node EXCEPTION:\n{traceback.format_exc()}")
            emit(_ev("search", "error", f"Search agent failed: {exc}"))
            return {"fatal_error": str(exc)}

        sources = _parse_search_sources(raw_tool_results.get("web_search", ""))
        if sources:
            emit(_ev("search", "sources", f"Found {len(sources)} sources", sources=sources))

        emit(_ev("search", "result", f"Retrieved {len(search_results)} chars of search data"))
        emit(_ev("search", "complete", "Search phase complete"))
        return {"search_results": search_results}

    # ── Node: Reader Agent ───────────────────────────────────────────────
    def reader_node(state: ResearchState) -> dict:
        emit(_ev("reader", "thinking", "Selecting highest-relevance URL to scrape..."))
        emit(_ev("reader", "tool_call", "scrape_url(best source from results)", tool="scrape_url"))

        read_url: Optional[str] = None

        def _capture_reader(name: str, args: dict, result_str: str) -> None:
            nonlocal read_url
            if name == "scrape_url" and read_url is None:
                read_url = args.get("url")

        try:
            scraped_content = run_reader_agent(
                topic=state["topic"],
                search_results=state["search_results"],
                llm=tool_llm,
                on_tool_result=_capture_reader,
            )
        except Exception as exc:
            # Non-fatal by design (matches original pipeline.py behaviour):
            # a failed scrape falls back to search-data-only rather than
            # aborting the whole run.
            print(f"[Graph] reader_node EXCEPTION:\n{traceback.format_exc()}")
            emit(_ev("reader", "error", f"Reader failed ({exc}) — continuing with search data only"))
            scraped_content = "[Reader could not scrape content — report uses search data only]"

        if read_url:
            emit(_ev("reader", "source_read", "Reading full article", url=read_url))

        emit(_ev("reader", "result", f"Extracted {len(scraped_content)} chars of page content"))
        emit(_ev("reader", "complete", "Reader phase complete"))
        return {"scraped_content": scraped_content}

    # ── Node: Writer Agent (first draft OR Reflexion-style revision) ────
    def writer_node(state: ResearchState) -> dict:
        attempt = state.get("attempt", 0)
        is_retry = attempt > 0

        if is_retry:
            last_score = state.get("last_score", 0.0)
            emit(_ev(
                "writer", "thinking",
                f"Quality gate: previous score {last_score * 10:.1f}/10 "
                f"< 7/10 — revising report (attempt {attempt + 1}/{MAX_RETRIES + 1})",
            ))
            emit(_ev("writer", "reset", ""))
            stream_input = {
                "topic": state["topic"],
                "research": _research_combined(state),
                "previous_report": state["report"],
                "feedback": state["feedback"],
            }
            chain_to_run = revision_chain
        else:
            emit(_ev("writer", "thinking", "Synthesising search + scraped data into Markdown report..."))
            stream_input = {"topic": state["topic"], "research": _research_combined(state)}
            chain_to_run = writer_chain

        try:
            chunks: list[str] = []
            for chunk in chain_to_run.stream(stream_input):
                chunks.append(chunk)
                emit(_ev("writer", "streaming", chunk))
            report = "".join(chunks)
        except Exception as exc:
            print(f"[Graph] writer_node EXCEPTION:\n{traceback.format_exc()}")
            emit(_ev("writer", "error", f"Writer chain failed: {exc}"))
            return {"fatal_error": str(exc)}

        emit(_ev("writer", "complete", "Report revised" if is_retry else "Report drafted successfully"))
        return {"report": report}

    # ── Node: Critic Agent + Reflexion quality-gate decision ────────────
    def critic_node(state: ResearchState) -> dict:
        attempt = state.get("attempt", 0)
        is_retry = attempt > 0

        if is_retry:
            emit(_ev("critic", "reset", ""))
        emit(_ev("critic", "thinking", "Evaluating report quality, factual consistency, and structure..."))

        try:
            chunks: list[str] = []
            for chunk in critic_chain.stream({"report": state["report"]}):
                chunks.append(chunk)
                emit(_ev("critic", "streaming", chunk))
            feedback = "".join(chunks)
        except Exception as exc:
            print(f"[Graph] critic_node EXCEPTION:\n{traceback.format_exc()}")
            emit(_ev("critic", "error", f"Critic chain failed: {exc}"))
            return {"fatal_error": str(exc), "next_action": "end"}

        update: dict = {"feedback": feedback}
        score = _parse_score(feedback)

        if score is None:
            # Critic didn't return a parseable score — treat as done rather
            # than retrying forever against an unparseable response.
            emit(_ev("critic", "complete", "Critique complete — pipeline finished"))
            update["next_action"] = "end"
            return update

        update["last_score"] = score

        if score >= QUALITY_THRESHOLD:
            emit(_ev("critic", "complete", f"Critique complete — score {score * 10:.1f}/10, passed quality gate"))
            update["next_action"] = "end"
        elif attempt >= MAX_RETRIES:
            emit(_ev(
                "critic", "complete",
                f"Critique complete — score {score * 10:.1f}/10, max retries ({MAX_RETRIES}) reached",
            ))
            update["next_action"] = "end"
        else:
            emit(_ev("critic", "complete", f"Score {score * 10:.1f}/10 — below 7/10 threshold, triggering retry"))
            update["next_action"] = "retry"
            update["attempt"] = attempt + 1

        return update

    # ── Conditional edge routing functions ───────────────────────────────
    def route_after_search(state: ResearchState) -> str:
        return "end" if state.get("fatal_error") else "reader"

    def route_after_writer(state: ResearchState) -> str:
        return "end" if state.get("fatal_error") else "critic"

    def route_after_critic(state: ResearchState) -> str:
        return "writer" if state.get("next_action") == "retry" else "end"

    # ── Wire up the graph ─────────────────────────────────────────────────
    graph = StateGraph(ResearchState)
    graph.add_node("search", search_node)
    graph.add_node("reader", reader_node)
    graph.add_node("writer", writer_node)
    graph.add_node("critic", critic_node)

    graph.set_entry_point("search")
    graph.add_conditional_edges("search", route_after_search, {"reader": "reader", "end": END})
    graph.add_edge("reader", "writer")
    graph.add_conditional_edges("writer", route_after_writer, {"critic": "critic", "end": END})
    graph.add_conditional_edges("critic", route_after_critic, {"writer": "writer", "end": END})

    return graph.compile()


# ═════════════════════════════════════════════════════════════════════════════
# Public entry point — same signature and same yielded event shape as
# pipeline.py's run_real_pipeline(), so it's a drop-in replacement.
# ═════════════════════════════════════════════════════════════════════════════

@traceable(name="research_pipeline_langgraph", run_type="chain")
def run_real_pipeline_graph(topic: str, focus_mode: str = "balanced") -> Generator[dict, None, None]:
    mode = resolve_focus_mode(focus_mode)

    yield _ev("search", "thinking", "Initialising LLMs...")
    if mode["label"] != "Balanced":
        yield _ev("search", "focus_mode", f"Focus mode: {mode['label']}", focus_mode=focus_mode)

    try:
        tool_llm = get_tool_llm()
        chain_llm = get_chain_llm()
    except RuntimeError as exc:
        yield _ev("search", "error", f"LLM init failed: {exc}")
        return

    try:
        writer_chain = build_writer_chain(chain_llm, focus_mode=focus_mode)
        revision_chain = build_writer_revision_chain(chain_llm, focus_mode=focus_mode)
        critic_chain = build_critic_chain(chain_llm)
    except Exception as exc:
        yield _ev("writer", "error", f"Chain setup failed: {exc}")
        return

    # `emit` is a closure the nodes push events into; since LangGraph runs
    # nodes synchronously on the same thread that calls .stream(), by the
    # time .stream() yields control back after a node, every event that
    # node emitted is already sitting in this buffer, ready to be drained.
    events_buffer: list[dict] = []
    emit = events_buffer.append

    app_graph = _build_graph(tool_llm, writer_chain, revision_chain, critic_chain, emit)

    initial_state: ResearchState = {
        "topic": topic,
        "focus_mode": focus_mode,
        "search_results": "",
        "scraped_content": "",
        "report": "",
        "feedback": "",
        "last_score": 0.0,
        "attempt": 0,
        "next_action": "",
        "fatal_error": None,
    }

    try:
        # recursion_limit guards against an unexpected infinite retry loop;
        # search + reader + up to 3 writer/critic passes is well under this.
        for _ in app_graph.stream(initial_state, config={"recursion_limit": 25}):
            while events_buffer:
                yield events_buffer.pop(0)
    except Exception as exc:
        print(f"[Graph] Unhandled graph EXCEPTION:\n{traceback.format_exc()}")
        while events_buffer:
            yield events_buffer.pop(0)
        yield _ev("system", "error", f"Unhandled pipeline error: {exc}")
        return

    # Drain anything emitted during the final step before the graph hit END.
    while events_buffer:
        yield events_buffer.pop(0)

    print(f"[Graph] All steps complete for topic: {topic!r}")
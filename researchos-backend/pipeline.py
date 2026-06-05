import asyncio
import os
import time
import traceback
from typing import AsyncGenerator, Generator

from dotenv import load_dotenv
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env", override=True)


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _has_real_keys() -> bool:
    groq   = [k for k in os.getenv("GROQ_API_KEYS",   "").split(",") if k.strip()]
    tavily = [k for k in os.getenv("TAVILY_API_KEYS",  "").split(",") if k.strip()]
    return bool(groq and tavily)


def _ev(agent: str, type_: str, msg: str, tool: str | None = None) -> dict:
    return {"agent": agent, "type": type_, "msg": msg, "tool": tool}


# ═════════════════════════════════════════════════════════════════════════════
# REAL PIPELINE
# ═════════════════════════════════════════════════════════════════════════════

def run_real_pipeline(topic: str) -> Generator[dict, None, None]:
    from agents import (
        get_tool_llm,
        get_chain_llm,
        run_search_agent,
        run_reader_agent,
        build_writer_chain,
        build_critic_chain,
    )

    state: dict = {}

    # ── LLM initialisation ───────────────────────────────────────────────────
    yield _ev("search", "thinking", "Initialising LLMs...")

    try:
        tool_llm  = get_tool_llm()
        chain_llm = get_chain_llm()
    except RuntimeError as exc:
        yield _ev("search", "error", f"LLM init failed: {exc}")
        return

    # ══ STEP 1 — Search Agent ════════════════════════════════════════════════
    yield _ev("search", "thinking", f'Formulating search strategy for: "{topic}"')
    yield _ev("search", "tool_call", f'web_search("{topic}")', tool="web_search")

    try:
        print(f"[Pipeline] Starting search agent for: {topic!r}")
        state["search_results"] = run_search_agent(topic=topic, llm=tool_llm)
        print(f"[Pipeline] Search agent done — {len(state['search_results'])} chars")
    except Exception as exc:
        print(f"[Pipeline] Search agent EXCEPTION:\n{traceback.format_exc()}")
        yield _ev("search", "error", f"Search agent failed: {exc}")
        return

    yield _ev("search", "result",
              f"Retrieved {len(state['search_results'])} chars of search data")
    yield _ev("search", "complete", "Search phase complete")

    # ══ STEP 2 — Reader Agent ════════════════════════════════════════════════
    yield _ev("reader", "thinking", "Selecting highest-relevance URL to scrape...")
    yield _ev("reader", "tool_call",
              "scrape_url(best source from results)", tool="scrape_url")

    try:
        print(f"[Pipeline] Starting reader agent...")
        state["scraped_content"] = run_reader_agent(
            topic=topic,
            search_results=state["search_results"],
            llm=tool_llm,
        )
        print(f"[Pipeline] Reader agent done — {len(state['scraped_content'])} chars")
    except Exception as exc:
        print(f"[Pipeline] Reader agent EXCEPTION:\n{traceback.format_exc()}")
        yield _ev("reader", "error",
                  f"Reader failed ({exc}) — continuing with search data only")
        state["scraped_content"] = (
            "[Reader could not scrape content — report uses search data only]"
        )

    yield _ev("reader", "result",
              f"Extracted {len(state['scraped_content'])} chars of page content")
    yield _ev("reader", "complete", "Reader phase complete")

    # ══ STEP 3 — Writer Chain ════════════════════════════════════════════════
    yield _ev("writer", "thinking",
              "Synthesising search + scraped data into Markdown report...")

    research_combined = (
        f"SEARCH RESULTS:\n{state['search_results']}\n\n"
        f"SCRAPED PAGE CONTENT:\n{state['scraped_content']}"
    )

    try:
        print(f"[Pipeline] Starting writer chain...")
        writer_chain  = build_writer_chain(chain_llm)
        report_chunks: list[str] = []
        for chunk in writer_chain.stream({"topic": topic, "research": research_combined}):
            report_chunks.append(chunk)
            yield _ev("writer", "streaming", chunk)
        state["report"] = "".join(report_chunks)
        print(f"[Pipeline] Writer chain done — {len(state['report'])} chars")
    except Exception as exc:
        print(f"[Pipeline] Writer chain EXCEPTION:\n{traceback.format_exc()}")
        yield _ev("writer", "error", f"Writer chain failed: {exc}")
        return

    yield _ev("writer", "complete", "Report drafted successfully")

    # ══ STEP 4 — Critic Chain ════════════════════════════════════════════════
    yield _ev("critic", "thinking",
              "Evaluating report quality, factual consistency, and structure...")

    try:
        print(f"[Pipeline] Starting critic chain...")
        critic_chain    = build_critic_chain(chain_llm)
        feedback_chunks: list[str] = []
        for chunk in critic_chain.stream({"report": state["report"]}):
            feedback_chunks.append(chunk)
            yield _ev("critic", "streaming", chunk)
        state["feedback"] = "".join(feedback_chunks)
        print(f"[Pipeline] Critic chain done — {len(state['feedback'])} chars")
    except Exception as exc:
        print(f"[Pipeline] Critic chain EXCEPTION:\n{traceback.format_exc()}")
        yield _ev("critic", "error", f"Critic chain failed: {exc}")
        return

    yield _ev("critic", "complete", "Critique complete — pipeline finished")
    print(f"[Pipeline] All steps complete for topic: {topic!r}")


# ═════════════════════════════════════════════════════════════════════════════
# SIMULATION PIPELINE
# ═════════════════════════════════════════════════════════════════════════════

_SIM_REPORT = """\
## Introduction

This research report presents a comprehensive overview of **{topic}**, synthesising
information from multiple authoritative sources. The analysis covers current trends,
key developments, and actionable insights for practitioners and decision-makers.

## Key Findings

### 1. Rapid Adoption and Market Growth
The domain of {topic} is experiencing unprecedented growth. Market analysts project
compound annual growth rates (CAGR) exceeding 30% through 2030, driven by increasing
enterprise adoption and maturing toolchains. Early-mover organisations report measurable
productivity gains ranging from 20–45% in targeted workflows.

### 2. Technical Maturation and Standardisation
Core standards are crystallising around interoperable APIs and open-source foundations.
Emerging frameworks are converging toward stable release cycles, reducing integration
friction and vendor lock-in risk for teams building on {topic}.

### 3. Ethical and Regulatory Landscape
Regulatory bodies in the EU and US are actively drafting governance frameworks.
Organisations that proactively invest in responsible practices — auditability, bias
mitigation, and transparency — are positioned to navigate compliance at lower cost
than reactive peers.

## Conclusion

{topic} represents a pivotal inflection point in technology. Organisations that invest
now in robust, observable, and maintainable infrastructure will establish durable
competitive advantages. The trajectory from experimental adoption to production-grade
deployment is accelerating, making architecture quality and observability critical.

## Sources

- [TechCrunch – {topic} Report 2025](https://techcrunch.com)
- [MIT Technology Review](https://technologyreview.com)
- [Stanford HAI Annual Report](https://hai.stanford.edu)
- [Gartner Research – {topic}](https://gartner.com)
"""

_SIM_FEEDBACK = """\
Score: 8/10

Strengths:
- Covers introduction, findings, and conclusion with a clear narrative arc
- Provides actionable, practitioner-relevant insights throughout
- Sources are diverse and credible across industry and academic domains

Areas to Improve:
- Key Findings could include more quantitative data points for stronger evidence
- The conclusion would benefit from explicit next-step recommendations
- Adding case studies or real-world examples would improve persuasiveness

One line verdict:
A solid, well-structured report that establishes context effectively and would benefit from deeper empirical grounding.
"""


def _stream_words(text: str, topic: str, delay: float = 0.014) -> Generator[str, None, None]:
    filled = text.replace("{topic}", topic)
    for word in filled.split(" "):
        yield word + " "
        time.sleep(delay)


def run_simulation_pipeline(topic: str) -> Generator[dict, None, None]:
    def pause(s: float): time.sleep(s)

    yield _ev("search", "thinking", f'Formulating search strategy for: "{topic}"')
    pause(0.6)
    yield _ev("search", "tool_call", f'web_search("{topic}")', tool="web_search")
    pause(1.2)
    yield _ev("search", "result", "Retrieved 4 sources (TechCrunch, MIT TR, Stanford HAI, Gartner)")
    pause(0.3)
    yield _ev("search", "complete", "Search phase complete")
    pause(0.4)

    yield _ev("reader", "thinking", "Selecting highest-relevance URL from search results...")
    pause(0.7)
    yield _ev("reader", "tool_call",
              "scrape_url(https://technologyreview.com)", tool="scrape_url")
    pause(1.4)
    yield _ev("reader", "result", "Extracted 3,842 chars of structured article text")
    pause(0.3)
    yield _ev("reader", "complete", "Reader phase complete")
    pause(0.4)

    yield _ev("writer", "thinking", "Synthesising research into structured Markdown report...")
    pause(0.6)
    for chunk in _stream_words(_SIM_REPORT, topic, delay=0.012):
        yield _ev("writer", "streaming", chunk)
    pause(0.3)
    yield _ev("writer", "complete", "Report drafted successfully")
    pause(0.4)

    yield _ev("critic", "thinking",
              "Evaluating report quality, factual consistency, and structure...")
    pause(0.8)
    for chunk in _stream_words(_SIM_FEEDBACK, topic, delay=0.020):
        yield _ev("critic", "streaming", chunk)
    pause(0.3)
    yield _ev("critic", "complete", "Critique complete — pipeline finished")


# ═════════════════════════════════════════════════════════════════════════════
# ASYNC WRAPPER — bridges sync generators → FastAPI SSE
# ═════════════════════════════════════════════════════════════════════════════

async def run_pipeline_async(topic: str) -> AsyncGenerator[dict, None]:
    """
    Wraps synchronous pipeline generators into an async generator for FastAPI SSE.

    Key fix vs original:
      Added asyncio.wait_for() with a per-item timeout on queue.get() so a
      hung pipeline thread never blocks the SSE stream forever — after
      ITEM_TIMEOUT seconds of silence an error event is emitted and the stream
      closes cleanly instead of hanging until the client drops the connection.
    """
    ITEM_TIMEOUT = 120  # seconds to wait for the next event before giving up

    loop = asyncio.get_running_loop()

    use_sim = not _has_real_keys()
    if use_sim:
        print(f"[OrchestrAI] SIMULATION mode — topic={topic!r}")
        gen = run_simulation_pipeline(topic)
    else:
        print(f"[OrchestrAI] REAL mode — topic={topic!r}")
        gen = run_real_pipeline(topic)

    queue: asyncio.Queue[dict | None] = asyncio.Queue()

    def _consume() -> None:
        try:
            for event in gen:
                loop.call_soon_threadsafe(queue.put_nowait, event)
        except Exception as exc:
            err_msg = f"Unhandled pipeline error: {exc}\n{traceback.format_exc()}"
            print(f"[Pipeline] _consume EXCEPTION:\n{err_msg}")
            err = _ev("system", "error", f"Unhandled pipeline error: {exc}")
            loop.call_soon_threadsafe(queue.put_nowait, err)
        finally:
            print("[Pipeline] _consume finished — sending sentinel")
            loop.call_soon_threadsafe(queue.put_nowait, None)

    thread_task = loop.run_in_executor(None, _consume)

    while True:
        try:
            item = await asyncio.wait_for(queue.get(), timeout=ITEM_TIMEOUT)
        except asyncio.TimeoutError:
            print(f"[Pipeline] Queue timeout after {ITEM_TIMEOUT}s — pipeline thread hung")
            yield _ev("system", "error",
                      f"Pipeline timed out after {ITEM_TIMEOUT}s of inactivity. "
                      f"This usually means the LLM API is unresponsive. Please retry.")
            break

        if item is None:
            print("[Pipeline] Sentinel received — stream complete")
            break
        yield item

    try:
        await asyncio.wait_for(thread_task, timeout=5)
    except Exception:
        pass
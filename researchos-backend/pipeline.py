import asyncio
import os
import time
import re
import traceback
from typing import AsyncGenerator, Generator
from langsmith import traceable

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


def _ev(agent: str, type_: str, msg: str, tool: str | None = None, **extra) -> dict:
    return {"agent": agent, "type": type_, "msg": msg, "tool": tool, **extra}


_SOURCE_BLOCK_RE = re.compile(
    r"Title:\s*(?P<title>.+?)\s*\n\s*URL:\s*(?P<url>\S+)\s*\n\s*Snippet:\s*(?P<snippet>.*?)(?:\n\s*\n|\Z)",
    re.DOTALL,
)


def _parse_search_sources(raw: str, limit: int = 6) -> list[dict]:
    """Parse tools.py's `web_search` raw output ("Title:/URL:/Snippet:" blocks,
    separated by "----") into structured {title, url, snippet} dicts.

    This runs on the *raw* tool result captured via on_tool_result — i.e.
    before the search agent's LLM paraphrases it into a summary — so the
    URLs here are exactly what Tavily returned, not an LLM's best guess at
    reproducing them.
    """
    if not raw or raw.startswith("[web_search error]") or raw == "No results found.":
        return []

    sources = []
    for block in raw.split("\n----\n"):
        m = _SOURCE_BLOCK_RE.search(block + "\n\n")
        if not m:
            continue
        url = m.group("url").strip()
        if not url or url == "N/A":
            continue
        sources.append({
            "title":   (m.group("title") or url).strip()[:160],
            "url":     url,
            "snippet": m.group("snippet").strip()[:220],
        })
        if len(sources) >= limit:
            break
    return sources


QUALITY_THRESHOLD = 0.7   # i.e. 7/10
MAX_RETRIES       = 2     # up to 2 revision attempts after the first draft


def _parse_score(feedback: str) -> float | None:
    """Extract the critic's score (e.g. 'Score: 6/10') and normalize to 0-1."""
    m = re.search(r"Score:\s*(\d+(?:\.\d+)?)\s*/\s*10", feedback, re.IGNORECASE)
    if m:
        return float(m.group(1)) / 10.0
    return None

# ═════════════════════════════════════════════════════════════════════════════
# REAL PIPELINE
# ═════════════════════════════════════════════════════════════════════════════

@traceable(name="research_pipeline", run_type="chain")
def run_real_pipeline(topic: str, focus_mode: str = "balanced") -> Generator[dict, None, None]:
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

    mode = resolve_focus_mode(focus_mode)
    state: dict = {}

    # ── LLM initialisation ───────────────────────────────────────────────────
    yield _ev("search", "thinking", "Initialising LLMs...")
    if mode["label"] != "Balanced":
        yield _ev("search", "focus_mode", f"Focus mode: {mode['label']}", focus_mode=focus_mode)

    try:
        tool_llm  = get_tool_llm()
        chain_llm = get_chain_llm()
    except RuntimeError as exc:
        yield _ev("search", "error", f"LLM init failed: {exc}")
        return

    # ══ STEP 1 — Search Agent ════════════════════════════════════════════════
    yield _ev("search", "thinking", f'Formulating search strategy for: "{topic}"')
    yield _ev("search", "tool_call", f'web_search("{topic}")', tool="web_search")

    raw_tool_results: dict[str, str] = {}

    def _capture_search(name: str, args: dict, result_str: str) -> None:
        # Keep the first (only) web_search call's raw output — this is the
        # exact Tavily response, before the agent's LLM paraphrases it.
        if name in ("web_search", "brave_search") and "web_search" not in raw_tool_results:
            raw_tool_results["web_search"] = result_str

    try:
        print(f"[Pipeline] Starting search agent for: {topic!r}")
        state["search_results"] = run_search_agent(topic=topic, llm=tool_llm, on_tool_result=_capture_search, focus_mode=focus_mode)
        print(f"[Pipeline] Search agent done — {len(state['search_results'])} chars")
    except Exception as exc:
        print(f"[Pipeline] Search agent EXCEPTION:\n{traceback.format_exc()}")
        yield _ev("search", "error", f"Search agent failed: {exc}")
        return

    sources = _parse_search_sources(raw_tool_results.get("web_search", ""))
    if sources:
        yield _ev("search", "sources", f"Found {len(sources)} sources", sources=sources)

    yield _ev("search", "result",
              f"Retrieved {len(state['search_results'])} chars of search data")
    yield _ev("search", "complete", "Search phase complete")

    # ══ STEP 2 — Reader Agent ════════════════════════════════════════════════
    yield _ev("reader", "thinking", "Selecting highest-relevance URL to scrape...")
    yield _ev("reader", "tool_call",
              "scrape_url(best source from results)", tool="scrape_url")

    read_url: str | None = None

    def _capture_reader(name: str, args: dict, result_str: str) -> None:
        nonlocal read_url
        if name in ("scrape_url",) and read_url is None:
            read_url = args.get("url")

    try:
        print(f"[Pipeline] Starting reader agent...")
        state["scraped_content"] = run_reader_agent(
            topic=topic,
            search_results=state["search_results"],
            llm=tool_llm,
            on_tool_result=_capture_reader,
        )
        print(f"[Pipeline] Reader agent done — {len(state['scraped_content'])} chars")
    except Exception as exc:
        print(f"[Pipeline] Reader agent EXCEPTION:\n{traceback.format_exc()}")
        yield _ev("reader", "error",
                  f"Reader failed ({exc}) — continuing with search data only")
        state["scraped_content"] = (
            "[Reader could not scrape content — report uses search data only]"
        )

    if read_url:
        yield _ev("reader", "source_read", "Reading full article", url=read_url)

    yield _ev("reader", "result",
              f"Extracted {len(state['scraped_content'])} chars of page content")
    yield _ev("reader", "complete", "Reader phase complete")

    # ══ STEP 3 & 4 — Writer + Critic, with Reflexion-style quality gate ═══════
    research_combined = (
        f"SEARCH RESULTS:\n{state['search_results']}\n\n"
        f"SCRAPED PAGE CONTENT:\n{state['scraped_content']}"
    )

    try:
        writer_chain   = build_writer_chain(chain_llm, focus_mode=focus_mode)
        revision_chain = build_writer_revision_chain(chain_llm, focus_mode=focus_mode)
        critic_chain   = build_critic_chain(chain_llm)
    except Exception as exc:
        yield _ev("writer", "error", f"Chain setup failed: {exc}")
        return

    for attempt in range(MAX_RETRIES + 1):
        is_retry = attempt > 0

        # ── Writer (first draft) or Reviser (retry) ─────────────────────────
        if is_retry:
            yield _ev("writer", "thinking",
                      f"Quality gate: previous score {state['last_score']*10:.1f}/10 "
                      f"< 7/10 — revising report (attempt {attempt+1}/{MAX_RETRIES+1})")
            yield _ev("writer", "reset", "")
            stream_input = {
                "topic": topic,
                "research": research_combined,
                "previous_report": state["report"],
                "feedback": state["feedback"],
            }
            chain_to_run = revision_chain
        else:
            yield _ev("writer", "thinking",
                      "Synthesising search + scraped data into Markdown report...")
            stream_input = {"topic": topic, "research": research_combined}
            chain_to_run = writer_chain

        try:
            print(f"[Pipeline] Writer attempt {attempt+1}/{MAX_RETRIES+1}...")
            report_chunks: list[str] = []
            for chunk in chain_to_run.stream(stream_input):
                report_chunks.append(chunk)
                yield _ev("writer", "streaming", chunk)
            state["report"] = "".join(report_chunks)
            print(f"[Pipeline] Writer attempt {attempt+1} done — {len(state['report'])} chars")
        except Exception as exc:
            print(f"[Pipeline] Writer EXCEPTION:\n{traceback.format_exc()}")
            yield _ev("writer", "error", f"Writer chain failed: {exc}")
            return

        yield _ev("writer", "complete",
                  "Report revised" if is_retry else "Report drafted successfully")

        # ── Critic ───────────────────────────────────────────────────────────
        if is_retry:
            yield _ev("critic", "reset", "")

        yield _ev("critic", "thinking",
                  "Evaluating report quality, factual consistency, and structure...")

        try:
            print(f"[Pipeline] Critic evaluating attempt {attempt+1}...")
            feedback_chunks: list[str] = []
            for chunk in critic_chain.stream({"report": state["report"]}):
                feedback_chunks.append(chunk)
                yield _ev("critic", "streaming", chunk)
            state["feedback"] = "".join(feedback_chunks)
            print(f"[Pipeline] Critic done — {len(state['feedback'])} chars")
        except Exception as exc:
            print(f"[Pipeline] Critic EXCEPTION:\n{traceback.format_exc()}")
            yield _ev("critic", "error", f"Critic chain failed: {exc}")
            return

        score = _parse_score(state["feedback"])
        state["last_score"] = score if score is not None else 1.0
        print(f"[Pipeline] Attempt {attempt+1} score: {score}")

        if score is None:
            yield _ev("critic", "complete", "Critique complete — pipeline finished")
            break

        if score >= QUALITY_THRESHOLD:
            yield _ev("critic", "complete",
                      f"Critique complete — score {score*10:.1f}/10, passed quality gate")
            break

        if attempt == MAX_RETRIES:
            yield _ev("critic", "complete",
                      f"Critique complete — score {score*10:.1f}/10, "
                      f"max retries ({MAX_RETRIES}) reached")
            break

        yield _ev("critic", "complete",
                  f"Score {score*10:.1f}/10 — below 7/10 threshold, triggering retry")

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


def run_simulation_pipeline(topic: str, focus_mode: str = "balanced") -> Generator[dict, None, None]:
    from agents import resolve_focus_mode
    mode = resolve_focus_mode(focus_mode)

    def pause(s: float): time.sleep(s)

    yield _ev("search", "thinking", f'Formulating search strategy for: "{topic}"')
    if mode["label"] != "Balanced":
        yield _ev("search", "focus_mode", f"Focus mode: {mode['label']}", focus_mode=focus_mode)
    pause(0.6)
    yield _ev("search", "tool_call", f'web_search("{topic}")', tool="web_search")
    pause(1.2)

    sim_sources = [
        {"title": f"{topic} — TechCrunch",             "url": "https://techcrunch.com",             "snippet": f"Recent coverage and analysis of {topic}, including industry reaction and what it means going forward."},
        {"title": f"{topic}: A Deep Dive — MIT Technology Review", "url": "https://technologyreview.com", "snippet": f"An in-depth technical look at {topic}, examining the underlying mechanisms and open research questions."},
        {"title": f"{topic} — Stanford HAI",           "url": "https://hai.stanford.edu",            "snippet": f"Academic perspective on {topic} from Stanford's Human-Centered AI Institute, with citations to primary research."},
        {"title": f"{topic} Market Outlook — Gartner",  "url": "https://gartner.com",                 "snippet": f"Analyst commentary on adoption trends and forecasts related to {topic} through the next several years."},
    ]
    yield _ev("search", "sources", f"Found {len(sim_sources)} sources", sources=sim_sources)
    pause(0.2)
    yield _ev("search", "result", "Retrieved 4 sources (TechCrunch, MIT TR, Stanford HAI, Gartner)")
    pause(0.3)
    yield _ev("search", "complete", "Search phase complete")
    pause(0.4)

    yield _ev("reader", "thinking", "Selecting highest-relevance URL from search results...")
    pause(0.7)
    yield _ev("reader", "tool_call",
              "scrape_url(https://technologyreview.com)", tool="scrape_url")
    pause(0.5)
    yield _ev("reader", "source_read", "Reading full article", url="https://technologyreview.com")
    pause(0.9)
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

async def run_pipeline_async(topic: str, focus_mode: str = "balanced") -> AsyncGenerator[dict, None]:
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
        print(f"[OrchestrAI] SIMULATION mode — topic={topic!r} focus_mode={focus_mode!r}")
        gen = run_simulation_pipeline(topic, focus_mode=focus_mode)
    elif os.getenv("USE_LANGGRAPH_PIPELINE", "false").lower() == "true":
        # Opt-in only — defaults to "false" so existing behaviour (the
        # original run_real_pipeline below) is completely unchanged unless
        # this env var is explicitly set. See pipeline_langgraph.py for the
        # LangGraph StateGraph version of this same orchestration.
        from pipeline_langgraph import run_real_pipeline_graph
        print(f"[OrchestrAI] REAL mode (LangGraph) — topic={topic!r} focus_mode={focus_mode!r}")
        gen = run_real_pipeline_graph(topic, focus_mode=focus_mode)
    else:
        print(f"[OrchestrAI] REAL mode — topic={topic!r} focus_mode={focus_mode!r}")
        gen = run_real_pipeline(topic, focus_mode=focus_mode)

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
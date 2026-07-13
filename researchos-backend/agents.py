import os
from dotenv import load_dotenv
import itertools


from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage, SystemMessage

from tools import web_search, scrape_url, brave_search, make_web_search_tool

# ─────────────────────────────────────────────────────────────────────────────
# Focus Modes — parameterize the pipeline without changing its architecture.
# Each mode tweaks: how Tavily searches (depth/topic/result count) and what
# extra guidance the Writer Agent gets. The LLM's tool schema never changes —
# only what happens inside the tool, and what's appended to the writer prompt.
# ─────────────────────────────────────────────────────────────────────────────

FOCUS_MODES: dict[str, dict] = {
    "balanced": {
        "label": "Balanced",
        "max_results": 5,
        "search_depth": "basic",
        "topic": "general",
        "writer_instructions": "",
    },
    "quick": {
        "label": "Quick",
        "max_results": 3,
        "search_depth": "basic",
        "topic": "general",
        "writer_instructions": (
            "Keep this report concise — aim for roughly half the usual length. "
            "Prioritize the single most important finding per section over exhaustive coverage."
        ),
    },
    "academic": {
        "label": "Academic",
        "max_results": 6,
        "search_depth": "advanced",
        "topic": "general",
        "writer_instructions": (
            "Write in a formal, academic register. Prioritize peer-reviewed research, "
            "primary sources, and institutional publications over blogs or press releases. "
            "Note methodology or evidence quality where relevant, and flag any claims that "
            "are contested or lack strong sourcing."
        ),
    },
    "news": {
        "label": "News",
        "max_results": 6,
        "search_depth": "basic",
        "topic": "news",
        "writer_instructions": (
            "Frame this as a news briefing. Lead with what changed most recently, include "
            "concrete dates, and clearly separate confirmed facts from speculation or analyst commentary."
        ),
    },
    "technical": {
        "label": "Technical",
        "max_results": 6,
        "search_depth": "advanced",
        "topic": "general",
        "writer_instructions": (
            "Write for a technically literate audience. Include specific mechanisms, "
            "architectures, numbers, or implementation details rather than high-level "
            "summaries. Define jargon only briefly in passing, don't over-explain basics."
        ),
    },
}

DEFAULT_FOCUS_MODE = "balanced"


def resolve_focus_mode(focus_mode: str | None) -> dict:
    """Look up a focus mode config, falling back safely for unknown/missing values."""
    return FOCUS_MODES.get((focus_mode or "").lower(), FOCUS_MODES[DEFAULT_FOCUS_MODE])
from pathlib import Path
load_dotenv(Path(__file__).parent / ".env", override=True)

# ─────────────────────────────────────────────────────────────────────────────
# Model constants
# ─────────────────────────────────────────────────────────────────────────────

TOOL_USE_MODELS: list[str] = [
    "llama-3.3-70b-versatile",   # Primary
    "moonshotai/kimi-k2-instruct",   # Fallback 1
    "llama-3.1-8b-instant",      # Fallback 2 (500k TPD — almost never rate-limited)
]

# Overridable via .env — set GROQ_CHAIN_MODEL=llama-3.1-8b-instant in .env
# before running evaluate.py to avoid burning your 100k/day quota on Step 1.
# Leave unset (or set to llama-3.3-70b-versatile) for normal app usage.
CHAIN_MODEL = os.getenv("GROQ_CHAIN_MODEL", "llama-3.3-70b-versatile")

MAX_TOOL_ITERATIONS = 6


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _load_keys(env_var: str) -> list[str]:
    raw = os.getenv(env_var, "")
    return [k.strip() for k in raw.split(",") if k.strip()]


GROQ_KEYS: list[str] = _load_keys("GROQ_API_KEYS")
_groq_key_cycle = itertools.cycle(GROQ_KEYS) if GROQ_KEYS else iter([])


def _make_llm(model: str, temperature: float = 0) -> ChatGroq:
    if not GROQ_KEYS:
        raise RuntimeError(
            "GROQ_API_KEYS is not set. "
            "Add it to backend/.env:\n  GROQ_API_KEYS=gsk_key1,gsk_key2"
        )
    key = next(_groq_key_cycle)
    print(f"[Groq] ✓  model={model}  key={key[:12]}…")
    return ChatGroq(api_key=key, model=model, temperature=temperature)


def _make_llm_with_failover(model: str, temperature: float = 0) -> ChatGroq:
    last_err: Exception | None = None
    for key in GROQ_KEYS:
        try:
            llm = ChatGroq(api_key=key, model=model, temperature=temperature)
            llm.invoke("hi")
            print(f"[Groq] ✓  model={model}  key={key[:12]}…")
            return llm
        except Exception as exc:
            print(f"[Groq] ✗  model={model}  key={key[:12]}…  err={exc}")
            last_err = exc
    raise RuntimeError(f"All Groq keys exhausted for model={model}. Last error: {last_err}")


# ─────────────────────────────────────────────────────────────────────────────
# LLM factories (public)
# ─────────────────────────────────────────────────────────────────────────────

def get_tool_llm(temperature: float = 0) -> ChatGroq:
    last_err: Exception | None = None
    for model in TOOL_USE_MODELS:
        try:
            return _make_llm(model, temperature)
        except RuntimeError as exc:
            print(f"[Groq] model={model} unavailable: {exc}")
            last_err = exc
    raise RuntimeError(
        f"No working tool-LLM found. Tried: {TOOL_USE_MODELS}. Last: {last_err}"
    )


def get_chain_llm(temperature: float = 0) -> ChatGroq:
    """Return the LLM for writer/critic chains (no tool binding).

    Model is controlled by GROQ_CHAIN_MODEL env var (default: llama-3.3-70b-versatile).
    Set GROQ_CHAIN_MODEL=llama-3.1-8b-instant in .env before running evaluate.py
    to use a token-efficient model during RAG response collection.
    """
    return _make_llm(CHAIN_MODEL, temperature)


# ─────────────────────────────────────────────────────────────────────────────
# Core: manual bind_tools loop
# ─────────────────────────────────────────────────────────────────────────────
def _run_tool_loop(
    llm: ChatGroq,
    tools: list,
    user_message: str,
    max_iterations: int = MAX_TOOL_ITERATIONS,
    on_tool_result=None,
) -> str:
    from groq import RateLimitError, BadRequestError, InternalServerError

    current_model = llm.model_name
    models_to_try = [current_model] + [m for m in TOOL_USE_MODELS if m != current_model]
    combos = [(key, model) for model in models_to_try for key in GROQ_KEYS]

    last_err: Exception | None = None

    for attempt, (key, model) in enumerate(combos):
        try:
            current_llm = ChatGroq(api_key=key, model=model, temperature=llm.temperature)
            print(f"[Groq] Trying model={model}  key={key[:12]}… (attempt {attempt+1}/{len(combos)})")
            return _run_tool_loop_inner(current_llm, tools, user_message, max_iterations, on_tool_result)
        except RateLimitError as exc:
            print(f"[Groq] 429 — model={model} key={key[:12]}… exhausted, trying next combo")
            last_err = exc
            continue
        except InternalServerError as exc:
            print(f"[Groq] 503 — model={model} over capacity, trying next combo")
            last_err = exc
            continue
        except BadRequestError as exc:
            print(f"[Groq] 400 — model={model} decommissioned or bad request, skipping")
            last_err = exc
            continue

    raise RuntimeError(
        f"All {len(combos)} key+model combos failed. "
        f"Last error: {last_err}"
    ) from last_err


def _run_tool_loop_inner(
    llm: ChatGroq,
    tools: list,
    user_message: str,
    max_iterations: int = MAX_TOOL_ITERATIONS,
    on_tool_result=None,
) -> str:
    """Core tool loop — no retry logic.

    on_tool_result: optional callback(name: str, args: dict, result_str: str)
    fired right after each tool invocation succeeds. This lets callers (e.g.
    pipeline.py) capture the *raw* tool output — exact titles/URLs from
    Tavily — before it gets folded into the LLM's paraphrased summary, which
    is what powers the live source rail on the frontend.
    """
    tool_map: dict[str, object] = {t.name: t for t in tools}
    llm_with_tools = llm.bind_tools(tools)
    messages: list = [HumanMessage(content=user_message)]

    for _ in range(max_iterations):
        response: AIMessage = llm_with_tools.invoke(messages)
        messages.append(response)

        if not getattr(response, "tool_calls", None):
            return response.content or ""

        for tool_call in response.tool_calls:
            name = tool_call["name"]
            args = tool_call["args"]
            tid  = tool_call["id"]

            if name not in tool_map:
                result_str = f"[Error] Unknown tool '{name}'. Available: {list(tool_map)}"
            else:
                try:
                    result = tool_map[name].invoke(args)
                    result_str = str(result)
                    if on_tool_result:
                        try:
                            on_tool_result(name, args, result_str)
                        except Exception as cb_exc:
                            print(f"[on_tool_result] callback failed (non-fatal): {cb_exc}")
                except Exception as exc:
                    result_str = f"[Tool error] {name} failed: {exc}"

            messages.append(ToolMessage(content=result_str, tool_call_id=tid))

    last_ai = next((m for m in reversed(messages) if isinstance(m, AIMessage)), None)
    return last_ai.content if last_ai else "Agent reached max iterations without a final answer."


# ─────────────────────────────────────────────────────────────────────────────
# Search Agent
# ─────────────────────────────────────────────────────────────────────────────

def run_search_agent(
    topic: str,
    llm: ChatGroq | None = None,
    on_tool_result=None,
    focus_mode: str = DEFAULT_FOCUS_MODE,
) -> str:
    if llm is None:
        llm = get_tool_llm()

    mode = resolve_focus_mode(focus_mode)
    search_tool = make_web_search_tool(
        max_results=mode["max_results"],
        search_depth=mode["search_depth"],
        topic=mode["topic"],
    )

    news_hint = (
        "\nPrioritize the most recent developments — this is a news-focused search."
        if mode["topic"] == "news" else ""
    )

    prompt = (
        f"You are a research assistant. Your task: find recent, reliable, and "
        f"detailed information about the following topic.\n\n"
        f"Topic: {topic}\n\n"
        f"Instructions:\n"
        f"1. Use the web_search tool to search for '{topic}'.\n"
        f"2. Review the results.\n"
        f"3. Return a clean summary of the most relevant sources, including: "
        f"title, URL, and a one-sentence summary of each result."
        f"{news_hint}"
    )

    return _run_tool_loop(llm, tools=[search_tool], user_message=prompt, on_tool_result=on_tool_result)


# ─────────────────────────────────────────────────────────────────────────────
# Reader Agent
# ─────────────────────────────────────────────────────────────────────────────

def run_reader_agent(
    topic: str,
    search_results: str,
    llm: ChatGroq | None = None,
    on_tool_result=None,
) -> str:
    if llm is None:
        llm = get_tool_llm()

    prompt = (
        f"You are a research reader assistant. Your task: extract detailed content "
        f"from the best web source about '{topic}'.\n\n"
        f"Search results available:\n{search_results[:1_400]}\n\n"
        f"Instructions:\n"
        f"1. From the search results above, identify the single most relevant, "
        f"authoritative, and informative URL for the topic '{topic}'.\n"
        f"2. Use the scrape_url tool to extract the full content from that URL.\n"
        f"3. Return the key extracted information in a structured format."
    )

    return _run_tool_loop(llm, tools=[scrape_url, brave_search], user_message=prompt, on_tool_result=on_tool_result)


# ─────────────────────────────────────────────────────────────────────────────
# Writer Chain
# ─────────────────────────────────────────────────────────────────────────────

_WRITER_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are an expert research writer. "
        "Write clear, structured, detailed, insightful, and fully factual research reports in Markdown.",
    ),
    (
        "human",
        """Write a detailed research report on the topic below.

Topic:
{topic}

Research Gathered:
{research}

Structure the report with these exact Markdown headings:

## Introduction
## Key Findings
## Conclusion
## Sources

Rules:
- Minimum 3 detailed Key Findings with sub-points
- Be factual and professional
- Avoid repetition
- Expand explanations with concrete context
- List all source URLs under ## Sources as markdown links
{focus_instructions}""",
    ),
])


def build_writer_chain(llm: ChatGroq | None = None, focus_mode: str = DEFAULT_FOCUS_MODE):
    if llm is None:
        llm = get_chain_llm()
    mode = resolve_focus_mode(focus_mode)
    extra = f"\nFocus mode — {mode['label']}: {mode['writer_instructions']}" if mode["writer_instructions"] else ""
    prompt = _WRITER_PROMPT.partial(focus_instructions=extra)
    return prompt | llm | StrOutputParser()


_WRITER_REVISION_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are an expert research writer revising a report based on a critic's feedback. "
        "Write clear, structured, detailed, insightful, and fully factual research reports in Markdown.",
    ),
    (
        "human",
        """Revise the research report below to address the critic's feedback below,
especially every point listed under "Areas to Improve".

Topic:
{topic}

Research Gathered:
{research}

Previous Draft:
{previous_report}

Critic Feedback:
{feedback}

Structure the revised report with these exact Markdown headings:

## Introduction
## Key Findings
## Conclusion
## Sources

Rules:
- Directly address each "Areas to Improve" point from the feedback
- Minimum 3 detailed Key Findings with sub-points
- Be factual and professional
- Avoid repetition
- List all source URLs under ## Sources as markdown links
{focus_instructions}""",
    ),
])


def build_writer_revision_chain(llm: ChatGroq | None = None, focus_mode: str = DEFAULT_FOCUS_MODE):
    if llm is None:
        llm = get_chain_llm()
    mode = resolve_focus_mode(focus_mode)
    extra = f"\nFocus mode — {mode['label']}: {mode['writer_instructions']}" if mode["writer_instructions"] else ""
    prompt = _WRITER_REVISION_PROMPT.partial(focus_instructions=extra)
    return prompt | llm | StrOutputParser()


# ─────────────────────────────────────────────────────────────────────────────
# Critic Chain
# ─────────────────────────────────────────────────────────────────────────────

_CRITIC_PROMPT = ChatPromptTemplate.from_messages([
    (
        "system",
        "You are a strict and constructive research critic. "
        "Review reports honestly and provide actionable, specific improvements.",
    ),
    (
        "human",
        """Review the research report below strictly.

Report:
{report}

Respond EXACTLY in this format (no deviations):

Score: X/10

Strengths:
- point 1
- point 2
- point 3

Areas to Improve:
- point 1
- point 2
- point 3

One line verdict:
your verdict here
""",
    ),
])


def build_critic_chain(llm: ChatGroq | None = None):
    if llm is None:
        llm = get_chain_llm()
    return _CRITIC_PROMPT | llm | StrOutputParser()


# ─────────────────────────────────────────────────────────────────────────────
# Follow-up Q&A
#
# Answers questions about an already-completed report WITHOUT re-running the
# search/reader/writer/critic pipeline. This is what turns a one-shot report
# generator into something you can actually have a conversation with — the
# Perplexity-style thread experience.
#
# Deliberately NOT a tool-calling agent: the report + sources already contain
# everything the Search and Reader agents found, so a single grounded LLM
# call over that existing context is faster, cheaper, and just as accurate
# as re-searching the web for something already covered.
# ─────────────────────────────────────────────────────────────────────────────

MAX_FOLLOWUP_HISTORY_TURNS = 10  # keep the last N turns — bounds context growth on long threads


def _format_sources_for_context(sources: list[dict] | None) -> str:
    if not sources:
        return "(no structured source list was saved for this report)"
    lines = []
    for i, s in enumerate(sources, 1):
        lines.append(f"[{i}] {s.get('title', 'Untitled')} — {s.get('url', '')}\n    {s.get('snippet', '')}")
    return "\n".join(lines)


def answer_followup(
    topic: str,
    report: str,
    sources: list[dict] | None,
    history: list[dict],
    question: str,
    llm: ChatGroq | None = None,
) -> str:
    """
    topic, report, sources: the original research run's saved context.
    history: prior turns in this thread, oldest first — each a dict with
             {"role": "user"|"assistant", "content": str}, as stored in the
             run_followups table.
    question: the new question being asked right now.

    Returns the assistant's answer as plain text (Markdown allowed).
    """
    if llm is None:
        llm = get_chain_llm()

    system_prompt = (
        "You are ResearchOS's follow-up assistant. The user already received a full "
        "research report on a topic; your job is to answer follow-up questions about "
        "it accurately, using ONLY the report and sources below plus this conversation. "
        "If the answer genuinely isn't in the report or sources, say so plainly instead "
        "of guessing — do not invent facts, statistics, or sources that aren't provided. "
        "Keep answers focused and conversational, not another full report. "
        "You may cite sources by their [N] number when relevant.\n\n"
        f"ORIGINAL TOPIC:\n{topic}\n\n"
        f"REPORT:\n{report[:6000]}\n\n"
        f"SOURCES:\n{_format_sources_for_context(sources)}"
    )

    messages: list = [SystemMessage(content=system_prompt)]
    for turn in history[-(MAX_FOLLOWUP_HISTORY_TURNS * 2):]:
        role, content = turn.get("role"), turn.get("content", "")
        if role == "user":
            messages.append(HumanMessage(content=content))
        elif role == "assistant":
            messages.append(AIMessage(content=content))
    messages.append(HumanMessage(content=question))

    response = llm.invoke(messages)
    return response.content or "I couldn't generate an answer — please try rephrasing your question."
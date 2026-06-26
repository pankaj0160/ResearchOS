import os
from dotenv import load_dotenv
import itertools


from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser
from langchain_core.messages import HumanMessage, AIMessage, ToolMessage

from tools import web_search, scrape_url, brave_search
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
            return _run_tool_loop_inner(current_llm, tools, user_message, max_iterations)
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
) -> str:
    """Core tool loop — no retry logic."""
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
                except Exception as exc:
                    result_str = f"[Tool error] {name} failed: {exc}"

            messages.append(ToolMessage(content=result_str, tool_call_id=tid))

    last_ai = next((m for m in reversed(messages) if isinstance(m, AIMessage)), None)
    return last_ai.content if last_ai else "Agent reached max iterations without a final answer."


# ─────────────────────────────────────────────────────────────────────────────
# Search Agent
# ─────────────────────────────────────────────────────────────────────────────

def run_search_agent(topic: str, llm: ChatGroq | None = None) -> str:
    if llm is None:
        llm = get_tool_llm()

    prompt = (
        f"You are a research assistant. Your task: find recent, reliable, and "
        f"detailed information about the following topic.\n\n"
        f"Topic: {topic}\n\n"
        f"Instructions:\n"
        f"1. Use the web_search tool to search for '{topic}'.\n"
        f"2. Review the results.\n"
        f"3. Return a clean summary of the most relevant sources, including: "
        f"title, URL, and a one-sentence summary of each result."
    )

    return _run_tool_loop(llm, tools=[web_search], user_message=prompt)


# ─────────────────────────────────────────────────────────────────────────────
# Reader Agent
# ─────────────────────────────────────────────────────────────────────────────

def run_reader_agent(
    topic: str,
    search_results: str,
    llm: ChatGroq | None = None,
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

    return _run_tool_loop(llm, tools=[scrape_url, brave_search], user_message=prompt)


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
""",
    ),
])


def build_writer_chain(llm: ChatGroq | None = None):
    if llm is None:
        llm = get_chain_llm()
    return _WRITER_PROMPT | llm | StrOutputParser()


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
""",
    ),
])


def build_writer_revision_chain(llm: ChatGroq | None = None):
    if llm is None:
        llm = get_chain_llm()
    return _WRITER_REVISION_PROMPT | llm | StrOutputParser()


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
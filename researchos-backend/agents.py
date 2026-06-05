import os
from dotenv import load_dotenv

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

# Models tested to produce valid JSON tool calls on Groq (in priority order).
# llama-3.3-70b-versatile is intentionally excluded — it emits XML tool calls.
TOOL_USE_MODELS: list[str] = [
    "llama-3.1-70b-versatile",          # Primary: stable JSON tool-call support
    "mixtral-8x7b-32768",               # Fallback 1: proven tool-call support
    "llama-3.1-8b-instant",             # Fallback 2: fast, reliable
]

# For LCEL chains — no tool binding, pure text generation
CHAIN_MODEL = "llama-3.3-70b-versatile"

# Safety cap: max tool-call iterations per agent run
MAX_TOOL_ITERATIONS = 6


# ─────────────────────────────────────────────────────────────────────────────
# Helpers
# ─────────────────────────────────────────────────────────────────────────────

def _load_keys(env_var: str) -> list[str]:
    raw = os.getenv(env_var, "")
    return [k.strip() for k in raw.split(",") if k.strip()]


GROQ_KEYS: list[str] = _load_keys("GROQ_API_KEYS")


def _make_llm(model: str, temperature: float = 0) -> ChatGroq:
    """
    Return the first working ChatGroq instance for the given model.
    Validates each key with a lightweight ping before returning.
    Raises RuntimeError if all keys fail.
    """
    if not GROQ_KEYS:
        raise RuntimeError(
            "GROQ_API_KEYS is not set. "
            "Add it to backend/.env:\n  GROQ_API_KEYS=gsk_key1,gsk_key2"
        )

    last_err: Exception | None = None
    for key in GROQ_KEYS:
        try:
            llm = ChatGroq(api_key=key, model=model, temperature=temperature)
            llm.invoke("ping")                      # validate key is active
            print(f"[Groq] ✓  model={model}  key={key[:12]}…")
            return llm
        except Exception as exc:
            print(f"[Groq] ✗  model={model}  key={key[:12]}…  err={exc}")
            last_err = exc

    raise RuntimeError(
        f"All Groq keys exhausted for model={model}. Last error: {last_err}"
    )


# ─────────────────────────────────────────────────────────────────────────────
# LLM factories (public)
# ─────────────────────────────────────────────────────────────────────────────

def get_tool_llm(temperature: float = 0) -> ChatGroq:
    """
    Return the best available LLM for tool-using agents.
    Iterates TOOL_USE_MODELS until a working (model × key) pair is found.
    Raises RuntimeError if every combination fails.
    """
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
    """Return the LLM for writer/critic chains (no tool binding)."""
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
    """
    Runs a manual tool-calling loop using llm.bind_tools().

    Why this instead of create_react_agent:
      bind_tools() sends tool schemas as JSON to the model's native tool-call
      API. The model returns AIMessage.tool_calls (already parsed JSON dicts).
      We execute each tool, feed results back as ToolMessages, and loop until
      the model returns a plain-text response.

      create_react_agent injects a hidden ReAct system prompt that causes some
      Groq models to produce XML-formatted tool calls, triggering HTTP 400.

    Args:
        llm          : A ChatGroq instance (tool-capable model).
        tools        : List of @tool-decorated callables.
        user_message : The task description for the agent.
        max_iterations: Safety cap on tool-call rounds.

    Returns:
        Final plain-text response from the model.
    """
    # Map tool name → callable for fast lookup
    tool_map: dict[str, any] = {t.name: t for t in tools}

    # Bind JSON schemas — no hidden prompts
    llm_with_tools = llm.bind_tools(tools)

    messages: list = [HumanMessage(content=user_message)]

    for iteration in range(max_iterations):
        response: AIMessage = llm_with_tools.invoke(messages)
        messages.append(response)

        # No tool calls → model produced its final answer
        if not getattr(response, "tool_calls", None):
            return response.content or ""

        # Execute every requested tool call and return results
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

            messages.append(
                ToolMessage(content=result_str, tool_call_id=tid)
            )

    # Max iterations reached — return the last AIMessage content we have
    last_ai = next(
        (m for m in reversed(messages) if isinstance(m, AIMessage)), None
    )
    return last_ai.content if last_ai else "Agent reached max iterations without a final answer."


# ─────────────────────────────────────────────────────────────────────────────
# Search Agent  (function, not class — returns string directly)
# ─────────────────────────────────────────────────────────────────────────────

def run_search_agent(topic: str, llm: ChatGroq | None = None) -> str:
    """
    Searches the web for recent information about `topic`.

    Internally calls web_search via bind_tools loop.
    Returns a formatted string of results (titles, URLs, snippets).

    Args:
        topic : Research topic string.
        llm   : Optional pre-built tool LLM (omit to auto-build).

    Returns:
        Multi-line string of search results.
    """
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
# Reader Agent  (function, not class — returns string directly)
# ─────────────────────────────────────────────────────────────────────────────

def run_reader_agent(
    topic: str,
    search_results: str,
    llm: ChatGroq | None = None,
) -> str:
    """
    Picks the best URL from `search_results` and scrapes its full content.

    Internally calls scrape_url via bind_tools loop.
    Returns extracted page text (up to 4 000 chars).

    Args:
        topic          : Research topic string (for relevance context).
        search_results : Output from run_search_agent().
        llm            : Optional pre-built tool LLM (omit to auto-build).

    Returns:
        Extracted page content as plain text.
    """
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

    # Include `brave_search` alias so models that attempt that tool name succeed.
    return _run_tool_loop(llm, tools=[scrape_url, brave_search], user_message=prompt)


# ─────────────────────────────────────────────────────────────────────────────
# Writer Chain  (LCEL — no tool binding)
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
    """LCEL chain: {topic, research} → Markdown report string."""
    if llm is None:
        llm = get_chain_llm()
    return _WRITER_PROMPT | llm | StrOutputParser()


# ─────────────────────────────────────────────────────────────────────────────
# Critic Chain  (LCEL — no tool binding)
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
    """LCEL chain: {report} → structured critique string."""
    if llm is None:
        llm = get_chain_llm()
    return _CRITIC_PROMPT | llm | StrOutputParser()
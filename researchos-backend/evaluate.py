"""
ResearchOS RAG Evaluation using RAGAS 0.2.x

Fixes vs previous version:
  - Switches to llama-3.1-8b-instant (uses ~5x fewer tokens than 70b)
  - Catches RateLimitError and sleeps the exact retry-after seconds Groq returns
  - safe_score() uses nanmean so one successful job still produces a real score
  - Drops to 5 questions by default to stay under the 100k TPD cap
    (each RAGAS question fires ~3 LLM calls; 5q x 3calls x ~1200tok ≈ 18k tokens)
"""

# ── Patch missing VertexAI module before any other imports ────────────────────
import types, sys
_vtx = types.ModuleType('langchain_community.chat_models.vertexai')
_vtx.ChatVertexAI = None
sys.modules['langchain_community.chat_models.vertexai'] = _vtx
# ─────────────────────────────────────────────────────────────────────────────

import os
import re
import json
import time
import math
from pathlib import Path
from dotenv import load_dotenv

load_dotenv(Path(__file__).parent / ".env", override=True)

# ── CONFIG ────────────────────────────────────────────────────────────────────

TEST_SESSION_ID = "02d8362f-b897-4642-9fd0-6139a311f800"   # <- your real session_id

# Keep this at 5 to stay well under the 100k tokens/day free limit.
# Each question costs ~3 RAGAS LLM calls x ~1,000-2,000 tokens = ~15k tokens total.
# 5 questions ~ 20-25k tokens, safely within the daily cap.
TEST_QUESTIONS = [
    "What is the Prefix Sum pattern and when should you use it?",
    "How does the Two Pointers pattern reduce time complexity?",
    "What is the Sliding Window pattern and what problems does it solve?",
    "What is Dynamic Programming and when should you use it?",
    "What is the difference between DFS and BFS?",
]

CACHE_FILE = Path(__file__).parent / "eval_cache.json"

# ── Tuning ────────────────────────────────────────────────────────────────────

# 8b model uses ~5-8x fewer tokens than 70b — essential for the free tier.
# Still smart enough for RAGAS faithfulness/relevancy judgments.
GROQ_MODEL        = "llama-3.1-8b-instant"

# Seconds to sleep between calls (RPM pacing — separate from TPD).
GROQ_CALL_DELAY   = 3.0

LLM_TIMEOUT       = 120
RAGAS_MAX_WORKERS = 1

# ─────────────────────────────────────────────────────────────────────────────


def check_config():
    if "..." in TEST_SESSION_ID or TEST_SESSION_ID == "PASTE_YOUR_SESSION_ID_HERE":
        print("\nERROR: Set TEST_SESSION_ID at the top of evaluate.py")
        sys.exit(1)


def collect_rag_responses(session_id: str, questions: list) -> list:
    from rag import get_top_sources, chat_with_pdf

    collected = []
    for i, question in enumerate(questions, 1):
        print(f"\n  [{i}/{len(questions)}] {question}")

        try:
            sources = get_top_sources(session_id, question)
        except Exception as e:
            print(f"    ERROR in get_top_sources: {e}")
            continue

        contexts = [
            s["snippet"]
            for s in sources
            if s.get("passed_threshold", True) and s.get("snippet", "").strip()
        ] or [s["snippet"] for s in sources if s.get("snippet", "").strip()]

        if not contexts:
            print("    SKIP — no chunks retrieved")
            continue

        try:
            answer = "".join(chat_with_pdf(session_id, question, history=[])).strip()
        except Exception as e:
            print(f"    ERROR in chat_with_pdf: {e}")
            continue

        if not answer:
            print("    SKIP — empty answer")
            continue

        print(f"    OK — {len(contexts)} chunks, {len(answer)} chars")
        collected.append({
            "user_input":         question,
            "response":           answer,
            "retrieved_contexts": contexts,
            "reference":          "",
        })

    return collected


def _parse_retry_after(error_message: str) -> float:
    """
    Extract wait time from a Groq 429 message like:
      'Please try again in 14m49.056s.'
    Returns seconds as float, defaults to 60 if unparseable.
    """
    m = re.search(r'try again in\s+(?:(\d+)m)?(?:([\d.]+)s)?', error_message)
    if m:
        minutes = float(m.group(1) or 0)
        seconds = float(m.group(2) or 0)
        total   = minutes * 60 + seconds
        return total if total > 0 else 60.0
    return 60.0


def _build_paced_llm():
    """ChatGroq wrapped to sleep between calls AND honour 429 retry-after."""
    from langchain_groq import ChatGroq
    from langchain_core.language_models import BaseChatModel

    groq_keys = [k.strip() for k in os.getenv("GROQ_API_KEYS", "").split(",") if k.strip()]
    if not groq_keys:
        print("ERROR: GROQ_API_KEYS not set in .env")
        sys.exit(1)

    inner_llm = ChatGroq(
        api_key=groq_keys[0],
        model=GROQ_MODEL,
        temperature=0,
        max_retries=0,           # we handle retries ourselves
        request_timeout=LLM_TIMEOUT,
    )

    class PacedGroq(BaseChatModel):
        inner: ChatGroq
        delay: float = GROQ_CALL_DELAY

        @property
        def _llm_type(self) -> str:
            return "paced_groq"

        def _call_with_retry(self, fn, *args, **kwargs):
            max_attempts = 4
            for attempt in range(max_attempts):
                time.sleep(self.delay)
                try:
                    return fn(*args, **kwargs)
                except Exception as e:
                    msg = str(e)
                    if "429" in msg or "rate_limit" in msg.lower():
                        wait = _parse_retry_after(msg)
                        # Cap at 5 minutes — if longer, daily quota is gone
                        if wait > 300:
                            print(f"\n  STOP: Groq daily token limit exhausted.")
                            print(f"  Resets in ~{wait/60:.0f} min (UTC midnight).")
                            print(f"  Options:")
                            print(f"  1. Wait until tomorrow")
                            print(f"  2. Add a second GROQ key from another account")
                            print(f"  3. Reduce TEST_QUESTIONS to 3")
                            raise
                        print(f"\n  Rate limit — waiting {wait:.0f}s (attempt {attempt+1}/{max_attempts})...")
                        time.sleep(wait)
                    elif attempt == max_attempts - 1:
                        raise
                    else:
                        time.sleep(2 ** attempt)

        def _generate(self, messages, stop=None, run_manager=None, **kwargs):
            return self._call_with_retry(
                self.inner._generate, messages, stop=stop,
                run_manager=run_manager, **kwargs
            )

        async def _agenerate(self, messages, stop=None, run_manager=None, **kwargs):
            import asyncio
            loop = asyncio.get_event_loop()
            return await loop.run_in_executor(
                None,
                lambda: self._call_with_retry(
                    self.inner._generate, messages, stop=stop, **kwargs
                )
            )

    return PacedGroq(inner=inner_llm, delay=GROQ_CALL_DELAY)


def run_evaluation(data: list) -> dict:
    print(f"\n  Running RAGAS on {len(data)} questions...")
    print(f"  Model: {GROQ_MODEL} (low token usage)")
    print(f"  Mode: sequential (max_workers={RAGAS_MAX_WORKERS}), delay={GROQ_CALL_DELAY}s\n")

    try:
        from ragas import EvaluationDataset, evaluate, RunConfig
        from ragas.metrics import (
            Faithfulness,
            AnswerRelevancy,
            LLMContextPrecisionWithoutReference,
        )
        from ragas.llms import LangchainLLMWrapper
        from ragas.embeddings import LangchainEmbeddingsWrapper
        from langchain_huggingface import HuggingFaceEmbeddings
    except ImportError as e:
        print(f"ERROR importing RAGAS: {e}")
        sys.exit(1)

    dataset      = EvaluationDataset.from_list(data)
    ragas_llm    = LangchainLLMWrapper(_build_paced_llm())

    print("  Loading local embeddings (zero token cost)...")
    ragas_embeddings = LangchainEmbeddingsWrapper(
        HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
    )

    metrics = [
        Faithfulness(llm=ragas_llm),
        AnswerRelevancy(llm=ragas_llm, embeddings=ragas_embeddings),
        LLMContextPrecisionWithoutReference(llm=ragas_llm),
    ]

    run_cfg = RunConfig(
        timeout=LLM_TIMEOUT,
        max_workers=RAGAS_MAX_WORKERS,
        max_retries=3,
    )

    try:
        return evaluate(dataset=dataset, metrics=metrics, run_config=run_cfg)
    except Exception as e:
        print(f"\nERROR during RAGAS evaluation: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)


def _nanmean(values) -> float:
    """Mean of values ignoring NaN/None. Returns 0.0 if all failed."""
    try:
        import numpy as np
        arr = np.array(values, dtype=float)
        return float(np.nanmean(arr)) if not np.all(np.isnan(arr)) else 0.0
    except Exception:
        nums = [v for v in values
                if v is not None and not (isinstance(v, float) and math.isnan(v))]
        return sum(nums) / len(nums) if nums else 0.0


def save_and_print(data: list, result) -> None:
    metric_keys = {
        "faithfulness":      "faithfulness",
        "answer_relevancy":  "answer_relevancy",
        "context_precision": "llm_context_precision_without_reference",
    }

    print("\n  Per-question breakdown:")
    raw = {}
    for label, key in metric_keys.items():
        try:
            val = result[key]
            raw[label] = val
            if hasattr(val, '__iter__') and not isinstance(val, (str, float, int)):
                vals = list(val)
                for i, v in enumerate(vals):
                    ok = v is not None and not (isinstance(v, float) and math.isnan(v))
                    print(f"    {label}[q{i+1}]: {v:.4f}" if ok else f"    {label}[q{i+1}]: FAILED")
            else:
                print(f"    {label}: {val}")
        except Exception as ex:
            raw[label] = None
            print(f"    {label}: MISSING ({ex})")

    scores = {
        label: _nanmean(raw[label]) if raw[label] is not None else 0.0
        for label in metric_keys
    }

    output = {
        "session_id":          TEST_SESSION_ID,
        "num_questions":       len(data),
        "model_used":          GROQ_MODEL,
        "scores":              scores,
        "questions_evaluated": [d["user_input"] for d in data],
    }
    (Path(__file__).parent / "ragas_results.json").write_text(json.dumps(output, indent=2))

    def lbl(s):
        if s >= 0.8: return "Excellent"
        if s >= 0.6: return "Good"
        if s >= 0.4: return "Fair"
        return "Needs work"

    print("\n" + "="*58)
    print("  RAGAS RESULTS — ResearchOS PDF Chat")
    print("="*58)
    print(f"  Questions evaluated  : {len(data)}")
    print(f"  Model                : {GROQ_MODEL}")
    print("-"*58)
    print(f"  Faithfulness         : {scores['faithfulness']:.4f}   {lbl(scores['faithfulness'])}")
    print(f"  Answer Relevancy     : {scores['answer_relevancy']:.4f}   {lbl(scores['answer_relevancy'])}")
    print(f"  Context Precision    : {scores['context_precision']:.4f}   {lbl(scores['context_precision'])}")

    if any(v == 0.0 for v in scores.values()):
        print("\n  If scores are still 0: your Groq 100k/day quota is exhausted.")
        print("  Wait until UTC midnight or add a second API key.")

    print("="*58)
    print(f"\n  RESUME BULLET:")
    print(f"  Evaluated RAG pipeline with RAGAS ({len(data)}-question test set):")
    print(f"  faithfulness {scores['faithfulness']:.2f}, answer relevancy")
    print(f"  {scores['answer_relevancy']:.2f}, context precision {scores['context_precision']:.2f}")
    print("="*58)
    print(f"\n  Full results -> ragas_results.json")


# ── Main ──────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("="*58)
    print("  ResearchOS RAG Evaluator (RAGAS 0.2.x)")
    print("="*58)

    check_config()

    print(f"\n  Session  : {TEST_SESSION_ID[:20]}...")
    print(f"  Questions: {len(TEST_QUESTIONS)}")
    print(f"  Model    : {GROQ_MODEL}")

    print(f"\nStep 1 — Collecting RAG responses...")
    if CACHE_FILE.exists():
        print(f"  Using cached responses (delete eval_cache.json to refresh)")
        data = json.loads(CACHE_FILE.read_text())
        empty_ctx = sum(1 for d in data if not d.get("retrieved_contexts"))
        if empty_ctx:
            print(f"\n  WARNING: {empty_ctx} entries have no retrieved_contexts.")
            print("  Delete eval_cache.json and re-run.\n")
        print(f"  Loaded {len(data)} pairs.")
    else:
        data = collect_rag_responses(TEST_SESSION_ID, TEST_QUESTIONS)
        if not data:
            print("\nERROR: No data collected. Check session_id and backend.")
            sys.exit(1)
        CACHE_FILE.write_text(json.dumps(data, indent=2))
        print(f"\n  Collected {len(data)} pairs -> eval_cache.json")

    print("\nStep 2 — Running RAGAS evaluation...")
    result = run_evaluation(data)
    save_and_print(data, result)
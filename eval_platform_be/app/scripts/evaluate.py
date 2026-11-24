"""LLM-as-judge over one completed run.

The judge scores each metric with evidence; the overall score and the pass flag
are computed HERE, from those scores. An LLM's holistic number drifts between
runs in a way per-dimension judgements do not, and an average is arithmetic - the
same split Sqouts' own assessment engine uses.
"""

import json

from .llm_brain import Brain, Verdict
from .local_scripts import *
PASS_THRESHOLD = 3.5


def aggregate(verdict: Verdict, threshold: float = PASS_THRESHOLD) -> dict:
    """Verdict -> the full result. Pure, so it is testable without an API key."""
    scores = [m.score for m in verdict.metric_scores]
    overall = round(sum(scores) / len(scores), 2) if scores else 0.0
    return {
        "overall_score": overall,
        "passed": bool(scores) and overall >= threshold and not verdict.critical_failures,
        "metric_scores": {m.metric: m.score for m in verdict.metric_scores},
        "metric_evidence": {m.metric: m.evidence for m in verdict.metric_scores},
        "critical_failures": [f.model_dump() for f in verdict.critical_failures],
        "strengths": verdict.strengths,
        "weaknesses": verdict.weaknesses,
        "overall_feedback": verdict.overall_feedback,
        "most_important_improvement": verdict.most_important_improvement,
    }


async def start_evaluate(role: str, transcript, metrics, plain: list=None, events: list=None, 
                         threshold: float = PASS_THRESHOLD) -> dict:
    ev = Brain()
    ev.set_evaluate_system_prompt(json.dumps(metrics, indent=2, ensure_ascii=False))

    # # Accept either the live list of (speaker, text) tuples or the dicts loaded
    # # back from transcript.json, so a run can be re-judged from files later.
    # rows = [
    #     t if isinstance(t, dict) else {"speaker": t[0], "text": t[1]}
    #     for t in transcript
    # ]

    if events:
        timeline = build_timeline(events, transcript, plain)
    else:
        timeline = transcript_timeline(transcript)
        
    payload = f"""
        <ai_role>
        {role}
        </ai_role>

        <conversation>
        {"\n".join(timeline)}
        </conversation>
        evaluate this result
        """

        # 4. event list:
        # {json.dumps(events, indent=2)}

    verdict, cost = await ev.judge(payload)
    result = aggregate(verdict, threshold)
    # print(json.dumps(result, indent=2))
    return result, cost
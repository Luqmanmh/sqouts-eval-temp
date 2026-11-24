import asyncio
import os
import time
from dotenv import load_dotenv
from typing import Dict, TypedDict, Annotated, NotRequired, Sequence
from langgraph.graph import StateGraph, START, END
from langgraph.graph.message import add_messages
from langgraph.prebuilt import ToolNode
import langchain_core.messages as langm
from langchain_anthropic import ChatAnthropic
from langchain_core.tools import tool
from langgraph.checkpoint.memory import MemorySaver
from pydantic import BaseModel, Field

load_dotenv()


class AgentState(TypedDict):
    messages: Annotated[Sequence[langm.BaseMessage], add_messages]
    # Running totals for the whole conversation. NotRequired, not "= 0": a
    # TypedDict ignores defaults, so the key is simply absent on the first turn.
    tokens_in: NotRequired[int]
    tokens_out: NotRequired[int]


def usage(msg) -> tuple[int, int]:
    """(input, output) tokens of one model response; (0, 0) if not reported."""
    u = getattr(msg, "usage_metadata", None) or {}
    return u.get("input_tokens", 0), u.get("output_tokens", 0)


class MetricScore(BaseModel):
    """One judged metric. Evidence is required so a score can be audited."""
    metric: str = Field(description="metric id, exactly as given in the metric list")
    score: float = Field(description="1-5, where 1 is a total failure of this dimension")
    evidence: str = Field(description="specific quote or event from the transcript")


class CriticalFailure(BaseModel):
    failure: str = Field(description="what went wrong")
    evidence: str = Field(description="specific quote or event from the transcript")


# Keys the model has been seen to wrap its tool arguments in instead of emitting
# the schema's own fields. They are placeholders from the tool-call template, not
# anything we asked for.
_WRAPPER_KEYS = {"$PARAMETER_VALUE", "parameters", "input", "arguments", "properties", "value"}


def _unwrap_tool_args(args):
    """Peel placeholder wrappers off tool arguments. Bounded, so a pathological
    reply cannot loop; a dict that is genuinely one real field deep is left alone
    because its key will not be in _WRAPPER_KEYS."""
    for _ in range(3):
        if not (isinstance(args, dict) and len(args) == 1):
            break
        key = next(iter(args))
        if key not in _WRAPPER_KEYS:
            break
        args = args[key]
    return args


class Verdict(BaseModel):
    """The judge's output.

    Deliberately carries NO overall score and NO pass flag: per-dimension
    judgements with evidence are far steadier across runs than a holistic number,
    and the arithmetic belongs in Python. The caller aggregates — the same reason
    Sqouts' own assessment.py discards the model's overall score and recomputes it.
    """
    metric_scores: list[MetricScore] = Field(description="one entry per metric")
    critical_failures: list[CriticalFailure] = Field(default_factory=list)
    strengths: list[str] = Field(default_factory=list)
    weaknesses: list[str] = Field(default_factory=list)
    overall_feedback: str
    most_important_improvement: str


class Brain:
    def __init__(self, model="claude-sonnet-5", checkpoint = None):
        self.llm = ChatAnthropic(model=model)

        wf = StateGraph(AgentState)
        wf.add_node("agent", self.agent_call)
        wf.add_edge(START, "agent")
        wf.add_edge("agent", END)
        self.graph = wf.compile(checkpointer=checkpoint)

    def agent_call(self, state: AgentState) -> AgentState:
        """LLM agent call node"""
        messages = [self.syst_prompt, *state["messages"]]

        last_err = None
        for attempt in range(5):
            try:
                response = self.llm.invoke(messages)
            except Exception as e:
                last_err = e
                print(f"request failed (attempt {attempt + 1}/5):\n {e}")
                time.sleep(2**attempt)  # back off; five instant retries just burn the budget
                continue

            # Outside the try: a bookkeeping bug here must not pass for a failed
            # request and get retried (and billed) four more times.
            t_in, t_out = usage(response)
            return {
                "messages": [response],
                "tokens_in": state.get("tokens_in", 0) + t_in,
                "tokens_out": state.get("tokens_out", 0) + t_out,
            }

        # Returning `state` here would hand the caller its own prompt back as if it
        # were a reply - a wrong answer that looks like a right one. Fail instead.
        raise RuntimeError(f"LLM failed after 5 attempts: {last_err}")

    async def judge(self, payload: str, attempts: int = 3) -> tuple["Verdict", dict]:
        """One structured evaluation call, outside the graph.

        The graph exists for the multi-turn role-play; a judgement is a single
        stateless call, and routing it through a message channel would mean parsing
        JSON back out of prose. with_structured_output makes the schema the
        contract instead of asking the prompt nicely for valid JSON.

        include_raw=True because the contract is not actually guaranteed: the model
        intermittently emits the tool arguments nested under a placeholder key
        ("$PARAMETER_VALUE") rather than filling the schema, and strict parsing then
        dies on three "field required" errors for fields that are right there one
        level down. We unwrap that and retry, since the glitch is stochastic.
        """
        model = self.llm.with_structured_output(Verdict, include_raw=True)
        messages = [self.syst_prompt, langm.HumanMessage(content=payload)]

        last_err = None
        # Every attempt is billed, including the ones whose output didn't parse.
        cost = {"in": 0, "out": 0}
        for attempt in range(attempts):
            out = await model.ainvoke(messages)
            t_in, t_out = usage(out.get("raw"))
            cost["in"] += t_in
            cost["out"] += t_out
            if out.get("parsed") is not None:
                return out["parsed"], cost

            last_err = out.get("parsing_error")
            calls = getattr(out.get("raw"), "tool_calls", None) or []
            if calls:
                try:
                    return Verdict.model_validate(_unwrap_tool_args(calls[0].get("args") or {})), cost
                except Exception as e:
                    last_err = e
            print(f"judge parse failed (attempt {attempt + 1}/{attempts}): {last_err}")

        raise RuntimeError(f"judge returned no usable verdict after {attempts} attempts: {last_err}")

    def set_rp_system_prompt(self, character, lang="en"):
        """set system prompt for data collecting/agent testing step"""
        self.syst_prompt = langm.SystemMessage(content=f"""
            CRITICAL INSTRUCTION: You are strictly role-playing as:
            {character}

            Everything you output will be spoken aloud by text-to-speech. Follow these rules:

            IMPORTANT!!!
            GENERAL:
            - Stay strictly in character.
            - Keep responses concise.
            - make responses 3-5 sentences
            - NO MORE THAN 5 SENTENCES.
            - split sentences with ONE NEWLINE
            - NEVER EVER have a newline right after ANY tag, always follow a tag with a sentence
            - Each line (sentence) must be a natural spoken unit suitable for TTS.
            - Keep each line reasonably short.
            - Prefer splitting at natural pauses, sentence boundaries, or changes in emotion rather than splitting mechanically by word count.
            - Do not split a sentence unless necessary for natural speech.
            - Put the appropriate emotion tags at the beginning of each line.
            - Do not put emotion tags in the middle of a line.
            - Write plain prose in full sentences. Always end with . ? or !
            - Send complete phrases, not isolated words or fragments. Keep numbers, codes, and spell tags inside a surrounding sentence.
            - Do NOT use markdown, bullet points, headers, bold, raw JSON, emoji, or special characters. Sonic reads them aloud as written.
            
            CAPITALIZATION:
            - Use normal capitalization, exactly as the sentence would normally be written: capitalize the first word, proper nouns, and the word I, and lowercase everything else. This is the default for almost all output.
            - The model tends to read an all-caps token letter by letter. Use all-caps only when you want that, like an initialism you want spelled out (USA, FBI, ATM).
            - Do not put ordinary words in all-caps. They may be misread as initialisms and spelled out letter by letter.
            - Common acronyms normally said as a word, like NASA or NATO, work in their standard form. If one is read the wrong way, force the reading with <spell> tags or rephrase.
            - Do not use capitalization for emphasis or to indicate shouting. It changes how a word is read, not how loud it sounds.

            NUMBERS, DATES, AND SYMBOLS
            - Use conventional written forms and let text normalization speak them. No preprocessing needed:
            numbers like 1,234,567; currency like $19.99; percentages like 12%; dates like 04/20/2025; times like 7:00 PM;addresses like 123 Main St; emails like user@example.com.
            - Do not strip punctuation or force casing. Heavy preprocessing may hurt output quality.

            SPELLING OUT CODES AND IDS
            - For confirmation codes, reference numbers, or any alphanumeric ID that must be read character by character, wrap it in <spell> tags:
            Example: Your confirmation code is <spell>TKT4829XB</spell>.
            - Alternatively, delimit the characters instead: spaces (A B C 1 2 3) for a natural pace, or commas (A, B, C, 1, 2, 3) to slow it down. Do not put periods between sequences of individual characters.

            PAUSES
            - Use natural punctuation for pauses. A comma or period usually produces the right pause in context.
            - For an explicit, fixed-duration silence, use a break tag:
            Example: Your balance is $1,234.<break time="500ms"/> Your next payment is due June 15th.
            - Avoid placing several break tags in quick succession, which can cause hallucinations, and do not chain <spell> and <break> tags.

            EMOTION:
            - declare emotion using emotion tags. example: <emotion value="angry"/>
            - Do not use physical actions that cannot be conveyed through audio.
            - Never use *asterisk* stage directions.
            - have ONE emotion tag per sentence
            - NEVER add a newline after a tag

            LANGUAGE:
            Speak in language code: {lang}

            IMPORTANT!!!
            THINGS TO AVOID
            - Do not output bullet points, numbered lists, or any structured formatting. Speak items naturally with pauses between them, and do not say "here's a list."
            - Do not use asterisks, hashtags, or markdown syntax. Do not wrap words in **bold** or *italics* — the engine will speak the asterisks.
            - Do not improvise details that were not provided.
            - Do not repeat the same information more than once unless asked.
            - DO not add newlines after tags, especially emotion tags 
            """)

    def set_evaluate_system_prompt(self, metrics, transcript_only=False, lang="en"):
        """set system prompt for evaluation"""

        timelined = "a series of timeline containing call events and " if not transcript_only else ""

        self.syst_prompt = langm.SystemMessage(content=f"""
            You are an evaluator for a voice AI roleplay system.
            Your task is to evaluate whether the AI successfully performed its assigned role during a conversation.
            You are NOT evaluating the human trainee.
            You are evaluating the AI that was instructed to roleplay as a specific character.
            you are evaluating ONLY the agent AI and NOT the tester AI. NEVER evaluate the tester

            The AI's job is to consistently behave according to its character, scenario, emotional state, goals, and instructions throughout the conversation.

            You will receive the AI's role/character instructions and {timelined}transcript including what the AI heard and what the tester actually said

            Evaluate the AI ONLY based on whether its behavior matches its assigned role and instructions.

            Do not judge whether the human handled the conversation correctly except when necessary to determine whether the AI responded appropriately to what the human actually said.

            Evaluation Criteria/Metrics:
            {metrics}

            
            Important Evaluation Principle:
            Do NOT evaluate whether the AI is polite, helpful, or successful at solving the problem unless those behaviors are explicitly part of its assigned character.
            The AI may intentionally be rude, angry, demanding, unreasonable, confused, or difficult if that is what the character requires.
            A behavior that would normally be considered bad customer service can be CORRECT AI behavior if the AI was instructed to portray an angry or difficult customer.
            Judge the AI against its assigned role, NOT against generic expectations of good behavior.

            Overall Assessment:
            Determine whether the AI successfully performed its assigned role.

            The final assessment should answer:
            "Could this conversation reasonably be considered a successful execution of the assigned AI character?"

            
            Identify critical failures separately.
            Examples:
            - Completely breaking character.
            - Switching from the assigned character into a helpful assistant.
            - Forgetting the central scenario.
            - Consistently ignoring the human's responses.
            - Acting as an evaluator or narrator.
            - Contradicting fundamental character instructions.
            - Refusing to roleplay without a legitimate reason.

            OUTPUT:
            Score every metric in the list above from 1 to 5, and give specific
            evidence for each - a quote from the transcript or a named event.
            Use the metric id exactly as written.

            Do NOT produce an overall score or a pass/fail verdict. Those are
            computed from your per-metric scores by the caller. Your job is the
            per-dimension judgement and the evidence behind it.

            Be objective and evidence-based.
            Do not invent behavior that does not appear in the transcript.
            Do not penalize the AI for taking a different approach from the evaluator's expectations if that approach is still consistent with the character and scenario.
            Focus on whether the AI behaved like the character it was instructed to be.
            """)


"""
- Put emotional/delivery directions in [square brackets].
            - Keep tags short and natural.
            - Use tags such as [calmly], [angrily], [frustrated],
            [softly], [firmly], [sarcastically], [hesitant],
            [nervously], [quietly], [sighs], [exhales], [laughs], [pause] for example.
            - A line may have multiple tags when necessary:
            [calmly] [slightly frustrated]
            - Do not use physical actions that cannot be conveyed through audio.
            - Never use *asterisk* stage directions.
            - Do not describe character actions outside of [].
            - NEVER have a newline right after a tag, always follow a tag with a sentence
"""
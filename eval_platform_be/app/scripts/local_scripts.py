from difflib import SequenceMatcher
import av
import json
import re

tag_ex = re.compile(r"<[^>]*>|\[[^\]]*\]")    # <emotion .../>, <break/>, <spell>, [sighs]

def to_word(s: str) -> list[str]:
    return tag_ex.sub(" ", s or "").lower()

def add_plain(chat:list, plain:list):
    fixed_chat = chat
    fixed_plain = [to_word(p) for p in plain]
    plain_index = 0
    for text in fixed_chat:
        if text["speaker"] == "ai":
            continue
        if not plain:
            text["plain"] = None
            continue

        # curr = to_word()
        if plain_index + 1 < len(fixed_plain) and (
            SequenceMatcher(None, text["text"].lower(), fixed_plain[plain_index]).ratio()
            < SequenceMatcher(
                None, text["text"].lower(), fixed_plain[plain_index + 1]
            ).ratio()
        ):
            plain_index += 1

        text["plain"] = plain_index

    return fixed_chat

def connect_chat(chat:list, plain:list):
    """turn split sqouts voice ai stt readings into one text and connecting the real text to it"""
    chat = chat or []
    plain = [p.lower() for p in (plain or [])]

    fixed_chat = []
    for clip in chat:
        if fixed_chat and clip["speaker"] == "user" and fixed_chat[-1]["speaker"] == "user":
            fixed_chat[-1]["text"] += f" {clip["text"]}"
        else:
            fixed_chat.append(clip)

    if plain:
        fixed_chat = add_plain(fixed_chat, plain)

    return fixed_chat


def timeline_items(events, transcript, plain) -> list[dict]:
    """Raw events -> what happened in the call, one dict per moment.

    Every item has `t` (seconds since connect) and `kind`:
      bot_start   Sqouts starts a line. `flag` is "nudge" (tester had gone quiet
                  for `silent` seconds) or "interrupt" (tester was talking)
      bot_stop    Sqouts stops
      bot_said    a sentence Sqouts finished saying (`text`)
      tester_start  the tester starts; `gap` is seconds since Sqouts stopped
      heard       what Sqouts' speech-to-text made of the tester (`text`)
      sent        what the tester actually generated for that turn (`text`)
      held        the tester was busy and held a turn
      cut         the tester was cut off mid-reply (`text` = what got said)
      sqouts_error  an error Sqouts reported over RTVI (`text`)
      error       the run itself failed (`text`)
    `rec` is the position in the recording, in seconds, when known.
    """
    turns = [c for c in connect_chat(transcript or [], plain) if c["speaker"] == "user"]
    turn_i, shown = 0, set()
    plain = plain or []

    items, last_bot_stop, tester_speaking = [], None, False

    def add(e, kind, **kw):
        item = {"t": e.get("t", 0), "kind": kind, **kw}
        if "pts" in e:
            item["rec"] = round(e["pts"] / 48000, 2)
        items.append(item)

    for e in events or []:
        t, typ, ev = e.get("t", 0), e.get("type"), e.get("ev")
        data = e.get("data") or {}
        if typ == "bot-started-speaking":
            if tester_speaking:
                add(e, "bot_start", flag="interrupt")
            elif last_bot_stop is not None:
                add(e, "bot_start", flag="nudge", silent=t - last_bot_stop)
            else:
                add(e, "bot_start")
        elif typ == "bot-stopped-speaking":
            last_bot_stop = t
            add(e, "bot_stop")
        elif typ == "bot-output" and data.get("spoken_status") == "completed":
            add(e, "bot_said", text=data["text"])
        elif typ == "user-started-speaking":
            tester_speaking = True
            add(e, "tester_start", gap=(t - last_bot_stop) if last_bot_stop else None)
            last_bot_stop = None
        elif typ == "user-stopped-speaking":
            tester_speaking = False
        elif typ == "user-transcription" and data.get("final"):
            heard = data.get("text", "")
            add(e, "heard", text=heard)

            # Move to the merged turn containing this clip.
            while turn_i + 1 < len(turns) and heard not in turns[turn_i]["text"]:
                turn_i += 1

            # One plain text covers many clips, so show it only once.
            idx = turns[turn_i].get("plain") if turns else None
            if idx is not None and idx not in shown and idx < len(plain):
                shown.add(idx)
                add(e, "sent", text=plain[idx])
        elif typ == "error":
            add(e, "sqouts_error", text=data.get("error", ""))
        elif ev == "user_turn_held":
            add(e, "held")
        elif ev == "user_answer_cut":
            add(e, "cut", text=e.get("said", ""))
        elif ev in ("error", "complete_failed"):
            add(e, "error", text=e.get("error", ev), event=ev)
        elif ev == "connection_state":
            if e.get("state") == "connecting":
                add(e, "state_connecting")
            elif e.get("state") == "connected":
                add(e, "state_connected")
        elif typ == "bot-ready" and items[-1] != "bot_ready":
            add(e, "bot_ready")
        elif typ == "client_ready" and items[-1] != "client_ready":
            add(e, "client_ready")
        elif typ == "bot-llm-started":
            add(e, "bot_started_thinking")
        elif typ == "bot-llm-stopped":
            add(e, "bot_stopped_thinking")

    return items


def build_timeline(events, transcript, plain) -> list[str]:
    """The timeline as text lines for the judge."""
    lines = []
    for it in timeline_items(events, transcript, plain):
        t, kind = it["t"], it["kind"]
        if kind == "bot_start":
            note = ""
            if it.get("flag") == "interrupt":
                note = "  INTERRUPTS tester"
            elif it.get("flag") == "nudge":
                note = f"  NUDGE, tester silent {it['silent']:.1f}s"
            lines.append(f"[{t:7.1f}] SQOUTS starts{note}")
        elif kind == "bot_stop":
            lines.append(f"[{t:7.1f}] SQOUTS stops")
        elif kind == "bot_said":
            lines.append(f'[{t:7.1f}] SQOUTS   "{it["text"]}"')
        elif kind == "tester_start":
            gap = f"  ({it['gap']:.1f}s after Sqouts stopped)" if it.get("gap") is not None else ""
            lines.append(f"[{t:7.1f}] TESTER starts{gap}")
        elif kind == "heard":
            lines.append(f'[{t:7.1f}] SQOUTS heard: "{it["text"]}"')
        elif kind == "sent":
            lines.append(f'          TESTER sent:  "{it["text"]}"')
        elif kind == "held":
            lines.append(f"[{t:7.1f}] tester busy, held this turn to answer next")
        elif kind == "error":
            lines.append(f"[{t:7.1f}] {it['event']}")
        elif kind == "state_connecting":
            lines.append(f"[{t:7.1f}] call connecting")
        elif kind == "state_connected":
            lines.append(f"[{t:7.1f}] call connected")
        elif kind == "bot_ready":
            lines.append(f"[{t:7.1f}] SQOUTS Ready")
        elif kind == "client_ready":
            lines.append(f"[{t:7.1f}] TESTER Ready")
        elif kind == "bot_started_thinking":
            lines.append(f"[{t:7.1f}] SQOUTS is thinking (llm)")
        elif kind == "bot_stopped_thinking":
            lines.append(f"[{t:7.1f}] SQOUTS stopped thinking (llm)")

    return lines


def get_plain(transcript:list):
    chat = transcript or []

    plain = []

    for clip in chat:
        if clip["speaker"] == "user" and plain and plain[-1] and SequenceMatcher(None, clip["plain"].lower(), plain[-1].lower()).ratio() > 0.8:
            continue
        else:
            plain.append(clip["plain"])

    plain = [x for x in plain if x != ""]
    return plain

def transcript_timeline(transcript:list):
    end=[]
    for lines in transcript:
        if lines["speaker"] == "user":
            text = f"{lines["timestamp"] or ""} - AI heard {lines["speaker"]}: {lines["text"]}"
            if lines["plain"]:
                text += f"\n TESTER sent: {lines["plain"]}"
            end.append(text)
        else:
            text = f"{lines["timestamp"] or ""} - AI said: {lines["text"]}"
            end.append(text)

    return end

def wav_to_mp3(src: str, dst: str, bitrate: int = 96_000) -> None:
    with av.open(src) as inp, av.open(dst, "w", format="mp3") as out:
        stream = out.add_stream("libmp3lame", rate=48000, layout="stereo")
        stream.bit_rate = bitrate
        for frame in inp.decode(audio=0):
            frame.pts = None
            for pkt in stream.encode(frame):
                out.mux(pkt)
        for pkt in stream.encode(None):
            out.mux(pkt)

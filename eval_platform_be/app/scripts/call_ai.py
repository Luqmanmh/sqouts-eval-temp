from __future__ import annotations

import asyncio
import fractions
import json
import time
import traceback
import wave
import uuid
import re
from pathlib import Path
from types import SimpleNamespace
from typing import Optional

import av
import httpx
import numpy as np
from math import ceil
from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.mediastreams import MediaStreamTrack

# from langchain_core.tools import tool
from langgraph.checkpoint.memory import MemorySaver
import langchain_core.messages as langm
from .llm_brain import Brain
from .speech import cast_tts
from .evaluate import start_evaluate
from .local_scripts import wav_to_mp3

from datetime import datetime, timezone

from sqlalchemy import update
from sqlalchemy.orm import selectinload

from app import config, files
from app.database import SyncSessionLocal
from app.models import Run, RunStatus, TestCase

# WebRTC/Opus is 48kHz. The server resamples down to 16k for VAD/STT itself, so
# the merit side always speaks 48k mono regardless of the source file.
RATE = 48000
CHANNELS = 1
FRAME_MS = 20
SAMPLES_PER_FRAME = RATE * FRAME_MS // 1000  # 960

# The server treats a data channel that has gone quiet for 3s as disconnected
# (SmallWebRTCConnection.is_connected), but ONLY once it has seen a first ping.
# 1s leaves a wide margin; stopping the loop mid-call would drop the session.
PING_INTERVAL_SEC = 1.0

RTVI_LABEL = "rtvi-ai"
# Report the protocol the server itself speaks. A 1.x version here would opt into
# the deprecated bot-output format and silence the word-level progress messages.
RTVI_PROTOCOL_VERSION = "2.0.0"


# ---------------------------------------------------------------------------
# Two-sided recording
# ---------------------------------------------------------------------------


def _remote_timeline(frames: list, total_samples: int) -> np.ndarray:
    """Lay remote frames onto our own track's sample timeline, silence in the gaps.

    Each frame carries the position it was given on arrival (see drain()), already
    in our sample clock, so it goes straight in. The remote pts is NOT used: it
    stops advancing while Sqouts is quiet and can restart, so placing by it pulled
    every later line earlier and let later frames overwrite earlier speech.
    """
    out = np.zeros(total_samples, dtype=np.int16)
    for pos, samples in frames:
        if pos >= total_samples:
            continue
        end = min(pos + len(samples), total_samples)
        out[pos:end] = samples[: end - pos]
    return out


def write_stereo_wav(path: str, own_frames: list, remote_frames: list) -> str:
    """One WAV, bot on the LEFT channel, Sqouts on the RIGHT.

    Stereo rather than a mixdown on purpose: with overlapping speech — which a
    slow merit reliably produces, since the agent nudges straight over it —
    separate channels are the difference between a diagnosable recording and a
    muddle. Sqouts persists no audio of its own anywhere, so this file is the only
    record of the call that will ever exist.
    """
    own = np.concatenate(own_frames) if own_frames else np.zeros(0, dtype=np.int16)
    remote = _remote_timeline(remote_frames, len(own))
    n = min(len(own), len(remote))
    stereo = np.stack([own[:n], remote[:n]], axis=-1)

    Path(path).parent.mkdir(parents=True, exist_ok=True)
    with wave.open(path, "wb") as w:
        w.setnchannels(2)
        w.setsampwidth(2)
        w.setframerate(RATE)
        w.writeframes(stereo.tobytes())
    return f"{n / RATE:.1f}s"


# ---------------------------------------------------------------------------
# merit audio (probably no need)
# ---------------------------------------------------------------------------


class ConnectionStream(MediaStreamTrack):
    """Outgoing audio track: silence until told to speak, then one answer.

    Silence between answers is not padding — it is what lets VAD see a real turn
    boundary. A track that streamed answers back to back would never produce the
    stopped-speaking event the aggregator needs to finalize a user turn.
    """

    kind = "audio"

    def __init__(self, tap: list | None = None):
        super().__init__()
        self._pending: Optional[np.ndarray] = None
        self._cursor = 0
        self._pts = 0
        self._speaking = asyncio.Event()
        self._tap = tap
        self._start: Optional[float] = None

    def say(self, samples: np.ndarray) -> None:
        self._pending = samples
        self._cursor = 0
        self._speaking.set()

    def cut(self) -> None:
        """Cut the current line off at the next frame."""
        self._pending = None
        self._cursor = 0
        self._speaking.clear()


    @property
    def is_speaking(self) -> bool:
        return self._speaking.is_set()

    @property
    def pts(self) -> int:
        """Samples emitted so far — the index into the stereo recording."""
        return self._pts

    async def wait_until_done(self) -> None:
        while self._speaking.is_set() and self.readyState == "live":
            await asyncio.sleep(0.05)

    async def recv(self):
        # Pace the track in real time; recv() is the clock the encoder follows.
        # Sleep until this frame is due rather than a fixed 20ms: every sleep runs
        # a little long (badly so on Windows), and fixed sleeps add that up, so the
        # track fell ~19% behind real time.
        if self._start is None:
            self._start = time.monotonic()
        wait = self._start + self._pts / RATE - time.monotonic()
        if wait > 0:
            await asyncio.sleep(wait)

        block = np.zeros(SAMPLES_PER_FRAME, dtype=np.int16)
        if self._pending is not None:
            chunk = self._pending[self._cursor : self._cursor + SAMPLES_PER_FRAME]
            block[: len(chunk)] = chunk
            self._cursor += SAMPLES_PER_FRAME
            if self._cursor >= len(self._pending):
                self._pending = None
                self._cursor = 0
                self._speaking.clear()

        frame = av.AudioFrame.from_ndarray(
            block.reshape(1, -1), format="s16", layout="mono"
        )
        frame.sample_rate = RATE
        frame.pts = self._pts
        frame.time_base = fractions.Fraction(1, RATE)
        self._pts += SAMPLES_PER_FRAME
        if self._tap is not None:
            self._tap.append(block.copy())
        return frame


# ---------------------------------------------------------------------------
# Control plane (the same calls the browser makes)
# ---------------------------------------------------------------------------


class InterviewRun:
    def __init__(self, base_url: str, token: str):
        self.base = base_url.rstrip("/")
        self.token = token
        self.http = httpx.AsyncClient(timeout=20.0)
        self.session_id: str = ""

    async def close(self):
        await self.http.aclose()

    async def resolve(self) -> dict:
        r = await self.http.get(f"{self.base}/s/{self.token}")
        r.raise_for_status()
        info = r.json()
        if info.get("expired"):
            raise RuntimeError("share link has expired")
        if info.get("inactive"):
            raise RuntimeError("agent is not accepting responses")
        return info

    async def create_session(self, name: str, email: str) -> str:
        # Vary the email per run: _find_or_create_walkin dedups on it, so a fixed
        # address would pile every run onto one merit row.
        r = await self.http.post(
            f"{self.base}/sessions/from_link",
            json={"token": self.token, "name": name, "email": email},
        )
        r.raise_for_status()
        self.session_id = r.json()["session_id"]
        return self.session_id

    async def start(self) -> None:
        r = await self.http.post(
            f"{self.base}/interview/sessions/{self.session_id}/start"
        )
        r.raise_for_status()

    async def rtc_token(self) -> str:
        r = await self.http.post(
            f"{self.base}/interview/sessions/{self.session_id}/connect"
        )
        r.raise_for_status()
        return r.json()["rtc_token"]

    async def signal(self, sdp: str, sdp_type: str, rtc_token: str) -> dict:
        r = await self.http.post(
            f"{self.base}/interview/sessions/{self.session_id}/rtc/offer",
            json={"sdp": sdp, "type": sdp_type},
            headers={"X-RTC-Token": rtc_token},
        )
        r.raise_for_status()
        return r.json()

    async def complete(self) -> None:
        r = await self.http.post(
            f"{self.base}/interview/sessions/{self.session_id}/complete"
        )
        r.raise_for_status()


class SqoutsSession:
    """Share link -> session -> start -> rtc token -> /rtc/offer."""
    def __init__(self, args):
        self.ctl = InterviewRun(args.base_url, args.token)
        self.args = args
        self.rtc = ""

    async def prepare(self, run_uid):
        info = await self.ctl.resolve()
        print(f"link ok: mode={info.get('mode')} share_mode={info.get('share_mode')}")
        tag = run_uid.hex[:8]
        await self.ctl.create_session(self.args.name.replace("{uid}", tag),
                                      self.args.email_prefix.replace("{uid}", tag))
        await self.ctl.start()
        self.rtc = await self.ctl.rtc_token()

    async def offer(self, sdp, sdp_type) -> dict:
        return await self.ctl.signal(sdp, sdp_type, self.rtc)

    async def finish(self):
        await self.ctl.complete()

    async def close(self):
        await self.ctl.close()


class PipecatSession:
    """Any Pipecat bot on SmallWebRTCTransport: one POST with the offer."""
    def __init__(self, args):
        self.url = args.base_url          # e.g. http://localhost:7860/api/offer
        headers = {"Authorization": f"Bearer {args.token}"} if args.token else {}
        self.http = httpx.AsyncClient(timeout=20.0, headers=headers)

    async def prepare(self, run_uid):
        pass                               # nothing to set up

    async def offer(self, sdp, sdp_type) -> dict:
        r = await self.http.post(self.url, json={"sdp": sdp, "type": sdp_type})
        r.raise_for_status()
        return r.json()                    # {"sdp", "type", "pc_id"}

    async def finish(self):
        pass                               # no "complete" step

    async def close(self):
        await self.http.aclose()

# ---------------------------------------------------------------------------
# The run
# ---------------------------------------------------------------------------


async def run(args, run_uid: uuid.UUID, rec: dict) -> dict:
    """Make the call and judge it. Returns what run_test_case saves.

    `args` carries what the CLI flags used to: token, base_url, name,
    email_prefix, character, language_code, voice_id, record, max_seconds,
    evaluate_role, metrics, pass_threshold.
    """
    # global t0, events
    # Module-level so log() can reach it; reset so a worker that handles
    # several runs doesn't carry one run's events into the next.
    t0 = None
    events = rec["events"]
    transcript: list[tuple[str, str]] = rec["transcript"]
    plain = rec["plain"]
    # Lives in rec, not here, so a run that fails still saves what it spent.
    cost = rec["cost"]

    def log(ev, on_pts, **kw):
        nonlocal events
        events.append(
            {"t": round(time.monotonic() - t0, 4), "pts": on_pts, "ev": ev, **kw}
        )

    t0 = time.monotonic()

    ai_config = {"configurable": {"thread_id": run_uid}}
    check = MemorySaver()
    agent = Brain(checkpoint=check)
    agent.set_rp_system_prompt(character=args.character, lang=args.language_code)

    if args.kind == "SQOUTS":
        session = SqoutsSession(args)
    else:
        session = PipecatSession(args)

    
    bot_segments: dict[int, str] = {}
    last_line: dict = {"at": -1, "segments": {}}
    bot_speaking = False
    bot_turns = 0
    finished = asyncio.Event()

    generating = False
    pending_turn: Optional[str] = None
    last_activity = time.monotonic()

    # handling starting
    started = False          

    def mark_started():
        nonlocal started
        if not started:
            started = True
            # log("conversation_started", merit.pts)
        touch()

    # handling nudges
    interrupted = False
    cut_note = ""

    def interrupt():
        nonlocal interrupted
        if generating:
            interrupted = True
            merit.cut()

    # if starting first
    opened = False
    OPENING = ("(The call has just connected and the other side is silent. "
            "You speak first: greet them and say why you're calling.)")

    def open_call(reason: str):
        nonlocal opened
        if opened or bot_turns > 0:
            return
        opened = True
        log("tester_opens", merit.pts, reason=reason)
        mark_started()
        asyncio.ensure_future(next_answer(OPENING))

    # for idle detection
    def touch():
        nonlocal last_activity
        last_activity = time.monotonic()

    try:
        await session.prepare(run_uid)

        pc = RTCPeerConnection()
        # Tap the track rather than the TTS output: recv() emits every 20ms frame
        # that actually goes on the wire, silence included, so the capture shares a
        # timeline with the remote side and shows what the agent really heard —
        # including replies that say() truncated mid-word.
        own_frames: list = []
        remote_frames: list = []
        merit = ConnectionStream(tap=own_frames if args.record else None)
        pc.addTrack(merit)

        channel = pc.createDataChannel("rtvi")

        @pc.on("track")
        def on_track(track):
            if track.kind != "audio":
                return

            # The incoming track MUST be drained whether or not we keep it: an
            # unconsumed track backs its queue up. With --record we also retain the
            # frames, which is why MediaRecorder is not used here — it writes its own
            # file on its own opaque clock, and that cannot be aligned with ours.
            async def drain():
                # Opus negotiates 48000/2, so frames may arrive stereo; normalise to
                # 48k mono so this channel can sit alongside our own.
                resampler = av.AudioResampler(format="s16", layout="mono", rate=RATE)
                keep = args.record is not None
                # Where the next remote sample goes, in our own track's samples.
                # Frames in one burst go back to back (arrival is jittery); after
                # a pause longer than RESYNC the cursor jumps to "now", i.e. our
                # track's position when the frame arrived.
                cursor = None
                RESYNC = RATE // 4
                while True:
                    try:
                        frame = await track.recv()
                    except Exception:
                        return
                    if not keep:
                        continue
                    now = merit.pts
                    if cursor is None or now - cursor > RESYNC:
                        cursor = now
                    for out in resampler.resample(frame):
                        samples = out.to_ndarray().reshape(-1).copy()
                        remote_frames.append((cursor, samples))
                        cursor += len(samples)

            asyncio.ensure_future(drain())
            if args.record:
                print(f"capturing both sides -> {args.record}")

        async def tts(line):
            # async + await: to_thread returns a coroutine, which can't be unpacked
            audio, chars = await asyncio.to_thread(
                cast_tts, line, voice_id=args.voice_id, lang_code=args.language_code
            )
            cost["tts_chars"] += chars
            return audio

        async def next_answer(message: str):
            nonlocal generating, pending_turn, interrupted, cut_note
            log("user_answer_turn", merit.pts, ai_message=message)

            if generating:
                # Don't wait for the old reply to finish: stop it and answer this.
                pending_turn = f"{pending_turn}\n{message}" if pending_turn else message
                interrupt()
                log("user_turn_interrupted", merit.pts, ai_message=message)
                touch()
                return

            try:
                generating = True
                while message is not None:
                    interrupted = False
                    prompt = f"{cut_note}\n{message}" if cut_note else message
                    cut_note = ""

                    log("user_invoke_answering", merit.pts, ai_message=message)
                    text_reply = await agent.graph.ainvoke(
                        {"messages": [langm.HumanMessage(content=prompt)]}, ai_config
                    )
                    print(f"text_reply:\n {text_reply}")
                    reply = text_reply["messages"][-1].text
                    log("user_invoke_answering_done", merit.pts, ai_message=message, user_reply=reply)

                    TAGS = re.compile(r"<[^>]*>|\[[^\]]*\]") 
                    def speakable(s: str) -> bool:
                        return any(ch.isalnum() for ch in TAGS.sub("", s))
                    # lines = [x for x in reply.splitlines() if x.strip()]
                    lines, carry = [], ""
                    for x in reply.splitlines():
                        x = x.strip()
                        if not x:
                            continue
                        if not speakable(x):
                            carry = f"{carry} {x}".strip()      # <emotion value="calm"/> joins the next line
                            continue
                        lines.append(f"{carry} {x}".strip())
                        carry = ""
                    spoken = []
                    upcoming = None
                    try:
                        for idx, line in enumerate(lines):
                            if interrupted or finished.is_set():
                                break
                            log("user_answer_chunk", merit.pts, ai_message=message, chunk=idx)
                            audio = await (upcoming or tts(line))
                            if interrupted or finished.is_set():          # cut off while this line was generating
                                break
                            upcoming = asyncio.create_task(tts(lines[idx + 1])) if idx + 1 < len(lines) else None
                            merit.say(audio)
                            await merit.wait_until_done()
                            if interrupted or finished.is_set():          # cut() ended this line early
                                spoken.append(line[:int(len(line)*(merit._cursor / len(audio)))])
                                break
                            spoken.append(line)
                    finally:
                        if upcoming:
                            upcoming.cancel()

                    if interrupted:
                        said = " ".join(spoken)
                        if said:
                            plain.append(said)
                            cut_note = (f'(You were cut off. They only heard: "{said}". '
                                        "Respond to what they just said; don't repeat yourself." \
                                        " make a shorter response)")
                        else:
                            cut_note = ("(You were interrupted before you said anything. "
                                        "They didn't hear your last reply." \
                                        " make a shorter response)")
                        log("user_answer_cut", merit.pts, said=said)
                    else:
                        plain.append(reply)
                        log("user_answer_done", merit.pts, ai_message=message, chunk=len(lines) - 1)
                    touch()

                    message, pending_turn = pending_turn, None
            except Exception as e:
                traceback.print_exc()
                log("answer_failed", merit.pts, error=repr(e))
            finally:
                generating = False

        @channel.on("open")
        def on_open():
            channel.send(
                json.dumps(
                    {
                        "label": RTVI_LABEL,
                        "type": "client-ready",
                        "id": uuid.uuid4().hex,
                        "data": {
                            "version": RTVI_PROTOCOL_VERSION,
                            "about": {"library": "link-eval-client"},
                        },
                    }
                )
            )
            print("sent client-ready")
            log("client_ready", merit.pts)

            async def ping_loop():
                while True:
                    await asyncio.sleep(PING_INTERVAL_SEC)
                    try:
                        channel.send("ping")
                    except Exception:
                        return

            asyncio.ensure_future(ping_loop())

        async def silence_watch(limit: float, startup_limit: float):
            while not finished.is_set():
                await asyncio.sleep(1)
                if bot_speaking or generating or merit.is_speaking:
                    touch()
                    continue
                quiet = time.monotonic() - last_activity
                allowed = limit if started else startup_limit
                if quiet > allowed:
                    why = "silence" if started else "never started"
                    print(f"no activity for {allowed:.0f}s ({why}); ending the call")
                    log("silence_timeout", merit.pts, seconds=allowed, started=started)
                    finished.set()
                    return

        def join_segments(segms: dict[int, str]) -> str:
            return " ".join(segms[k] for k in sorted(segms))

        def flush_line() -> str:
            """Move the pending Sqouts segments into the transcript as one line."""
            nonlocal bot_segments, last_line
            line = join_segments(bot_segments)
            if line:
                transcript.append(("ai", line))
                last_line = {"at": len(transcript) - 1, "segments": bot_segments}
                print(f"  bot : {line!r}")
            bot_segments = {}
            return line

        @channel.on("message")
        def on_message(raw):
            nonlocal bot_turns, bot_speaking
            if isinstance(raw, str) and raw.startswith("ping"):
                return
            try:
                msg = json.loads(raw)
            except Exception:
                return
            mtype = msg.get("type")
            data = msg.get("data") or {}
            log("rtvi", merit.pts, type=mtype, data=data)

            if mtype == "bot-output":
                touch()
                mark_started()
                if data.get("aggregated_by") != "sentence":
                    return
                seg = data.get("segment_id")
                status = data.get("spoken_status")
                text = (
                    data.get("text")
                    if (not status or status == "completed")
                    else (data.get("spoken_progress") or {}).get("accumulated_text", "")
                )
                if seg is None or not text:
                    return
                if not bot_speaking and last_line["at"] >= 0:
                    # Sqouts isn't speaking, so this is the tail of the line that
                    # just ended (it can land after bot-stopped-speaking). It
                    # belongs to that line; every new line opens with
                    # bot-started-speaking.
                    last_line["segments"][seg] = text
                    transcript[last_line["at"]] = ("ai", join_segments(last_line["segments"]))
                    return
                bot_segments[seg] = text
            elif mtype == "user-transcription" and data.get("final"):
                touch()
                transcript.append(("user", data.get("text", "")))
                print(f"  user: {data.get('text','')!r}")
            elif mtype == "bot-started-speaking":
                flush_line()
                mark_started()
                touch()
                bot_speaking = True
                interrupt()
            elif mtype == "bot-stopped-speaking":
                # One bot turn finished. Flush its segments into the transcript and
                # take our turn — this is the harness's turn-taking loop.
                bot_speaking = False
                line = flush_line()
                touch()
                if line.strip():
                    bot_turns += 1
                    asyncio.ensure_future(next_answer(line))
                else:
                    log("empty_bot_turn", merit.pts)
            elif mtype == "bot-ready":
                touch()
                if args.tester_first:
                    open_call("bot-ready")

        @pc.on("connectionstatechange")
        async def on_state():
            print(f"pc state: {pc.connectionState}")
            log("connection_state", merit.pts, state=pc.connectionState)
            if pc.connectionState in ("failed", "closed", "disconnected"):
                finished.set()

        await pc.setLocalDescription(await pc.createOffer())
        # aiortc completes ICE gathering inside setLocalDescription, so the offer
        # is already final — no trickle PATCH needed for this client.
        answer = await session.offer(
            pc.localDescription.sdp, pc.localDescription.type
        )
        await pc.setRemoteDescription(
            RTCSessionDescription(sdp=answer["sdp"], type=answer["type"])
        )
        t0 = time.monotonic()
        log("connected", merit.pts)
        print("webrtc connected; waiting for the interview")

        if args.tester_first:
            async def open_fallback():
                await asyncio.sleep(5)
                open_call("timeout")
            asyncio.ensure_future(open_fallback())

        # timeout watcher set to 90 sec then close
        touch()
        watch = None
        watch = asyncio.ensure_future(silence_watch(90, 300))

        try:
            await asyncio.wait_for(finished.wait(), timeout=args.max_seconds)
        except asyncio.TimeoutError:
            print(f"hit --max-seconds ({args.max_seconds}); closing")
        finally:
            if watch:
                watch.cancel()

        try:
            await asyncio.wait_for(pc.close(), timeout=10)
        except asyncio.TimeoutError:
            log("pc_close_timeout", merit.pts)
            print("pc.close() didn't finish in 10s; carrying on")


        if args.record:
            # After pc.close(), so the last frames of both sides are in hand.
            dur = write_stereo_wav(args.record, own_frames, remote_frames)
            print(f"stereo recording -> {args.record} ({dur}, L=bot R=sqouts)")

        try:
            await session.finish()
            log("complete", merit.pts)
            print("session completed; assessment enqueued")
        except Exception as e:
            # Sqouts often ends the session itself, and marking it complete again
            # then errors. The call is over either way; still judge it.
            log("complete_failed", merit.pts, error=repr(e))

        # 2: nothing to judge if the tester never got a word in
        if not plain:
            raise RuntimeError("call ended before the tester said anything")

        rows = [{"speaker": s, "text": t} for s, t in transcript]
        eval_res, ev_spent = await start_evaluate(
            args.evaluate_role,
            rows,
            args.metrics,
            plain,
            events,
            threshold=args.pass_threshold,
        )
        cost["eval_in"] = ev_spent["in"]
        cost["eval_out"] = ev_spent["out"]
        # The metrics as they were for this run, so later edits to a rubric
        # don't change what an old result appears to have been scored on.
        eval_res["metrics"] = args.metrics

        return {
            "eval_res": eval_res,
            "transcript": rows,
            "plain": plain,
            "events": events,
        }
    finally:
        # In finally so the tester's tokens are kept even when the call or the
        # judge fails. The graph state holds the running totals.
        state = agent.graph.get_state(ai_config).values
        cost["reply_in"] = state.get("tokens_in", 0)
        cost["reply_out"] = state.get("tokens_out", 0)
        await session.close()


def run_test_case(
    test_case_id: int, run_id: uuid.UUID | str | None, max_seconds: float = 3600.0, record: bool = False
) -> Run:
    """Run a test case end to end and save the result. Blocking: call it from
    a Celery task or a script, not from a request."""
    with SyncSessionLocal() as db:
        tc = db.get(
            TestCase, test_case_id,
            options=[selectinload(TestCase.scenario), selectinload(TestCase.metrics)],
        )
        if tc is None:
            raise LookupError(f"test case {test_case_id} not found")
        scenario = tc.scenario
        metrics = [
            {
                "id": m.id,
                "key": m.key,
                "name": m.name,
                "description": m.description,
                "critical": m.critical,
            }
            for m in tc.metrics  # ordered by id on the relationship
        ]

        if run_id:
            # Claim the run in one UPDATE, so a leftover or duplicate task can't
            # restart one that was aborted or is already being run.
            claimed = db.execute(
                update(Run)
                .where(Run.id == uuid.UUID(str(run_id)), Run.status == RunStatus.PREPARING)
                .values(status=RunStatus.RUNNING)
            ).rowcount
            db.commit()
            r = db.get(Run, uuid.UUID(str(run_id)))
            if not claimed:
                return r
        else:
            r = Run(test_case_id=tc.id, status=RunStatus.RUNNING, token_count={})
            db.add(r)
            db.commit()

        location = f"recording/rec-{r.id}.wav"
        mp3_rel = f"recording/rec-{r.id}.mp3"
        rec_path = files.media_path(location)
        rec_path.parent.mkdir(parents=True, exist_ok=True)

        args = SimpleNamespace(
            token=scenario.token,
            base_url=scenario.gateway_url,
            name=tc.join_name,
            email_prefix=tc.join_email,
            character=tc.bot_char,
            language_code=tc.language,
            voice_id=tc.voice_id,
            # str, not Path: wave.open only opens the file itself when given a str
            record=str(rec_path) if record else None,
            max_seconds=max_seconds,
            evaluate_role=scenario.ai_role,
            metrics=metrics,
            pass_threshold=tc.pass_threshold,
            kind=scenario.scenario_type,
            tester_first=False,
        )

        rec = {
            "events": [], "transcript": [], "plain": [],
            # LLM costs are tokens; TTS (Cartesia) bills by characters.
            "cost": dict.fromkeys(
                ["reply_in", "reply_out", "eval_in", "eval_out", "tts_chars"], 0
            ),
        }

        try:
            out = asyncio.run(run(args, r.id, rec))
        except BaseException as e:
            # Keep whatever the call logged before it failed, plus why it failed;
            # with no result backend this is the only record of the error.
            rec["events"].append(
                {"ev": "error", "error": repr(e), "traceback": traceback.format_exc()}
            )
            _finish_recording(rec_path, mp3_rel, record)
            _save_logs(r, rec, mp3_rel if record else None)
            r.status = RunStatus.ABORTED
            r.finish_time = datetime.now(timezone.utc)
            db.commit()
            raise

        _finish_recording(rec_path, mp3_rel, record)
        _save_logs(r, rec, mp3_rel if record else None)
        r.eval_res = files.write_json("eval_res", f"eval_res-{r.id}.json", out["eval_res"])
        r.status = RunStatus.DONE
        r.finish_time = datetime.now(timezone.utc)
        db.commit()
        return r


def _finish_recording(rec_path: Path, mp3_rel: str, record: bool) -> None:
    """Turn the call's WAV into the MP3 the API serves, and drop the WAV."""
    if record and rec_path.exists():
        wav_to_mp3(str(rec_path), str(files.media_path(mp3_rel)))
        rec_path.unlink()


def _save_logs(r: Run, rec, recording: str | None):
    r.transcript = files.write_json(
        "transcript", f"transcript-{r.id}.json",
        [{"speaker": s, "text": t} for s, t in rec["transcript"]],
    )
    r.plain = files.write_json("plain", f"plain-{r.id}.json", rec["plain"])
    r.events_log = files.write_json("events_log", f"events-{r.id}.json", rec["events"])
    r.token_count = rec["cost"]
    # It's missing when the call failed before the recording was written.
    if recording and files.exists(recording):
        r.recording = recording

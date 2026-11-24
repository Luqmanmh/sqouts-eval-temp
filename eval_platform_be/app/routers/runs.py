import uuid

from fastapi import APIRouter, Depends
from fastapi.concurrency import run_in_threadpool
from fastapi.responses import FileResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .. import files, security
from ..database import get_db
from ..deletion import delete_run
from ..errors import not_found
from ..models import Run, RunStatus, Scenario, TestCase, User
from ..paging import iso
from ..scripts.local_scripts import connect_chat, timeline_items, wav_to_mp3

router = APIRouter(prefix="/runs", tags=["runs"])


def verdict(run: Run) -> tuple[bool | None, float | None]:
    """(passed, overall_score) from the run's eval_res file. There are no score
    columns, so this reads the JSON the judge wrote; (None, None) when the file
    is missing or unreadable."""
    res = files.read_json(run.eval_res)
    if not isinstance(res, dict):
        return None, None
    return res.get("passed"), res.get("overall_score")


async def own_run(db: AsyncSession, id: str, user: User, *statuses: str) -> Run:
    try:
        run_id = uuid.UUID(id)
    except ValueError:
        raise not_found("No Runs matches the given query.")
    stmt = (
        select(Run)
        .join(TestCase, Run.test_case_id == TestCase.id)
        .join(Scenario, TestCase.scenario_id == Scenario.id)
        .where(Run.id == run_id, Scenario.user_id == user.id)
        .options(selectinload(Run.test_case).selectinload(TestCase.scenario))
    )
    if statuses:
        stmt = stmt.where(Run.status.in_(statuses))
    run = await db.scalar(stmt)
    if run is None:
        raise not_found("No Runs matches the given query.")
    return run


@router.get("/{id}")
async def get_run(id: str, user: User = Depends(security.current_user), db: AsyncSession = Depends(get_db)):
    r = await own_run(db, id, user)
    plain = files.read_json(r.plain)
    return {
        "id": str(r.id),
        "status": r.status,
        "finish_time": iso(r.finish_time),
        "token_count": r.token_count or {},
        "pass_threshold": r.test_case.pass_threshold,
        "scenario_type": r.test_case.scenario.scenario_type,
        "has_recording": files.exists(r.recording),
        "has_events": files.exists(r.events_log),
        "eval_res": files.read_json(r.eval_res),
        "transcript": connect_chat(files.read_json(r.transcript), plain),
        "plain": plain,
    }


@router.delete("/{id}")
async def remove_run(id: str, user: User = Depends(security.current_user), db: AsyncSession = Depends(get_db)):
    r = await own_run(db, id, user)
    await delete_run(db, r)
    return {"details": "Run deleted"}


@router.get("/{id}/events")
async def run_events(id: str, user: User = Depends(security.current_user), db: AsyncSession = Depends(get_db)):
    """The call as a timeline for the Events tab (see timeline_items)."""
    # Aborted runs too: the events are most useful when a call went wrong.
    r = await own_run(db, id, user, RunStatus.DONE, RunStatus.ABORTED)
    events = files.read_json(r.events_log)
    if events is None:
        raise not_found("no events log")
    items = timeline_items(events, files.read_json(r.transcript), files.read_json(r.plain))
    return {"items": items}


@router.get("/{id}/recording")
async def run_recording(id: str, user: User = Depends(security.current_user), db: AsyncSession = Depends(get_db)):
    r = await own_run(db, id, user)
    if not files.exists(r.recording):
        raise not_found("no recording")
    # Older runs kept a WAV; convert it once, on first play.
    if r.recording.lower().endswith(".wav"):
        mp3_rel = f"recording/rec-{r.id}.mp3"
        wav = files.media_path(r.recording)
        await run_in_threadpool(wav_to_mp3, str(wav), str(files.media_path(mp3_rel)))
        wav.unlink()
        r.recording = mp3_rel
        await db.commit()
    return FileResponse(files.media_path(r.recording), media_type="audio/mpeg")

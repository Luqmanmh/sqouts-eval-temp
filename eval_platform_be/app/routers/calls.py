import json

from fastapi import APIRouter, Depends, File, UploadFile
from sqlalchemy.ext.asyncio import AsyncSession

from .. import files, security
from ..database import get_db
from ..errors import ApiError, bad_request
from ..models import Run, RunStatus, User
from ..schemas import CountIn
from ..scripts.local_scripts import get_plain
from ..worker import run_evaluate_transcript, run_test_case_task
from .testcases import own_test_case

router = APIRouter(prefix="/call", tags=["calls"])

MAX_RUNS = 10  # per request


@router.post("/startrun/{id}", status_code=202)
async def start_runs(id: int, body: CountIn, user: User = Depends(security.current_user), db: AsyncSession = Depends(get_db)):
    tc = await own_test_case(db, id, user)
    try:
        count = int(body.count)
    except (TypeError, ValueError):
        raise bad_request("count must be a number")
    if not 1 <= count <= MAX_RUNS:
        raise bad_request(f"count must be 1-{MAX_RUNS}")

    runs = [Run(test_case_id=tc.id, status=RunStatus.PREPARING, token_count={}) for _ in range(count)]
    db.add_all(runs)
    await db.commit()
    # Queued only after the commit, so the worker always finds its row.
    for r in runs:
        run_test_case_task.delay(tc.id, str(r.id))
    return {"runs": [str(r.id) for r in runs]}


def clean_rows(rows) -> list[dict]:
    """The uploaded transcript, checked: a list of {speaker, text} rows.
    plain and timestamp are optional and filled in as empty when missing."""
    if not isinstance(rows, list) or not rows:
        raise ValueError
    out = []
    for row in rows:
        if not isinstance(row, dict) or row.get("speaker") not in ("ai", "user") or not isinstance(row.get("text"), str):
            raise ValueError
        out.append({**row, "plain": row.get("plain") or "", "timestamp": row.get("timestamp")})
    return out


@router.post("/transcript/{id}", status_code=202)
async def evaluate_transcript(
    id: int,
    file: UploadFile | None = File(None),
    user: User = Depends(security.current_user),
    db: AsyncSession = Depends(get_db),
):
    tc = await own_test_case(db, id, user)
    if file is None:
        raise bad_request("No file sent")
    try:
        rows = clean_rows(json.loads(await file.read()))
    except (ValueError, TypeError):
        raise ApiError(400, {"error": "bad JSON shape"})

    run = Run(test_case_id=tc.id, status=RunStatus.PREPARING, token_count={})
    db.add(run)
    await db.flush()  # assigns nothing server-side, but checks the row before writing files
    run.transcript = files.write_json("transcript", f"transcript-{run.id}.json", rows)
    plain = get_plain(rows)
    if plain:
        run.plain = files.write_json("plain", f"plain-{run.id}.json", plain)
    await db.commit()

    run_evaluate_transcript.delay(tc.id, str(run.id), rows)
    return {"id": str(run.id)}

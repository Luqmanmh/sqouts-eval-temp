from fastapi import APIRouter, Depends, Query
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy.orm import selectinload

from .. import security
from ..database import get_db
from ..deletion import delete_test_case
from ..errors import invalid, not_found
from ..models import Metric, Run, RunStatus, Scenario, TestCase, User
from ..paging import iso, page_number, paginate
from ..schemas import TestCaseCreate, TestCaseUpdate
from .runs import verdict
from .scenarios import own_scenario

router = APIRouter(prefix="/testcases", tags=["test cases"])

EDITABLE = ("name", "bot_char", "language", "voice_id", "join_name", "join_email", "pass_threshold", "start_first")


def test_case_out(tc: TestCase) -> dict:
    return {
        "id": tc.id,
        "scenario_id": tc.scenario_id,
        "scenario_type": tc.scenario.scenario_type,
        "name": tc.name,
        "bot_char": tc.bot_char,
        "language": tc.language,
        "voice_id": tc.voice_id,
        "join_name": tc.join_name,
        "join_email": tc.join_email,
        "pass_threshold": tc.pass_threshold,
        "start_first": tc.start_first,
        "metrics": [m.id for m in tc.metrics],
    }


async def own_test_case(db: AsyncSession, id: int, user: User) -> TestCase:
    tc = await db.scalar(
        select(TestCase)
        .join(Scenario, TestCase.scenario_id == Scenario.id)
        .where(TestCase.id == id, Scenario.user_id == user.id)
        .options(selectinload(TestCase.scenario), selectinload(TestCase.metrics))
    )
    if tc is None:
        raise not_found("No TestCase matches the given query.")
    return tc


async def usable_metrics(db: AsyncSession, ids: list[int], user: User) -> list[Metric]:
    """The metrics a test case may use: built-in ones and the user's own.
    (The old serializer accepted any metric id, including other users'.)"""
    found = (await db.scalars(
        select(Metric).where(Metric.id.in_(ids), or_(Metric.user_id.is_(None), Metric.user_id == user.id))
    )).all()
    missing = [i for i in ids if i not in {m.id for m in found}]
    if missing:
        raise invalid({"metrics": [f'Invalid pk "{missing[0]}" - object does not exist.']})
    return sorted(found, key=lambda m: m.id)


@router.get("/list/{id}")
async def list_test_cases(
    id: int,
    query: str = "",
    page: str | None = Query(None),
    user: User = Depends(security.current_user),
    db: AsyncSession = Depends(get_db),
):
    scen = await own_scenario(db, id, user)
    stmt = select(TestCase).where(TestCase.scenario_id == scen.id).order_by(TestCase.id.desc())
    if query:
        stmt = stmt.where(or_(TestCase.bot_char.icontains(query), TestCase.language.icontains(query)))
    rows, pagin = await paginate(db, stmt, page_number(page), 10)

    data = []
    for tc in rows:
        run = await db.scalar(
            select(Run)
            .where(Run.test_case_id == tc.id, Run.status == RunStatus.DONE)
            .order_by(Run.finish_time.desc().nulls_last())
            .limit(1)
        )
        last_run = None
        if run is not None:
            passed, score = verdict(run)
            last_run = {"id": str(run.id), "finished_at": iso(run.finish_time), "passed": passed, "overall_score": score}
        data.append({"id": tc.id, "name": tc.name, "language": tc.language, "last_run": last_run})
    return {"data": data, "pagin": pagin}


@router.post("", status_code=201)
async def create_test_case(body: TestCaseCreate, user: User = Depends(security.current_user), db: AsyncSession = Depends(get_db)):
    # Only into the user's own scenario (the old view didn't check this).
    scen = await db.scalar(select(Scenario).where(Scenario.id == body.scenario_id, Scenario.user_id == user.id))
    if scen is None:
        raise invalid({"scenario_id": [f'Invalid pk "{body.scenario_id}" - object does not exist.']})

    values = {k: v for k, v in body.model_dump(include=set(EDITABLE)).items() if v is not None}
    tc = TestCase(scenario_id=scen.id, **values)
    tc.metrics = await usable_metrics(db, body.metrics or [], user)
    db.add(tc)
    await db.commit()
    return {"detail": "Created successfully", "id": tc.id}


@router.get("/{id}")
async def get_test_case(id: int, user: User = Depends(security.current_user), db: AsyncSession = Depends(get_db)):
    return test_case_out(await own_test_case(db, id, user))


@router.put("/{id}")
async def update_test_case(id: int, body: TestCaseUpdate, user: User = Depends(security.current_user), db: AsyncSession = Depends(get_db)):
    tc = await own_test_case(db, id, user)
    sent = body.model_dump(exclude_unset=True)
    for field in EDITABLE:
        if field in sent and sent[field] is not None:
            setattr(tc, field, sent[field])
    if body.metrics is not None:
        tc.metrics = await usable_metrics(db, body.metrics, user)
    await db.commit()
    return {"detail": "Test case updated successfully", "data": test_case_out(tc)}


@router.delete("/{id}")
async def remove_test_case(id: int, user: User = Depends(security.current_user), db: AsyncSession = Depends(get_db)):
    tc = await own_test_case(db, id, user)
    await delete_test_case(db, tc.id)
    return {"details": "Test case deleted"}


@router.get("/{id}/runs")
async def list_runs(
    id: int,
    page: str | None = Query(None),
    user: User = Depends(security.current_user),
    db: AsyncSession = Depends(get_db),
):
    tc = await own_test_case(db, id, user)
    # Newest first; Postgres puts unfinished runs (no finish_time) on top, as before.
    stmt = select(Run).where(Run.test_case_id == tc.id).order_by(Run.finish_time.desc())
    rows, pagin = await paginate(db, stmt, page_number(page), 10)
    data = []
    for r in rows:
        passed, score = verdict(r)
        data.append({
            "id": str(r.id),
            "status": r.status,
            "finish_time": iso(r.finish_time),
            "passed": passed,
            "overall_score": score,
        })
    return {"data": data, "pagin": pagin}

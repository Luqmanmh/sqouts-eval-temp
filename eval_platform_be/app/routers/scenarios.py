from fastapi import APIRouter, Depends, Query
from sqlalchemy import func, or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import security
from ..database import get_db
from ..deletion import delete_scenario
from ..errors import not_found
from ..models import Run, RunStatus, Scenario, TestCase, User
from ..paging import iso, page_number, paginate
from ..schemas import ScenarioIn

router = APIRouter(prefix="/scenarios", tags=["scenarios"])


def scenario_out(s: Scenario) -> dict:
    return {
        "id": s.id,
        "name": s.name,
        "description": s.description,
        "gateway_url": s.gateway_url,
        "token": s.token,
        "ai_role": s.ai_role,
        "scenario_type": s.scenario_type,
    }


async def own_scenario(db: AsyncSession, id: int, user: User) -> Scenario:
    s = await db.scalar(select(Scenario).where(Scenario.id == id, Scenario.user_id == user.id))
    if s is None:
        raise not_found("No Scenario matches the given query.")
    return s


@router.get("/list")
async def list_scenarios(
    query: str = "",
    page: str | None = Query(None),
    user: User = Depends(security.current_user),
    db: AsyncSession = Depends(get_db),
):
    stmt = select(Scenario).where(Scenario.user_id == user.id).order_by(Scenario.id.desc())
    if query:
        stmt = stmt.where(or_(
            Scenario.name.icontains(query),
            Scenario.description.icontains(query),
            Scenario.gateway_url.icontains(query),
            Scenario.token.icontains(query),
        ))
    rows, pagin = await paginate(db, stmt, page_number(page), 10)

    # Two grouped queries for the whole page instead of two per scenario.
    ids = [s.id for s in rows]
    counts = dict((await db.execute(
        select(TestCase.scenario_id, func.count())
        .where(TestCase.scenario_id.in_(ids))
        .group_by(TestCase.scenario_id)
    )).all()) if ids else {}
    latest = dict((await db.execute(
        select(TestCase.scenario_id, func.max(Run.finish_time))
        .join(Run, Run.test_case_id == TestCase.id)
        .where(TestCase.scenario_id.in_(ids), Run.status == RunStatus.DONE)
        .group_by(TestCase.scenario_id)
    )).all()) if ids else {}

    data = []
    for s in rows:
        item = scenario_out(s)
        del item["ai_role"]
        item["test_case_count"] = counts.get(s.id, 0)
        item["latest_test_done"] = iso(latest.get(s.id))
        data.append(item)
    return {"data": data, "pagin": pagin}


@router.post("", status_code=201)
async def create_scenario(body: ScenarioIn, user: User = Depends(security.current_user), db: AsyncSession = Depends(get_db)):
    s = Scenario(user_id=user.id, **body.model_dump())
    db.add(s)
    await db.commit()
    return {"detail": "Created successfully", "id": s.id}


@router.get("/{id}")
async def get_scenario(id: int, user: User = Depends(security.current_user), db: AsyncSession = Depends(get_db)):
    return scenario_out(await own_scenario(db, id, user))


@router.put("/{id}")
async def update_scenario(id: int, body: ScenarioIn, user: User = Depends(security.current_user), db: AsyncSession = Depends(get_db)):
    s = await own_scenario(db, id, user)
    for field, value in body.model_dump().items():
        setattr(s, field, value)
    await db.commit()
    return {"detail": "Scenario updated successfully", "data": scenario_out(s)}


@router.delete("/{id}")
async def remove_scenario(id: int, user: User = Depends(security.current_user), db: AsyncSession = Depends(get_db)):
    s = await own_scenario(db, id, user)
    await delete_scenario(db, s.id)
    return {"details": "Scenario deleted"}

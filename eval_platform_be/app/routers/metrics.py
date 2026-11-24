from fastapi import APIRouter, Depends
from sqlalchemy import or_, select
from sqlalchemy.ext.asyncio import AsyncSession

from .. import security
from ..database import get_db
from ..errors import invalid, not_found
from ..models import Metric, User
from ..schemas import MetricCreate, MetricUpdate

router = APIRouter(prefix="/metrics", tags=["metrics"])


def metric_out(m: Metric) -> dict:
    return {
        "id": m.id,
        "key": m.key,
        "name": m.name,
        "description": m.description,
        "max_score": m.max_score,
        "critical": m.critical,
    }


async def check_key(db: AsyncSession, key: str, user: User, exclude_id: int | None = None) -> None:
    # The judge reports scores by key, so a key must point at one metric:
    # not one of the user's own, and not a built-in.
    stmt = select(Metric.id).where(Metric.key == key, or_(Metric.user_id == user.id, Metric.user_id.is_(None)))
    if exclude_id is not None:
        stmt = stmt.where(Metric.id != exclude_id)
    if await db.scalar(stmt.limit(1)) is not None:
        raise invalid({"key": ["A metric with this key already exists."]})


@router.get("/built")
async def built_in(_: User = Depends(security.current_user), db: AsyncSession = Depends(get_db)):
    rows = await db.scalars(select(Metric).where(Metric.user_id.is_(None)).order_by(Metric.id))
    return [metric_out(m) for m in rows]


@router.get("/self")
async def own(user: User = Depends(security.current_user), db: AsyncSession = Depends(get_db)):
    rows = await db.scalars(select(Metric).where(Metric.user_id == user.id).order_by(Metric.id))
    return [metric_out(m) for m in rows]


@router.post("/self", status_code=201)
async def create_metric(body: MetricCreate, user: User = Depends(security.current_user), db: AsyncSession = Depends(get_db)):
    await check_key(db, body.key, user)
    values = {k: v for k, v in body.model_dump().items() if v is not None}
    m = Metric(user_id=user.id, **values)
    db.add(m)
    await db.commit()
    return metric_out(m)


@router.put("/self")
async def update_metric(body: MetricUpdate, user: User = Depends(security.current_user), db: AsyncSession = Depends(get_db)):
    m = await db.scalar(select(Metric).where(Metric.id == body.id, Metric.user_id == user.id))
    if m is None:
        raise not_found("No Metrics matches the given query.")
    sent = body.model_dump(exclude_unset=True, exclude={"id"})
    if sent.get("key") is not None:
        await check_key(db, sent["key"], user, exclude_id=m.id)
    for field, value in sent.items():
        if value is not None:
            setattr(m, field, value)
    await db.commit()
    return {"detail": "Metric updated successfully", "data": metric_out(m)}

"""List pages in the Django backend's {"data": [...], "pagin": {...}} shape."""

import math
from datetime import datetime, timezone

from sqlalchemy import Select, func, select
from sqlalchemy.ext.asyncio import AsyncSession


def iso(dt: datetime | None) -> str | None:
    """ISO 8601 in UTC with a Z, like DRF's DateTimeField output."""
    if dt is None:
        return None
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00", "Z")


def page_number(raw: str | None) -> int:
    try:
        return int(raw or 1)
    except ValueError:
        return 1


async def paginate(db: AsyncSession, stmt: Select, page: int, per_page: int):
    """(rows, pagin). Like Django's Paginator.get_page, a page past either end
    returns the last page rather than an error."""
    total = await db.scalar(select(func.count()).select_from(stmt.order_by(None).subquery()))
    total_page = max(1, math.ceil(total / per_page))
    if page < 1 or page > total_page:
        page = total_page
    rows = (await db.scalars(stmt.limit(per_page).offset((page - 1) * per_page))).all()
    return rows, {
        "current_page": page,
        "page_len": per_page,
        "total_items": total,
        "total_page": total_page,
    }

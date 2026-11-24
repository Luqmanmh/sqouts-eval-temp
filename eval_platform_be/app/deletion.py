"""Cascading deletes, done by hand because the database has no ON DELETE CASCADE.

Mirrors what Django did: user -> own metrics (and scenarios set to no owner),
scenario -> test cases -> runs, and each run's files on disk. Files go only
after the commit, so a failed delete never leaves rows pointing at nothing.
"""

from sqlalchemy import delete, select, text, update
from sqlalchemy.ext.asyncio import AsyncSession

from .files import delete_run_files
from .models import Metric, Run, Scenario, TestCase, User, testcase_metrics


async def _delete_test_cases(db: AsyncSession, test_case_ids: list[int]) -> list[Run]:
    if not test_case_ids:
        return []
    runs = (await db.scalars(select(Run).where(Run.test_case_id.in_(test_case_ids)))).all()
    await db.execute(delete(Run).where(Run.test_case_id.in_(test_case_ids)))
    await db.execute(delete(testcase_metrics).where(testcase_metrics.c.testcase_id.in_(test_case_ids)))
    await db.execute(delete(TestCase).where(TestCase.id.in_(test_case_ids)))
    return list(runs)


async def delete_run(db: AsyncSession, run: Run) -> None:
    await db.delete(run)
    await db.commit()
    delete_run_files(run)


async def delete_test_case(db: AsyncSession, test_case_id: int) -> None:
    runs = await _delete_test_cases(db, [test_case_id])
    await db.commit()
    for r in runs:
        delete_run_files(r)


async def delete_scenario(db: AsyncSession, scenario_id: int) -> None:
    tc_ids = list(await db.scalars(select(TestCase.id).where(TestCase.scenario_id == scenario_id)))
    runs = await _delete_test_cases(db, tc_ids)
    await db.execute(delete(Scenario).where(Scenario.id == scenario_id))
    await db.commit()
    for r in runs:
        delete_run_files(r)


async def delete_user(db: AsyncSession, user: User) -> None:
    metric_ids = list(await db.scalars(select(Metric.id).where(Metric.user_id == user.id)))
    if metric_ids:
        await db.execute(delete(testcase_metrics).where(testcase_metrics.c.metrics_id.in_(metric_ids)))
        await db.execute(delete(Metric).where(Metric.id.in_(metric_ids)))
    # Scenario.user_id was SET_NULL in Django: the scenarios stay, ownerless.
    await db.execute(update(Scenario).where(Scenario.user_id == user.id).values(user_id=None))
    # Django's own tables that point at the user. They exist only on a database
    # Django created; skip the ones that aren't there.
    for table, column in (
        ("api_user_groups", "user_id"),
        ("api_user_user_permissions", "user_id"),
        ("django_admin_log", "user_id"),
    ):
        if await db.scalar(text("SELECT to_regclass(:t)"), {"t": table}):
            await db.execute(text(f"DELETE FROM {table} WHERE {column} = :id"), {"id": user.id})
    await db.delete(user)
    await db.commit()

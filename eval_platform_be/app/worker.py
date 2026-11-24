"""Celery app and tasks: each run's call, and transcript-only evaluations.

Start it with:  celery -A app.worker worker -P threads -c 5 -l info

The queue is "eval_api", not Celery's default "celery" the Django worker
listens on: both use the same Redis, and a worker that receives a task it
doesn't know (a different module path) drops it with an error.
"""

import asyncio
import uuid
from datetime import datetime, timezone

from celery import Celery
from sqlalchemy import update
from sqlalchemy.orm import selectinload

from . import config, files
from .database import SyncSessionLocal
from .models import Run, RunStatus, TestCase

celery_app = Celery("eval_platform_be", broker=config.CELERY_BROKER_URL)
celery_app.conf.update(
    task_default_queue="eval_api",
    worker_prefetch_multiplier=1,                         # don't let one worker hold queued runs
    broker_transport_options={"visibility_timeout": 7200},  # longer than any run
    task_acks_late=False,                                 # default; avoids a duplicate call
    broker_connection_retry_on_startup=True,
)


@celery_app.task(name="eval_api.run_test_case")
def run_test_case_task(test_case_id: int, run_id: str) -> str:
    """One call per task; the worker thread blocks for the whole call (minutes)."""
    from .scripts.call_ai import run_test_case

    return str(run_test_case(test_case_id, run_id, record=True).id)


@celery_app.task(name="eval_api.evaluate_transcript")
def run_evaluate_transcript(test_case_id: int, run_id: str, transcript: list) -> str:
    """Judge an uploaded transcript; there's no call to make."""
    from .scripts.evaluate import start_evaluate

    rid = uuid.UUID(run_id)
    with SyncSessionLocal() as db:
        tc = db.get(TestCase, test_case_id, options=[selectinload(TestCase.scenario), selectinload(TestCase.metrics)])
        metrics = [
            {"id": m.id, "key": m.key, "name": m.name, "description": m.description, "critical": m.critical}
            for m in tc.metrics
        ]

        claimed = db.execute(
            update(Run).where(Run.id == rid, Run.status == RunStatus.PREPARING).values(status=RunStatus.RUNNING)
        ).rowcount
        db.commit()
        r = db.get(Run, rid)
        if not claimed:
            return run_id

        try:
            result, spent = asyncio.run(start_evaluate(
                tc.scenario.ai_role, transcript,
                metrics=metrics, threshold=tc.pass_threshold,
            ))
        except Exception:
            r.status = RunStatus.ABORTED
            r.finish_time = datetime.now(timezone.utc)
            db.commit()
            raise

        r.eval_res = files.write_json("eval_res", f"eval_res-{r.id}.json", result)
        # No call, so only the judge spent anything.
        r.token_count = {"eval_in": spent["in"], "eval_out": spent["out"]}
        r.status = RunStatus.DONE
        r.finish_time = datetime.now(timezone.utc)
        db.commit()
        return run_id

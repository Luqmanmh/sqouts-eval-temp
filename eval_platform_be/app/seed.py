"""Seed one scenario and one test case to start from.

    python -m app.seed
    python -m app.seed --user melnn

Safe to rerun: an existing seed scenario or test case is reused, not duplicated.
"""

import argparse
import sys

from sqlalchemy import select

from .database import SyncSessionLocal
from .models import Metric, Scenario, ScenarioType, TestCase, User

SCENARIO_NAME = "Angry customer: broken rice cooker (seed)"
TEST_CASE_NAME = "Calm the customer (seed)"

AI_ROLE = (
    "Character: Pelanggan yang kesal karena rice cooker pesanannya datang rusak "
    "untuk kedua kalinya. Scenario: Pelanggan memesan rice cooker seharga Rp850.000 "
    "(nomor pesanan INV-5521)."
)

BOT_CHAR = (
    "a customer service trainee of Melnn online furnitures. You are facing an "
    "enraged customer calling about their problems. Calm them, find a solution "
    "based on protocol and policy, and make sure they stay loyal."
)


def main() -> None:
    parser = argparse.ArgumentParser(description="Seed a scenario and a test case.")
    parser.add_argument("--user", help="username that owns the scenario (default: first user)")
    opts = parser.parse_args()

    with SyncSessionLocal() as db:
        q = select(User).where(User.username == opts.user) if opts.user else select(User).order_by(User.id)
        user = db.scalars(q.limit(1)).first()
        if user is None:
            sys.exit("no user to own the scenario; create one first (python -m app.create_user)")

        scenario = db.scalar(select(Scenario).where(Scenario.name == SCENARIO_NAME, Scenario.user_id == user.id))
        made_scenario = scenario is None
        if made_scenario:
            scenario = Scenario(
                user_id=user.id,
                name=SCENARIO_NAME,
                description="A seed scenario to try the app with.",
                scenario_type=ScenarioType.SQOUTS,
                gateway_url="http://localhost:8010",
                token="REPLACE_ME",  # put a real share-link token here before running it
                ai_role=AI_ROLE,
            )
            db.add(scenario)
            db.flush()

        test_case = db.scalar(select(TestCase).where(TestCase.scenario_id == scenario.id, TestCase.name == TEST_CASE_NAME))
        made_test_case = test_case is None
        if made_test_case:
            test_case = TestCase(
                scenario_id=scenario.id,
                name=TEST_CASE_NAME,
                bot_char=BOT_CHAR,
                language="en",
                join_name="Eval {uid}",
                join_email="eval@example.test",
            )
            # the built-in metrics (no owner)
            test_case.metrics = list(db.scalars(select(Metric).where(Metric.user_id.is_(None)).order_by(Metric.id)))
            db.add(test_case)
        db.commit()

        print(
            f"scenario #{scenario.id} ({'created' if made_scenario else 'already there'}), "
            f"test case #{test_case.id} ({'created' if made_test_case else 'already there'}, "
            f"{len(test_case.metrics)} metrics) for {user.username}"
        )


if __name__ == "__main__":
    main()

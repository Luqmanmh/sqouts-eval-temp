"""SQLAlchemy models on the tables the Django backend created.

Table and column names are kept as Django made them (api_*, and foreign keys
named "<field>_id_id" because the Django fields were themselves called
"user_id", "scenario_id", ...), so both backends can run on one database.

The foreign keys have no ON DELETE CASCADE in the database: Django did its
cascades in Python. Deletes here do the same by hand (see app/deletion.py).
"""

import enum
import uuid
from datetime import datetime

from sqlalchemy import (
    BigInteger,
    Index,
    Boolean,
    Column,
    DateTime,
    ForeignKey,
    Integer,
    String,
    Table,
    Text,
    UniqueConstraint,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column, relationship


class Base(DeclarativeBase):
    pass


def FK(target: str) -> ForeignKey:
    """A foreign key as Django made them: checked at commit, not per statement.
    Index and constraint names below are Django's too, so Alembic sees the
    existing database and the models as identical."""
    return ForeignKey(target, deferrable=True, initially="DEFERRED")


class ScenarioType(enum.StrEnum):
    SQOUTS = "SQOUTS"
    PIPECAT = "PIPECAT"
    TRANSCRIPTION = "TRANSCRIPTION"


class RunStatus(enum.StrEnum):
    PREPARING = "PREPARING"
    RUNNING = "RUNNING"
    DONE = "DONE"
    ABORTED = "ABORTED"


# The file columns of a run, each holding a path relative to MEDIA_ROOT, or "".
RUN_FILES = ("eval_res", "events_log", "plain", "transcript", "recording")


class User(Base):
    __tablename__ = "api_user"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    password: Mapped[str] = mapped_column(String(128))
    last_login: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    is_superuser: Mapped[bool] = mapped_column(Boolean, default=False)
    username: Mapped[str] = mapped_column(String(150), unique=True)
    first_name: Mapped[str] = mapped_column(String(150), default="")
    last_name: Mapped[str] = mapped_column(String(150), default="")
    email: Mapped[str] = mapped_column(String(254), default="")
    is_staff: Mapped[bool] = mapped_column(Boolean, default=False)
    date_joined: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    is_active: Mapped[bool] = mapped_column(Boolean, default=True)

    __table_args__ = (
        Index("api_user_username_cf4e88d2_like", "username", postgresql_ops={"username": "varchar_pattern_ops"}),
    )


testcase_metrics = Table(
    "api_testcase_metrics",
    Base.metadata,
    Column("id", BigInteger, primary_key=True),
    Column("testcase_id", BigInteger, FK("api_testcase.id"), nullable=False),
    Column("metrics_id", BigInteger, FK("api_metrics.id"), nullable=False),
    UniqueConstraint("testcase_id", "metrics_id", name="api_testcase_metrics_testcase_id_metrics_id_21d00c38_uniq"),
    Index("api_testcase_metrics_testcase_id_8778f218", "testcase_id"),
    Index("api_testcase_metrics_metrics_id_20b182ab", "metrics_id"),
)


class Metric(Base):
    __tablename__ = "api_metrics"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    # None = built in, offered to every user
    user_id: Mapped[int | None] = mapped_column("user_id_id", BigInteger, FK("api_user.id"))
    key: Mapped[str] = mapped_column(String(60))
    name: Mapped[str] = mapped_column(String(100))
    description: Mapped[str] = mapped_column(Text)
    max_score: Mapped[int] = mapped_column(Integer, default=5)
    critical: Mapped[bool] = mapped_column(Boolean, default=False)

    __table_args__ = (
        Index("api_metrics_key_b93186fa", "key"),
        Index("api_metrics_key_b93186fa_like", "key", postgresql_ops={"key": "varchar_pattern_ops"}),
        Index("api_metrics_user_id_id_6f211fe5", "user_id_id"),
    )


class Scenario(Base):
    __tablename__ = "api_scenario"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    user_id: Mapped[int | None] = mapped_column("user_id_id", BigInteger, FK("api_user.id"))
    name: Mapped[str] = mapped_column(String(255))
    description: Mapped[str] = mapped_column(Text, default="")
    gateway_url: Mapped[str] = mapped_column(String(255), default="")
    token: Mapped[str] = mapped_column(String(100), default="")
    ai_role: Mapped[str] = mapped_column(String)
    scenario_type: Mapped[str] = mapped_column(String, default=ScenarioType.SQOUTS)

    test_cases: Mapped[list["TestCase"]] = relationship(back_populates="scenario")

    __table_args__ = (Index("api_scenario_user_id_id_cc9e029e", "user_id_id"),)


class TestCase(Base):
    __tablename__ = "api_testcase"

    id: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    scenario_id: Mapped[int] = mapped_column("scenario_id_id", BigInteger, FK("api_scenario.id"))
    name: Mapped[str] = mapped_column(String(255))
    bot_char: Mapped[str] = mapped_column(Text, default="")
    language: Mapped[str] = mapped_column(String(5))
    voice_id: Mapped[str] = mapped_column(String(40), default="gpzZjtWbZNetDrq8CXKD")
    join_name: Mapped[str] = mapped_column(String, default="")
    join_email: Mapped[str] = mapped_column(String(254), default="")
    pass_threshold: Mapped[int] = mapped_column(Integer, default=4)
    start_first: Mapped[bool] = mapped_column(Boolean, default=False)

    scenario: Mapped[Scenario] = relationship(back_populates="test_cases")
    metrics: Mapped[list[Metric]] = relationship(secondary=testcase_metrics, order_by=Metric.id)

    __table_args__ = (Index("api_testcase_scenario_id_id_3bbe4ff1", "scenario_id_id"),)


class Run(Base):
    __tablename__ = "api_runs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    test_case_id: Mapped[int] = mapped_column("test_case_id_id", BigInteger, FK("api_testcase.id"))
    eval_res: Mapped[str] = mapped_column(String(100), default="")
    events_log: Mapped[str] = mapped_column(String(100), default="")
    plain: Mapped[str] = mapped_column(String(100), default="")
    transcript: Mapped[str] = mapped_column(String(100), default="")
    recording: Mapped[str] = mapped_column(String(100), default="")
    # {"reply_in", "reply_out", "eval_in", "eval_out", "tts_chars"}; LLM entries
    # are tokens, tts_chars is Cartesia characters. A transcript run only has eval_*.
    token_count: Mapped[dict] = mapped_column(JSONB, default=dict)
    status: Mapped[str] = mapped_column(String(15), default=RunStatus.PREPARING)
    finish_time: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    test_case: Mapped[TestCase] = relationship()

    # (the odd name is Django's, from when this column was called scenario_id)
    __table_args__ = (Index("api_runs_scenario_id_id_95eb6b27", "test_case_id_id"),)

"""Baseline: the schema as the Django backend left it (through its migration 0017).

On a database Django already created, the tables exist and this does nothing
but record the revision. On an empty database it creates them, with the same
names, and adds the built-in metrics (Django's migration 0011).

Revision ID: 0001
Revises:
"""

import sqlalchemy as sa
from alembic import op
from sqlalchemy.dialects import postgresql

revision = "0001"
down_revision = None
branch_labels = None
depends_on = None

BUILTIN_METRICS = [
    ("nudge_escalation_order", "Nudge escalation order",
     "Did silence handling escalate nudge -> re-ask -> advance, in that order?"),
    ("silence_recovery_quality", "Silence recovery quality",
     "When the candidate went quiet, did the agent recover gracefully, or just repeat itself and grow passive-aggressive?"),
    ("probe_relevance", "Probe relevance",
     "Were follow-ups targeted at what the candidate actually said, or generic filler?"),
    ("persona_consistency", "Persona consistency",
     "Did the agent hold its configured tone and role throughout, including under pressure?"),
    ("claim_handling", "Claim handling",
     "Did the agent accept assertions it should have challenged, or make commitments it cannot keep?"),
    ("closing_appropriateness", "Closing appropriateness",
     "Was the ending natural and complete, or abrupt and mid-thought?"),
]


def upgrade() -> None:
    if sa.inspect(op.get_bind()).has_table("api_user"):
        return  # created by Django; nothing to do

    identity = sa.Identity(always=False)

    def fk(target):
        # deferrable, as Django creates them
        return sa.ForeignKey(target, deferrable=True, initially="DEFERRED")

    def like_index(name, table, column):
        # Django adds these for LIKE 'abc%' lookups on indexed text columns
        op.create_index(name, table, [column], postgresql_ops={column: "varchar_pattern_ops"})
    op.create_table(
        "api_user",
        sa.Column("id", sa.BigInteger, identity, primary_key=True),
        sa.Column("password", sa.String(128), nullable=False),
        sa.Column("last_login", sa.DateTime(timezone=True)),
        sa.Column("is_superuser", sa.Boolean, nullable=False),
        sa.Column("username", sa.String(150), nullable=False, unique=True),
        sa.Column("first_name", sa.String(150), nullable=False),
        sa.Column("last_name", sa.String(150), nullable=False),
        sa.Column("email", sa.String(254), nullable=False),
        sa.Column("is_staff", sa.Boolean, nullable=False),
        sa.Column("date_joined", sa.DateTime(timezone=True), nullable=False),
        sa.Column("is_active", sa.Boolean, nullable=False),
    )
    like_index("api_user_username_cf4e88d2_like", "api_user", "username")
    op.create_table(
        "api_metrics",
        sa.Column("id", sa.BigInteger, identity, primary_key=True),
        sa.Column("key", sa.String(60), nullable=False),
        sa.Column("name", sa.String(100), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("max_score", sa.Integer, nullable=False),
        sa.Column("critical", sa.Boolean, nullable=False),
        sa.Column("user_id_id", sa.BigInteger, fk("api_user.id")),
    )
    op.create_index("api_metrics_key_b93186fa", "api_metrics", ["key"])
    like_index("api_metrics_key_b93186fa_like", "api_metrics", "key")
    op.create_index("api_metrics_user_id_id_6f211fe5", "api_metrics", ["user_id_id"])
    op.create_table(
        "api_scenario",
        sa.Column("id", sa.BigInteger, identity, primary_key=True),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("description", sa.Text, nullable=False),
        sa.Column("gateway_url", sa.String(255), nullable=False),
        sa.Column("token", sa.String(100), nullable=False),
        sa.Column("ai_role", sa.String, nullable=False),
        sa.Column("user_id_id", sa.BigInteger, fk("api_user.id")),
        sa.Column("scenario_type", sa.String, nullable=False),
    )
    op.create_index("api_scenario_user_id_id_cc9e029e", "api_scenario", ["user_id_id"])
    op.create_table(
        "api_testcase",
        sa.Column("id", sa.BigInteger, identity, primary_key=True),
        sa.Column("bot_char", sa.Text, nullable=False),
        sa.Column("language", sa.String(5), nullable=False),
        sa.Column("voice_id", sa.String(40), nullable=False),
        sa.Column("join_name", sa.String, nullable=False),
        sa.Column("join_email", sa.String(254), nullable=False),
        sa.Column("pass_threshold", sa.Integer, nullable=False),
        sa.Column("scenario_id_id", sa.BigInteger, fk("api_scenario.id"), nullable=False),
        sa.Column("name", sa.String(255), nullable=False),
        sa.Column("start_first", sa.Boolean, nullable=False),
    )
    op.create_index("api_testcase_scenario_id_id_3bbe4ff1", "api_testcase", ["scenario_id_id"])
    op.create_table(
        "api_testcase_metrics",
        sa.Column("id", sa.BigInteger, identity, primary_key=True),
        sa.Column("testcase_id", sa.BigInteger, fk("api_testcase.id"), nullable=False),
        sa.Column("metrics_id", sa.BigInteger, fk("api_metrics.id"), nullable=False),
        sa.UniqueConstraint("testcase_id", "metrics_id", name="api_testcase_metrics_testcase_id_metrics_id_21d00c38_uniq"),
    )
    op.create_index("api_testcase_metrics_testcase_id_8778f218", "api_testcase_metrics", ["testcase_id"])
    op.create_index("api_testcase_metrics_metrics_id_20b182ab", "api_testcase_metrics", ["metrics_id"])
    op.create_table(
        "api_runs",
        sa.Column("id", postgresql.UUID(as_uuid=True), primary_key=True),
        sa.Column("eval_res", sa.String(100), nullable=False),
        sa.Column("events_log", sa.String(100), nullable=False),
        sa.Column("plain", sa.String(100), nullable=False),
        sa.Column("transcript", sa.String(100), nullable=False),
        sa.Column("token_count", postgresql.JSONB, nullable=False),
        sa.Column("test_case_id_id", sa.BigInteger, fk("api_testcase.id"), nullable=False),
        sa.Column("status", sa.String(15), nullable=False),
        sa.Column("finish_time", sa.DateTime(timezone=True)),
        sa.Column("recording", sa.String(100), nullable=False),
    )
    op.create_index("api_runs_scenario_id_id_95eb6b27", "api_runs", ["test_case_id_id"])

    metrics = sa.table(
        "api_metrics",
        sa.column("key"), sa.column("name"), sa.column("description"),
        sa.column("max_score"), sa.column("critical"),
    )
    op.bulk_insert(metrics, [
        {"key": k, "name": n, "description": d, "max_score": 5, "critical": False}
        for k, n, d in BUILTIN_METRICS
    ])


def downgrade() -> None:
    for table in ("api_runs", "api_testcase_metrics", "api_testcase", "api_scenario", "api_metrics", "api_user"):
        op.drop_table(table)

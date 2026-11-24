"""Request bodies. Messages match DRF's, which the frontend shows as-is."""

import re
from typing import Annotated

from pydantic import AfterValidator, BaseModel, Field, field_validator

from .models import ScenarioType


def _not_blank(v: str) -> str:
    if not v.strip():
        raise ValueError("This field may not be blank.")
    return v


def _max(n: int):
    def check(v: str) -> str:
        if len(v) > n:
            raise ValueError(f"Ensure this field has no more than {n} characters.")
        return v
    return AfterValidator(check)


Required = Annotated[str, AfterValidator(_not_blank)]

SLUG = re.compile(r"^[-a-zA-Z0-9_]+$")
EMAIL = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


# --- scenarios ---------------------------------------------------------------


class ScenarioIn(BaseModel):
    name: Annotated[Required, _max(255)]
    description: str = ""
    gateway_url: Annotated[str, _max(255)] = ""
    token: Annotated[str, _max(100)] = ""
    ai_role: Required
    scenario_type: str = ScenarioType.SQOUTS

    @field_validator("scenario_type")
    @classmethod
    def _choice(cls, v: str) -> str:
        if v not in ScenarioType.__members__.values():
            raise ValueError(f'"{v}" is not a valid choice.')
        return v


# --- test cases --------------------------------------------------------------


class _TestCaseFields(BaseModel):
    """The editable fields; every one optional so an update can send a subset."""

    name: Annotated[Required, _max(255)] | None = None
    bot_char: str | None = None
    language: Annotated[Required, _max(5)] | None = None
    voice_id: Annotated[str, _max(40)] | None = None
    join_name: str | None = None
    join_email: Annotated[str, _max(254)] | None = None
    pass_threshold: int | None = None
    start_first: bool | None = None
    metrics: list[int] | None = None

    @field_validator("join_email")
    @classmethod
    def _email(cls, v: str | None) -> str | None:
        if v and not EMAIL.match(v):
            raise ValueError("Enter a valid email address.")
        return v


class TestCaseCreate(_TestCaseFields):
    scenario_id: int
    name: Annotated[Required, _max(255)]
    language: Annotated[Required, _max(5)]


class TestCaseUpdate(_TestCaseFields):
    # Accepted and ignored: a test case can't move to another scenario.
    scenario_id: int | None = None


# --- metrics -----------------------------------------------------------------


class _MetricFields(BaseModel):
    key: Annotated[Required, _max(60)] | None = None
    name: Annotated[Required, _max(100)] | None = None
    description: Required | None = None
    max_score: int | None = None
    critical: bool | None = None

    @field_validator("key")
    @classmethod
    def _slug(cls, v: str | None) -> str | None:
        if v is not None and not SLUG.match(v):
            raise ValueError(
                'Enter a valid "slug" consisting of letters, numbers, underscores or hyphens.'
            )
        return v


class MetricCreate(_MetricFields):
    key: Annotated[Required, _max(60)]
    name: Annotated[Required, _max(100)]
    description: Required


class MetricUpdate(_MetricFields):
    id: int = Field(...)


class CountIn(BaseModel):
    count: object = 1  # checked by hand, for the old error messages

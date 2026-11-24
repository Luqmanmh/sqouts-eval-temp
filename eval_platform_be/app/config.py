"""Settings, read once from eval_platform_be/.env (and the process environment)."""

import os
from datetime import timedelta
from pathlib import Path

from dotenv import load_dotenv

BASE_DIR = Path(__file__).resolve().parent.parent  # eval_platform_be/
load_dotenv(BASE_DIR / ".env")


def _env(key: str, default: str | None = None) -> str:
    value = os.getenv(key, default)
    if value is None:
        raise RuntimeError(f"{key} is not set; add it to eval_platform_be/.env")
    return value


# Signs the JWTs. Keep it equal to the Django backend's SECRET_KEY while both
# run, so a session started on one is accepted by the other.
SECRET_KEY = _env("SECRET_KEY")
DEBUG = _env("DEBUG", "False").lower() == "true"
CORS = [o.strip() for o in _env("CORS", "http://localhost:3000").split(",") if o.strip()]

DB_USER = _env("DB_USER")
DB_PASSWORD = _env("DB_PASSWORD")
DB_HOST = _env("DB_HOST", "localhost")
DB_PORT = _env("DB_PORT", "5436")
DB_NAME = _env("DB_NAME")
_DB = f"{DB_USER}:{DB_PASSWORD}@{DB_HOST}:{DB_PORT}/{DB_NAME}"
DATABASE_URL = f"postgresql+asyncpg://{_DB}"        # the API
SYNC_DATABASE_URL = f"postgresql+psycopg2://{_DB}"  # the worker and Alembic

CELERY_BROKER_URL = _env("CELERY_BROKER_URL", "redis://localhost:6380/0")

# Where run files live. Relative paths are resolved against eval_platform_be/.
# Point it at ../../eval-bot/eval_platform_be/files to share runs with the Django backend.
MEDIA_ROOT = (BASE_DIR / _env("MEDIA_ROOT", "files")).resolve()

ACCESS_TOKEN_LIFETIME = timedelta(hours=4)
REFRESH_TOKEN_LIFETIME = timedelta(days=7)

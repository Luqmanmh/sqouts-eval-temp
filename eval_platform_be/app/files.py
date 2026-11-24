"""Run files on disk. Columns store paths relative to MEDIA_ROOT, "" for none."""

import json
from pathlib import Path

from . import config
from .models import RUN_FILES, Run


def media_path(rel: str) -> Path:
    return config.MEDIA_ROOT / rel


def exists(rel: str) -> bool:
    return bool(rel) and media_path(rel).is_file()


def read_json(rel: str):
    """The parsed file, or None when it's unset, missing or not valid JSON."""
    if not rel:
        return None
    try:
        with media_path(rel).open("rb") as f:
            return json.load(f)
    except (OSError, ValueError):
        return None


def write_json(folder: str, name: str, data) -> str:
    """Write data as <MEDIA_ROOT>/<folder>/<name>; returns the relative path to store."""
    rel = f"{folder}/{name}"
    path = media_path(rel)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False), encoding="utf-8")
    return rel


def delete_run_files(run: Run) -> None:
    """Remove a run's files; the Django backend did this in a post_delete signal."""
    for field in RUN_FILES:
        rel = getattr(run, field)
        if rel:
            media_path(rel).unlink(missing_ok=True)

#!/usr/bin/env python3
"""Canonical Codex skill catalog and installed-copy integrity helpers."""

from __future__ import annotations

import hashlib
import json
import stat
from pathlib import Path
from typing import Iterable


WORKFLOW_SKILL_NAMES = (
    "run-adaptive",
    "run-simple",
    "run-flow",
    "run-pipeline",
    "run-general",
    "run-spec",
    "run-ci",
    "run-modernize",
    "run-analysis",
    "run-ux",
    "run-committee",
)

CAPABILITY_SKILL_NAMES = (
    "artgen-scaffold",
    "devtools-ux-audit",
    "frontend-aesthetic-director",
    "ui-communication-designer",
    "ui-ux-workflow",
)

MANAGED_SKILL_NAMES = WORKFLOW_SKILL_NAMES + CAPABILITY_SKILL_NAMES

SKILL_MARKER_FILENAME = ".agents-pipeline-skill.json"
SKILL_MARKER_TOOL = "agents_pipeline.sync-codex-skills"
SKILL_MARKER_VERSION = 2
SUPPORTED_SKILL_MARKER_VERSIONS = (1, SKILL_MARKER_VERSION)
SKILL_SYNC_STATE_PENDING = "pending"
SKILL_SYNC_STATE_READY = "ready"


def is_linklike(path: Path) -> bool:
    """Return whether *path* is a symlink, junction, or reparse point."""

    if path.is_symlink():
        return True
    is_junction = getattr(path, "is_junction", None)
    if is_junction and is_junction():
        return True
    try:
        attributes = getattr(path.lstat(), "st_file_attributes", 0)
    except OSError:
        return False
    return bool(
        attributes
        & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    )


def skill_tree_digest(root: Path) -> str:
    """Hash every regular installed skill file except its ownership marker."""

    digest = hashlib.sha256()
    marker_path = root / SKILL_MARKER_FILENAME
    paths = sorted(
        path
        for path in root.rglob("*")
        if path != marker_path
    )
    for path in paths:
        if is_linklike(path):
            raise ValueError(f"Skill tree contains a link or reparse point: {path}")
        if path.is_dir():
            continue
        if not path.is_file():
            raise ValueError(f"Skill tree contains a non-regular entry: {path}")
        relative = path.relative_to(root).as_posix()
        digest.update(relative.encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def expected_skill_marker(
    content_root: Path,
    skill_name: str,
    *,
    installed_root: Path | None = None,
) -> dict[str, object]:
    target = installed_root or content_root
    return {
        "content_sha256": skill_tree_digest(content_root),
        "installed_root": target.resolve(strict=False).as_posix(),
        "skill_name": skill_name,
        "tool": SKILL_MARKER_TOOL,
        "version": SKILL_MARKER_VERSION,
    }


def skill_collection_issues(
    user_skills_root: Path, skill_names: Iterable[str]
) -> list[str]:
    """Return stable issue tokens for a marker-owned installed skill collection."""

    if is_linklike(user_skills_root) or not user_skills_root.is_dir():
        return ["skills:root"]

    issues: list[str] = []
    for skill_name in skill_names:
        target = user_skills_root / skill_name
        prefix = f"skills:{skill_name}"
        if is_linklike(target) or not target.is_dir():
            issues.append(prefix)
            continue
        skill_md = target / "SKILL.md"
        if is_linklike(skill_md) or not skill_md.is_file():
            issues.append(f"{prefix}/SKILL.md")
            continue
        marker_path = target / SKILL_MARKER_FILENAME
        if is_linklike(marker_path) or not marker_path.is_file():
            issues.append(f"{prefix}/marker")
            continue
        try:
            marker = json.loads(marker_path.read_text(encoding="utf-8"))
            expected = expected_skill_marker(target, skill_name)
        except (json.JSONDecodeError, OSError, UnicodeError, ValueError):
            issues.append(f"{prefix}/integrity")
            continue
        if marker != expected:
            issues.append(f"{prefix}/integrity")
    return issues

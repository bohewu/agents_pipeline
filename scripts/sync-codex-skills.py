#!/usr/bin/env python3
"""Safely synchronize agents_pipeline mode skills into a Codex user skill root."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import stat
import sys
import tempfile
from pathlib import Path


MANAGED_SKILL_NAMES = (
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
MARKER_FILE = ".agents-pipeline-skill.json"
MARKER_TOOL = "agents_pipeline.sync-codex-skills"
MARKER_VERSION = 1
SKILL_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
FRONTMATTER_NAME_RE = re.compile(
    r"\A---\s*\n(?P<body>.*?)\n---(?:\s*\n|\Z)", re.DOTALL
)
YAML_NAME_RE = re.compile(
    r"^name\s*:\s*['\"]?(?P<name>[a-z0-9][a-z0-9-]*)['\"]?\s*$",
    re.MULTILINE,
)


class SkillSyncError(RuntimeError):
    """A safe, actionable skill synchronization failure."""


def _is_linklike(path: Path) -> bool:
    if path.is_symlink():
        return True
    is_junction = getattr(path, "is_junction", None)
    if is_junction and is_junction():
        return True
    try:
        attributes = getattr(path.lstat(), "st_file_attributes", 0)
    except OSError:
        return False
    return bool(attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400))


def _absolute_lexical(value: str | Path) -> Path:
    return Path(os.path.abspath(os.fspath(Path(value).expanduser())))


def _validate_directory_chain(path: Path, label: str) -> None:
    """Reject link, junction, or reparse traversal in every lexical component."""

    absolute = _absolute_lexical(path)
    for candidate in reversed((absolute, *absolute.parents)):
        if candidate == Path(candidate.anchor):
            continue
        if _is_linklike(candidate):
            raise SkillSyncError(
                f"{label} must not traverse a symbolic link, junction, or reparse point: {candidate}"
            )


def _validate_regular_tree(root: Path, label: str) -> None:
    if _is_linklike(root) or not root.is_dir():
        raise SkillSyncError(f"{label} must be a real directory: {root}")
    for path in root.rglob("*"):
        if _is_linklike(path):
            raise SkillSyncError(
                f"{label} must not contain a symbolic link, junction, or reparse point: {path}"
            )
        if not path.is_dir() and not path.is_file():
            raise SkillSyncError(f"{label} contains a non-regular filesystem entry: {path}")


def _frontmatter_name(skill_md: Path) -> str:
    try:
        text = skill_md.read_text(encoding="utf-8")
    except (OSError, UnicodeError) as exc:
        raise SkillSyncError(
            f"Unable to read skill definition {skill_md}: {exc}"
        ) from exc
    frontmatter = FRONTMATTER_NAME_RE.match(text)
    if frontmatter is None:
        raise SkillSyncError(
            f"Skill definition is missing YAML frontmatter: {skill_md}"
        )
    name_match = YAML_NAME_RE.search(frontmatter.group("body"))
    if name_match is None:
        raise SkillSyncError(
            f"Skill definition is missing a safe frontmatter name: {skill_md}"
        )
    return name_match.group("name")


def validate_source_skills(source_skills_root: Path) -> dict[str, Path]:
    _validate_directory_chain(source_skills_root, "Skill source root")
    if _is_linklike(source_skills_root) or not source_skills_root.is_dir():
        raise SkillSyncError(
            f"Skill source root must be a real directory: {source_skills_root}"
        )
    sources: dict[str, Path] = {}
    for skill_name in MANAGED_SKILL_NAMES:
        if SKILL_NAME_RE.fullmatch(skill_name) is None:
            raise SkillSyncError(f"Unsafe managed skill name: {skill_name}")
        skill_root = source_skills_root / skill_name
        _validate_regular_tree(skill_root, f"Source skill '{skill_name}'")
        skill_md = skill_root / "SKILL.md"
        if not skill_md.is_file() or _is_linklike(skill_md):
            raise SkillSyncError(
                f"Source skill is missing a regular SKILL.md: {skill_md}"
            )
        declared_name = _frontmatter_name(skill_md)
        if declared_name != skill_name:
            raise SkillSyncError(
                f"Source skill name mismatch: expected '{skill_name}', found '{declared_name}' in {skill_md}"
            )
        sources[skill_name] = skill_root
    return sources


def _expected_marker(target: Path, skill_name: str) -> dict[str, object]:
    return {
        "installed_root": target.resolve(strict=False).as_posix(),
        "skill_name": skill_name,
        "tool": MARKER_TOOL,
        "version": MARKER_VERSION,
    }


def validate_existing_target(target: Path, skill_name: str) -> None:
    if not target.exists() and not target.is_symlink():
        return
    if _is_linklike(target) or not target.is_dir():
        raise SkillSyncError(f"Managed skill target must be a real directory: {target}")
    marker_path = target / MARKER_FILE
    if _is_linklike(marker_path) or not marker_path.is_file():
        raise SkillSyncError(
            f"Refusing to replace unowned skill directory without a regular ownership marker: {target}"
        )
    try:
        marker = json.loads(marker_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError, UnicodeError) as exc:
        raise SkillSyncError(f"Invalid skill ownership marker: {marker_path}") from exc
    expected = _expected_marker(target, skill_name)
    if marker != expected:
        raise SkillSyncError(f"Unexpected skill ownership marker: {marker_path}")
    _validate_regular_tree(target, f"Managed skill target '{skill_name}'")


def _validate_nonoverlapping_roots(source_root: Path, user_skills_root: Path) -> None:
    source = source_root.resolve(strict=False)
    target = user_skills_root.resolve(strict=False)
    if source == target or source.is_relative_to(target) or target.is_relative_to(source):
        raise SkillSyncError(
            "User skill root and canonical source skill root must not overlap: "
            f"{source} -> {target}"
        )


def _write_marker(staged_skill: Path, target: Path, skill_name: str) -> None:
    marker_path = staged_skill / MARKER_FILE
    marker_path.write_text(
        json.dumps(_expected_marker(target, skill_name), indent=2, sort_keys=True) + "\n",
        encoding="utf-8",
        newline="\n",
    )


def sync_managed_skills(
    source_skills_root: Path,
    user_skills_root: Path,
    *,
    dry_run: bool,
) -> None:
    source_skills_root = _absolute_lexical(source_skills_root)
    user_skills_root = _absolute_lexical(user_skills_root)
    sources = validate_source_skills(source_skills_root)
    _validate_nonoverlapping_roots(source_skills_root, user_skills_root)
    _validate_directory_chain(user_skills_root, "User skill root")
    if user_skills_root.exists() and not user_skills_root.is_dir():
        raise SkillSyncError(
            f"User skill root must be a directory: {user_skills_root}"
        )

    targets = {name: user_skills_root / name for name in MANAGED_SKILL_NAMES}
    for name, target in targets.items():
        validate_existing_target(target, name)

    if dry_run:
        print(
            "Dry run: would sync managed Codex skills "
            + ", ".join(MANAGED_SKILL_NAMES)
            + f" to {user_skills_root}"
        )
        return

    user_skills_root.mkdir(parents=True, exist_ok=True)
    _validate_directory_chain(user_skills_root, "User skill root")
    if _is_linklike(user_skills_root) or not user_skills_root.is_dir():
        raise SkillSyncError(
            f"User skill root must be a real directory: {user_skills_root}"
        )

    staging_root = Path(
        tempfile.mkdtemp(prefix=".agents-pipeline-skills.staging-", dir=user_skills_root)
    )
    backup_root: Path | None = None
    moved_new: list[str] = []
    moved_old: list[str] = []
    committed = False
    try:
        for name, source in sources.items():
            staged = staging_root / name
            shutil.copytree(
                source,
                staged,
                ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store"),
            )
            _write_marker(staged, targets[name], name)

        backup_root = Path(
            tempfile.mkdtemp(prefix=".agents-pipeline-skills.backup-", dir=user_skills_root)
        )
        for name in MANAGED_SKILL_NAMES:
            target = targets[name]
            if target.exists():
                os.replace(target, backup_root / name)
                moved_old.append(name)
            os.replace(staging_root / name, target)
            moved_new.append(name)
        committed = True
    except Exception as install_error:
        rollback_root: Path | None = None
        try:
            rollback_root = Path(
                tempfile.mkdtemp(
                    prefix=".agents-pipeline-skills.failed-", dir=user_skills_root
                )
            )
            for name in reversed(moved_new):
                target = targets[name]
                if target.exists() or target.is_symlink():
                    os.replace(target, rollback_root / name)
            if backup_root is not None:
                for name in reversed(moved_old):
                    saved = backup_root / name
                    if saved.exists():
                        os.replace(saved, targets[name])
            shutil.rmtree(rollback_root)
            if backup_root is not None and backup_root.exists():
                shutil.rmtree(backup_root)
                backup_root = None
        except Exception as rollback_error:
            preserved = backup_root or rollback_root or staging_root
            raise RuntimeError(
                "Managed skill installation and rollback both failed; "
                f"recovery data is preserved at {preserved}"
            ) from rollback_error
        raise SkillSyncError(
            f"Managed skill installation failed: {install_error}"
        ) from install_error
    finally:
        if staging_root.exists():
            shutil.rmtree(staging_root)

    if committed and backup_root is not None:
        try:
            shutil.rmtree(backup_root)
        except OSError as exc:
            raise SkillSyncError(
                "Managed skills were installed, but the previous-version backup "
                f"could not be removed: {backup_root}"
            ) from exc


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-skills-root", required=True)
    parser.add_argument("--user-skills-root", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    try:
        sync_managed_skills(
            Path(args.source_skills_root),
            Path(args.user_skills_root),
            dry_run=args.dry_run,
        )
    except (OSError, RuntimeError, SkillSyncError) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

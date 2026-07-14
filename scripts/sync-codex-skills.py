#!/usr/bin/env python3
"""Safely synchronize agents_pipeline skills into a Codex user skill root."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import tempfile
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
if SCRIPT_DIR.as_posix() not in sys.path:
    sys.path.insert(0, SCRIPT_DIR.as_posix())

from codex_skill_catalog import (
    CAPABILITY_SKILL_NAMES,
    MANAGED_SKILL_NAMES,
    SKILL_MARKER_FILENAME,
    SKILL_MARKER_TOOL,
    SKILL_MARKER_VERSION,
    SUPPORTED_SKILL_MARKER_VERSIONS,
    expected_skill_marker,
    is_linklike,
)


MARKER_FILE = SKILL_MARKER_FILENAME
MARKER_TOOL = SKILL_MARKER_TOOL
MARKER_VERSION = SKILL_MARKER_VERSION
SKILL_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
FRONTMATTER_NAME_RE = re.compile(
    r"\A---\s*\n(?P<body>.*?)\n---(?:\s*\n|\Z)", re.DOTALL
)
YAML_NAME_RE = re.compile(
    r"^name\s*:\s*['\"]?(?P<name>[a-z0-9][a-z0-9-]*)['\"]?\s*$",
    re.MULTILINE,
)
SUPPORT_RELATIVE_REF_RE = re.compile(
    r"(?<![A-Za-z0-9_./:-])(?:\.\./){2,}"
    r"(?P<relative>(?:agents|protocols|runtimes|scripts|tools)/[A-Za-z0-9_./-]+)"
)


class SkillSyncError(RuntimeError):
    """A safe, actionable skill synchronization failure."""


def _absolute_lexical(value: str | Path) -> Path:
    return Path(os.path.abspath(os.fspath(Path(value).expanduser())))


def _validate_directory_chain(path: Path, label: str) -> None:
    """Reject link, junction, or reparse traversal in every lexical component."""

    absolute = _absolute_lexical(path)
    for candidate in reversed((absolute, *absolute.parents)):
        if candidate == Path(candidate.anchor):
            continue
        if is_linklike(candidate):
            raise SkillSyncError(
                f"{label} must not traverse a symbolic link, junction, or reparse point: {candidate}"
            )


def _validate_regular_tree(root: Path, label: str) -> None:
    if is_linklike(root) or not root.is_dir():
        raise SkillSyncError(f"{label} must be a real directory: {root}")
    for path in root.rglob("*"):
        if is_linklike(path):
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
    if is_linklike(source_skills_root) or not source_skills_root.is_dir():
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
        if not skill_md.is_file() or is_linklike(skill_md):
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


def _legacy_marker(target: Path, skill_name: str) -> dict[str, object]:
    return {
        "installed_root": target.resolve(strict=False).as_posix(),
        "skill_name": skill_name,
        "tool": MARKER_TOOL,
        "version": 1,
    }


def validate_existing_target(
    target: Path,
    skill_name: str,
    *,
    migrate_legacy_skills: bool,
) -> str | None:
    """Return a preservation reason when replacement needs a saved backup."""

    if not target.exists() and not target.is_symlink():
        return None
    if is_linklike(target) or not target.is_dir():
        raise SkillSyncError(f"Managed skill target must be a real directory: {target}")
    marker_path = target / MARKER_FILE
    if is_linklike(marker_path) or not marker_path.is_file():
        if migrate_legacy_skills and skill_name in CAPABILITY_SKILL_NAMES:
            _validate_regular_tree(target, f"Legacy skill target '{skill_name}'")
            skill_md = target / "SKILL.md"
            if not skill_md.is_file() or is_linklike(skill_md):
                raise SkillSyncError(
                    f"Legacy skill is missing a regular SKILL.md: {skill_md}"
                )
            if _frontmatter_name(skill_md) != skill_name:
                raise SkillSyncError(
                    f"Legacy skill name does not match its directory: {target}"
                )
            return "legacy"
        migration_hint = (
            " Rerun with --migrate-legacy-skills to back up and replace this "
            "known capability skill."
            if skill_name in CAPABILITY_SKILL_NAMES
            else ""
        )
        raise SkillSyncError(
            "Refusing to replace unowned skill directory without a regular "
            f"ownership marker: {target}.{migration_hint}"
        )
    try:
        marker = json.loads(marker_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError, UnicodeError) as exc:
        raise SkillSyncError(f"Invalid skill ownership marker: {marker_path}") from exc
    if not isinstance(marker, dict) or marker.get("version") not in SUPPORTED_SKILL_MARKER_VERSIONS:
        raise SkillSyncError(f"Unexpected skill ownership marker: {marker_path}")
    _validate_regular_tree(target, f"Managed skill target '{skill_name}'")
    if marker.get("version") == 1:
        if marker != _legacy_marker(target, skill_name):
            raise SkillSyncError(f"Unexpected skill ownership marker: {marker_path}")
        # V1 markers predate content digests, so even an apparently official
        # copy may contain user edits. Preserve it before the first V2 refresh.
        return "v1"

    expected = expected_skill_marker(target, skill_name)
    expected_identity = {
        key: value for key, value in expected.items() if key != "content_sha256"
    }
    marker_identity = {
        key: value for key, value in marker.items() if key != "content_sha256"
    }
    digest = marker.get("content_sha256")
    if (
        set(marker) != set(expected)
        or marker_identity != expected_identity
        or not isinstance(digest, str)
        or re.fullmatch(r"[0-9a-f]{64}", digest) is None
    ):
        raise SkillSyncError(f"Unexpected skill ownership marker: {marker_path}")
    return None if marker == expected else "modified"


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
        json.dumps(
            expected_skill_marker(
                staged_skill,
                skill_name,
                installed_root=target,
            ),
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )


def _rewrite_support_references(staged_skill: Path, support_root: Path) -> None:
    """Point repo-relative references at the persistent global support tree."""

    support_prefix = support_root.resolve(strict=False).as_posix().rstrip("/")
    for path in sorted(staged_skill.rglob("*.md")):
        try:
            text = path.read_text(encoding="utf-8")
        except (OSError, UnicodeError) as exc:
            raise SkillSyncError(
                f"Unable to rewrite installed skill reference in {path}: {exc}"
            ) from exc
        rewritten = SUPPORT_RELATIVE_REF_RE.sub(
            lambda match: f"{support_prefix}/{match.group('relative')}",
            text,
        )
        if rewritten != text:
            try:
                path.write_text(rewritten, encoding="utf-8", newline="\n")
            except OSError as exc:
                raise SkillSyncError(
                    f"Unable to write installed skill reference in {path}: {exc}"
                ) from exc


def sync_managed_skills(
    source_skills_root: Path,
    user_skills_root: Path,
    support_root: Path,
    *,
    dry_run: bool,
    migrate_legacy_skills: bool = False,
) -> None:
    source_skills_root = _absolute_lexical(source_skills_root)
    user_skills_root = _absolute_lexical(user_skills_root)
    support_root = _absolute_lexical(support_root)
    sources = validate_source_skills(source_skills_root)
    _validate_nonoverlapping_roots(source_skills_root, user_skills_root)
    _validate_directory_chain(user_skills_root, "User skill root")
    _validate_directory_chain(support_root, "Global support root")
    if user_skills_root.exists() and not user_skills_root.is_dir():
        raise SkillSyncError(
            f"User skill root must be a directory: {user_skills_root}"
        )

    targets = {name: user_skills_root / name for name in MANAGED_SKILL_NAMES}
    target_states: dict[str, str] = {}
    for name, target in targets.items():
        state = validate_existing_target(
            target,
            name,
            migrate_legacy_skills=migrate_legacy_skills,
        )
        if state is not None:
            target_states[name] = state
    legacy_names = {
        name for name, state in target_states.items() if state == "legacy"
    }
    preserved_names = set(target_states)

    if dry_run:
        print(
            "Dry run: would sync managed Codex skills "
            + ", ".join(MANAGED_SKILL_NAMES)
            + f" to {user_skills_root}"
        )
        if legacy_names:
            print(
                "Dry run: would back up and migrate legacy capability skills "
                + ", ".join(sorted(legacy_names))
            )
        modified_names = {
            name for name, state in target_states.items() if state == "modified"
        }
        if modified_names:
            print(
                "Dry run: would preserve and repair modified managed skills "
                + ", ".join(sorted(modified_names))
            )
        v1_names = {name for name, state in target_states.items() if state == "v1"}
        if v1_names:
            print(
                "Dry run: would preserve V1 managed skills before upgrading markers "
                + ", ".join(sorted(v1_names))
            )
        return

    user_skills_root.mkdir(parents=True, exist_ok=True)
    _validate_directory_chain(user_skills_root, "User skill root")
    if is_linklike(user_skills_root) or not user_skills_root.is_dir():
        raise SkillSyncError(
            f"User skill root must be a real directory: {user_skills_root}"
        )

    staging_root = Path(
        tempfile.mkdtemp(prefix=".agents-pipeline-skills.staging-", dir=user_skills_root)
    )
    backup_root: Path | None = None
    legacy_backup_parent: Path | None = None
    legacy_backup_root: Path | None = None
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
            _rewrite_support_references(staged, support_root)
            _write_marker(staged, targets[name], name)

        backup_root = Path(
            tempfile.mkdtemp(prefix=".agents-pipeline-skills.backup-", dir=user_skills_root)
        )
        if preserved_names:
            legacy_backup_parent = (
                user_skills_root.parent
                / f".{user_skills_root.name}.agents-pipeline-backups"
            )
            _validate_directory_chain(legacy_backup_parent, "Legacy skill backup root")
            legacy_backup_parent.mkdir(parents=True, exist_ok=True)
            if is_linklike(legacy_backup_parent) or not legacy_backup_parent.is_dir():
                raise SkillSyncError(
                    "Legacy skill backup root must be a real directory: "
                    f"{legacy_backup_parent}"
                )
            legacy_backup_root = Path(
                tempfile.mkdtemp(
                    prefix="agents-pipeline-skills-",
                    dir=legacy_backup_parent,
                )
            )
        for name in MANAGED_SKILL_NAMES:
            target = targets[name]
            if target.exists() or target.is_symlink():
                destination_root = (
                    legacy_backup_root if name in preserved_names else backup_root
                )
                if destination_root is None:  # pragma: no cover - defensive invariant.
                    raise RuntimeError(f"Missing backup root for {name}")
                os.replace(target, destination_root / name)
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
                    source_root = (
                        legacy_backup_root if name in preserved_names else backup_root
                    )
                    if source_root is None:
                        continue
                    saved = source_root / name
                    if saved.exists():
                        os.replace(saved, targets[name])
            shutil.rmtree(rollback_root)
            if backup_root is not None and backup_root.exists():
                shutil.rmtree(backup_root)
                backup_root = None
            if legacy_backup_root is not None and legacy_backup_root.exists():
                shutil.rmtree(legacy_backup_root)
                legacy_backup_root = None
            if legacy_backup_parent is not None:
                try:
                    legacy_backup_parent.rmdir()
                except OSError:
                    pass
        except Exception as rollback_error:
            preserved = legacy_backup_root or backup_root or rollback_root or staging_root
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
    if committed and legacy_backup_root is not None:
        print(f"Replaced skill backup preserved at: {legacy_backup_root}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-skills-root", required=True)
    parser.add_argument("--user-skills-root", required=True)
    parser.add_argument("--support-root", required=True)
    parser.add_argument("--migrate-legacy-skills", action="store_true")
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    try:
        sync_managed_skills(
            Path(args.source_skills_root),
            Path(args.user_skills_root),
            Path(args.support_root),
            dry_run=args.dry_run,
            migrate_legacy_skills=args.migrate_legacy_skills,
        )
    except (OSError, RuntimeError, SkillSyncError) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

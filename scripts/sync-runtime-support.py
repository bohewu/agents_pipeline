#!/usr/bin/env python3
"""Safely synchronize the neutral support tree for Tier 2 runtime adapters."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path


SCRIPT_DIR = Path(__file__).resolve().parent
if SCRIPT_DIR.as_posix() not in sys.path:
    sys.path.insert(0, SCRIPT_DIR.as_posix())

from path_safety import is_linklike, validate_generated_shell_path  # noqa: E402


SUPPORT_DIRS = ("agents", "protocols", "runtimes", "scripts", "skills", "tools")
SUPPORT_FILES = ("AGENTS.md", "VERSION", "modes.json")
MARKER_FILE = ".agents-pipeline-support.json"
MARKER_TOOL = "agents_pipeline.sync-runtime-support"
MARKER_VERSION = 3
SUPPORTED_MARKER_VERSIONS = (1, 2, MARKER_VERSION)
SUPPORT_REF_RE = re.compile(
    r"(?<![A-Za-z0-9_./:-])((?:\./)?(?:agents|protocols|skills|tools)/[A-Za-z0-9_./-]+)"
)
ROOT_SCRIPT_REF_RE = re.compile(
    r"(?<![A-Za-z0-9_./:-])((?:\./)?scripts/[A-Za-z0-9_./-]+)"
)


def resolve_target(raw_target: str) -> Path:
    if not raw_target.strip():
        raise ValueError("--target-root must not be empty")
    normalized_target = validate_generated_shell_path(raw_target, "Support target")
    raw_path = Path(normalized_target)
    if is_linklike(raw_path):
        raise ValueError(
            f"Support target must not be a symbolic link or junction: {raw_path}"
        )
    absolute = raw_path if raw_path.is_absolute() else Path.cwd() / raw_path
    return absolute.parent.resolve() / absolute.name


def _reset_windows_acl_inheritance(target_root: Path) -> None:
    """Restore inherited ACLs on a completed staging tree before its move."""

    if sys.platform != "win32":
        return
    try:
        result = subprocess.run(
            ["icacls", os.fspath(target_root), "/reset", "/T", "/C"],
            capture_output=True,
            check=False,
            text=True,
        )
    except OSError as exc:
        raise ValueError(
            f"Unable to reset Windows ACL inheritance for support staging tree: {target_root}"
        ) from exc
    if result.returncode != 0:
        detail = (result.stderr or result.stdout).strip()
        raise ValueError(
            "Unable to reset Windows ACL inheritance for support staging tree: "
            f"{target_root} (icacls exited {result.returncode}"
            + (f": {detail}" if detail else "")
            + ")"
        )


def _verify_installed_support_tree(target_root: Path) -> None:
    """Ensure a newly moved support tree is immediately usable before success."""

    try:
        if is_linklike(target_root) or not target_root.is_dir():
            raise ValueError(
                f"Installed support target must be a real directory: {target_root}"
            )
        list(target_root.iterdir())
        validate_source(target_root)
        contents: dict[str, str] = {}
        for name in (*SUPPORT_FILES, MARKER_FILE):
            path = target_root / name
            if is_linklike(path) or not path.is_file():
                raise ValueError(
                    f"Installed support target is missing a regular file: {path}"
                )
            contents[name] = path.read_text(encoding="utf-8")
        marker = json.loads(contents[MARKER_FILE])
    except (OSError, UnicodeError, json.JSONDecodeError, ValueError) as exc:
        raise ValueError(
            f"Installed support target is not readable: {target_root}"
        ) from exc
    expected_marker = {
        "installed_root": target_root.resolve().as_posix(),
        "tool": MARKER_TOOL,
        "version": MARKER_VERSION,
    }
    if marker != expected_marker:
        raise ValueError(
            f"Installed support target failed ownership verification: {target_root}"
        )


def validate_source(source_root: Path) -> None:
    missing = [name for name in SUPPORT_DIRS if not (source_root / name).is_dir()]
    missing.extend(name for name in SUPPORT_FILES if not (source_root / name).is_file())
    if missing:
        raise ValueError(
            f"Neutral support source is incomplete at {source_root}: {', '.join(missing)}"
        )


def validate_existing_target(target_root: Path) -> None:
    if is_linklike(target_root):
        raise ValueError(f"Support target must be a real directory: {target_root}")
    if not target_root.exists():
        return
    if not target_root.is_dir():
        raise ValueError(f"Support target must be a real directory: {target_root}")
    marker_path = target_root / MARKER_FILE
    if is_linklike(marker_path):
        raise ValueError(f"Support ownership marker must be a regular non-link file: {marker_path}")
    try:
        if not marker_path.is_file():
            return
        marker = json.loads(marker_path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError, OSError, UnicodeError) as exc:
        # Do not inspect an unowned or inaccessible tree. It is moved as opaque
        # stale state into the transactional backup below.
        return
    marker_version = marker.get("version") if isinstance(marker, dict) else None
    expected_keys = (
        {"tool", "version", "installed_root"}
        if marker_version == MARKER_VERSION
        else {"tool", "version"}
    )
    if (
        not isinstance(marker, dict)
        or set(marker) != expected_keys
        or marker.get("tool") != MARKER_TOOL
        or type(marker.get("version")) is not int
        or marker.get("version") not in SUPPORTED_MARKER_VERSIONS
    ):
        return
    if marker_version == MARKER_VERSION:
        installed_root = marker.get("installed_root")
        if (
            not isinstance(installed_root, str)
            or installed_root != target_root.resolve().as_posix()
        ):
            return


def source_installed_root(source_root: Path) -> Path | None:
    marker_path = source_root / MARKER_FILE
    if is_linklike(marker_path) or not marker_path.is_file():
        return None
    try:
        marker = json.loads(marker_path.read_text(encoding="utf-8"))
    except (json.JSONDecodeError, OSError):
        return None
    if not isinstance(marker, dict) or marker.get("tool") != MARKER_TOOL:
        return None
    version = marker.get("version")
    if type(version) is not int or version not in SUPPORTED_MARKER_VERSIONS:
        return None
    if version == MARKER_VERSION:
        installed_root = marker.get("installed_root")
        if not isinstance(installed_root, str):
            return None
        return Path(installed_root).expanduser().resolve()
    return source_root.resolve()


def validate_nonoverlapping_roots(source_root: Path, target_root: Path) -> None:
    source = source_root.resolve(strict=False)
    target = target_root.resolve(strict=False)
    if source == target:
        return
    copied_roots = [source / name for name in SUPPORT_DIRS]
    if source.is_relative_to(target) or any(
        target.is_relative_to(copied_root) for copied_root in copied_roots
    ):
        raise ValueError(
            "Support target must not contain the source or be nested under a copied "
            f"source directory: {source} -> {target}"
        )


def rewrite_support_refs(
    text: str,
    target_root: Path,
    *,
    relative_path: Path | None = None,
    previous_root: Path | None = None,
) -> str:
    normalized_root = target_root.as_posix().rstrip("/")
    if previous_root is not None:
        text = text.replace(previous_root.as_posix().rstrip("/"), normalized_root)
    text = re.sub(
        r"\bnode\s+[\"']?(?:\./)?tools/(status-event|reasoning-policy|capability-recovery|codex-child-trace)\.js[\"']?",
        lambda match: f'node "{normalized_root}/tools/{match.group(1)}.js"',
        text,
    )

    def repl(match: re.Match[str]) -> str:
        relative_path = match.group(1).removeprefix("./")
        return f"{normalized_root}/{relative_path}"

    rewritten = SUPPORT_REF_RE.sub(repl, text.replace("$ARGUMENTS", "raw_input"))
    if relative_path is not None and (
        relative_path.as_posix() == "AGENTS.md"
        or (relative_path.parts and relative_path.parts[0] in {"agents", "protocols"})
    ):
        rewritten = ROOT_SCRIPT_REF_RE.sub(
            lambda match: (
                f'"{normalized_root}/'
                f'{match.group(1).removeprefix("./")}"'
            ),
            rewritten,
        )
    return rewritten


def populate_staging(source_root: Path, staging_root: Path, target_root: Path) -> None:
    previous_root = source_installed_root(source_root)
    for name in SUPPORT_DIRS:
        shutil.copytree(
            source_root / name,
            staging_root / name,
            ignore=shutil.ignore_patterns("__pycache__", "*.pyc", ".DS_Store"),
        )
    for name in SUPPORT_FILES:
        shutil.copy2(source_root / name, staging_root / name)
    for markdown_path in staging_root.rglob("*.md"):
        markdown_path.write_text(
            rewrite_support_refs(
                markdown_path.read_text(encoding="utf-8"),
                target_root,
                relative_path=markdown_path.relative_to(staging_root),
                previous_root=previous_root,
            ),
            encoding="utf-8",
            newline="\n",
        )
    (staging_root / MARKER_FILE).write_text(
        json.dumps(
            {
                "installed_root": target_root.resolve().as_posix(),
                "tool": MARKER_TOOL,
                "version": MARKER_VERSION,
            },
            indent=2,
            sort_keys=True,
        )
        + "\n",
        encoding="utf-8",
        newline="\n",
    )


def sync_support_tree(source_root: Path, target_root: Path, *, dry_run: bool) -> None:
    target_root = Path(
        validate_generated_shell_path(target_root, "Support target")
    )
    validate_source(source_root)
    validate_nonoverlapping_roots(source_root, target_root)
    validate_existing_target(target_root)
    if dry_run:
        print(f"Dry run: would sync neutral support tree to {target_root}")
        return

    target_root.parent.mkdir(parents=True, exist_ok=True)
    staging_root = Path(
        tempfile.mkdtemp(prefix=f".{target_root.name}.staging-", dir=target_root.parent)
    )
    backup_root: Path | None = None
    moved_old = False
    moved_new = False
    try:
        populate_staging(source_root, staging_root, target_root)
        _reset_windows_acl_inheritance(staging_root)
        if target_root.exists() or target_root.is_symlink():
            backup_root = Path(
                tempfile.mkdtemp(
                    prefix=f".{target_root.name}.backup-", dir=target_root.parent
                )
            )
            backup_root.rmdir()
            os.replace(target_root, backup_root)
            moved_old = True
        os.replace(staging_root, target_root)
        moved_new = True
        _verify_installed_support_tree(target_root)
    except Exception as install_error:
        rollback_root: Path | None = None
        try:
            if moved_new and (target_root.exists() or target_root.is_symlink()):
                rollback_root = Path(
                    tempfile.mkdtemp(
                        prefix=f".{target_root.name}.failed-", dir=target_root.parent
                    )
                )
                os.replace(target_root, rollback_root / target_root.name)
            if moved_old and backup_root is not None and backup_root.exists():
                os.replace(backup_root, target_root)
                backup_root = None
            if rollback_root is not None:
                shutil.rmtree(rollback_root)
        except Exception as rollback_error:
            if backup_root is not None and backup_root.exists():
                raise RuntimeError(
                    "Support tree installation and rollback both failed for "
                    f"{target_root}; the previous tree is preserved at {backup_root}"
                ) from rollback_error
            preserved = rollback_root or target_root
            raise RuntimeError(
                "Support tree installation and rollback both failed for "
                f"{target_root}; recovery data is preserved at {preserved}"
            ) from rollback_error
        raise ValueError(
            f"Support tree installation failed for {target_root}: {install_error}"
        ) from install_error
    finally:
        if staging_root.exists():
            shutil.rmtree(staging_root)

    if backup_root is not None:
        try:
            shutil.rmtree(backup_root)
        except OSError as cleanup_error:
            print(
                "Support tree installed successfully, but cleanup of the previous "
                f"backup failed; it remains at {backup_root}: {cleanup_error}",
                file=sys.stderr,
            )


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--source-root", required=True)
    parser.add_argument("--target-root", required=True)
    parser.add_argument("--dry-run", action="store_true")
    args = parser.parse_args()

    try:
        source_root = Path(args.source_root).expanduser().resolve()
        target_root = resolve_target(args.target_root)
        sync_support_tree(source_root, target_root, dry_run=args.dry_run)
    except (OSError, RuntimeError, ValueError) as exc:
        print(str(exc), file=sys.stderr)
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

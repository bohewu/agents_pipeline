#!/usr/bin/env python3
"""Manage a thin project-local Codex profile overlay over a global install."""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import stat
import subprocess
import sys
import tempfile
from pathlib import Path
from typing import Any, Mapping, Sequence

try:  # Python 3.11+ is required for safe TOML validation.
    import tomllib
except ImportError:  # pragma: no cover - exercised only on Python 3.10.
    tomllib = None  # type: ignore[assignment]

from codex_skill_catalog import (
    MANAGED_SKILL_NAMES,
    SKILL_MARKER_VERSION,
    SKILL_SYNC_STATE_READY,
    skill_collection_issues,
)


PROJECT_MANIFEST_FILENAME = ".agents-pipeline-project-profile.json"
CACHE_MANIFEST_FILENAME = ".agents-pipeline-profile-cache.json"
GLOBAL_MANIFEST_FILENAME = ".agents-pipeline-codex-manifest.json"
SUPPORT_MARKER_FILENAME = ".agents-pipeline-support.json"
PROJECT_MANIFEST_TOOL = "agents_pipeline.codex-project-profile"
CACHE_MANIFEST_TOOL = "agents_pipeline.codex-profile-cache"
GLOBAL_MANIFEST_TOOL = "agents_pipeline.install-codex-config"
SUPPORT_MARKER_TOOL = "agents_pipeline.sync-runtime-support"
PROJECT_MANIFEST_VERSION = 2
SUPPORTED_PROJECT_MANIFEST_VERSIONS = (1, PROJECT_MANIFEST_VERSION)
CACHE_MANIFEST_VERSION = 2
SUPPORTED_CACHE_MANIFEST_VERSIONS = (1, CACHE_MANIFEST_VERSION)
SUPPORTED_GLOBAL_MANIFEST_VERSIONS = (2, 3, 4)
SUPPORTED_SUPPORT_MARKER_VERSIONS = (1, 2, 3)
SUPPORT_COMMON_REQUIRED_DIRS = (
    "agents",
    "protocols",
    "runtimes",
    "scripts",
    "skills",
    "tools",
)
SUPPORT_COMMON_REQUIRED_FILES = (
    "AGENTS.md",
    "VERSION",
    "modes.json",
    "protocols/UI_UX_WORKFLOW.md",
    "protocols/UX_DEVTOOLS_WORKFLOW.md",
    "scripts/agent-profile.sh",
    "scripts/agent-profile.ps1",
    "scripts/agent_model_profiles.py",
    "scripts/path_safety.py",
    "scripts/sync-runtime-support.py",
    "tools/agent-profile.py",
    "tools/status-event.js",
)
SUPPORT_CODEX_REQUIRED_FILES = (
    "tools/codex-child-trace.js",
    "scripts/codex_mode_aliases.py",
    "scripts/codex-project-profile.py",
    "scripts/codex_skill_catalog.py",
    "scripts/export-codex-agents.py",
    "scripts/install-codex-config.py",
    "scripts/install-codex.sh",
    "scripts/install-codex.ps1",
    "scripts/sync-codex-skills.py",
)
BEGIN_MARKER = "# BEGIN agents-pipeline-codex-project-profile"
END_MARKER = "# END agents-pipeline-codex-project-profile"
GLOBAL_AGENTS_BEGIN_MARKER = "<!-- BEGIN agents-pipeline-codex-managed -->"
GLOBAL_AGENTS_END_MARKER = "<!-- END agents-pipeline-codex-managed -->"
AGENT_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
SAFE_COMPONENT_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
AGENT_TABLE_RE = re.compile(
    r"^\s*\[\s*agents\s*\.\s*(?:"
    r'"(?P<double>[a-z0-9][a-z0-9-]*)"|'
    r"'(?P<single>[a-z0-9][a-z0-9-]*)'|"
    r"(?P<bare>[a-z0-9][a-z0-9-]*))"
    r"(?:\s*\.[^\]]+)?\s*\]\s*(?:#.*)?$",
    re.MULTILINE,
)


class ProjectProfileError(RuntimeError):
    """A safe, actionable project profile error."""


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


def _canonical(path: str | Path) -> Path:
    return Path(path).expanduser().resolve(strict=False)


def _validate_leaf(path: Path, label: str) -> None:
    if _is_linklike(path):
        raise ProjectProfileError(f"{label} must not be a symbolic link or junction: {path}")
    if path.exists() and not path.is_file():
        raise ProjectProfileError(f"{label} must be a regular file: {path}")


def _validated_project_dir(workspace: Path) -> Path:
    project_dir = workspace / ".codex"
    if _is_linklike(project_dir):
        raise ProjectProfileError(
            f"Project .codex directory must not be a symbolic link or junction: {project_dir}"
        )
    if project_dir.exists() and not project_dir.is_dir():
        raise ProjectProfileError(f"Project .codex path must be a directory: {project_dir}")
    return project_dir


def _validate_directory_chain(root: Path, target: Path, label: str) -> None:
    """Reject link/junction traversal beneath a managed root."""

    try:
        relative = target.relative_to(root)
    except ValueError as exc:
        raise ProjectProfileError(f"{label} escapes its managed root: {target}") from exc
    current = root
    for part in relative.parts:
        current = current / part
        if _is_linklike(current):
            raise ProjectProfileError(
                f"{label} must not traverse a symbolic link or junction: {current}"
            )
        if current.exists() and not current.is_dir():
            raise ProjectProfileError(f"{label} parent must be a directory: {current}")


def _load_json(path: Path, label: str) -> dict[str, Any]:
    _validate_leaf(path, label)
    if not path.is_file():
        raise ProjectProfileError(f"{label} not found: {path}")
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        raise ProjectProfileError(
            f"Invalid JSON in {label.lower()} {path} at line {exc.lineno}, "
            f"column {exc.colno}: {exc.msg}"
        ) from exc
    except (OSError, UnicodeDecodeError) as exc:
        raise ProjectProfileError(f"Unable to read {label.lower()} as UTF-8: {path}") from exc
    if not isinstance(value, dict):
        raise ProjectProfileError(f"{label} must contain a JSON object: {path}")
    return value


def _atomic_write(path: Path, content: str) -> None:
    _atomic_write_bytes(path, content.encode("utf-8"))


def _atomic_write_bytes(path: Path, content: bytes) -> None:
    _validate_leaf(path, "Managed project profile file")
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, temp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
    temp_path = Path(temp_name)
    try:
        with os.fdopen(fd, "wb") as handle:
            handle.write(content)
            handle.flush()
            os.fsync(handle.fileno())
        os.chmod(temp_path, path.stat().st_mode & 0o777 if path.exists() else 0o644)
        os.replace(temp_path, path)
    finally:
        try:
            temp_path.unlink()
        except FileNotFoundError:
            pass


def _atomic_json(path: Path, payload: Mapping[str, Any]) -> None:
    _atomic_write(
        path,
        json.dumps(payload, indent=2, sort_keys=True, ensure_ascii=False) + "\n",
    )


def _safe_agent_names(value: Any, *, label: str) -> list[str]:
    if not isinstance(value, list) or not all(
        isinstance(item, str) and AGENT_NAME_RE.fullmatch(item) for item in value
    ):
        raise ProjectProfileError(f"{label} must contain safe Codex agent names.")
    if len(value) != len(set(value)):
        raise ProjectProfileError(f"{label} contains duplicate agent names.")
    return sorted(value)


def _safe_component(value: str, label: str) -> str:
    if SAFE_COMPONENT_RE.fullmatch(value) is None:
        raise ProjectProfileError(f"Unsafe {label}: {value!r}")
    return value


def _sha256_file(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as handle:
        for chunk in iter(lambda: handle.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _cache_agent_hashes(value: Any, agent_names: Sequence[str]) -> dict[str, str] | None:
    if not isinstance(value, dict) or set(value) != set(agent_names):
        return None
    if not all(
        isinstance(name, str)
        and isinstance(digest, str)
        and re.fullmatch(r"[0-9a-f]{64}", digest)
        for name, digest in value.items()
    ):
        return None
    return {name: value[name] for name in sorted(agent_names)}


def _asset_version(asset_root: Path) -> str:
    version_path = asset_root / "VERSION"
    if not version_path.is_file():
        raise ProjectProfileError(f"VERSION not found under profile asset root: {asset_root}")
    try:
        version = version_path.read_text(encoding="utf-8").strip()
    except (OSError, UnicodeDecodeError) as exc:
        raise ProjectProfileError(f"Unable to read VERSION as UTF-8: {version_path}") from exc
    if re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", version) is None:
        raise ProjectProfileError(f"Invalid VERSION value under profile asset root: {version!r}")
    return version


def _markdown_marker_indexes(lines: Sequence[str], marker: str) -> list[int]:
    indexes: list[int] = []
    fence_char: str | None = None
    fence_length = 0
    for index, line in enumerate(lines):
        leading_spaces = len(line) - len(line.lstrip(" "))
        candidate = line[leading_spaces:] if leading_spaces <= 3 else ""
        if fence_char is not None:
            run = len(candidate) - len(candidate.lstrip(fence_char))
            if run >= fence_length and not candidate[run:].strip():
                fence_char = None
                fence_length = 0
            continue
        if candidate.startswith("```") or candidate.startswith("~~~"):
            fence_char = candidate[0]
            fence_length = len(candidate) - len(candidate.lstrip(fence_char))
            continue
        if leading_spaces >= 4 or line.startswith("\t"):
            continue
        if line.strip() == marker:
            indexes.append(index)
    return indexes


def _validate_global_codex_registration(global_target: Path, names: Sequence[str]) -> None:
    config_path = global_target / "config.toml"
    _validate_leaf(config_path, "Global Codex config")
    if not config_path.is_file():
        raise ProjectProfileError(f"Global Codex config is missing: {config_path}")
    try:
        config = tomllib.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError) as exc:
        raise ProjectProfileError(f"Unable to read global Codex config: {config_path}") from exc
    except tomllib.TOMLDecodeError as exc:
        raise ProjectProfileError(f"Global Codex config is invalid TOML: {exc}") from exc
    agents = config.get("agents")
    if not isinstance(agents, dict):
        raise ProjectProfileError("Global Codex config has no agents table.")
    for name in names:
        entry = agents.get(name)
        raw_path = entry.get("config_file") if isinstance(entry, dict) else None
        if not isinstance(raw_path, str) or not raw_path:
            raise ProjectProfileError(f"Global Codex config does not register agent {name}.")
        candidate = Path(raw_path).expanduser()
        if not candidate.is_absolute():
            candidate = global_target / candidate
        expected = global_target / "agents" / f"{name}.toml"
        if candidate.resolve(strict=False) != expected.resolve():
            raise ProjectProfileError(
                f"Global Codex agent {name} points outside its managed role file."
            )
    features = config.get("features")
    if not isinstance(features, dict) or features.get("multi_agent") is not True:
        raise ProjectProfileError("Global Codex config does not enable features.multi_agent.")

    override = global_target / "AGENTS.override.md"
    _validate_leaf(override, "Global Codex AGENTS override")
    try:
        override_active = (
            override.is_file() and override.read_text(encoding="utf-8").strip()
        )
    except (OSError, UnicodeDecodeError) as exc:
        raise ProjectProfileError(f"Unable to read global Codex AGENTS override: {override}") from exc
    active = override if override_active else global_target / "AGENTS.md"
    _validate_leaf(active, "Global Codex AGENTS file")
    if not active.is_file():
        raise ProjectProfileError(f"Global Codex AGENTS file is missing: {active}")
    try:
        lines = active.read_text(encoding="utf-8").splitlines()
    except (OSError, UnicodeDecodeError) as exc:
        raise ProjectProfileError(f"Unable to read global Codex AGENTS file: {active}") from exc
    starts = _markdown_marker_indexes(lines, GLOBAL_AGENTS_BEGIN_MARKER)
    ends = _markdown_marker_indexes(lines, GLOBAL_AGENTS_END_MARKER)
    if len(starts) != 1 or len(ends) != 1 or ends[0] <= starts[0]:
        raise ProjectProfileError(
            f"Global Codex AGENTS managed mode block is missing or malformed: {active}"
        )


def _project_trust_state(global_target: Path, workspace: Path) -> str:
    """Return Codex's explicit trust decision without changing global config."""

    config_path = global_target / "config.toml"
    _validate_leaf(config_path, "Global Codex config")
    if not config_path.is_file():
        raise ProjectProfileError(f"Global Codex config is missing: {config_path}")
    try:
        config = tomllib.loads(config_path.read_text(encoding="utf-8"))
    except (OSError, UnicodeDecodeError) as exc:
        raise ProjectProfileError(f"Unable to read global Codex config: {config_path}") from exc
    except tomllib.TOMLDecodeError as exc:
        raise ProjectProfileError(f"Global Codex config is invalid TOML: {exc}") from exc
    projects = config.get("projects")
    if not isinstance(projects, dict):
        return "unknown"
    entry = projects.get(str(workspace))
    if not isinstance(entry, dict):
        for raw_path, candidate in projects.items():
            if (
                isinstance(raw_path, str)
                and isinstance(candidate, dict)
                and _canonical(raw_path) == workspace
            ):
                entry = candidate
                break
    if not isinstance(entry, dict):
        return "unknown"
    trust_level = entry.get("trust_level")
    return trust_level if trust_level in ("trusted", "untrusted") else "unknown"


def _eligibility_metadata(
    global_target: Path, workspace: Path, *, configured: bool
) -> dict[str, str]:
    trust = _project_trust_state(global_target, workspace)
    if not configured:
        eligibility = "not_configured"
    else:
        eligibility = "eligible" if trust == "trusted" else "ineligible"
    return {"profile_eligibility": eligibility, "project_trust": trust}


def _asset_digest(
    asset_root: Path,
    *,
    profile: str | None,
    model_set: str | None,
    uniform_model: str | None,
) -> str:
    """Fingerprint every input that can change generated Codex role files."""

    relative_paths = [
        Path("VERSION"),
        Path("AGENTS.md"),
        Path("modes.json"),
        Path("scripts/export-codex-agents.py"),
        Path("scripts/agent_model_profiles.py"),
        Path("scripts/codex_mode_aliases.py"),
    ]
    relative_paths.extend(
        path.relative_to(asset_root) for path in sorted((asset_root / "agents").glob("*.md"))
    )
    if not uniform_model:
        if not profile or not model_set:
            raise ProjectProfileError("Named profile cache digest requires a profile and model set.")
        relative_paths.extend(
            [
                Path("tools/agent-profiles") / f"{profile}.json",
                Path("runtimes/codex/model-sets") / f"{model_set}.json",
            ]
        )

    digest = hashlib.sha256()
    digest.update((uniform_model or "").encode("utf-8"))
    digest.update(b"\0")
    for relative in relative_paths:
        path = asset_root / relative
        if not path.is_file() or _is_linklike(path):
            raise ProjectProfileError(f"Profile cache input is missing or unsafe: {path}")
        digest.update(relative.as_posix().encode("utf-8"))
        digest.update(b"\0")
        digest.update(path.read_bytes())
        digest.update(b"\0")
    return digest.hexdigest()


def validate_global_install(global_target: Path) -> list[str]:
    manifest_path = global_target / GLOBAL_MANIFEST_FILENAME
    data = _load_json(manifest_path, "Global Codex installer manifest")
    if data.get("tool") != GLOBAL_MANIFEST_TOOL:
        raise ProjectProfileError(f"Unexpected global Codex manifest identity: {manifest_path}")
    if data.get("version") not in SUPPORTED_GLOBAL_MANIFEST_VERSIONS:
        raise ProjectProfileError(f"Unsupported global Codex manifest version: {manifest_path}")
    declared_target = data.get("target_dir")
    if not isinstance(declared_target, str) or _canonical(declared_target) != global_target:
        raise ProjectProfileError(
            f"Global Codex manifest target does not match {global_target}; rerun the global bootstrap."
        )
    if data.get("mode") != "default" or any(
        data.get(key) is not None
        for key in ("profile", "model_set", "uniform_model")
    ):
        raise ProjectProfileError(
            "Global Codex roles must be model-free. Run the installed profile "
            "manager with 'clear --runtime codex --scope global' before using a "
            "workspace profile."
        )
    if data.get("version") >= 4:
        raw_skill_root = data.get("managed_user_skills_root")
        raw_skill_names = data.get("managed_skill_names")
        raw_marker_version = data.get("managed_skill_marker_version")
        raw_sync_state = data.get("managed_skill_sync_state")
        if raw_skill_root is None:
            if (
                raw_skill_names != []
                or raw_marker_version is not None
                or raw_sync_state is not None
            ):
                raise ProjectProfileError(
                    "Global Codex skill metadata is invalid; rerun the global bootstrap."
                )
        elif (
            not isinstance(raw_skill_root, str)
            or not Path(raw_skill_root).is_absolute()
            or raw_skill_names != sorted(MANAGED_SKILL_NAMES)
            or raw_marker_version != SKILL_MARKER_VERSION
            or raw_sync_state != SKILL_SYNC_STATE_READY
        ):
            raise ProjectProfileError(
                "Global Codex skill metadata is missing or invalid; rerun the global bootstrap."
            )
        else:
            skill_issues = skill_collection_issues(
                _canonical(raw_skill_root), raw_skill_names
            )
            if skill_issues:
                raise ProjectProfileError(
                    "Global Codex discovery skills are incomplete or modified; rerun "
                    "the global bootstrap. Issues: " + ", ".join(skill_issues)
                )
    names = _safe_agent_names(data.get("managed_agent_names"), label="managed_agent_names")
    files = data.get("managed_agent_files")
    if not isinstance(files, list) or not all(isinstance(item, str) for item in files):
        raise ProjectProfileError("managed_agent_files must be an array of strings.")
    expected_files = [f"agents/{name}.toml" for name in names]
    if sorted(files) != expected_files:
        raise ProjectProfileError("Global Codex managed agent names/files do not correspond.")
    agents_dir = global_target / "agents"
    if _is_linklike(agents_dir) or not agents_dir.is_dir():
        raise ProjectProfileError(
            f"Global Codex agents directory is missing or unsafe: {agents_dir}"
        )
    for relative in expected_files:
        path = global_target / relative
        if _is_linklike(path) or not path.is_file():
            raise ProjectProfileError(f"Global Codex agent definition is missing or unsafe: {path}")
        try:
            role = tomllib.loads(path.read_text(encoding="utf-8"))
        except (OSError, UnicodeDecodeError, tomllib.TOMLDecodeError) as exc:
            raise ProjectProfileError(
                f"Global Codex agent definition is invalid: {path}"
            ) from exc
        overrides = sorted({"model", "model_provider"}.intersection(role))
        if overrides:
            raise ProjectProfileError(
                "Global Codex roles must be model-free; found "
                + ", ".join(overrides)
                + f" in {path}. Run the installed profile manager with "
                "'clear --runtime codex --scope global'."
            )

    support_root = global_target / "agents-pipeline"
    if _is_linklike(support_root) or not support_root.is_dir():
        raise ProjectProfileError(
            f"Global neutral support tree is missing; rerun the global bootstrap: {support_root}"
        )
    missing_support = [
        name
        for name in SUPPORT_COMMON_REQUIRED_DIRS
        if _is_linklike(support_root / name) or not (support_root / name).is_dir()
    ]
    required_support_files = (
        SUPPORT_COMMON_REQUIRED_FILES + SUPPORT_CODEX_REQUIRED_FILES
    )
    missing_support.extend(
        name
        for name in required_support_files
        if _is_linklike(support_root / name) or not (support_root / name).is_file()
    )
    if missing_support:
        raise ProjectProfileError(
            "Global neutral support tree is incomplete; rerun the global bootstrap. "
            "Missing: "
            + ", ".join(sorted(missing_support))
        )
    marker = _load_json(
        support_root / SUPPORT_MARKER_FILENAME, "Global support ownership marker"
    )
    if (
        marker.get("tool") != SUPPORT_MARKER_TOOL
        or marker.get("version") not in SUPPORTED_SUPPORT_MARKER_VERSIONS
    ):
        raise ProjectProfileError(f"Unexpected global support ownership marker: {support_root}")
    if marker.get("version") == 3:
        installed_root = marker.get("installed_root")
        if (
            not isinstance(installed_root, str)
            or _canonical(installed_root) != support_root
        ):
            raise ProjectProfileError(
                f"Global support ownership marker root mismatch: {support_root}"
            )
    _validate_global_codex_registration(global_target, names)
    return names


def _cache_identity(
    *, version: str, profile: str | None, model_set: str | None, uniform_model: str | None
) -> tuple[Path, str]:
    if uniform_model:
        digest = hashlib.sha256(uniform_model.encode("utf-8")).hexdigest()[:16]
        return Path(f"v{version}") / "codex" / "uniform" / digest, f"uniform:{uniform_model}"
    if not profile or not model_set:
        raise ProjectProfileError("A named project profile requires both profile and model set.")
    return (
        Path(f"v{version}")
        / "codex"
        / _safe_component(model_set, "model set")
        / _safe_component(profile, "profile"),
        f"profile:{profile}:{model_set}",
    )


def _selection_from_manifest(
    data: Mapping[str, Any], *, label: str
) -> tuple[str | None, str | None, str | None]:
    mode = data.get("mode")
    profile = data.get("profile")
    model_set = data.get("model_set")
    uniform_model = data.get("uniform_model")
    if mode == "profile":
        if not isinstance(profile, str) or not profile:
            raise ProjectProfileError(f"{label} profile mode requires a profile name.")
        if not isinstance(model_set, str) or not model_set:
            raise ProjectProfileError(f"{label} profile mode requires a model set.")
        if uniform_model is not None:
            raise ProjectProfileError(f"{label} profile mode must not set a uniform model.")
        return profile, model_set, None
    if mode == "uniform":
        if profile not in (None, "uniform") or model_set is not None:
            raise ProjectProfileError(f"{label} has invalid uniform profile metadata.")
        if not isinstance(uniform_model, str) or not uniform_model:
            raise ProjectProfileError(f"{label} uniform mode requires a model name.")
        return None, None, uniform_model
    raise ProjectProfileError(f"{label} has unsupported mode {mode!r}.")


def _cache_is_reusable(
    path: Path,
    *,
    identity: str,
    source_version: str,
    asset_digest: str,
    agent_names: Sequence[str],
) -> bool:
    if not path.exists():
        return False
    if _is_linklike(path) or not path.is_dir():
        raise ProjectProfileError(f"Profile cache target must be a real directory: {path}")
    marker = _load_json(path / CACHE_MANIFEST_FILENAME, "Profile cache marker")
    if (
        marker.get("tool") != CACHE_MANIFEST_TOOL
        or marker.get("version") not in SUPPORTED_CACHE_MANIFEST_VERSIONS
    ):
        raise ProjectProfileError(f"Refusing to replace an unowned profile cache: {path}")
    if marker.get("version") != CACHE_MANIFEST_VERSION:
        return False
    if marker.get("identity") != identity or marker.get("source_version") != source_version:
        raise ProjectProfileError(f"Profile cache identity does not match its path: {path}")
    if marker.get("asset_digest") != asset_digest:
        return False
    try:
        cached_names = _safe_agent_names(marker.get("agent_names"), label="cache agent_names")
    except ProjectProfileError:
        return False
    expected_names = sorted(agent_names)
    if cached_names != expected_names:
        return False
    hashes = _cache_agent_hashes(marker.get("agent_sha256"), expected_names)
    if hashes is None:
        return False
    agents_dir = path / "agents"
    if _is_linklike(agents_dir) or not agents_dir.is_dir():
        return False
    for name in expected_names:
        role_path = agents_dir / f"{name}.toml"
        if _is_linklike(role_path) or not role_path.is_file():
            return False
        if _sha256_file(role_path) != hashes[name]:
            return False
    return True


def _scan_multiline_string_state(line: str, state: str | None) -> str | None:
    """Track TOML multiline strings so marker-looking content remains user data."""

    index = 0
    while index < len(line):
        if state is not None:
            found = line.find(state, index)
            if found < 0:
                return state
            if state == '"""':
                backslashes = 0
                cursor = found - 1
                while cursor >= 0 and line[cursor] == "\\":
                    backslashes += 1
                    cursor -= 1
                if backslashes % 2:
                    index = found + 1
                    continue
            index = found + 3
            state = None
            continue
        if line.startswith('"""', index):
            state = '"""'
            index += 3
            continue
        if line.startswith("'''", index):
            state = "'''"
            index += 3
            continue
        char = line[index]
        if char == "#":
            break
        if char == '"':
            index += 1
            while index < len(line):
                if line[index] == '"':
                    backslashes = 0
                    cursor = index - 1
                    while cursor >= 0 and line[cursor] == "\\":
                        backslashes += 1
                        cursor -= 1
                    if backslashes % 2 == 0:
                        index += 1
                        break
                index += 1
            continue
        if char == "'":
            closing = line.find("'", index + 1)
            index = len(line) if closing < 0 else closing + 1
            continue
        index += 1
    return state


def _top_level_marker_indexes(lines: Sequence[str], marker: str) -> list[int]:
    state: str | None = None
    indexes: list[int] = []
    for index, line in enumerate(lines):
        if state is None and line.strip() == marker:
            indexes.append(index)
        state = _scan_multiline_string_state(line, state)
    return indexes


def generate_cache(
    *,
    asset_root: Path,
    global_target: Path,
    profile: str | None,
    model_set: str | None,
    uniform_model: str | None,
    global_agent_names: Sequence[str],
    dry_run: bool,
) -> tuple[Path, list[str], str]:
    version = _asset_version(asset_root)
    relative_cache, identity = _cache_identity(
        version=version,
        profile=profile,
        model_set=model_set,
        uniform_model=uniform_model,
    )
    asset_digest = _asset_digest(
        asset_root,
        profile=profile,
        model_set=model_set,
        uniform_model=uniform_model,
    )
    cache_root = global_target / "agents-pipeline-profiles"
    cache_dir = cache_root / relative_cache
    names = sorted(global_agent_names)
    _validate_directory_chain(global_target, cache_dir, "Global profile cache")
    reusable = _cache_is_reusable(
        cache_dir,
        identity=identity,
        source_version=version,
        asset_digest=asset_digest,
        agent_names=names,
    )
    if reusable:
        return cache_dir, names, version
    if dry_run:
        return cache_dir, names, version

    exporter = asset_root / "scripts" / "export-codex-agents.py"
    if not exporter.is_file():
        raise ProjectProfileError(f"Codex exporter not found in global support assets: {exporter}")
    cache_dir.parent.mkdir(parents=True, exist_ok=True)
    staging = Path(
        tempfile.mkdtemp(prefix=f".{cache_dir.name}.staging-", dir=cache_dir.parent)
    )
    backup: Path | None = None
    try:
        command = [
            sys.executable,
            str(exporter),
            "--source-agents",
            str(asset_root / "agents"),
            "--modes-file",
            str(asset_root / "modes.json"),
            "--catalog",
            str(asset_root / "AGENTS.md"),
            "--target-dir",
            str(staging),
            "--resolve-support-refs-to",
            str(global_target / "agents-pipeline"),
            "--strict",
            "--profile-dir",
            str(asset_root / "tools/agent-profiles"),
            "--model-set-dir",
            str(asset_root / "runtimes/codex/model-sets"),
        ]
        if uniform_model:
            command.extend(["--uniform-model", uniform_model])
        else:
            command.extend(["--agent-profile", str(profile), "--model-set", str(model_set)])
        completed = subprocess.run(command, capture_output=True, text=True, check=False)
        if completed.returncode != 0:
            detail = completed.stderr.strip() or completed.stdout.strip()
            raise ProjectProfileError(f"Codex profile cache export failed: {detail}")

        generated_names = sorted(path.stem for path in (staging / "agents").glob("*.toml"))
        if generated_names != names:
            raise ProjectProfileError(
                "Global install and selected profile assets contain different agent catalogs; "
                "rerun the global bootstrap before setting a project profile."
            )
        payload = {
            "agent_names": names,
            "agent_sha256": {
                name: _sha256_file(staging / "agents" / f"{name}.toml")
                for name in names
            },
            "asset_digest": asset_digest,
            "identity": identity,
            "model_set": model_set,
            "profile": profile or ("uniform" if uniform_model else None),
            "source_version": version,
            "tool": CACHE_MANIFEST_TOOL,
            "uniform_model": uniform_model,
            "version": CACHE_MANIFEST_VERSION,
        }
        _atomic_json(staging / CACHE_MANIFEST_FILENAME, payload)

        if cache_dir.exists():
            backup = Path(
                tempfile.mkdtemp(prefix=f".{cache_dir.name}.backup-", dir=cache_dir.parent)
            )
            backup.rmdir()
            os.replace(cache_dir, backup)
        os.replace(staging, cache_dir)
        if backup is not None:
            shutil.rmtree(backup)
            backup = None
    except Exception:
        if backup is not None and backup.exists() and not cache_dir.exists():
            os.replace(backup, cache_dir)
            backup = None
        raise
    finally:
        if staging.exists():
            shutil.rmtree(staging)
        if backup is not None and backup.exists():
            shutil.rmtree(backup)
    return cache_dir, names, version


def _remove_managed_block(text: str) -> tuple[str, str | None]:
    lines = text.splitlines(keepends=True)
    begin_indexes = _top_level_marker_indexes(lines, BEGIN_MARKER)
    end_indexes = _top_level_marker_indexes(lines, END_MARKER)
    if not begin_indexes and not end_indexes:
        return text, None
    if len(begin_indexes) != 1 or len(end_indexes) != 1:
        raise ProjectProfileError("Project config has malformed profile overlay markers.")
    start = begin_indexes[0]
    end = end_indexes[0]
    if end <= start:
        raise ProjectProfileError("Project profile overlay markers are out of order.")
    block = "".join(lines[start : end + 1]).rstrip("\r\n")
    remaining = "".join(lines[:start] + lines[end + 1 :])
    return remaining, block


def _build_block(
    *,
    agents_dir: Path,
    agent_names: Sequence[str],
    profile: str | None,
    model_set: str | None,
    uniform_model: str | None,
) -> str:
    lines = [
        BEGIN_MARKER,
        "# This block selects installer-owned project-local role variants.",
        f"# profile = {json.dumps(profile or ('uniform' if uniform_model else None), ensure_ascii=False)}",
        f"# model_set = {json.dumps(model_set, ensure_ascii=False)}",
        f"# uniform_model = {json.dumps(uniform_model, ensure_ascii=False)}",
    ]
    for name in sorted(agent_names):
        lines.extend(
            [
                "",
                f"[agents.{name}]",
                "config_file = "
                + json.dumps(
                    str(agents_dir / f"{name}.toml"),
                    ensure_ascii=False,
                ),
            ]
        )
    lines.extend(["", END_MARKER])
    return "\n".join(lines) + "\n"


def _parse_toml_agents(text: str, *, label: str) -> set[str]:
    if tomllib is None:  # Guarded again in main for a user-facing error.
        raise ProjectProfileError("Codex project profiles require Python 3.11 or newer.")
    if not text.strip():
        return set()
    try:
        parsed = tomllib.loads(text)
    except tomllib.TOMLDecodeError as exc:
        raise ProjectProfileError(f"{label} is not valid TOML: {exc}") from exc
    agents = parsed.get("agents")
    if agents is None:
        return set()
    if not isinstance(agents, dict):
        raise ProjectProfileError(f"{label} has a non-table 'agents' value.")
    return {str(name) for name in agents}


def _agent_names_from_tables(text: str) -> set[str]:
    names: set[str] = set()
    for match in AGENT_TABLE_RE.finditer(text):
        name = match.group("double") or match.group("single") or match.group("bare")
        if name:
            names.add(name)
    return names


def _validate_no_agent_conflicts(text: str, agent_names: Sequence[str]) -> None:
    parsed_names = _parse_toml_agents(text, label="Existing project Codex config")
    existing_names = parsed_names | _agent_names_from_tables(text)
    conflicts = sorted(existing_names & set(agent_names))
    if conflicts:
        raise ProjectProfileError(
            "Project config already defines agents managed by this profile: "
            + ", ".join(conflicts)
            + ". Remove or rename those project-specific entries first."
        )


def _validate_merged_config(text: str) -> None:
    _parse_toml_agents(text, label="Generated project Codex config")


def _safe_project_agent_files(value: Any, agent_names: Sequence[str]) -> list[str]:
    expected = [f"agents/{name}.toml" for name in sorted(agent_names)]
    if not isinstance(value, list) or not all(isinstance(item, str) for item in value):
        raise ProjectProfileError("managed_agent_files must be an array of strings.")
    if sorted(value) != expected or len(value) != len(set(value)):
        raise ProjectProfileError(
            "Project profile managed agent names/files do not correspond."
        )
    return expected


def _validate_project_manifest_v2(
    data: Mapping[str, Any], *, workspace: Path
) -> tuple[list[str], list[str], dict[str, str]]:
    names = _safe_agent_names(data.get("agent_names"), label="agent_names")
    files = _safe_project_agent_files(data.get("managed_agent_files"), names)
    hashes = _cache_agent_hashes(data.get("agent_sha256"), names)
    if hashes is None:
        raise ProjectProfileError("Project profile manifest has invalid agent hashes.")
    config_raw = data.get("config_file")
    roles_raw = data.get("roles_dir")
    if not isinstance(config_raw, str) or _canonical(config_raw) != workspace / ".codex/config.toml":
        raise ProjectProfileError("Project profile config path escapes its workspace.")
    if not isinstance(roles_raw, str) or _canonical(roles_raw) != workspace / ".codex/agents":
        raise ProjectProfileError("Project profile roles path escapes its workspace.")
    source_version = data.get("source_version")
    if (
        not isinstance(source_version, str)
        or re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", source_version) is None
    ):
        raise ProjectProfileError("Project profile manifest has no valid source version.")
    asset_digest = data.get("asset_digest")
    if (
        not isinstance(asset_digest, str)
        or re.fullmatch(r"[0-9a-f]{64}", asset_digest) is None
    ):
        raise ProjectProfileError("Project profile manifest has no valid asset digest.")
    _selection_from_manifest(data, label="Project profile manifest")
    return names, files, hashes


def _read_project_manifest(workspace: Path) -> tuple[Path, dict[str, Any]] | None:
    path = _validated_project_dir(workspace) / PROJECT_MANIFEST_FILENAME
    _validate_leaf(path, "Project profile manifest")
    if not path.exists():
        return None
    data = _load_json(path, "Project profile manifest")
    if (
        data.get("tool") != PROJECT_MANIFEST_TOOL
        or data.get("version") not in SUPPORTED_PROJECT_MANIFEST_VERSIONS
    ):
        raise ProjectProfileError(f"Unexpected project profile manifest: {path}")
    if data.get("runtime") != "codex" or _canonical(str(data.get("workspace", ""))) != workspace:
        raise ProjectProfileError(f"Project profile manifest does not belong to {workspace}: {path}")
    if data.get("version") == PROJECT_MANIFEST_VERSION:
        _validate_project_manifest_v2(data, workspace=workspace)
    return path, data


def _validate_project_agents_dir(project_dir: Path) -> Path:
    agents_dir = project_dir / "agents"
    if _is_linklike(agents_dir):
        raise ProjectProfileError(
            f"Project agents directory must not be a symbolic link or junction: {agents_dir}"
        )
    if agents_dir.exists() and not agents_dir.is_dir():
        raise ProjectProfileError(f"Project agents path must be a directory: {agents_dir}")
    return agents_dir


def _render_workspace_roles(
    *,
    asset_root: Path,
    global_target: Path,
    profile: str | None,
    model_set: str | None,
    uniform_model: str | None,
    global_agent_names: Sequence[str],
) -> tuple[dict[str, str], str, str]:
    """Render role TOMLs without writing either the workspace or global install."""

    source_version = _asset_version(asset_root)
    asset_digest = _asset_digest(
        asset_root,
        profile=profile,
        model_set=model_set,
        uniform_model=uniform_model,
    )
    exporter = asset_root / "scripts" / "export-codex-agents.py"
    if not exporter.is_file() or _is_linklike(exporter):
        raise ProjectProfileError(f"Codex exporter is missing or unsafe: {exporter}")
    with tempfile.TemporaryDirectory(prefix="agents-pipeline-workspace-profile-") as temp_name:
        staging = Path(temp_name)
        command = [
            sys.executable,
            str(exporter),
            "--source-agents",
            str(asset_root / "agents"),
            "--modes-file",
            str(asset_root / "modes.json"),
            "--catalog",
            str(asset_root / "AGENTS.md"),
            "--target-dir",
            str(staging),
            "--resolve-support-refs-to",
            str(global_target / "agents-pipeline"),
            "--strict",
            "--profile-dir",
            str(asset_root / "tools/agent-profiles"),
            "--model-set-dir",
            str(asset_root / "runtimes/codex/model-sets"),
        ]
        if uniform_model:
            command.extend(["--uniform-model", uniform_model])
        else:
            command.extend(["--agent-profile", str(profile), "--model-set", str(model_set)])
        completed = subprocess.run(command, capture_output=True, text=True, check=False)
        if completed.returncode != 0:
            detail = completed.stderr.strip() or completed.stdout.strip()
            raise ProjectProfileError(f"Codex workspace profile export failed: {detail}")
        generated = sorted((staging / "agents").glob("*.toml"))
        generated_names = [path.stem for path in generated]
        expected_names = sorted(global_agent_names)
        if generated_names != expected_names:
            raise ProjectProfileError(
                "Global install and selected profile assets contain different agent catalogs; "
                "rerun the global bootstrap before setting a project profile."
            )
        contents: dict[str, str] = {}
        for path in generated:
            if _is_linklike(path) or not path.is_file():
                raise ProjectProfileError(f"Generated Codex role is missing or unsafe: {path}")
            try:
                content = path.read_text(encoding="utf-8")
                tomllib.loads(content)
            except (OSError, UnicodeDecodeError) as exc:
                raise ProjectProfileError(f"Unable to read generated Codex role: {path}") from exc
            except tomllib.TOMLDecodeError as exc:
                raise ProjectProfileError(f"Generated Codex role is invalid TOML: {path}: {exc}") from exc
            contents[path.stem] = content
    return contents, source_version, asset_digest


FileSnapshot = tuple[bool, bytes, int]


def _snapshot_file(path: Path) -> FileSnapshot:
    _validate_leaf(path, "Managed project profile file")
    if not path.exists():
        return False, b"", 0
    return True, path.read_bytes(), path.stat().st_mode & 0o777


def _restore_file(path: Path, snapshot: FileSnapshot) -> None:
    existed, content, mode = snapshot
    if existed:
        _atomic_write_bytes(path, content)
        os.chmod(path, mode)
    elif path.exists():
        _validate_leaf(path, "Managed project profile file")
        path.unlink()


def _rollback_files(snapshots: Mapping[Path, FileSnapshot]) -> None:
    errors: list[OSError] = []
    for path, snapshot in reversed(list(snapshots.items())):
        try:
            _restore_file(path, snapshot)
        except OSError as exc:  # Preserve the primary failure when rollback is partial.
            errors.append(exc)
    if errors:
        raise ProjectProfileError(f"Unable to roll back project profile files: {errors[0]}")


def set_profile(
    *,
    workspace: Path,
    global_target: Path,
    asset_root: Path,
    profile: str | None,
    model_set: str | None,
    uniform_model: str | None,
    dry_run: bool,
) -> dict[str, Any]:
    global_names = validate_global_install(global_target)
    role_contents, source_version, asset_digest = _render_workspace_roles(
        asset_root=asset_root,
        global_target=global_target,
        profile=profile,
        model_set=model_set,
        uniform_model=uniform_model,
        global_agent_names=global_names,
    )
    names = sorted(role_contents)
    project_dir = _validated_project_dir(workspace)
    agents_dir = _validate_project_agents_dir(project_dir)
    config_path = project_dir / "config.toml"
    manifest_path = project_dir / PROJECT_MANIFEST_FILENAME
    _validate_leaf(config_path, "Project Codex config")
    _validate_leaf(manifest_path, "Project profile manifest")
    try:
        existing = config_path.read_text(encoding="utf-8") if config_path.exists() else ""
    except (OSError, UnicodeDecodeError) as exc:
        raise ProjectProfileError(f"Unable to read project Codex config: {config_path}") from exc
    remaining, _old_block = _remove_managed_block(existing)
    _validate_no_agent_conflicts(remaining, names)
    loaded = _read_project_manifest(workspace)
    old_owned_files: list[str] = []
    if loaded is not None and loaded[1].get("version") == PROJECT_MANIFEST_VERSION:
        _old_names, old_owned_files, _old_hashes = _validate_project_manifest_v2(
            loaded[1], workspace=workspace
        )
    old_owned = set(old_owned_files)
    managed_files = [f"agents/{name}.toml" for name in names]
    for relative in managed_files:
        target = project_dir / relative
        _validate_leaf(target, "Project-local Codex role")
        if target.exists() and relative not in old_owned:
            raise ProjectProfileError(
                f"Refusing to overwrite an unowned project-local Codex role: {target}"
            )
    block = _build_block(
        agents_dir=agents_dir,
        agent_names=names,
        profile=profile,
        model_set=model_set,
        uniform_model=uniform_model,
    )
    merged = remaining.rstrip() + ("\n\n" if remaining.strip() else "") + block
    _validate_merged_config(merged)
    agent_hashes = {
        name: hashlib.sha256(role_contents[name].encode("utf-8")).hexdigest()
        for name in names
    }
    payload = {
        "agent_names": names,
        "agent_sha256": agent_hashes,
        "asset_digest": asset_digest,
        "config_file": str(config_path),
        "global_target": str(global_target),
        "managed_agent_files": managed_files,
        "mode": "uniform" if uniform_model else "profile",
        "model_set": model_set,
        "profile": profile or ("uniform" if uniform_model else None),
        "roles_dir": str(agents_dir),
        "runtime": "codex",
        "source_version": source_version,
        "tool": PROJECT_MANIFEST_TOOL,
        "uniform_model": uniform_model,
        "version": PROJECT_MANIFEST_VERSION,
        "workspace": str(workspace),
    }
    if not dry_run:
        affected = [
            *(project_dir / relative for relative in sorted(set(managed_files) | old_owned)),
            config_path,
            manifest_path,
        ]
        snapshots = {path: _snapshot_file(path) for path in affected}
        created_dirs = [
            path for path in (workspace, project_dir, agents_dir) if not path.exists()
        ]
        try:
            agents_dir.mkdir(parents=True, exist_ok=True)
            for name in names:
                _atomic_write(agents_dir / f"{name}.toml", role_contents[name])
            for relative in sorted(old_owned - set(managed_files)):
                (project_dir / relative).unlink(missing_ok=True)
            _atomic_write(config_path, merged)
            _atomic_json(manifest_path, payload)
        except Exception:
            _rollback_files(snapshots)
            for path in reversed(created_dirs):
                try:
                    path.rmdir()
                except OSError:
                    pass
            raise
    return {
        "dry_run": dry_run,
        **payload,
        **_eligibility_metadata(global_target, workspace, configured=True),
    }


def read_status(
    workspace: Path, *, global_target: Path, asset_root: Path
) -> dict[str, Any]:
    loaded = _read_project_manifest(workspace)
    project_dir = _validated_project_dir(workspace)
    config_path = project_dir / "config.toml"
    _validate_leaf(config_path, "Project Codex config")
    if loaded is None:
        if config_path.is_file():
            try:
                config_text = config_path.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError) as exc:
                raise ProjectProfileError(
                    f"Unable to read project Codex config: {config_path}"
                ) from exc
            _remaining, orphan_block = _remove_managed_block(config_text)
            if orphan_block is not None:
                raise ProjectProfileError(
                    "Project Codex config contains a managed profile block without its "
                    "manifest; rerun 'set' or remove the block manually."
                )
        validate_global_install(global_target)
        return {
            "catalog_state": "inherit",
            "configured": False,
            "global_installed": True,
            "global_target": str(global_target),
            "health": "ok",
            "installed": False,
            "managed_generated_count": 0,
            "managed_generated_files": [],
            "missing_generated_files": [],
            "mode": "inherit",
            "model_set": None,
            "profile": None,
            "runtime": "codex",
            "scope": "workspace",
            "source_version": _asset_version(asset_root),
            "target": str(workspace / ".codex"),
            "uniform_model": None,
            "workspace": str(workspace),
            **_eligibility_metadata(global_target, workspace, configured=False),
        }
    manifest_path, data = loaded
    profile, model_set, uniform_model = _selection_from_manifest(
        data, label="Project profile manifest"
    )
    global_raw = data.get("global_target")
    if not isinstance(global_raw, str) or not global_raw:
        raise ProjectProfileError(f"Invalid project profile paths in {manifest_path}")
    manifest_global_target = _canonical(global_raw)
    if manifest_global_target != global_target:
        raise ProjectProfileError(
            "Project profile points to a different Codex global installation; "
            "rerun 'set' for the current CODEX_HOME."
        )
    global_names = validate_global_install(global_target)
    source_version = data.get("source_version")
    if (
        not isinstance(source_version, str)
        or re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", source_version) is None
    ):
        raise ProjectProfileError("Project profile manifest has no valid source version.")
    current_source_version = _asset_version(asset_root)
    if data.get("version") != PROJECT_MANIFEST_VERSION:
        return {
            "configured": True,
            "catalog_state": "pinned",
            "global_installed": True,
            "global_target": str(global_target),
            "health": "incomplete",
            "installed": True,
            "managed_generated_count": 0,
            "managed_generated_files": [],
            "manifest": str(manifest_path),
            "missing_generated_files": ["project:legacy-profile-layout"],
            "mode": data.get("mode"),
            "model_set": data.get("model_set"),
            "profile": data.get("profile"),
            "runtime": "codex",
            "scope": "workspace",
            "source_version": source_version,
            "target": str(project_dir),
            "uniform_model": data.get("uniform_model"),
            "workspace": str(workspace),
            **_eligibility_metadata(global_target, workspace, configured=True),
        }

    names, managed_files, hashes = _validate_project_manifest_v2(data, workspace=workspace)
    agents_dir = _validate_project_agents_dir(project_dir)
    missing: list[str] = []
    if not agents_dir.is_dir():
        missing.append("agents")
    else:
        for name in names:
            role = agents_dir / f"{name}.toml"
            if _is_linklike(role) or not role.is_file():
                missing.append(f"agents/{name}.toml")
            elif _sha256_file(role) != hashes[name]:
                missing.append(f"agents/{name}.toml:sha256")
    if source_version == current_source_version:
        expected_asset_digest = _asset_digest(
            asset_root,
            profile=profile,
            model_set=model_set,
            uniform_model=uniform_model,
        )
        if data.get("asset_digest") != expected_asset_digest:
            missing.append("project:profile-input-digest")
    if not config_path.is_file():
        missing.append("project:.codex/config.toml")
    else:
        try:
            config_text = config_path.read_text(encoding="utf-8")
        except (OSError, UnicodeDecodeError) as exc:
            raise ProjectProfileError(
                f"Unable to read project Codex config: {config_path}"
            ) from exc
        _remaining, block = _remove_managed_block(config_text)
        if block is None:
            missing.append("project:managed-profile-block")
        elif block.strip() != _build_block(
            agents_dir=agents_dir,
            agent_names=names,
            profile=profile,
            model_set=model_set,
            uniform_model=uniform_model,
        ).strip():
            missing.append("project:managed-profile-block-mismatch")
    return {
        "configured": True,
        "catalog_state": (
            "current"
            if names == global_names and source_version == current_source_version
            else "pinned"
        ),
        "global_installed": True,
        "global_target": str(global_target),
        "health": "ok" if not missing else "incomplete",
        "installed": True,
        "managed_generated_count": len(managed_files),
        "managed_generated_files": managed_files,
        "manifest": str(manifest_path),
        "missing_generated_files": missing,
        "mode": data.get("mode"),
        "model_set": data.get("model_set"),
        "profile": data.get("profile"),
        "roles_dir": str(agents_dir),
        "runtime": "codex",
        "scope": "workspace",
        "source_version": source_version,
        "target": str(workspace / ".codex"),
        "uniform_model": data.get("uniform_model"),
        "workspace": str(workspace),
        **_eligibility_metadata(global_target, workspace, configured=True),
    }


def clear_profile(*, workspace: Path, dry_run: bool) -> dict[str, Any]:
    loaded = _read_project_manifest(workspace)
    project_dir = _validated_project_dir(workspace)
    config_path = project_dir / "config.toml"
    manifest_path = project_dir / PROJECT_MANIFEST_FILENAME
    _validate_leaf(config_path, "Project Codex config")
    if loaded is None:
        if config_path.is_file():
            try:
                config_text = config_path.read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError) as exc:
                raise ProjectProfileError(
                    f"Unable to read project Codex config: {config_path}"
                ) from exc
            _remaining, orphan_block = _remove_managed_block(config_text)
            if orphan_block is not None:
                raise ProjectProfileError(
                    "Project Codex config contains a managed profile block without its manifest."
                )
        return {"changed": False, "dry_run": dry_run, "workspace": str(workspace)}
    try:
        existing = config_path.read_text(encoding="utf-8") if config_path.exists() else ""
    except (OSError, UnicodeDecodeError) as exc:
        raise ProjectProfileError(f"Unable to read project Codex config: {config_path}") from exc
    remaining, block = _remove_managed_block(existing)
    if block is None:
        raise ProjectProfileError(
            f"Project profile manifest exists but managed config block is missing: {manifest_path}"
        )
    data = loaded[1]
    managed_files: list[str] = []
    agents_dir = _validate_project_agents_dir(project_dir)
    if data.get("version") == PROJECT_MANIFEST_VERSION:
        _names, managed_files, _hashes = _validate_project_manifest_v2(
            data, workspace=workspace
        )
    owned_paths = [project_dir / relative for relative in managed_files]
    for path in owned_paths:
        _validate_leaf(path, "Project-local Codex role")
    if not dry_run:
        affected = [*owned_paths, config_path, manifest_path]
        snapshots = {path: _snapshot_file(path) for path in affected}
        try:
            for path in owned_paths:
                path.unlink(missing_ok=True)
            if remaining.strip():
                _atomic_write(config_path, remaining)
            elif config_path.exists():
                config_path.unlink()
            manifest_path.unlink()
        except Exception:
            _rollback_files(snapshots)
            raise
        try:
            agents_dir.rmdir()
        except OSError:
            pass
        try:
            project_dir.rmdir()
        except OSError:
            pass
    return {
        "changed": True,
        "dry_run": dry_run,
        "managed_removed_count": len(managed_files),
        "workspace": str(workspace),
    }


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("action", choices=("cache", "set", "status", "clear"))
    parser.add_argument("--workspace")
    parser.add_argument("--global-target")
    parser.add_argument("--asset-root")
    parser.add_argument("--profile")
    parser.add_argument("--model-set")
    parser.add_argument("--uniform-model")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--json", action="store_true")
    return parser


def _print_eligibility_warning(result: Mapping[str, Any]) -> None:
    if result.get("profile_eligibility") != "ineligible":
        return
    workspace = result.get("workspace", "this workspace")
    trust = result.get("project_trust", "unknown")
    print(
        "Warning: Codex will ignore the workspace profile at "
        f"{workspace}/.codex/config.toml because project trust is {trust}. "
        "Mark this project as trusted in Codex, then rerun workspace profile status.",
        file=sys.stderr,
    )


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if tomllib is None:
            raise ProjectProfileError("Codex project profiles require Python 3.11 or newer.")
        global_target = _canonical(
            args.global_target
            or os.environ.get("CODEX_HOME")
            or Path.home() / ".codex"
        )
        asset_root = _canonical(args.asset_root or Path(__file__).resolve().parent.parent)
        expected_asset_root = global_target / "agents-pipeline"
        if asset_root != expected_asset_root:
            raise ProjectProfileError(
                "Project profiles must use the support assets owned by the selected "
                f"global Codex installation: {expected_asset_root}"
            )
        if args.action in ("cache", "set"):
            if args.uniform_model and (args.profile or args.model_set):
                raise ProjectProfileError(
                    "--uniform-model cannot be combined with --profile or --model-set."
                )
            if not args.uniform_model and not (args.profile and args.model_set):
                raise ProjectProfileError(
                    "set requires --profile and --model-set, or --uniform-model."
                )
            if not args.uniform_model and bool(args.profile) != bool(args.model_set):
                raise ProjectProfileError("--profile and --model-set must be supplied together.")
        if args.action == "cache":
            names = validate_global_install(global_target)
            cache_dir, _names, source_version = generate_cache(
                asset_root=asset_root,
                global_target=global_target,
                profile=args.profile,
                model_set=args.model_set,
                uniform_model=args.uniform_model,
                global_agent_names=names,
                dry_run=args.dry_run,
            )
            result = {
                "cache_dir": str(cache_dir),
                "dry_run": args.dry_run,
                "source_version": source_version,
            }
        else:
            if not args.workspace:
                raise ProjectProfileError(f"{args.action} requires --workspace.")
            workspace = _canonical(args.workspace)
        if args.action == "set":
            result = set_profile(
                workspace=workspace,
                global_target=global_target,
                asset_root=asset_root,
                profile=args.profile,
                model_set=args.model_set,
                uniform_model=args.uniform_model,
                dry_run=args.dry_run,
            )
        elif args.action == "status":
            result = read_status(
                workspace,
                global_target=global_target,
                asset_root=asset_root,
            )
        elif args.action == "clear":
            result = clear_profile(workspace=workspace, dry_run=args.dry_run)
        if args.json:
            print(json.dumps(result, indent=2, sort_keys=True, ensure_ascii=False))
        else:
            if args.action == "cache":
                print(
                    ("Would generate" if args.dry_run else "Generated")
                    + f" global profile cache: {result['cache_dir']}"
                )
            elif args.action == "status" and not result.get("configured"):
                print(f"Project profile: inherit global ({workspace})")
            elif args.action == "status":
                print(
                    f"Project profile: {result.get('profile')} "
                    f"({workspace})"
                )
                print(f"File health: {result.get('health')}")
                print(
                    f"Trust eligibility: {result.get('profile_eligibility')} "
                    f"(project trust: {result.get('project_trust')})"
                )
            elif args.action == "clear":
                print(
                    ("Would clear" if args.dry_run else "Cleared")
                    + f" project profile overlay: {workspace}"
                )
            else:
                print(
                    ("Would set" if args.dry_run else "Set")
                    + f" project profile overlay: {workspace}"
                )
        if args.action in ("set", "status") and result.get("configured", True):
            _print_eligibility_warning(result)
        return 0
    except (OSError, ProjectProfileError) as exc:
        print(f"codex-project-profile: {exc}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

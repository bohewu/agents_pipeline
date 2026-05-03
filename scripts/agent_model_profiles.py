#!/usr/bin/env python3
"""Shared agent model profile and runtime model-set resolver.

This module intentionally validates only local profile/model-set shape and
runtime-specific config syntax. It does not check provider availability and it
does not handle reasoning-effort settings.
"""

import json
import re
import warnings
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Union


REQUIRED_TIERS = frozenset({"mini", "standard", "strong"})
SUPPORTED_RUNTIMES = frozenset({"opencode", "codex", "copilot", "claude"})
SHARED_PROFILE_RUNTIME = "opencode"
CLAUDE_MODEL_ALIASES = frozenset({"inherit", "sonnet", "opus", "haiku"})

AGENT_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
TIER_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
CODEX_MODEL_KEYS = frozenset({"model", "model_provider"})

RuntimeModelSetting = Union[str, List[str], Dict[str, str]]


@dataclass(frozen=True)
class AgentModelProfile:
    """Loaded logical agent-to-tier profile."""

    name: str
    runtime: str
    source_runtime: str
    models: Dict[str, str]
    path: Path
    description: Optional[str] = None
    model_set_name: Optional[str] = None


@dataclass(frozen=True)
class RuntimeModelSet:
    """Loaded runtime-specific tier-to-model mapping."""

    name: str
    runtime: str
    tiers: Dict[str, RuntimeModelSetting]
    path: Path
    description: Optional[str] = None


def _json_path(name: str, directory: Union[str, Path]) -> Path:
    raw = Path(str(name))
    base = Path(directory).expanduser()
    if raw.suffix == ".json":
        return raw if raw.is_absolute() else base / raw
    return base / f"{name}.json"


def _load_json_object(path: Path, label: str) -> Dict[str, Any]:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except FileNotFoundError as exc:
        raise ValueError(f"{label} not found: {path.as_posix()}") from exc
    except json.JSONDecodeError as exc:
        raise ValueError(
            f"{path.as_posix()}: invalid JSON at line {exc.lineno}, column {exc.colno}: {exc.msg}"
        ) from exc
    if not isinstance(data, dict):
        raise ValueError(f"{path.as_posix()}: {label} JSON must be an object")
    return data


def _single_line_string(value: Any, context: str) -> str:
    if not isinstance(value, str):
        raise ValueError(f"{context} must be a single-line string")
    if not value or "\n" in value or "\r" in value:
        raise ValueError(f"{context} must be a non-empty single-line string")
    return value


def _normalize_runtime(value: Any, context: str) -> str:
    runtime = _single_line_string(value, context).strip().lower()
    if runtime not in SUPPORTED_RUNTIMES:
        expected = ", ".join(sorted(SUPPORTED_RUNTIMES))
        raise ValueError(f"{context} must be one of: {expected}")
    return runtime


def _validate_agent_name(value: Any, context: str) -> str:
    name = _single_line_string(value, context)
    if AGENT_NAME_RE.fullmatch(name) is None:
        raise ValueError(
            f"{context} must be a safe generated agent name matching {AGENT_NAME_RE.pattern}"
        )
    return name


def _validate_tier_name(value: Any, context: str) -> str:
    tier = _single_line_string(value, context)
    if TIER_NAME_RE.fullmatch(tier) is None:
        raise ValueError(
            f"{context} must be a safe tier name matching {TIER_NAME_RE.pattern}"
        )
    return tier


def _optional_single_line_string(value: Any, context: str) -> Optional[str]:
    if value is None:
        return None
    return _single_line_string(value, context)


def _validate_profile_runtime(
    path: Path, source_runtime: str, requested_runtime: str
) -> None:
    if source_runtime == requested_runtime:
        return
    if (
        source_runtime == SHARED_PROFILE_RUNTIME
        and requested_runtime != SHARED_PROFILE_RUNTIME
    ):
        return
    raise ValueError(
        f"{path.as_posix()}: profile runtime '{source_runtime}' is incompatible with requested runtime '{requested_runtime}'"
    )


def _validate_codex_model_setting(path: Path, tier: str, value: Any) -> Dict[str, str]:
    context = f"{path.as_posix()}: tier '{tier}' Codex model setting"
    if not isinstance(value, dict):
        raise ValueError(
            f"{context} must be an object with 'model' and optional 'model_provider'"
        )

    unknown_keys = sorted(set(value.keys()) - CODEX_MODEL_KEYS)
    if unknown_keys:
        raise ValueError(
            f"{context} has unsupported key(s): {', '.join(unknown_keys)}; only 'model' and optional 'model_provider' are allowed"
        )
    if "model" not in value:
        raise ValueError(f"{context} must include 'model'")

    resolved = {
        "model": _single_line_string(value["model"], f"{context} field 'model'")
    }
    if "model_provider" in value:
        resolved["model_provider"] = _single_line_string(
            value["model_provider"], f"{context} field 'model_provider'"
        )
    return resolved


def _validate_copilot_model_setting(
    path: Path, tier: str, value: Any
) -> Union[str, List[str]]:
    context = f"{path.as_posix()}: tier '{tier}' Copilot model setting"
    if isinstance(value, str):
        return _single_line_string(value, context)
    if isinstance(value, list):
        if not value:
            raise ValueError(f"{context} list must not be empty")
        return [
            _single_line_string(item, f"{context} list item {index}")
            for index, item in enumerate(value)
        ]
    raise ValueError(f"{context} must be a string or non-empty list of strings")


def _validate_claude_alias(path: Path, tier: str, value: Any) -> str:
    context = f"{path.as_posix()}: tier '{tier}' Claude model setting"
    alias = _single_line_string(value, context)
    if alias in CLAUDE_MODEL_ALIASES:
        return alias
    expected = ", ".join(sorted(CLAUDE_MODEL_ALIASES))
    if "/" in alias or alias.startswith("claude-") or re.search(r"\d", alias):
        raise ValueError(
            f"{context} must be a Claude alias ({expected}); versioned model IDs such as '{alias}' are not allowed"
        )
    raise ValueError(f"{context} must be one of: {expected}")


def _validate_opencode_model_setting(path: Path, tier: str, value: Any) -> str:
    return _single_line_string(
        value, f"{path.as_posix()}: tier '{tier}' OpenCode model setting"
    )


def _validate_model_setting(
    runtime: str, path: Path, tier: str, value: Any
) -> RuntimeModelSetting:
    if runtime == "codex":
        return _validate_codex_model_setting(path, tier, value)
    if runtime == "copilot":
        return _validate_copilot_model_setting(path, tier, value)
    if runtime == "claude":
        return _validate_claude_alias(path, tier, value)
    if runtime == "opencode":
        return _validate_opencode_model_setting(path, tier, value)
    raise ValueError(f"Unsupported runtime: {runtime}")


def _validate_uniform_model(runtime: str, value: Any) -> RuntimeModelSetting:
    if runtime == "codex":
        return {"model": _single_line_string(value, "uniform Codex model")}
    if runtime == "copilot":
        return _single_line_string(value, "uniform Copilot model")
    if runtime == "claude":
        return _validate_claude_alias(Path("<uniform>"), "uniform", value)
    if runtime == "opencode":
        return _single_line_string(value, "uniform OpenCode model")
    raise ValueError(f"Unsupported runtime: {runtime}")


def _copy_setting(value: RuntimeModelSetting) -> RuntimeModelSetting:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, list):
        return list(value)
    return value


def _infer_runtime(
    profile: Optional[AgentModelProfile],
    model_set: Optional[RuntimeModelSet],
    runtime: Optional[str],
) -> Optional[str]:
    inferred = _normalize_runtime(runtime, "runtime") if runtime is not None else None
    candidates = []
    if profile is not None:
        candidates.append(("profile", profile.runtime))
    if model_set is not None:
        candidates.append(("model set", model_set.runtime))

    for label, candidate in candidates:
        if inferred is None:
            inferred = candidate
            continue
        if candidate != inferred:
            raise ValueError(
                f"{label} runtime '{candidate}' does not match requested runtime '{inferred}'"
            )
    return inferred


def load_profile(
    profile_name: str, profile_dir: Union[str, Path], runtime: str
) -> AgentModelProfile:
    """Load an agent-to-tier profile for the requested exporter runtime.

    Profiles marked with runtime ``opencode`` are accepted as shared tier maps
    for non-OpenCode runtimes. Other runtime mismatches fail clearly.
    """

    path = _json_path(profile_name, profile_dir)
    requested_runtime = _normalize_runtime(runtime, "requested profile runtime")
    data = _load_json_object(path, "profile")

    source_runtime = _normalize_runtime(
        data.get("runtime"), f"{path.as_posix()}: profile runtime"
    )
    _validate_profile_runtime(path, source_runtime, requested_runtime)

    raw_models = data.get("models")
    if not isinstance(raw_models, dict):
        raise ValueError(f"{path.as_posix()}: profile field 'models' must be an object")

    models: Dict[str, str] = {}
    for raw_agent, raw_tier in raw_models.items():
        agent = _validate_agent_name(raw_agent, f"{path.as_posix()}: profile agent name")
        tier = _validate_tier_name(
            raw_tier, f"{path.as_posix()}: profile tier for agent '{agent}'"
        )
        models[agent] = tier

    name = _optional_single_line_string(
        data.get("name"), f"{path.as_posix()}: profile name"
    )
    description = _optional_single_line_string(
        data.get("description"), f"{path.as_posix()}: profile description"
    )
    model_set_name = _optional_single_line_string(
        data.get("modelSet"), f"{path.as_posix()}: profile modelSet"
    )

    return AgentModelProfile(
        name=name or Path(profile_name).stem,
        runtime=requested_runtime,
        source_runtime=source_runtime,
        models=models,
        path=path,
        description=description,
        model_set_name=model_set_name,
    )


def load_model_set(
    model_set_name: str, model_set_dir: Union[str, Path], runtime: str
) -> RuntimeModelSet:
    """Load a runtime-specific tier-to-model mapping."""

    path = _json_path(model_set_name, model_set_dir)
    requested_runtime = _normalize_runtime(runtime, "requested model-set runtime")
    data = _load_json_object(path, "model set")

    source_runtime = _normalize_runtime(
        data.get("runtime"), f"{path.as_posix()}: model-set runtime"
    )
    if source_runtime != requested_runtime:
        raise ValueError(
            f"{path.as_posix()}: model set runtime '{source_runtime}' does not match requested runtime '{requested_runtime}'"
        )

    raw_tiers = data.get("tiers")
    if not isinstance(raw_tiers, dict):
        raise ValueError(f"{path.as_posix()}: model set field 'tiers' must be an object")

    tier_names = set()
    for raw_tier in raw_tiers.keys():
        tier_names.add(_validate_tier_name(raw_tier, f"{path.as_posix()}: tier name"))

    missing_tiers = sorted(REQUIRED_TIERS - tier_names)
    if missing_tiers:
        raise ValueError(
            f"{path.as_posix()}: missing required tier(s): {', '.join(missing_tiers)}"
        )

    tiers: Dict[str, RuntimeModelSetting] = {}
    for raw_tier, raw_value in raw_tiers.items():
        tier = _validate_tier_name(raw_tier, f"{path.as_posix()}: tier name")
        tiers[tier] = _validate_model_setting(requested_runtime, path, tier, raw_value)

    name = _optional_single_line_string(
        data.get("name"), f"{path.as_posix()}: model-set name"
    )
    description = _optional_single_line_string(
        data.get("description"), f"{path.as_posix()}: model-set description"
    )

    return RuntimeModelSet(
        name=name or Path(model_set_name).stem,
        runtime=requested_runtime,
        tiers=tiers,
        path=path,
        description=description,
    )


def resolve_agent_model_settings(
    agent_names: Sequence[str],
    profile: Optional[AgentModelProfile],
    model_set: Optional[RuntimeModelSet],
    uniform_model: Optional[str] = None,
    *,
    runtime: Optional[str] = None,
) -> Dict[str, RuntimeModelSetting]:
    """Resolve per-agent runtime model settings.

    Missing profile entries intentionally produce no mapping so generated agents
    inherit the runtime default. Profile entries for agents outside
    ``agent_names`` are skipped with a standard ``UserWarning``.
    """

    safe_agents = [
        _validate_agent_name(agent, "generated agent name") for agent in agent_names
    ]
    safe_agent_set = set(safe_agents)

    if uniform_model is not None:
        resolved_runtime = _infer_runtime(profile, model_set, runtime)
        if resolved_runtime is None:
            raise ValueError(
                "runtime is required for uniform model resolution when profile/model_set are omitted"
            )
        setting = _validate_uniform_model(resolved_runtime, uniform_model)
        return {agent: _copy_setting(setting) for agent in safe_agents}

    if profile is None and model_set is None:
        return {}
    if profile is None or model_set is None:
        raise ValueError(
            "profile and model_set must both be supplied unless uniform_model is used"
        )

    resolved_runtime = _infer_runtime(profile, model_set, runtime)
    if resolved_runtime is None:
        raise ValueError("unable to infer runtime from profile/model_set")

    for agent in profile.models:
        if agent not in safe_agent_set:
            warnings.warn(
                f"{profile.path.as_posix()}: profile entry for non-generated agent '{agent}' skipped",
                UserWarning,
                stacklevel=2,
            )

    resolved: Dict[str, RuntimeModelSetting] = {}
    for agent in safe_agents:
        tier = profile.models.get(agent)
        if tier is None:
            continue
        if tier not in model_set.tiers:
            raise ValueError(
                f"{profile.path.as_posix()}: agent '{agent}' references unknown tier '{tier}' not present in model set {model_set.path.as_posix()}"
            )
        resolved[agent] = _copy_setting(model_set.tiers[tier])
    return resolved


__all__ = [
    "AgentModelProfile",
    "RuntimeModelSet",
    "load_profile",
    "load_model_set",
    "resolve_agent_model_settings",
]

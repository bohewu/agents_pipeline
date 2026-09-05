#!/usr/bin/env python3
"""Shared agent model profile and runtime model-set resolver.

This module intentionally validates only local profile/model-set shape and
runtime-specific config syntax. It does not check provider availability and it
does not handle reasoning-effort settings.
"""

import hashlib
import json
import re
import warnings
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any, Dict, List, Mapping, Optional, Sequence, Union


REQUIRED_TIERS = frozenset({"mini", "standard", "strong"})
TIER_ORDER = {"mini": 0, "standard": 1, "strong": 2}
RECOVERY_CEILING_AGENTS = frozenset({"executor", "generalist"})
SUPPORTED_RUNTIMES = frozenset({"codex", "copilot", "claude"})
SHARED_PROFILE_RUNTIME = "neutral"
CLAUDE_MODEL_ALIASES = frozenset({"inherit", "sonnet", "opus", "haiku"})

AGENT_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
TIER_NAME_RE = re.compile(r"^[a-z0-9][a-z0-9-]*$")
MODEL_IDENTIFIER_RE = re.compile(r"^[A-Za-z0-9][A-Za-z0-9._-]*$")
CODEX_MODEL_KEYS = frozenset({"model", "model_provider"})
VERSIONED_CODEX_MODEL_SET_KEYS = frozenset(
    {"version", "mapping_digest", "reasoning_projection", "role_overrides"}
)
DIGEST_RE = re.compile(r"^sha256:[0-9a-f]{64}$")

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
    recovery_ceiling_tiers: Dict[str, str] = field(default_factory=dict)


@dataclass(frozen=True)
class RuntimeModelSet:
    """Loaded runtime-specific tier-to-model mapping."""

    name: str
    runtime: str
    tiers: Dict[str, RuntimeModelSetting]
    path: Path
    description: Optional[str] = None
    version: Optional[str] = None
    mapping_digest: Optional[str] = None
    reasoning_projection: Optional[Dict[str, str]] = None
    role_overrides: Dict[str, Dict[str, str]] = field(default_factory=dict)


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


def _normalize_profile_runtime(value: Any, context: str) -> str:
    runtime = _single_line_string(value, context).strip().lower()
    allowed = SUPPORTED_RUNTIMES | {SHARED_PROFILE_RUNTIME}
    if runtime not in allowed:
        expected = ", ".join(sorted(allowed))
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
    if source_runtime == SHARED_PROFILE_RUNTIME:
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


def _validate_model_setting(
    runtime: str, path: Path, tier: str, value: Any
) -> RuntimeModelSetting:
    if runtime == "codex":
        return _validate_codex_model_setting(path, tier, value)
    if runtime == "copilot":
        return _validate_copilot_model_setting(path, tier, value)
    if runtime == "claude":
        return _validate_claude_alias(path, tier, value)
    raise ValueError(f"Unsupported runtime: {runtime}")


def _validate_uniform_model(runtime: str, value: Any) -> RuntimeModelSetting:
    if runtime == "codex":
        return {"model": _single_line_string(value, "uniform Codex model")}
    if runtime == "copilot":
        return _single_line_string(value, "uniform Copilot model")
    if runtime == "claude":
        return _validate_claude_alias(Path("<uniform>"), "uniform", value)
    raise ValueError(f"Unsupported runtime: {runtime}")


def _copy_setting(value: RuntimeModelSetting) -> RuntimeModelSetting:
    if isinstance(value, dict):
        return dict(value)
    if isinstance(value, list):
        return list(value)
    return value


def _canonical_json_bytes(value: Any) -> bytes:
    """Return the shared digest representation for managed configuration data."""

    return json.dumps(
        value,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    ).encode("utf-8")


def _sha256_digest(value: Any) -> str:
    return "sha256:" + hashlib.sha256(_canonical_json_bytes(value)).hexdigest()


def _model_mapping_payload(
    *,
    name: str,
    version: str,
    tiers: Mapping[str, RuntimeModelSetting],
    role_overrides: Mapping[str, Mapping[str, str]],
) -> Dict[str, Any]:
    """Return the immutable portion covered by a model-set mapping digest."""

    if not all(
        isinstance(tiers[tier], dict) and isinstance(tiers[tier].get("model"), str)
        for tier in tiers
    ):
        raise ValueError("versioned Codex model mappings require a model for every tier")
    return {
        "id": name,
        "version": version,
        # Provider remains parent-session metadata. The policy registry binds the
        # actual model string, so it deliberately hashes that stable surface only.
        "tiers": {tier: tiers[tier]["model"] for tier in sorted(tiers)},
        "role_overrides": {
            role: {
                "model_tier": role_overrides[role]["expected_tier"],
                "model": role_overrides[role]["model"],
            }
            for role in sorted(role_overrides)
        },
    }


def _validate_digest(value: Any, context: str) -> str:
    digest = _single_line_string(value, context)
    if DIGEST_RE.fullmatch(digest) is None:
        raise ValueError(f"{context} must be a sha256:<64 lowercase hex> digest")
    return digest


def _validate_model_identifier(value: Any, context: str) -> str:
    model = _single_line_string(value, context)
    if MODEL_IDENTIFIER_RE.fullmatch(model) is None:
        raise ValueError(
            f"{context} must be a bounded model identifier matching {MODEL_IDENTIFIER_RE.pattern}"
        )
    return model


def _validate_model_set_id(value: Any, context: str) -> str:
    name = _single_line_string(value, context)
    if AGENT_NAME_RE.fullmatch(name) is None:
        raise ValueError(
            f"{context} must be a safe model-set id matching {AGENT_NAME_RE.pattern}"
        )
    return name


def _validate_reasoning_projection(path: Path, value: Any) -> Dict[str, str]:
    context = f"{path.as_posix()}: reasoning_projection"
    if not isinstance(value, dict):
        raise ValueError(f"{context} must be an object")
    required = {"id", "version", "policy_version", "digest"}
    if set(value) != required:
        raise ValueError(
            f"{context} must contain exactly: {', '.join(sorted(required))}"
        )
    return {
        "id": _single_line_string(value["id"], f"{context}.id"),
        "version": _single_line_string(value["version"], f"{context}.version"),
        "policy_version": _single_line_string(
            value["policy_version"], f"{context}.policy_version"
        ),
        "digest": _validate_digest(value["digest"], f"{context}.digest"),
    }


def _validate_codex_role_overrides(path: Path, value: Any) -> Dict[str, Dict[str, str]]:
    context = f"{path.as_posix()}: role_overrides"
    if not isinstance(value, dict):
        raise ValueError(f"{context} must be an object")
    if set(value) - {"reviewer"}:
        raise ValueError(f"{context} supports only the named Codex reviewer")
    if "reviewer" not in value:
        return {}
    reviewer = value["reviewer"]
    if not isinstance(reviewer, dict) or set(reviewer) != {"expected_tier", "model"}:
        raise ValueError(
            f"{context}.reviewer must contain exactly: expected_tier, model"
        )
    expected_tier = _validate_tier_name(
        reviewer["expected_tier"], f"{context}.reviewer.expected_tier"
    )
    if expected_tier != "strong":
        raise ValueError(f"{context}.reviewer.expected_tier must be 'strong'")
    return {
        "reviewer": {
            "expected_tier": expected_tier,
            "model": _validate_model_identifier(
                reviewer["model"], f"{context}.reviewer.model"
            ),
        }
    }


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

    Profiles marked with runtime ``neutral`` are accepted as shared tier maps
    for all supported runtimes. Other runtime mismatches fail clearly.
    """

    path = _json_path(profile_name, profile_dir)
    requested_runtime = _normalize_runtime(runtime, "requested profile runtime")
    data = _load_json_object(path, "profile")

    source_runtime = _normalize_profile_runtime(
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

    raw_recovery_ceilings = data.get("recovery_ceiling_tiers", {})
    if not isinstance(raw_recovery_ceilings, dict):
        raise ValueError(
            f"{path.as_posix()}: profile field 'recovery_ceiling_tiers' must be an object"
        )
    recovery_ceiling_tiers: Dict[str, str] = {}
    for raw_agent, raw_ceiling in raw_recovery_ceilings.items():
        agent = _validate_agent_name(
            raw_agent, f"{path.as_posix()}: recovery ceiling agent name"
        )
        if agent not in RECOVERY_CEILING_AGENTS:
            expected = ", ".join(sorted(RECOVERY_CEILING_AGENTS))
            raise ValueError(
                f"{path.as_posix()}: recovery ceiling agent '{agent}' must be one of: {expected}"
            )
        if agent not in models:
            raise ValueError(
                f"{path.as_posix()}: recovery ceiling agent '{agent}' must exist in profile models"
            )
        ceiling = _validate_tier_name(
            raw_ceiling, f"{path.as_posix()}: recovery ceiling for agent '{agent}'"
        )
        if ceiling not in REQUIRED_TIERS:
            expected = ", ".join(sorted(REQUIRED_TIERS))
            raise ValueError(
                f"{path.as_posix()}: recovery ceiling for agent '{agent}' must be one of: {expected}"
            )
        base_tier = models[agent]
        if base_tier not in REQUIRED_TIERS:
            expected = ", ".join(sorted(REQUIRED_TIERS))
            raise ValueError(
                f"{path.as_posix()}: recovery ceiling agent '{agent}' has base tier '{base_tier}' outside required tiers: {expected}"
            )
        if TIER_ORDER[ceiling] < TIER_ORDER[base_tier]:
            raise ValueError(
                f"{path.as_posix()}: recovery ceiling '{ceiling}' for agent '{agent}' cannot be below base tier '{base_tier}'"
            )
        recovery_ceiling_tiers[agent] = ceiling

    name = _optional_single_line_string(
        data.get("name"), f"{path.as_posix()}: profile name"
    )
    description = _optional_single_line_string(
        data.get("description"), f"{path.as_posix()}: profile description"
    )
    return AgentModelProfile(
        name=name or Path(profile_name).stem,
        runtime=requested_runtime,
        source_runtime=source_runtime,
        models=models,
        path=path,
        description=description,
        recovery_ceiling_tiers=recovery_ceiling_tiers,
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

    metadata_keys = set(data).intersection(VERSIONED_CODEX_MODEL_SET_KEYS)
    version: Optional[str] = None
    mapping_digest: Optional[str] = None
    reasoning_projection: Optional[Dict[str, str]] = None
    role_overrides: Dict[str, Dict[str, str]] = {}
    if requested_runtime != "codex" and metadata_keys:
        raise ValueError(
            f"{path.as_posix()}: versioned model-set metadata is supported only for Codex"
        )
    if requested_runtime == "codex" and metadata_keys:
        required_metadata = {"version", "mapping_digest", "reasoning_projection"}
        if not required_metadata.issubset(metadata_keys):
            raise ValueError(
                f"{path.as_posix()}: versioned Codex model set requires: "
                + ", ".join(sorted(required_metadata))
            )
        version = _single_line_string(data["version"], f"{path.as_posix()}: model-set version")
        versioned_name = _validate_model_set_id(
            data.get("name"), f"{path.as_posix()}: model-set name"
        )
        role_overrides = _validate_codex_role_overrides(
            path, data.get("role_overrides", {})
        )
        mapping_digest = _validate_digest(
            data["mapping_digest"], f"{path.as_posix()}: mapping_digest"
        )
        expected_mapping_digest = _sha256_digest(
            _model_mapping_payload(
                name=versioned_name,
                version=version,
                tiers=tiers,
                role_overrides=role_overrides,
            )
        )
        if mapping_digest != expected_mapping_digest:
            raise ValueError(
                f"{path.as_posix()}: mapping_digest does not match its model mapping"
            )
        reasoning_projection = _validate_reasoning_projection(
            path, data["reasoning_projection"]
        )

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
        version=version,
        mapping_digest=mapping_digest,
        reasoning_projection=reasoning_projection,
        role_overrides=role_overrides,
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

    bindings = resolve_agent_model_bindings(
        safe_agents,
        profile,
        model_set,
        runtime=resolved_runtime,
    )
    return {
        agent: _copy_setting(binding["model_setting"])
        for agent, binding in bindings.items()
    }


def resolve_agent_model_bindings(
    agent_names: Sequence[str],
    profile: AgentModelProfile,
    model_set: RuntimeModelSet,
    *,
    runtime: Optional[str] = None,
) -> Dict[str, Dict[str, Any]]:
    """Resolve role settings with their proven tier and model-source metadata."""

    safe_agents = [
        _validate_agent_name(agent, "generated agent name") for agent in agent_names
    ]
    resolved_runtime = _infer_runtime(profile, model_set, runtime)
    if resolved_runtime is None:
        raise ValueError("unable to infer runtime from profile/model_set")

    if resolved_runtime == "codex" and model_set.version is not None:
        validate_model_set_projection(model_set)

    if resolved_runtime == "codex":
        for role, override in model_set.role_overrides.items():
            actual_tier = profile.models.get(role)
            if actual_tier is None:
                raise ValueError(
                    f"{profile.path.as_posix()}: role override for '{role}' requires "
                    "the named profile to define that role"
                )
            if actual_tier != override["expected_tier"]:
                raise ValueError(
                    f"{profile.path.as_posix()}: role override for '{role}' requires "
                    f"tier '{override['expected_tier']}', found '{actual_tier}'"
                )

    resolved: Dict[str, Dict[str, Any]] = {}
    for agent in safe_agents:
        tier = profile.models.get(agent)
        if tier is None:
            continue
        if tier not in model_set.tiers:
            raise ValueError(
                f"{profile.path.as_posix()}: agent '{agent}' references unknown tier '{tier}' not present in model set {model_set.path.as_posix()}"
            )
        setting = _copy_setting(model_set.tiers[tier])
        role_override: Optional[Dict[str, str]] = None
        if resolved_runtime == "codex":
            candidate = model_set.role_overrides.get(agent)
            if candidate is not None:
                if tier != candidate["expected_tier"]:
                    raise ValueError(
                        f"{profile.path.as_posix()}: role override for '{agent}' requires "
                        f"tier '{candidate['expected_tier']}', found '{tier}'"
                    )
                if not isinstance(setting, dict):  # Defensive: Codex validation guarantees this.
                    raise ValueError(f"{model_set.path.as_posix()}: invalid Codex model setting")
                setting["model"] = candidate["model"]
                role_override = dict(candidate)
        resolved[agent] = {
            "model_setting": setting,
            "model_tier": tier,
            "role_override": role_override,
        }
    return resolved


def model_mapping_snapshot(model_set: RuntimeModelSet) -> Dict[str, Any]:
    """Return a verified immutable catalog snapshot for workspace persistence."""

    if model_set.version is None or model_set.mapping_digest is None:
        raise ValueError(
            f"{model_set.path.as_posix()}: model set has no versioned mapping metadata"
        )
    snapshot = _model_mapping_payload(
        name=model_set.name,
        version=model_set.version,
        tiers=model_set.tiers,
        role_overrides=model_set.role_overrides,
    )
    snapshot["mapping_digest"] = model_set.mapping_digest
    return validate_model_mapping_snapshot(snapshot)


def validate_model_mapping_projection(
    mapping: Any, reasoning_projection: Any, *, label: str = "model mapping snapshot"
) -> None:
    """Prove a persisted model mapping and projection against the installed registry."""

    validated_mapping = validate_model_mapping_snapshot(mapping)
    projection = _validate_reasoning_projection(Path(f"<{label}>"), reasoning_projection)
    registry_path = (
        Path(__file__).resolve().parent.parent
        / "protocols"
        / "reasoning-projections.json"
    )
    registry = _load_json_object(registry_path, "reasoning projection registry")
    projections = registry.get("projections")
    if not isinstance(projections, list):
        raise ValueError(f"{registry_path.as_posix()}: projections must be an array")
    record = next(
        (
            item
            for item in projections
            if isinstance(item, dict)
            and item.get("id") == projection["id"]
            and item.get("version") == projection["version"]
        ),
        None,
    )
    if record is None:
        raise ValueError(
            f"{label}: unknown reasoning projection "
            f"{projection['id']}@{projection['version']}"
        )
    record_digest = record.get("digest")
    digest_payload = {key: value for key, value in record.items() if key != "digest"}
    if (
        record.get("policy_version") != projection["policy_version"]
        or record_digest != projection["digest"]
        or not isinstance(record_digest, str)
        or _sha256_digest(digest_payload) != record_digest
    ):
        raise ValueError(
            f"{label}: reasoning projection digest does not match registry"
        )
    bindings = record.get("model_sets")
    if not isinstance(bindings, list) or validated_mapping not in bindings:
        raise ValueError(
            f"{label}: reasoning projection has no matching model binding"
        )


def validate_model_set_projection(model_set: RuntimeModelSet) -> None:
    """Prove a versioned catalog against this resolver's installed projection registry."""

    identity = configuration_identity(model_set)
    validate_model_mapping_projection(
        model_mapping_snapshot(model_set),
        identity["reasoning_projection"],
        label=model_set.path.as_posix(),
    )


def validate_model_mapping_snapshot(value: Any) -> Dict[str, Any]:
    """Validate a persisted Codex model mapping without consulting live catalogs."""

    if not isinstance(value, dict):
        raise ValueError("model mapping snapshot must be an object")
    required = {"id", "version", "tiers", "role_overrides", "mapping_digest"}
    if set(value) != required:
        raise ValueError(
            "model mapping snapshot must contain exactly: " + ", ".join(sorted(required))
        )
    name = _validate_model_set_id(value["id"], "model mapping snapshot id")
    version = _single_line_string(value["version"], "model mapping snapshot version")
    raw_tiers = value["tiers"]
    if not isinstance(raw_tiers, dict) or set(raw_tiers) != REQUIRED_TIERS:
        raise ValueError("model mapping snapshot must contain exactly mini, standard, and strong")
    tiers: Dict[str, RuntimeModelSetting] = {
        tier: {"model": _validate_model_identifier(raw_tiers[tier], f"model mapping {tier}")}
        for tier in sorted(REQUIRED_TIERS)
    }
    raw_snapshot_overrides = value["role_overrides"]
    if not isinstance(raw_snapshot_overrides, dict):
        raise ValueError("model mapping snapshot role_overrides must be an object")
    normalized_catalog_overrides: Dict[str, Dict[str, Any]] = {}
    for role, override in raw_snapshot_overrides.items():
        if not isinstance(override, dict) or set(override) != {"model_tier", "model"}:
            raise ValueError(
                "model mapping snapshot role overrides must contain exactly model_tier, model"
            )
        normalized_catalog_overrides[role] = {
            "expected_tier": override["model_tier"],
            "model": override["model"],
        }
    overrides = _validate_codex_role_overrides(
        Path("<model-mapping-snapshot>"), normalized_catalog_overrides
    )
    digest = _validate_digest(value["mapping_digest"], "model mapping snapshot digest")
    expected = _sha256_digest(
        _model_mapping_payload(
            name=name,
            version=version,
            tiers=tiers,
            role_overrides=overrides,
        )
    )
    if digest != expected:
        raise ValueError("model mapping snapshot digest does not match its mapping")
    return {
        "id": name,
        "version": version,
        "tiers": {tier: tiers[tier]["model"] for tier in sorted(tiers)},
        "role_overrides": {
            role: {
                "model_tier": overrides[role]["expected_tier"],
                "model": overrides[role]["model"],
            }
            for role in sorted(overrides)
        },
        "mapping_digest": digest,
    }


def configuration_identity(model_set: RuntimeModelSet) -> Dict[str, Any]:
    """Return the resolver-owned identity shared with the reasoning policy."""

    if (
        model_set.version is None
        or model_set.mapping_digest is None
        or model_set.reasoning_projection is None
    ):
        raise ValueError(
            f"{model_set.path.as_posix()}: model set lacks required projection metadata"
        )
    return {
        "schema_version": 1,
        "model_set": {
            "id": model_set.name,
            "version": model_set.version,
            "mapping_digest": model_set.mapping_digest,
        },
        "reasoning_projection": dict(model_set.reasoning_projection),
    }


def resolved_configuration(
    model_set: RuntimeModelSet,
    *,
    role: str,
    model_tier: str,
    model_setting: RuntimeModelSetting,
    provenance: Mapping[str, Any],
) -> Dict[str, Any]:
    """Build the versioned per-role envelope consumed by policy and status tools."""

    safe_role = _validate_agent_name(role, "resolved configuration role")
    safe_tier = _validate_tier_name(model_tier, "resolved configuration model tier")
    if safe_tier not in model_set.tiers:
        raise ValueError(
            f"{model_set.path.as_posix()}: resolved tier '{safe_tier}' is not present"
        )
    if not isinstance(model_setting, dict) or not isinstance(model_setting.get("model"), str):
        raise ValueError("resolved Codex configuration requires a model setting")
    if not isinstance(provenance, Mapping):
        raise ValueError("resolved configuration provenance must be an object")
    result = configuration_identity(model_set)
    result["role_binding"] = {
        "role": safe_role,
        "model_tier": safe_tier,
        "model": model_setting["model"],
        "mapping_digest": model_set.mapping_digest,
    }
    result["provenance"] = dict(provenance)
    return result


def resolve_workspace_configurations(
    agent_names: Sequence[str],
    profile: AgentModelProfile,
    model_set: RuntimeModelSet,
) -> Dict[str, Dict[str, Any]]:
    """Resolve all named Codex roles into persisted policy input envelopes."""

    if model_set.runtime != "codex":
        raise ValueError("workspace configurations are supported only for Codex")
    bindings = resolve_agent_model_bindings(agent_names, profile, model_set, runtime="codex")
    return {
        role: resolved_configuration(
            model_set,
            role=role,
            model_tier=binding["model_tier"],
            model_setting=binding["model_setting"],
            provenance={"source": "workspace_profile", "override": None},
        )
        for role, binding in sorted(bindings.items())
    }


def resolve_recovery_model_setting(
    agent_name: str,
    requested_tier: str,
    profile: AgentModelProfile,
    model_set: RuntimeModelSet,
) -> Dict[str, Any]:
    """Resolve a bounded recovery model setting without changing base mappings."""

    agent = _validate_agent_name(agent_name, "recovery agent name")
    if agent not in RECOVERY_CEILING_AGENTS:
        expected = ", ".join(sorted(RECOVERY_CEILING_AGENTS))
        raise ValueError(f"recovery agent '{agent}' must be one of: {expected}")
    requested = _validate_tier_name(requested_tier, "requested recovery tier")
    if requested not in REQUIRED_TIERS:
        expected = ", ".join(sorted(REQUIRED_TIERS))
        raise ValueError(f"requested recovery tier must be one of: {expected}")

    _infer_runtime(profile, model_set, None)
    base_tier = profile.models.get(agent)
    if base_tier is None:
        raise ValueError(f"{profile.path.as_posix()}: recovery agent '{agent}' is not in profile models")
    ceiling_tier = profile.recovery_ceiling_tiers.get(agent)
    if ceiling_tier is None:
        raise ValueError(
            f"{profile.path.as_posix()}: recovery ceiling for agent '{agent}' is not configured"
        )
    if base_tier not in REQUIRED_TIERS:
        raise ValueError(
            f"{profile.path.as_posix()}: recovery agent '{agent}' has unknown base tier '{base_tier}'"
        )
    if requested not in model_set.tiers:
        raise ValueError(
            f"{model_set.path.as_posix()}: requested recovery tier '{requested}' is not present"
        )
    if TIER_ORDER[requested] <= TIER_ORDER[base_tier]:
        raise ValueError(
            f"requested recovery tier '{requested}' must be above base tier '{base_tier}'"
        )
    if TIER_ORDER[requested] > TIER_ORDER[ceiling_tier]:
        raise ValueError(
            f"requested recovery tier '{requested}' exceeds ceiling tier '{ceiling_tier}'"
        )

    return {
        "model_setting": _copy_setting(model_set.tiers[requested]),
        "base_tier": base_tier,
        "requested_tier": requested,
        "ceiling_tier": ceiling_tier,
    }


__all__ = [
    "AgentModelProfile",
    "RuntimeModelSet",
    "configuration_identity",
    "load_profile",
    "load_model_set",
    "model_mapping_snapshot",
    "resolved_configuration",
    "resolve_agent_model_bindings",
    "resolve_agent_model_settings",
    "resolve_recovery_model_setting",
    "resolve_workspace_configurations",
    "validate_model_mapping_projection",
    "validate_model_mapping_snapshot",
    "validate_model_set_projection",
]

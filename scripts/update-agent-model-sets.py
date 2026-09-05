#!/usr/bin/env python3
"""Refresh static model-set catalogs for supported runtime adapters."""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Callable


REPO_ROOT = Path(__file__).resolve().parents[1]


@dataclass(frozen=True)
class ManagedModelSet:
    runtime: str
    path: Path
    builder: Callable[[object | None, Path], dict]


def _canonical_json_bytes(value: object) -> bytes:
    return json.dumps(
        value, ensure_ascii=False, sort_keys=True, separators=(",", ":")
    ).encode("utf-8")


def _sha256_digest(value: object) -> str:
    return "sha256:" + hashlib.sha256(_canonical_json_bytes(value)).hexdigest()


def _projection_metadata(projection_id: str) -> dict:
    path = REPO_ROOT / "protocols" / "reasoning-projections.json"
    try:
        registry = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise ValueError(f"Unable to load managed reasoning projections: {path}") from exc
    projections = registry.get("projections") if isinstance(registry, dict) else None
    if not isinstance(projections, list):
        raise ValueError(f"Managed reasoning projections have no projection list: {path}")
    for projection in projections:
        if not isinstance(projection, dict) or projection.get("id") != projection_id:
            continue
        required = ("id", "version", "policy_version", "digest")
        if not all(isinstance(projection.get(key), str) and projection[key] for key in required):
            raise ValueError(f"Managed reasoning projection is invalid: {projection_id}")
        return {key: projection[key] for key in required}
    raise ValueError(f"Managed reasoning projection is missing: {projection_id}")


def _build_codex_catalog(
    *,
    name: str,
    version: str,
    description: str,
    tiers: dict,
    projection_id: str,
    role_overrides: dict | None = None,
) -> dict:
    overrides = role_overrides or {}
    mapping_payload = {
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
    }
    return {
        "name": name,
        "version": version,
        "runtime": "codex",
        "description": description,
        "mapping_digest": _sha256_digest(mapping_payload),
        "reasoning_projection": _projection_metadata(projection_id),
        "tiers": tiers,
        "role_overrides": overrides,
    }


def build_codex_openai(_data: object | None, _path: Path) -> dict:
    return {
        **_build_codex_catalog(
            name="openai",
            version="3",
            description=(
                "OpenAI standard set: Luna/Terra/Sol, with Astra for the proven "
                "strong reviewer."
            ),
            tiers={
            "mini": {"model": "gpt-5.6-luna", "model_provider": "openai"},
            "standard": {"model": "gpt-5.6-terra", "model_provider": "openai"},
            "strong": {"model": "gpt-5.6-sol", "model_provider": "openai"},
            },
            projection_id="openai-reviewer-v1",
            role_overrides={
                "reviewer": {"expected_tier": "strong", "model": "gpt-6-astra"}
            },
        )
    }


def build_codex_openai_luna_sol_astra(_data: object | None, _path: Path) -> dict:
    return _build_codex_catalog(
        name="openai-luna-sol-astra",
        version="1",
        description="Experimental Luna/Sol/Astra model set with its dedicated effort projection.",
        tiers={
            "mini": {"model": "gpt-5.6-luna", "model_provider": "openai"},
            "standard": {"model": "gpt-5.6-sol", "model_provider": "openai"},
            "strong": {"model": "gpt-6-astra", "model_provider": "openai"},
        },
        projection_id="lsa-efficiency-v1",
    )


def build_codex_openai_legacy(_data: object | None, _path: Path) -> dict:
    return _build_codex_catalog(
        name="openai-legacy",
        version="2",
        description="Legacy Luna/Terra/Sol model set with the v2 effort projection.",
        tiers={
            "mini": {"model": "gpt-5.6-luna", "model_provider": "openai"},
            "standard": {"model": "gpt-5.6-terra", "model_provider": "openai"},
            "strong": {"model": "gpt-5.6-sol", "model_provider": "openai"},
        },
        projection_id="legacy-v2",
    )


def build_copilot_default(_data: object | None, _path: Path) -> dict:
    return {
        "name": "default",
        "runtime": "copilot",
        "description": "Copilot/VS Code custom agent model set. Values must match available Copilot/VS Code model picker names.",
        "tiers": {
            "mini": "GPT-5 mini",
            "standard": "GPT-5.5",
            "strong": ["GPT-5.5", "Claude Opus 4.8"],
        },
    }


def build_claude_default(_data: object | None, _path: Path) -> dict:
    return {
        "name": "default",
        "runtime": "claude",
        "description": "Default Claude Code model set for exported agent profiles using Claude model aliases.",
        "tiers": {"mini": "haiku", "standard": "sonnet", "strong": "opus"},
    }


MANAGED_MODEL_SETS = (
    ManagedModelSet(
        "codex",
        REPO_ROOT / "runtimes/codex/model-sets/openai.json",
        build_codex_openai,
    ),
    ManagedModelSet(
        "codex",
        REPO_ROOT / "runtimes/codex/model-sets/openai-legacy.json",
        build_codex_openai_legacy,
    ),
    ManagedModelSet(
        "codex",
        REPO_ROOT / "runtimes/codex/model-sets/openai-luna-sol-astra.json",
        build_codex_openai_luna_sol_astra,
    ),
    ManagedModelSet(
        "copilot",
        REPO_ROOT / "runtimes/copilot/model-sets/default.json",
        build_copilot_default,
    ),
    ManagedModelSet(
        "claude",
        REPO_ROOT / "runtimes/claude/model-sets/default.json",
        build_claude_default,
    ),
)
MANAGED_MODEL_SET_ORDER = ("codex", "copilot", "claude")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Update static model-set JSON files for supported runtime adapters."
    )
    parser.add_argument(
        "--provider",
        choices=(*MANAGED_MODEL_SET_ORDER, "all"),
        default="all",
        help="Runtime catalog to update (default: all).",
    )
    parser.add_argument(
        "--model-set-dir",
        help=(
            "Override the output directory. A single provider writes its JSON file directly below it; "
            "--provider all mirrors runtimes/<runtime>/model-sets below it."
        ),
    )
    parser.add_argument("--dry-run", action="store_true", help="Print diffs without writing.")
    parser.add_argument("--check", action="store_true", help="Fail if a catalog is stale.")
    return parser.parse_args()


def render_json(document: dict) -> str:
    return json.dumps(document, indent=2) + "\n"


def selected_model_sets(provider: str) -> list[ManagedModelSet]:
    if provider == "all":
        return list(MANAGED_MODEL_SETS)
    return [model_set for model_set in MANAGED_MODEL_SETS if model_set.runtime == provider]


def output_path(
    model_set: ManagedModelSet, override_dir: str | None, *, all_providers: bool
) -> Path:
    if not override_dir:
        return model_set.path
    root = Path(override_dir)
    if all_providers:
        return root / model_set.path.relative_to(REPO_ROOT)
    return root / model_set.path.name


def main() -> int:
    args = parse_args()
    managed = selected_model_sets(args.provider)
    stale = False
    for model_set in managed:
        path = output_path(
            model_set,
            args.model_set_dir,
            all_providers=args.provider == "all",
        )
        expected = render_json(model_set.builder(None, path))
        current = path.read_text(encoding="utf-8") if path.exists() else ""
        if current == expected:
            print(f"Current: {path}")
            continue
        stale = True
        if args.dry_run or args.check:
            print(
                "".join(
                    difflib.unified_diff(
                        current.splitlines(keepends=True),
                        expected.splitlines(keepends=True),
                        fromfile=path.as_posix(),
                        tofile=path.as_posix(),
                    )
                ),
                end="",
            )
        if not args.dry_run and not args.check:
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(expected, encoding="utf-8")
            print(f"Updated {path}")
    return 1 if args.check and stale else 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Refresh static model-set catalogs for supported runtime adapters."""

from __future__ import annotations

import argparse
import difflib
import hashlib
import json
import stat
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
            version="4",
            description="OpenAI GPT-6 Luna/Sol/Astra model set.",
            tiers={
            "mini": {"model": "gpt-6-luna", "model_provider": "openai"},
            "standard": {"model": "gpt-6-sol", "model_provider": "openai"},
            "strong": {"model": "gpt-6-astra", "model_provider": "openai"},
            },
            projection_id="openai-gpt6-v1",
        )
    }


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
RETIRED_CODEX_CATALOGS = {
    "openai-legacy.json": "4afd156225bcb28617ed3d167c51fac0e8c95eaf3e67bb9a85cd39f0661c2269",
    "openai-luna-sol-astra.json": "022cc952533041fb6c5b7ee141787f67ca146672ea6f8a7d357c5fa02d86ec49",
}


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


def linklike_component(path: Path) -> Path | None:
    """Reject links and Windows reparse points anywhere on an output path."""

    absolute = path.absolute()
    for component in (absolute, *absolute.parents):
        try:
            metadata = component.lstat()
        except FileNotFoundError:
            continue
        if stat.S_ISLNK(metadata.st_mode) or (
            getattr(metadata, "st_file_attributes", 0)
            & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0)
        ):
            return component
    return None


def main() -> int:
    args = parse_args()
    managed = selected_model_sets(args.provider)
    stale = False
    blocked = False
    for model_set in managed:
        path = output_path(
            model_set,
            args.model_set_dir,
            all_providers=args.provider == "all",
        )
        if linklike_component(path) is not None or (path.exists() and not path.is_file()):
            print(f"Unsafe managed catalog requires manual review: {path}", file=sys.stderr)
            stale = True
            blocked = True
            continue
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
    if args.provider in ("codex", "all"):
        catalog_dir = output_path(
            next(item for item in managed if item.runtime == "codex"),
            args.model_set_dir,
            all_providers=args.provider == "all",
        ).parent
        for filename, expected_hash in RETIRED_CODEX_CATALOGS.items():
            path = catalog_dir / filename
            if not path.exists() and not path.is_symlink():
                continue
            stale = True
            if linklike_component(path) is not None or not path.is_file():
                print(f"Unsafe retired catalog requires manual removal: {path}", file=sys.stderr)
                blocked = True
                continue
            if hashlib.sha256(path.read_bytes()).hexdigest() != expected_hash:
                print(f"Unrecognized retired catalog requires manual review: {path}", file=sys.stderr)
                blocked = True
                continue
            if args.check or args.dry_run:
                print(f"Retired managed catalog remains: {path}")
            else:
                path.unlink()
                print(f"Removed retired managed catalog: {path}")
    return 1 if (args.check and stale) or (blocked and not args.dry_run) else 0


if __name__ == "__main__":
    raise SystemExit(main())

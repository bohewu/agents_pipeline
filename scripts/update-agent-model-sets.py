#!/usr/bin/env python3
"""Refresh managed agent model-set catalogs.

Anthropic and Google OpenCode catalogs are derived from models.dev metadata.
Runtime-only catalogs for Codex, Copilot, and Claude Code are static local
defaults and intentionally do not require network metadata.
"""

from __future__ import annotations

import argparse
from dataclasses import dataclass
import difflib
import json
import re
import sys
import urllib.request
from pathlib import Path
from typing import Callable


DEFAULT_SOURCE_URL = "https://models.dev/api.json"
REPO_ROOT = Path(__file__).resolve().parents[1]
DEFAULT_MODEL_SET_DIR = REPO_ROOT / "opencode" / "tools" / "model-sets"


@dataclass(frozen=True)
class ManagedModelSet:
    name: str
    path: Path
    builder: Callable[[dict | None, Path], dict]
    needs_metadata: bool = False


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Update managed agent model-set JSON files from metadata or static runtime defaults."
    )
    parser.add_argument(
        "--source-url",
        default=DEFAULT_SOURCE_URL,
        help=f"models.dev compatible JSON URL (default: {DEFAULT_SOURCE_URL})",
    )
    parser.add_argument(
        "--source-file",
        help="Read provider metadata from a local JSON file instead of --source-url.",
    )
    parser.add_argument(
        "--model-set-dir",
        help=(
            "Override output directory for the selected model-set JSON file(s). "
            f"Anthropic/Google default to {DEFAULT_MODEL_SET_DIR}. Runtime catalogs default to their bundled directories."
        ),
    )
    parser.add_argument(
        "--provider",
        choices=("anthropic", "google", "copilot", "codex", "claude", "all"),
        default="all",
        help=(
            "Provider or runtime model set to update. For backward compatibility, "
            "'all' updates only the Anthropic and Google OpenCode catalogs (default: all)."
        ),
    )
    parser.add_argument(
        "--dry-run",
        action="store_true",
        help="Print unified diffs instead of writing files.",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Fail if any managed model-set file is out of date.",
    )
    return parser.parse_args()


def load_metadata(args: argparse.Namespace) -> dict:
    if args.source_file:
        return json.loads(Path(args.source_file).read_text(encoding="utf-8"))

    request = urllib.request.Request(
        args.source_url,
        headers={
            "Accept": "application/json",
            "User-Agent": "agents-pipeline-model-set-updater/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=30) as response:
        return json.loads(response.read().decode("utf-8"))


def model_version(model_id: str) -> tuple[int, ...]:
    match = re.search(r"(?:claude-[a-z]+-|gemini-)(.+)", model_id)
    if not match:
        return ()
    return tuple(int(part) for part in re.findall(r"\d+", match.group(1)) if len(part) != 8)


def is_snapshot(model_id: str) -> bool:
    return bool(re.search(r"(?:^|-)\d{8}(?:$|-)", model_id))


def candidate_key(model_id: str) -> tuple:
    version = model_version(model_id)
    return (
        version,
        "preview" not in model_id,
        "latest" not in model_id,
        not is_snapshot(model_id),
        -len(model_id),
        model_id,
    )


def pick_model(models: dict, predicate: Callable[[str], bool], label: str) -> str:
    candidates = [model_id for model_id in models if predicate(model_id)]
    if not candidates:
        raise RuntimeError(f"No candidate model found for {label}.")
    return max(candidates, key=candidate_key)


def google_text_model(model_id: str) -> bool:
    excluded = ("image", "live", "tts", "embedding")
    return model_id.startswith("gemini-") and not any(token in model_id for token in excluded)


def render_json(data: dict) -> str:
    return json.dumps(data, indent=2) + "\n"


def build_anthropic(data: dict | None, _path: Path) -> dict:
    if data is None:
        raise RuntimeError("Anthropic model-set update requires provider metadata.")
    models = data["anthropic"]["models"]
    tiers = {
        "mini": "anthropic/"
        + pick_model(models, lambda model_id: model_id.startswith("claude-haiku-"), "anthropic mini"),
        "standard": "anthropic/"
        + pick_model(models, lambda model_id: model_id.startswith("claude-sonnet-"), "anthropic standard"),
        "strong": "anthropic/"
        + pick_model(models, lambda model_id: model_id.startswith("claude-opus-"), "anthropic strong"),
    }
    return {
        "name": "anthropic",
        "runtime": "opencode",
        "description": "Anthropic model set for workspace agent profiles. Adjust concrete model IDs to match your OpenCode provider configuration.",
        "tiers": tiers,
    }


def build_google(data: dict | None, _path: Path) -> dict:
    if data is None:
        raise RuntimeError("Google model-set update requires provider metadata.")
    models = data["google"]["models"]
    tiers = {
        "mini": "google/"
        + pick_model(
            models,
            lambda model_id: google_text_model(model_id) and "flash-lite" in model_id,
            "google mini",
        ),
        "standard": "google/"
        + pick_model(
            models,
            lambda model_id: google_text_model(model_id)
            and "flash" in model_id
            and "flash-lite" not in model_id,
            "google standard",
        ),
        "strong": "google/"
        + pick_model(
            models,
            lambda model_id: google_text_model(model_id) and "pro" in model_id,
            "google strong",
        ),
    }
    return {
        "name": "google",
        "runtime": "opencode",
        "description": "Google model set for workspace agent profiles. Adjust concrete model IDs to match your OpenCode provider configuration.",
        "tiers": tiers,
    }


def existing_tier(path: Path, tier: str, fallback: object) -> object:
    if not path.exists():
        return fallback
    data = json.loads(path.read_text(encoding="utf-8"))
    tiers = data.get("tiers")
    if isinstance(tiers, dict) and tier in tiers:
        return tiers[tier]
    return fallback


def build_copilot_default(_data: dict | None, path: Path) -> dict:
    return {
        "name": "default",
        "runtime": "copilot",
        "description": "Copilot/VS Code custom agent model set. Values must match available Copilot/VS Code model picker names.",
        "tiers": {
            "mini": existing_tier(path, "mini", "GPT-5 mini"),
            "standard": "GPT-5.4",
            "strong": ["Claude Opus 4.7", "GPT-5.5"],
        },
    }


def build_codex_openai(_data: dict | None, _path: Path) -> dict:
    return {
        "name": "openai",
        "runtime": "codex",
        "description": "OpenAI model set for Codex exported agent profiles.",
        "tiers": {
            "mini": {"model": "gpt-5.4-mini", "model_provider": "openai"},
            "standard": {"model": "gpt-5.4", "model_provider": "openai"},
            "strong": {"model": "gpt-5.5", "model_provider": "openai"},
        },
    }


def build_claude_default(_data: dict | None, _path: Path) -> dict:
    return {
        "name": "default",
        "runtime": "claude",
        "description": "Default Claude Code model set for exported agent profiles using Claude model aliases.",
        "tiers": {
            "mini": "haiku",
            "standard": "sonnet",
            "strong": "opus",
        },
    }


MANAGED_MODEL_SETS = {
    "anthropic": ManagedModelSet(
        name="anthropic",
        path=DEFAULT_MODEL_SET_DIR / "anthropic.json",
        builder=build_anthropic,
        needs_metadata=True,
    ),
    "google": ManagedModelSet(
        name="google",
        path=DEFAULT_MODEL_SET_DIR / "google.json",
        builder=build_google,
        needs_metadata=True,
    ),
    "copilot": ManagedModelSet(
        name="copilot",
        path=REPO_ROOT / "copilot" / "tools" / "model-sets" / "default.json",
        builder=build_copilot_default,
    ),
    "codex": ManagedModelSet(
        name="codex",
        path=REPO_ROOT / "codex" / "tools" / "model-sets" / "openai.json",
        builder=build_codex_openai,
    ),
    "claude": ManagedModelSet(
        name="claude",
        path=REPO_ROOT / "claude" / "tools" / "model-sets" / "default.json",
        builder=build_claude_default,
    ),
}


def selected_model_sets(provider: str) -> list[ManagedModelSet]:
    if provider == "all":
        return [MANAGED_MODEL_SETS["anthropic"], MANAGED_MODEL_SETS["google"]]
    return [MANAGED_MODEL_SETS[provider]]


def output_path(model_set: ManagedModelSet, override_dir: str | None) -> Path:
    if override_dir:
        return Path(override_dir) / model_set.path.name
    return model_set.path


def update_file(path: Path, rendered: str, *, dry_run: bool, check: bool) -> bool:
    current = path.read_text(encoding="utf-8") if path.exists() else ""
    if current == rendered:
        print(f"OK {path}")
        return False

    if check:
        print(f"OUTDATED {path}")
        return True

    if dry_run:
        diff = difflib.unified_diff(
            current.splitlines(keepends=True),
            rendered.splitlines(keepends=True),
            fromfile=str(path),
            tofile=f"{path} (updated)",
        )
        sys.stdout.writelines(diff)
        return True

    path.write_text(rendered, encoding="utf-8")
    print(f"Updated {path}")
    return True


def main() -> int:
    args = parse_args()
    model_sets = selected_model_sets(args.provider)
    data = load_metadata(args) if any(model_set.needs_metadata for model_set in model_sets) else None

    changed = False
    for model_set in model_sets:
        path = output_path(model_set, args.model_set_dir)
        rendered = render_json(model_set.builder(data, path))
        changed = update_file(path, rendered, dry_run=args.dry_run, check=args.check) or changed

    if args.check and changed:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Refresh workspace agent model-set catalogs from models.dev metadata."""

from __future__ import annotations

import argparse
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


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Update Anthropic and Google agent model-set JSON files from models.dev."
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
        default=str(DEFAULT_MODEL_SET_DIR),
        help="Directory containing model-set JSON files.",
    )
    parser.add_argument(
        "--provider",
        choices=("anthropic", "google", "all"),
        default="all",
        help="Provider model set to update (default: all).",
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


def build_anthropic(data: dict) -> dict:
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


def build_google(data: dict) -> dict:
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


BUILDERS = {
    "anthropic": build_anthropic,
    "google": build_google,
}


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
    model_set_dir = Path(args.model_set_dir)
    data = load_metadata(args)

    providers = ["anthropic", "google"] if args.provider == "all" else [args.provider]
    changed = False
    for provider in providers:
        path = model_set_dir / f"{provider}.json"
        rendered = render_json(BUILDERS[provider](data))
        changed = update_file(path, rendered, dry_run=args.dry_run, check=args.check) or changed

    if args.check and changed:
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec python3 - "${SCRIPT_DIR}" "$@" <<'PY'
from __future__ import annotations

import argparse
import datetime as dt
import hashlib
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path


SCRIPT_DIR = Path(sys.argv[1]).resolve()
ARGV = sys.argv[2:]


def normalize_args(args: list[str]) -> list[str]:
    mapping = {
        "-Model": "--model",
        "-ModelSet": "--model-set",
        "-Runtime": "--runtime",
        "-Target": "--target",
        "-UniformModel": "--uniform-model",
        "-Workspace": "--workspace",
        "-SourceAgents": "--source-agents",
        "-ProfileDir": "--profile-dir",
        "-ModelSetDir": "--model-set-dir",
        "-ClaudeMd": "--claude-md",
        "-DryRun": "--dry-run",
        "-NoBackup": "--no-backup",
        "-NoRunner": "--no-runner",
        "-Force": "--force",
    }
    return [mapping.get(arg, arg) for arg in args]


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def write_text(path: Path, text: str) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(text, encoding="utf-8")


def read_json(path: Path):
    if not path.is_file():
        raise RuntimeError(f"JSON file not found: {path}")
    try:
        return json.loads(read_text(path))
    except json.JSONDecodeError as exc:
        raise RuntimeError(f"Invalid JSON file '{path}': {exc}") from exc


def sha256_file(path: Path) -> str:
    return "sha256:" + hashlib.sha256(path.read_bytes()).hexdigest()


def sha256_text(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()


def assert_profile_schema(obj, path: Path) -> None:
    if not isinstance(obj, dict):
        raise RuntimeError(f"Invalid profile schema in '{path}': expected object.")
    for key in ("name", "runtime", "description", "models"):
        if key not in obj or obj[key] in (None, ""):
            raise RuntimeError(f"Invalid profile schema in '{path}': missing {key}.")
    if obj["runtime"] != "opencode":
        raise RuntimeError(f"Invalid profile runtime in '{path}': expected 'opencode'.")
    if not isinstance(obj["models"], dict) or not obj["models"]:
        raise RuntimeError(f"Invalid profile schema in '{path}': models must not be empty.")
    for agent, tier in obj["models"].items():
        if not isinstance(tier, str) or not tier.strip():
            raise RuntimeError(f"Invalid profile schema in '{path}': empty tier for '{agent}'.")
        assert_safe_name(str(agent), "agent name")
        assert_safe_name(tier, "model tier")


def assert_model_set_schema(obj, path: Path) -> None:
    if not isinstance(obj, dict):
        raise RuntimeError(f"Invalid model set schema in '{path}': expected object.")
    for key in ("name", "runtime", "description", "tiers"):
        if key not in obj or obj[key] in (None, ""):
            raise RuntimeError(f"Invalid model set schema in '{path}': missing {key}.")
    if obj["runtime"] != "opencode":
        raise RuntimeError(f"Invalid model set runtime in '{path}': expected 'opencode'.")
    if not isinstance(obj["tiers"], dict):
        raise RuntimeError(f"Invalid model set schema in '{path}': tiers must be an object.")
    for tier in ("mini", "standard", "strong"):
        value = obj["tiers"].get(tier)
        if not isinstance(value, str) or not value.strip():
            raise RuntimeError(f"Invalid model set schema in '{path}': missing tier '{tier}'.")
        assert_safe_model_id(value, f"{path} tier '{tier}'")


def assert_runtime_model_set_schema(obj, path: Path, runtime: str) -> None:
    if not isinstance(obj, dict):
        raise RuntimeError(f"Invalid model set schema in '{path}': expected object.")
    for key in ("name", "runtime", "description", "tiers"):
        if key not in obj or obj[key] in (None, ""):
            raise RuntimeError(f"Invalid model set schema in '{path}': missing {key}.")
    if obj["runtime"] != runtime:
        raise RuntimeError(f"Invalid model set runtime in '{path}': expected '{runtime}'.")
    if not isinstance(obj["tiers"], dict):
        raise RuntimeError(f"Invalid model set schema in '{path}': tiers must be an object.")
    for tier in ("mini", "standard", "strong"):
        if tier not in obj["tiers"]:
            raise RuntimeError(f"Invalid model set schema in '{path}': missing tier '{tier}'.")
        value = obj["tiers"][tier]
        if value in (None, "") or value == [] or value == {}:
            raise RuntimeError(f"Invalid model set schema in '{path}': tier '{tier}' is empty.")


def format_runtime_tier(value) -> str:
    if isinstance(value, str):
        return value
    return json.dumps(value, separators=(",", ":"), ensure_ascii=False)


def list_runtime_profiles(runtime: str, profile_dir: Path, model_set_dir: Path) -> None:
    if not profile_dir.is_dir():
        raise RuntimeError(f"Profile directory not found: {profile_dir}")
    if not model_set_dir.is_dir():
        raise RuntimeError(f"Model set directory not found for runtime '{runtime}': {model_set_dir}")
    print(f"Runtime: {runtime}")
    print("Profiles:")
    for file in sorted(profile_dir.glob("*.json")):
        profile = read_json(file)
        assert_profile_schema(profile, file)
        print(f"- {profile['name']}: {len(profile['models'])} agents. {profile['description']}")
    print("- uniform: built-in mode; use --uniform-model or 'uniform --model' to apply one runtime model to every generated agent.")
    print(f"Model sets ({runtime}):")
    for file in sorted(model_set_dir.glob("*.json")):
        model_set = read_json(file)
        assert_runtime_model_set_schema(model_set, file, runtime)
        tiers = model_set["tiers"]
        print(
            f"- {model_set['name']}: "
            f"mini={format_runtime_tier(tiers['mini'])}, "
            f"standard={format_runtime_tier(tiers['standard'])}, "
            f"strong={format_runtime_tier(tiers['strong'])}"
        )


def runtime_installer_unavailable(runtime: str, installer: Path) -> str:
    return (
        f"Runtime installer script not found for '{runtime}': {installer}. "
        "Run this tool from a cloned agents_pipeline repo or an extracted release bundle that includes scripts/install-<runtime>.*, "
        f"or invoke scripts/install-{runtime}.* directly from that repo/bundle."
    )


def runtime_target_from_workspace(runtime: str, workspace: Path) -> Path:
    if runtime == "opencode":
        return workspace / ".opencode" / "agents"
    if runtime == "claude":
        return workspace / ".claude" / "agents"
    if runtime == "copilot":
        return workspace / ".copilot" / "agents"
    if runtime == "codex":
        return workspace / ".codex"
    raise RuntimeError(f"Unsupported runtime: {runtime}")


def run_runtime_install(args: argparse.Namespace, repo_root: Path, profile_dir: Path, model_set_dir: Path) -> int:
    installer = repo_root / "scripts" / f"install-{args.runtime}.sh"
    if not installer.is_file():
        raise RuntimeError(runtime_installer_unavailable(args.runtime, installer))
    if not args.profile:
        raise RuntimeError("install requires a profile: frugal, balanced, premium, or uniform.")
    if args.runtime != "claude" and (args.claude_md or args.no_runner):
        raise RuntimeError("--claude-md and --no-runner are only supported with --runtime claude.")

    cmd = ["bash", str(installer)]
    if args.target:
        cmd.extend(["--target", args.target])
    if args.dry_run:
        cmd.append("--dry-run")
    if args.no_backup:
        cmd.append("--no-backup")
    if args.force and args.runtime == "codex":
        cmd.append("--force")
    if args.runtime == "claude":
        if args.claude_md:
            cmd.extend(["--claude-md", args.claude_md])
        if args.no_runner:
            cmd.append("--no-runner")

    if args.profile == "uniform":
        uniform_model = args.uniform_model or args.model
        if not uniform_model:
            raise RuntimeError("install uniform requires --uniform-model (or --model for compatibility).")
        if args.model and args.uniform_model and args.model != args.uniform_model:
            raise RuntimeError("install uniform received different values for --model and --uniform-model.")
        cmd.extend(["--uniform-model", uniform_model])
    else:
        if args.uniform_model:
            raise RuntimeError("--uniform-model is only valid with the built-in 'uniform' profile.")
        if args.model:
            raise RuntimeError("Named runtime profiles are tier-map driven. Use --model-set, or use 'uniform --uniform-model'.")
        if not args.model_set:
            raise RuntimeError(f"install {args.profile} --runtime {args.runtime} requires --model-set.")
        assert_safe_name(args.profile, "profile")
        cmd.extend(["--agent-profile", args.profile, "--model-set", args.model_set])
        cmd.extend(["--profile-dir", str(profile_dir), "--model-set-dir", str(model_set_dir)])

    completed = subprocess.run(cmd)
    return completed.returncode


def is_safe_name(value: str) -> bool:
    import re
    return bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._-]*", value or ""))


def assert_safe_name(value: str, kind: str) -> None:
    if not is_safe_name(value):
        raise RuntimeError(f"Invalid {kind} '{value}': expected a basename using letters, digits, dot, underscore, or hyphen.")


def is_safe_model_id(value: str) -> bool:
    import re
    return bool(re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9._:/@+-]*", value or ""))


def assert_safe_model_id(value: str, context: str) -> None:
    if not is_safe_model_id(value):
        raise RuntimeError(f"Invalid model id for {context}: expected a single-line provider/model scalar without spaces or YAML control characters.")


def is_safe_relative_file(value: str) -> bool:
    if not value or os.path.isabs(value):
        return False
    parts = Path(value).parts
    return bool(parts) and all(part not in ("", ".", "..") for part in parts)


def assert_child_path(parent: Path, child: Path) -> Path:
    parent = parent.resolve()
    child = child.resolve()
    try:
        child.relative_to(parent)
    except ValueError as exc:
        raise RuntimeError(f"Path escapes managed directory: {child}") from exc
    return child


def patch_frontmatter_model(text: str, model: str) -> str | None:
    normalized = text.replace("\r\n", "\n")
    if not normalized.startswith("---\n"):
        return None
    close = normalized.find("\n---", 4)
    if close < 0:
        return None
    after_close_index = close + len("\n---")
    if after_close_index < len(normalized) and normalized[after_close_index] not in ("\n", " ", "\t"):
        return None
    front = normalized[4:close]
    rest = normalized[after_close_index:]
    lines = [line for line in front.split("\n") if not line.lstrip().startswith("model:")]
    insert_at = len(lines)
    for key in ("mode", "description", "name"):
        for index, line in enumerate(lines):
            if line.lstrip().startswith(f"{key}:"):
                insert_at = index + 1
                break
        if insert_at != len(lines):
            break
    lines.insert(insert_at, f"model: {model}")
    return "---\n" + "\n".join(lines) + "\n---" + rest


def load_managed_lookup(manifest_path: Path) -> dict[str, str]:
    if not manifest_path.is_file():
        return {}
    manifest = read_json(manifest_path)
    return {str(item.get("file")): str(item.get("targetHash", "")) for item in manifest.get("managedFiles", []) if item.get("file")}


def backup_file(path: Path, opencode_dir: Path, state: dict, no_backup: bool) -> None:
    if no_backup or not path.is_file():
        return
    if "backup_dir" not in state:
        stamp = dt.datetime.now().strftime("%Y%m%d-%H%M%S")
        state["backup_dir"] = opencode_dir / f".backup-agent-profile-{stamp}"
        state["backup_dir"].mkdir(parents=True, exist_ok=True)
    backup_dir = state["backup_dir"]
    try:
        relative = path.resolve().relative_to(opencode_dir.resolve())
    except ValueError:
        relative = Path(path.name)
    destination = backup_dir / relative
    destination.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(path, destination)


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Install agent model profiles for OpenCode and companion runtimes.")
    parser.add_argument("action", choices=("install", "status", "clear", "list"))
    parser.add_argument("profile", nargs="?")
    parser.add_argument("--model")
    parser.add_argument("--model-set")
    parser.add_argument("--runtime", choices=("opencode", "codex", "copilot", "claude"), default="opencode", type=str.lower)
    parser.add_argument("--target")
    parser.add_argument("--uniform-model")
    parser.add_argument("--workspace")
    parser.add_argument("--source-agents")
    parser.add_argument("--profile-dir")
    parser.add_argument("--model-set-dir")
    parser.add_argument("--claude-md")
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--no-backup", action="store_true")
    parser.add_argument("--no-runner", action="store_true")
    parser.add_argument("--force", action="store_true")
    return parser


def main() -> int:
    args = build_parser().parse_args(normalize_args(ARGV))
    repo_root = (SCRIPT_DIR / "../..").resolve()
    source_agents = Path(args.source_agents).expanduser().resolve() if args.source_agents else (SCRIPT_DIR / "../agents").resolve()
    profile_dir = Path(args.profile_dir).expanduser().resolve() if args.profile_dir else (SCRIPT_DIR / "agent-profiles").resolve()
    if args.runtime == "opencode":
        model_set_dir = Path(args.model_set_dir).expanduser().resolve() if args.model_set_dir else (SCRIPT_DIR / "model-sets").resolve()
        workspace_value = args.target or args.workspace or "."
        if args.target and args.workspace:
            target_path = Path(args.target).expanduser().resolve()
            workspace_path = Path(args.workspace).expanduser().resolve()
            if target_path != workspace_path:
                raise RuntimeError("--target and --workspace both set different paths for --runtime opencode.")
        if args.uniform_model:
            if args.profile == "uniform" and not args.model:
                args.model = args.uniform_model
            elif args.model and args.model != args.uniform_model:
                raise RuntimeError("install uniform received different values for --model and --uniform-model.")
            elif args.profile != "uniform":
                raise RuntimeError("--uniform-model is only valid with the built-in 'uniform' profile.")
    else:
        model_set_dir = Path(args.model_set_dir).expanduser().resolve() if args.model_set_dir else (repo_root / args.runtime / "tools" / "model-sets").resolve()
        if args.action == "list":
            list_runtime_profiles(args.runtime, profile_dir, model_set_dir)
            return 0
        if args.action != "install":
            raise RuntimeError(f"{args.action} is unsupported for --runtime {args.runtime}; supported actions are install and list.")
        workspace = Path(args.workspace or ".").expanduser().resolve()
        if not args.target:
            args.target = str(runtime_target_from_workspace(args.runtime, workspace))
        return run_runtime_install(args, repo_root, profile_dir, model_set_dir)

    workspace = Path(workspace_value).expanduser().resolve()
    opencode_dir = workspace / ".opencode"
    target_agents_dir = opencode_dir / "agents"
    manifest_path = opencode_dir / ".agents-pipeline-agent-profile.json"

    if args.action == "list":
        if not profile_dir.is_dir():
            raise RuntimeError(f"Profile directory not found: {profile_dir}")
        if not model_set_dir.is_dir():
            raise RuntimeError(f"Model set directory not found: {model_set_dir}")
        print("Profiles:")
        for file in sorted(profile_dir.glob("*.json")):
            profile = read_json(file)
            assert_profile_schema(profile, file)
            print(f"- {profile['name']}: {len(profile['models'])} agents, default model set '{profile.get('modelSet')}'. {profile['description']}")
        print("- uniform: built-in mode; requires --model and applies that exact model to every source agent.")
        print("Model sets:")
        for file in sorted(model_set_dir.glob("*.json")):
            model_set = read_json(file)
            assert_model_set_schema(model_set, file)
            tiers = model_set["tiers"]
            print(f"- {model_set['name']}: mini={tiers['mini']}, standard={tiers['standard']}, strong={tiers['strong']}")
        return 0

    if args.action == "status":
        if not manifest_path.is_file():
            print(f"No agent model profile installed for workspace: {workspace}")
            return 0
        manifest = read_json(manifest_path)
        warnings = manifest.get("warnings", [])
        managed = manifest.get("managedFiles", [])
        print(f"Profile: {manifest.get('profile')}")
        print(f"Mode: {manifest.get('mode')}")
        if manifest.get("modelSet"):
            print(f"Model set: {manifest.get('modelSet')}")
        print(f"Generated at: {manifest.get('generatedAt')}")
        print(f"Source agents: {manifest.get('sourceAgentsDir')}")
        print(f"Target agents: {manifest.get('targetAgentsDir')}")
        print(f"Managed files: {len(managed)}")
        print(f"Warnings: {len(warnings)}")
        for warning in warnings:
            print(f"- {warning}")
        for item in managed:
            file = str(item.get("file", ""))
            if not is_safe_relative_file(file):
                print(f"Missing/unsafe managed file entry: {file}")
                continue
            path = assert_child_path(target_agents_dir, target_agents_dir / file)
            if not path.is_file():
                print(f"Missing managed file: {file}")
        return 0

    if args.action == "clear":
        if not manifest_path.is_file():
            print("No agent model profile installed; nothing to clear.")
            return 0
        manifest = read_json(manifest_path)
        backup_state: dict = {}
        for item in manifest.get("managedFiles", []):
            file = str(item.get("file", ""))
            if not is_safe_relative_file(file):
                raise RuntimeError(f"Unsafe managed file entry in manifest: {file}")
            path = assert_child_path(target_agents_dir, target_agents_dir / file)
            if args.dry_run:
                print(f"Would remove managed file: {path}")
            elif path.is_file():
                expected_hash = str(item.get("targetHash", ""))
                if expected_hash and sha256_file(path) != expected_hash and not args.force:
                    print(f"Warning: skipped changed managed file without --force: {path}")
                    continue
                backup_file(path, opencode_dir, backup_state, args.no_backup)
                path.unlink()
                print(f"Removed managed file: {path}")
        if args.dry_run:
            print(f"Would remove manifest: {manifest_path}")
            print("Dry run complete. No files were written.")
            return 0
        backup_file(manifest_path, opencode_dir, backup_state, args.no_backup)
        manifest_path.unlink()
        print("Agent model profile cleared.")
        return 0

    if not args.profile:
        raise RuntimeError("install requires a profile: frugal, balanced, premium, or uniform.")
    if not source_agents.is_dir():
        raise RuntimeError(f"Source agents directory not found: {source_agents}")

    warnings: list[str] = []
    entries: list[dict] = []
    mode = "profile"
    profile_path = None
    model_set_path = None
    model_set_name = None

    if args.profile == "uniform":
        if not args.model:
            raise RuntimeError("install uniform requires --model.")
        assert_safe_model_id(args.model, "uniform --model")
        mode = "uniform"
        for file in sorted(source_agents.glob("*.md")):
            assert_safe_name(file.stem, "agent filename")
            entries.append({"agent": file.stem, "tier": None, "model": args.model, "sourcePath": file})
    else:
        assert_safe_name(args.profile, "profile")
        if args.model:
            raise RuntimeError("Named profiles are tier-map driven. Use --model-set, or use 'uniform --model'.")
        if not profile_dir.is_dir():
            raise RuntimeError(f"Profile directory not found: {profile_dir}")
        if not model_set_dir.is_dir():
            raise RuntimeError(f"Model set directory not found: {model_set_dir}")
        profile_path = profile_dir / f"{args.profile}.json"
        profile = read_json(profile_path)
        assert_profile_schema(profile, profile_path)
        model_set_name = args.model_set or profile.get("modelSet")
        if not model_set_name:
            raise RuntimeError(f"Profile '{args.profile}' does not declare modelSet; pass --model-set explicitly.")
        assert_safe_name(model_set_name, "model set")
        model_set_path = model_set_dir / f"{model_set_name}.json"
        model_set = read_json(model_set_path)
        assert_model_set_schema(model_set, model_set_path)
        for agent, tier in sorted(profile["models"].items()):
            assert_safe_name(agent, "agent name")
            assert_safe_name(tier, "model tier")
            if tier not in model_set["tiers"]:
                raise RuntimeError(f"Profile '{args.profile}' maps '{agent}' to unknown tier '{tier}' for model set '{model_set_name}'.")
            source_path = assert_child_path(source_agents, source_agents / f"{agent}.md")
            if not source_path.is_file():
                warnings.append(f"Profile references missing source agent: {agent}")
                continue
            entries.append({"agent": agent, "tier": tier, "model": model_set["tiers"][tier], "sourcePath": source_path})

    previous_managed = load_managed_lookup(manifest_path)
    new_managed: set[str] = set()
    managed_files: list[dict] = []
    backup_state: dict = {}

    for entry in sorted(entries, key=lambda item: item["agent"]):
        target_file = f"{entry['agent']}.md"
        if not is_safe_relative_file(target_file):
            raise RuntimeError(f"Unsafe target file name generated for agent: {entry['agent']}")
        target_path = assert_child_path(target_agents_dir, target_agents_dir / target_file)
        patched = patch_frontmatter_model(read_text(entry["sourcePath"]), entry["model"])
        if patched is None:
            warnings.append(f"Source agent has unsupported frontmatter; skipped: {entry['agent']}")
            continue
        target_exists = target_path.is_file()
        is_managed = target_file in previous_managed
        if target_exists and not is_managed and not args.force:
            warnings.append(f"Skipped unmanaged target without --force: {target_file}")
            print(f"Warning: skipped unmanaged target without --force: {target_path}")
            continue
        if target_exists and is_managed and not args.force:
            previous_hash = previous_managed.get(target_file)
            if previous_hash and sha256_file(target_path) != previous_hash:
                warnings.append(f"Skipped changed managed target without --force: {target_file}")
                print(f"Warning: skipped changed managed target without --force: {target_path}")
                continue
        new_managed.add(target_file)
        managed_files.append({
            "agent": entry["agent"],
            "file": target_file,
            "tier": entry["tier"],
            "model": entry["model"],
            "sourcePath": str(entry["sourcePath"].resolve()),
            "sourceHash": sha256_file(entry["sourcePath"]),
            "targetHash": sha256_text(patched),
        })
        if args.dry_run:
            print(f"Would {'overwrite' if target_exists else 'write'}: {target_path}")
            continue
        if target_exists:
            backup_file(target_path, opencode_dir, backup_state, args.no_backup)
        write_text(target_path, patched)
        print(f"Wrote: {target_path}")

    if manifest_path.is_file():
        previous_manifest = read_json(manifest_path)
        for item in previous_manifest.get("managedFiles", []):
            file = str(item.get("file", ""))
            if not file or file in new_managed:
                continue
            if not is_safe_relative_file(file):
                raise RuntimeError(f"Unsafe managed file entry in previous manifest: {file}")
            stale_path = assert_child_path(target_agents_dir, target_agents_dir / file)
            if not stale_path.is_file():
                continue
            if args.dry_run:
                print(f"Would remove stale managed file: {stale_path}")
            else:
                backup_file(stale_path, opencode_dir, backup_state, args.no_backup)
                stale_path.unlink()
                print(f"Removed stale managed file: {stale_path}")

    if args.dry_run:
        print("Dry run complete. No files were written.")
        return 0

    if manifest_path.is_file():
        backup_file(manifest_path, opencode_dir, backup_state, args.no_backup)
    manifest = {
        "tool": "agents_pipeline.agent-profile",
        "version": 2,
        "profile": args.profile,
        "mode": mode,
        "modelSet": model_set_name,
        "workspace": str(workspace),
        "sourceAgentsDir": str(source_agents),
        "profilePath": str(profile_path.resolve()) if profile_path else None,
        "modelSetPath": str(model_set_path.resolve()) if model_set_path else None,
        "targetAgentsDir": str(target_agents_dir.resolve()),
        "generatedAt": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
        "managedFiles": sorted(managed_files, key=lambda item: item["agent"]),
        "warnings": warnings,
    }
    write_text(manifest_path, json.dumps(manifest, indent=2) + "\n")
    print("Profile installed. Restart OpenCode to reload workspace agents.")
    return 0


try:
    raise SystemExit(main())
except Exception as exc:
    print(f"agent-profile.sh: {exc}", file=sys.stderr)
    raise SystemExit(1)
PY

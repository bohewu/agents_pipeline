#!/usr/bin/env python3
"""List, search, and install agent skills from local paths or curated catalogs."""

from __future__ import annotations

import argparse
import json
import os
import re
import shutil
import sys
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path
from typing import Any


SOURCES = {
    "anthropic": {
        "label": "Anthropic skills",
        "repo": "anthropics/skills",
        "skills_path": "skills",
        "url": "https://github.com/anthropics/skills/tree/main/skills",
        "default_scope": "repo",
    },
    "awesome-copilot": {
        "label": "Awesome Copilot skills",
        "repo": "github/awesome-copilot",
        "skills_path": "skills",
        "url": "https://github.com/github/awesome-copilot/tree/main/skills",
        "default_scope": "repo",
    },
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "List, search, and install agent skills from local skill locations or "
            "supported GitHub catalogs."
        )
    )
    parser.add_argument(
        "--action",
        required=True,
        choices=["list", "search", "install"],
        help="Operation to perform.",
    )
    parser.add_argument(
        "--source",
        default="installed",
        help=(
            "Skill source: installed, anthropic, awesome-copilot, all, or local. "
            "Install supports anthropic, awesome-copilot, or local."
        ),
    )
    parser.add_argument("--query", help="Search text for skill names.")
    parser.add_argument("--skill-name", help="Skill name to install.")
    parser.add_argument("--local-path", help="Local skill folder path when --source=local.")
    parser.add_argument(
        "--scope",
        default="repo",
        choices=["repo", "global"],
        help="Installation scope for install action.",
    )
    parser.add_argument(
        "--format",
        default="text",
        choices=["text", "json"],
        help="Output format.",
    )
    parser.add_argument("--project-root", default=os.getcwd(), help="Current project root/worktree.")
    parser.add_argument("--force", action="store_true", help="Replace an existing installed skill.")
    parser.add_argument("--dry-run", action="store_true", help="Preview install actions without writing files.")
    return parser.parse_args()


def github_headers() -> dict[str, str]:
    headers = {
        "Accept": "application/vnd.github+json",
        "User-Agent": "agents-pipeline-skill-manager",
    }
    token = os.environ.get("GITHUB_TOKEN") or os.environ.get("GH_TOKEN")
    if token:
        headers["Authorization"] = f"Bearer {token}"
    return headers


def github_get_json(url: str) -> Any:
    request = urllib.request.Request(url, headers=github_headers())
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return json.loads(response.read().decode("utf-8"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"GitHub request failed ({exc.code}) for {url}: {detail}") from exc


def github_download_text(url: str) -> str:
    request = urllib.request.Request(url, headers=github_headers())
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read().decode("utf-8")


def github_download_bytes(url: str) -> bytes:
    request = urllib.request.Request(url, headers=github_headers())
    with urllib.request.urlopen(request, timeout=30) as response:
        return response.read()


def parse_frontmatter(text: str) -> dict[str, str]:
    lines = text.splitlines()
    if len(lines) < 3 or lines[0].strip() != "---":
        return {}
    data: dict[str, str] = {}
    for line in lines[1:]:
        stripped = line.strip()
        if stripped == "---":
            break
        match = re.match(r"^([A-Za-z0-9_-]+):\s*(.*)$", line)
        if not match:
            continue
        key = match.group(1)
        value = match.group(2).strip().strip('"').strip("'")
        data[key] = value
    return data


def read_skill_metadata(skill_dir: Path) -> dict[str, Any] | None:
    skill_file = skill_dir / "SKILL.md"
    if not skill_file.is_file():
        return None
    content = skill_file.read_text(encoding="utf-8")
    frontmatter = parse_frontmatter(content)
    return {
        "name": frontmatter.get("name", skill_dir.name),
        "description": frontmatter.get("description", ""),
        "path": str(skill_dir),
    }


def local_skill_locations(project_root: Path) -> list[dict[str, Any]]:
    home = Path.home()
    return [
        {"scope": "global", "location": "agents", "path": home / ".agents" / "skills"},
        {"scope": "global", "location": "claude", "path": home / ".claude" / "skills"},
        {"scope": "global", "location": "opencode", "path": home / ".config" / "opencode" / "skills"},
        {"scope": "global", "location": "copilot", "path": home / ".copilot" / "skills"},
        {"scope": "repo", "location": "agents", "path": project_root / ".agents" / "skills"},
        {"scope": "repo", "location": "claude", "path": project_root / ".claude" / "skills"},
        {"scope": "repo", "location": "opencode", "path": project_root / ".opencode" / "skills"},
        {"scope": "repo", "location": "github", "path": project_root / ".github" / "skills"},
    ]


def list_installed(project_root: Path) -> list[dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = {}
    for location in local_skill_locations(project_root):
        path = location["path"]
        if not path.is_dir():
            continue
        for child in sorted(path.iterdir()):
            if not child.is_dir():
                continue
            metadata = read_skill_metadata(child)
            if not metadata:
                continue
            record = grouped.setdefault(
                metadata["name"],
                {
                    "name": metadata["name"],
                    "description": metadata["description"],
                    "locations": [],
                },
            )
            record["locations"].append(
                {
                    "scope": location["scope"],
                    "location": location["location"],
                    "path": str(child),
                }
            )
            if not record["description"] and metadata["description"]:
                record["description"] = metadata["description"]
    return [grouped[name] for name in sorted(grouped)]


def list_remote_source(source_name: str) -> list[dict[str, Any]]:
    if source_name not in SOURCES:
        raise RuntimeError(f"Unsupported source '{source_name}'.")
    source = SOURCES[source_name]
    repo = source["repo"]
    skills_path = source["skills_path"]
    url = f"https://api.github.com/repos/{repo}/contents/{urllib.parse.quote(skills_path)}"
    entries = github_get_json(url)
    results = []
    for entry in entries:
        if entry.get("type") != "dir":
            continue
        results.append(
            {
                "name": entry["name"],
                "description": "",
                "source": source_name,
                "repo": repo,
                "path": entry["path"],
                "url": entry.get("html_url") or f"https://github.com/{repo}/tree/main/{entry['path']}",
                "default_scope": source["default_scope"],
            }
        )
    return sorted(results, key=lambda item: item["name"])


def enrich_remote_descriptions(source_name: str, results: list[dict[str, Any]]) -> list[dict[str, Any]]:
    if source_name not in SOURCES:
        return results
    source = SOURCES[source_name]
    repo = source["repo"]
    for item in results:
        skill_md = f"https://api.github.com/repos/{repo}/contents/{urllib.parse.quote(item['path'] + '/SKILL.md')}"
        try:
            file_info = github_get_json(skill_md)
            download_url = file_info.get("download_url")
            if download_url:
                frontmatter = parse_frontmatter(github_download_text(download_url))
                item["description"] = frontmatter.get("description", "")
        except Exception:
            continue
    return results


def search_skills(source_name: str, query: str, project_root: Path) -> list[dict[str, Any]]:
    query_norm = query.lower()
    sources = [source_name] if source_name != "all" else ["installed", *sorted(SOURCES)]
    results: list[dict[str, Any]] = []
    for source in sources:
        if source == "installed":
            for item in list_installed(project_root):
                haystack = f"{item['name']} {item.get('description', '')}".lower()
                if query_norm in haystack:
                    results.append({**item, "source": "installed"})
            continue
        remote_items = [item for item in list_remote_source(source) if query_norm in item["name"].lower()]
        results.extend(enrich_remote_descriptions(source, remote_items))
    return results


def install_roots(scope: str, project_root: Path) -> list[Path]:
    if scope == "global":
        home = Path.home()
        return [home / ".agents" / "skills", home / ".claude" / "skills"]
    return [project_root / ".agents" / "skills", project_root / ".claude" / "skills"]


def ensure_clean_destination(dest: Path, force: bool, dry_run: bool) -> None:
    if not dest.exists():
        return
    if not force:
        raise RuntimeError(f"Destination already exists: {dest}. Re-run with --force to replace it.")
    if dry_run:
        return
    shutil.rmtree(dest)


def download_github_directory(repo: str, remote_path: str, dest: Path, dry_run: bool) -> None:
    url = f"https://api.github.com/repos/{repo}/contents/{urllib.parse.quote(remote_path)}"
    payload = github_get_json(url)
    if isinstance(payload, dict) and payload.get("type") == "file":
        if dry_run:
            return
        dest.parent.mkdir(parents=True, exist_ok=True)
        download_url = payload.get("download_url")
        if not download_url:
            raise RuntimeError(f"Missing download URL for {remote_path}.")
        dest.write_bytes(github_download_bytes(download_url))
        return
    if not isinstance(payload, list):
        raise RuntimeError(f"Unexpected GitHub payload for {remote_path}.")
    if dry_run:
        return
    dest.mkdir(parents=True, exist_ok=True)
    for entry in payload:
        target = dest / entry["name"]
        if entry.get("type") == "dir":
            download_github_directory(repo, entry["path"], target, dry_run)
        elif entry.get("type") == "file":
            download_url = entry.get("download_url")
            if not download_url:
                raise RuntimeError(f"Missing download URL for {entry['path']}.")
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(github_download_bytes(download_url))


def install_local_skill(local_path: Path, roots: list[Path], force: bool, dry_run: bool) -> dict[str, Any]:
    metadata = read_skill_metadata(local_path)
    if not metadata:
        raise RuntimeError(f"Local skill path does not contain SKILL.md: {local_path}")
    destinations = []
    for root in roots:
        dest = root / metadata["name"]
        ensure_clean_destination(dest, force, dry_run)
        if not dry_run:
            dest.parent.mkdir(parents=True, exist_ok=True)
            shutil.copytree(local_path, dest)
        destinations.append(str(dest))
    return {"name": metadata["name"], "source": "local", "destinations": destinations, "dry_run": dry_run}


def install_remote_skill(source_name: str, skill_name: str, roots: list[Path], force: bool, dry_run: bool) -> dict[str, Any]:
    if source_name not in SOURCES:
        raise RuntimeError(f"Unsupported source '{source_name}' for install.")
    source = SOURCES[source_name]
    repo = source["repo"]
    remote_skill_dir = f"{source['skills_path']}/{skill_name}"
    skill_md_url = f"https://api.github.com/repos/{repo}/contents/{urllib.parse.quote(remote_skill_dir + '/SKILL.md')}"
    file_info = github_get_json(skill_md_url)
    download_url = file_info.get("download_url")
    if not download_url:
        raise RuntimeError(f"Skill '{skill_name}' was not found in source '{source_name}'.")
    frontmatter = parse_frontmatter(github_download_text(download_url))
    actual_name = frontmatter.get("name", skill_name)
    destinations = []
    for root in roots:
        dest = root / actual_name
        ensure_clean_destination(dest, force, dry_run)
        if not dry_run:
            dest.parent.mkdir(parents=True, exist_ok=True)
            download_github_directory(repo, remote_skill_dir, dest, dry_run)
        destinations.append(str(dest))
    return {
        "name": actual_name,
        "description": frontmatter.get("description", ""),
        "source": source_name,
        "repo": repo,
        "destinations": destinations,
        "dry_run": dry_run,
    }


def render_text(payload: dict[str, Any]) -> str:
    action = payload["action"]
    if action == "list-installed":
        items = payload["items"]
        if not items:
            return "No installed skills were found in the known global/repo locations."
        lines = ["Installed skills:"]
        for item in items:
            locations = ", ".join(f"{loc['scope']}:{loc['location']}" for loc in item["locations"])
            line = f"- {item['name']} [{locations}]"
            if item.get("description"):
                line += f": {item['description']}"
            lines.append(line)
        return "\n".join(lines)
    if action == "list-source":
        items = payload["items"]
        if not items:
            return f"No skills found for source '{payload['source']}'."
        lines = [f"Available skills from {payload['source']}: "]
        lines.extend(f"- {item['name']} ({item['url']})" for item in items)
        return "\n".join(lines)
    if action == "search":
        items = payload["items"]
        if not items:
            return f"No skills matched '{payload['query']}'."
        lines = [f"Skill matches for '{payload['query']}':"]
        for item in items:
            if item.get("source") == "installed":
                locations = ", ".join(f"{loc['scope']}:{loc['location']}" for loc in item["locations"])
                line = f"- {item['name']} [installed: {locations}]"
            else:
                line = f"- {item['name']} [source: {item['source']}]"
            if item.get("description"):
                line += f": {item['description']}"
            lines.append(line)
        return "\n".join(lines)
    if action == "install":
        result = payload["result"]
        mode = "Would install" if result["dry_run"] else "Installed"
        lines = [f"{mode} skill '{result['name']}' from {result['source']}:"]
        if result.get("description"):
            lines.append(f"- Description: {result['description']}")
        for dest in result["destinations"]:
            lines.append(f"- {dest}")
        return "\n".join(lines)
    raise RuntimeError(f"Unsupported render action '{action}'.")


def main() -> int:
    args = parse_args()
    project_root = Path(args.project_root).expanduser().resolve()

    if args.action == "list":
        if args.source == "installed":
            payload = {"action": "list-installed", "items": list_installed(project_root)}
        else:
            payload = {"action": "list-source", "source": args.source, "items": list_remote_source(args.source)}
    elif args.action == "search":
        if not args.query:
            raise RuntimeError("--query is required for search.")
        payload = {
            "action": "search",
            "query": args.query,
            "items": search_skills(args.source, args.query, project_root),
        }
    else:
        roots = install_roots(args.scope, project_root)
        if args.source == "local":
            if not args.local_path:
                raise RuntimeError("--local-path is required when --source=local.")
            result = install_local_skill(Path(args.local_path).expanduser().resolve(), roots, args.force, args.dry_run)
        else:
            if not args.skill_name:
                raise RuntimeError("--skill-name is required for remote installs.")
            result = install_remote_skill(args.source, args.skill_name, roots, args.force, args.dry_run)
        payload = {"action": "install", "result": result}

    if args.format == "json":
        sys.stdout.write(json.dumps(payload, indent=2) + "\n")
    else:
        sys.stdout.write(render_text(payload) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

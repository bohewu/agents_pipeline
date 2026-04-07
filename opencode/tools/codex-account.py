#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import tempfile
from pathlib import Path
from typing import Any, Dict, List, Optional


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="List and switch local OpenCode Codex accounts."
    )
    parser.add_argument("--action", default="list", choices=["list", "switch", "next"])
    parser.add_argument("--project-root", default=os.getcwd())
    parser.add_argument("--format", default="text", choices=["text", "json"])
    parser.add_argument("--path")
    parser.add_argument("--email")
    parser.add_argument("--index", type=int)
    return parser.parse_args()


def ensure_text(value: Any) -> Optional[str]:
    if isinstance(value, str):
        stripped = value.strip()
        return stripped or None
    return None


def load_json(path: Path) -> Any:
    with path.open("r", encoding="utf-8") as handle:
        return json.load(handle)


def iter_config_roots() -> List[Path]:
    roots: List[Path] = []
    home = Path.home()
    xdg = os.environ.get("XDG_CONFIG_HOME")
    appdata = os.environ.get("APPDATA")
    for candidate in (
        Path(xdg) / "opencode" if xdg else None,
        home / ".config" / "opencode",
        home / ".opencode",
        Path(appdata) / "opencode" if appdata else None,
    ):
        if candidate is None:
            continue
        resolved = candidate.expanduser()
        if resolved not in roots:
            roots.append(resolved)
    return roots


def discover_account_files(project_root: Path) -> List[Path]:
    discovered: List[Path] = []
    seen: set[str] = set()

    def add(candidate: Path) -> None:
        resolved = candidate.expanduser()
        key = str(resolved)
        if key in seen:
            return
        if resolved.exists() and resolved.is_file():
            seen.add(key)
            discovered.append(resolved)

    for root in iter_config_roots():
        add(root / "openai-codex-accounts.json")
        projects_dir = root / "projects"
        if projects_dir.exists():
            for match in sorted(projects_dir.glob("*/openai-codex-accounts.json")):
                add(match)

    add(project_root / ".opencode" / "openai-codex-accounts.json")
    return discovered


def choose_primary_record(
    left: Dict[str, Any], right: Dict[str, Any]
) -> Dict[str, Any]:
    left_source = ensure_text(left.get("accountIdSource")) or ""
    right_source = ensure_text(right.get("accountIdSource")) or ""
    if left_source != "org" and right_source == "org":
        merged = dict(right)
        merged["indexes"] = list(left.get("indexes", [])) + list(
            right.get("indexes", [])
        )
        return merged
    left_org = ensure_text(left.get("organizationId"))
    right_org = ensure_text(right.get("organizationId"))
    if not left_org and right_org:
        merged = dict(right)
        merged["indexes"] = list(left.get("indexes", [])) + list(
            right.get("indexes", [])
        )
        return merged
    return left


def summarize_accounts(data: Dict[str, Any]) -> Dict[str, Any]:
    accounts = data.get("accounts") if isinstance(data.get("accounts"), list) else []
    active_index = (
        data.get("activeIndex") if isinstance(data.get("activeIndex"), int) else None
    )
    active_by_family = (
        data.get("activeIndexByFamily")
        if isinstance(data.get("activeIndexByFamily"), dict)
        else {}
    )
    grouped: Dict[str, Dict[str, Any]] = {}
    ordered_keys: List[str] = []

    for index, raw in enumerate(accounts):
        if not isinstance(raw, dict):
            continue
        email = ensure_text(raw.get("email"))
        refresh_token = ensure_text(raw.get("refreshToken"))
        account_id = ensure_text(raw.get("accountId"))
        key = refresh_token or email or account_id or f"index:{index}"
        candidate = {
            "primaryIndex": index,
            "indexes": [index],
            "email": email,
            "label": ensure_text(raw.get("accountLabel"))
            or email
            or f"Account {index}",
            "accountIdSource": ensure_text(raw.get("accountIdSource")) or None,
            "organizationId": ensure_text(raw.get("organizationId")) or None,
        }
        if key not in grouped:
            grouped[key] = candidate
            ordered_keys.append(key)
            continue
        merged = dict(grouped[key])
        merged["indexes"] = list(grouped[key].get("indexes", [])) + [index]
        grouped[key] = choose_primary_record(merged, candidate)

    choices: List[Dict[str, Any]] = []
    for key in ordered_keys:
        choice = grouped[key]
        indexes = sorted(set(choice.get("indexes", [])))
        active_families = [
            family
            for family, value in active_by_family.items()
            if isinstance(value, int) and value in indexes
        ]
        is_active = (active_index in indexes) or bool(active_families)
        choices.append(
            {
                "primaryIndex": choice.get("primaryIndex"),
                "indexes": indexes,
                "email": choice.get("email"),
                "label": choice.get("label"),
                "accountIdSource": choice.get("accountIdSource"),
                "isActive": is_active,
                "activeFamilies": sorted(active_families),
            }
        )

    active_choice = next((choice for choice in choices if choice.get("isActive")), None)
    return {
        "activeIndex": active_index,
        "activeIndexByFamily": {
            key: value
            for key, value in active_by_family.items()
            if isinstance(value, int)
        },
        "choices": choices,
        "activeChoice": active_choice,
    }


def select_file(
    discovered: List[Path], requested_path: Optional[str], project_root: Path
) -> Path:
    if requested_path:
        candidate = Path(requested_path).expanduser()
        if not candidate.is_absolute():
            candidate = (project_root / candidate).resolve()
        if not candidate.exists() or not candidate.is_file():
            raise RuntimeError(f"Account file not found: {candidate}")
        return candidate
    if len(discovered) == 1:
        return discovered[0]
    if not discovered:
        raise RuntimeError("No openai-codex-accounts.json files found.")
    rendered = "\n".join(f"- {path}" for path in discovered)
    raise RuntimeError(
        f"Multiple account files found. Re-run with --path=<file>.\n{rendered}"
    )


def select_choice(
    summary: Dict[str, Any], email: Optional[str], index: Optional[int]
) -> Dict[str, Any]:
    choices = summary.get("choices") if isinstance(summary.get("choices"), list) else []
    if index is not None:
        for choice in choices:
            indexes = (
                choice.get("indexes") if isinstance(choice.get("indexes"), list) else []
            )
            if index in indexes:
                return choice
        raise RuntimeError(f"No stored account entry matches index {index}.")

    selector = ensure_text(email)
    if not selector:
        raise RuntimeError("Switch requires --email=<address> or --index=<n>.")
    needle = selector.lower()

    exact_email = [
        choice
        for choice in choices
        if ensure_text(choice.get("email"))
        and ensure_text(choice.get("email")).lower() == needle
    ]
    if len(exact_email) == 1:
        return exact_email[0]
    if len(exact_email) > 1:
        raise RuntimeError(
            f"Multiple accounts matched email {selector!r}; use --index."
        )

    exact_label = [
        choice
        for choice in choices
        if ensure_text(choice.get("label"))
        and ensure_text(choice.get("label")).lower() == needle
    ]
    if len(exact_label) == 1:
        return exact_label[0]
    if len(exact_label) > 1:
        raise RuntimeError(
            f"Multiple accounts matched label {selector!r}; use --index."
        )

    partial = [
        choice
        for choice in choices
        if needle in (ensure_text(choice.get("email")) or "").lower()
        or needle in (ensure_text(choice.get("label")) or "").lower()
    ]
    if len(partial) == 1:
        return partial[0]
    if len(partial) > 1:
        raise RuntimeError(f"Multiple accounts matched {selector!r}; use --index.")
    raise RuntimeError(f"No account matched {selector!r}.")


def select_next_choice(summary: Dict[str, Any]) -> Dict[str, Any]:
    choices = summary.get("choices") if isinstance(summary.get("choices"), list) else []
    if not choices:
        raise RuntimeError("No switchable Codex accounts found.")
    if len(choices) == 1:
        return choices[0]

    active_choice = (
        summary.get("activeChoice")
        if isinstance(summary.get("activeChoice"), dict)
        else None
    )
    active_index = next(
        (
            index
            for index, choice in enumerate(choices)
            if active_choice
            and choice.get("primaryIndex") == active_choice.get("primaryIndex")
        ),
        -1,
    )
    if active_index < 0:
        return choices[0]
    return choices[(active_index + 1) % len(choices)]


def write_json_atomic(file_path: Path, payload: Dict[str, Any]) -> None:
    file_path.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.NamedTemporaryFile(
        "w", encoding="utf-8", dir=file_path.parent, delete=False
    ) as handle:
        temp_path = Path(handle.name)
        handle.write(json.dumps(payload, indent=2) + "\n")
    temp_path.replace(file_path)


def apply_active_choice(
    data: Dict[str, Any], selected: Dict[str, Any], selected_path: Path
) -> Dict[str, Any]:
    target_index = selected.get("primaryIndex")
    if not isinstance(target_index, int):
        raise RuntimeError("Matched account does not have a valid primary index.")

    current_index = (
        data.get("activeIndex") if isinstance(data.get("activeIndex"), int) else None
    )
    data["activeIndex"] = target_index
    active_by_family = data.get("activeIndexByFamily")
    updated_families: List[str] = []
    changed = current_index != target_index
    if isinstance(active_by_family, dict):
        for family, value in list(active_by_family.items()):
            if isinstance(value, int):
                changed = changed or value != target_index
                active_by_family[family] = target_index
                updated_families.append(family)

    if changed:
        write_json_atomic(selected_path, data)
    return {
        "path": str(selected_path),
        "selected": selected,
        "activeIndex": target_index,
        "updatedFamilies": sorted(updated_families),
        "changed": changed,
    }


def render_text_listing(files: List[Dict[str, Any]]) -> str:
    lines = ["Codex account files:"]
    for item in files:
        lines.append(f"- file: {item['path']}")
        active = item.get("activeChoice")
        if active:
            lines.append(
                f"  active: {active.get('email') or active.get('label')} (primary index {active.get('primaryIndex')})"
            )
        else:
            lines.append("  active: none")
        choices = item.get("choices") if isinstance(item.get("choices"), list) else []
        if not choices:
            lines.append("  choices: none")
            continue
        lines.append("  choices:")
        for choice in choices:
            indexes = ", ".join(str(value) for value in choice.get("indexes", []))
            active_suffix = " [active]" if choice.get("isActive") else ""
            source = (
                f" ({choice.get('accountIdSource')})"
                if choice.get("accountIdSource")
                else ""
            )
            lines.append(
                f"    - [{indexes}] {choice.get('email') or choice.get('label')}{source}{active_suffix}"
            )
    return "\n".join(lines)


def render_text_switch(result: Dict[str, Any]) -> str:
    active_families = (
        result.get("updatedFamilies")
        if isinstance(result.get("updatedFamilies"), list)
        else []
    )
    family_text = ", ".join(active_families) if active_families else "none"
    selected = (
        result.get("selected") if isinstance(result.get("selected"), dict) else {}
    )
    changed = bool(result.get("changed"))
    note = result.get("note") if isinstance(result.get("note"), str) else None
    return "\n".join(
        [
            "Switched active Codex account."
            if changed
            else "Active Codex account unchanged.",
            f"- file: {result.get('path')}",
            f"- account: {selected.get('email') or selected.get('label')}",
            f"- primary index: {selected.get('primaryIndex')}",
            f"- updated families: {family_text}",
            *([f"- note: {note}"] if note else []),
        ]
    )


def run_list(
    project_root: Path, requested_path: Optional[str], output_format: str
) -> str:
    discovered = discover_account_files(project_root)
    if requested_path:
        selected_path = select_file(discovered, requested_path, project_root)
        targets = [selected_path]
    else:
        targets = discovered

    files: List[Dict[str, Any]] = []
    for file_path in targets:
        data = load_json(file_path)
        if not isinstance(data, dict):
            continue
        summary = summarize_accounts(data)
        files.append({"path": str(file_path), **summary})

    payload = {"files": files}
    if output_format == "json":
        return json.dumps(payload, indent=2)
    return render_text_listing(files)


def run_switch(
    project_root: Path,
    requested_path: Optional[str],
    email: Optional[str],
    index: Optional[int],
    output_format: str,
) -> str:
    discovered = discover_account_files(project_root)
    selected_path = select_file(discovered, requested_path, project_root)
    data = load_json(selected_path)
    if not isinstance(data, dict):
        raise RuntimeError(f"Unexpected account file payload: {selected_path}")

    summary = summarize_accounts(data)
    selected = select_choice(summary, email, index)
    result = apply_active_choice(data, selected, selected_path)
    if output_format == "json":
        return json.dumps(result, indent=2)
    return render_text_switch(result)


def run_next(
    project_root: Path, requested_path: Optional[str], output_format: str
) -> str:
    discovered = discover_account_files(project_root)
    selected_path = select_file(discovered, requested_path, project_root)
    data = load_json(selected_path)
    if not isinstance(data, dict):
        raise RuntimeError(f"Unexpected account file payload: {selected_path}")

    summary = summarize_accounts(data)
    choices = summary.get("choices") if isinstance(summary.get("choices"), list) else []
    if len(choices) == 1:
        result = apply_active_choice(data, choices[0], selected_path)
        result["note"] = (
            "Only one stored Codex account is available, so there is nothing to rotate."
        )
        if output_format == "json":
            return json.dumps(result, indent=2)
        return render_text_switch(result)

    selected = select_next_choice(summary)
    result = apply_active_choice(data, selected, selected_path)
    if output_format == "json":
        return json.dumps(result, indent=2)
    return render_text_switch(result)


def main() -> int:
    args = parse_args()
    project_root = Path(args.project_root).expanduser().resolve()
    try:
        if args.action == "switch":
            output = run_switch(
                project_root, args.path, args.email, args.index, args.format
            )
        elif args.action == "next":
            output = run_next(project_root, args.path, args.format)
        else:
            output = run_list(project_root, args.path, args.format)
    except RuntimeError as error:
        print(str(error), file=os.sys.stderr)
        return 1

    print(output)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

#!/usr/bin/env python3
"""Emit a profile-aware viewport plan for browser-backed UX audits."""

from __future__ import annotations

import argparse
import json
import sys


PRESETS = {
    "desktop-2": [
        {"label": "1366x768", "width": 1366, "height": 768, "scope": "primary"},
        {"label": "1920x1080", "width": 1920, "height": 1080, "scope": "primary"},
    ],
    "desktop-3": [
        {"label": "1366x768", "width": 1366, "height": 768, "scope": "primary"},
        {"label": "1440x900", "width": 1440, "height": 900, "scope": "primary"},
        {"label": "1920x1080", "width": 1920, "height": 1080, "scope": "primary"},
    ],
    "responsive-core": [
        {"label": "390x844", "width": 390, "height": 844, "scope": "primary"},
        {"label": "768x1024", "width": 768, "height": 1024, "scope": "primary"},
        {"label": "1366x768", "width": 1366, "height": 768, "scope": "primary"},
    ],
    "mobile-core": [
        {"label": "375x812", "width": 375, "height": 812, "scope": "primary"},
        {"label": "390x844", "width": 390, "height": 844, "scope": "primary"},
        {"label": "430x932", "width": 430, "height": 932, "scope": "secondary"},
    ],
}

PROFILE_DEFAULTS = {
    "desktop-web": "desktop-3",
    "desktop-app": "desktop-3",
    "responsive-web": "responsive-core",
    "mobile-web": "mobile-core",
}

WEIGHTS = {
    "primary": 1.0,
    "secondary": 0.5,
    "compatibility": 0.0,
}


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description=(
            "Emit a viewport/testing plan for the devtools-ux-audit skill. "
            "Use --help first, then choose a profile and optional preset override."
        )
    )
    parser.add_argument("--profile", required=True, choices=sorted(PROFILE_DEFAULTS), help="Product profile to audit.")
    parser.add_argument(
        "--preset",
        default="auto",
        choices=["auto", *sorted(PRESETS)],
        help="Viewport preset override. Defaults to the profile-specific preset.",
    )
    parser.add_argument(
        "--include-compatibility-mobile",
        action="store_true",
        help="For desktop profiles, append one compatibility-only mobile viewport.",
    )
    parser.add_argument("--format", default="json", choices=["json", "text"], help="Output format.")
    return parser.parse_args()


def build_plan(profile: str, preset: str, include_compatibility_mobile: bool) -> dict:
    resolved_preset = PROFILE_DEFAULTS[profile] if preset == "auto" else preset
    matrix = [dict(item) for item in PRESETS[resolved_preset]]

    if include_compatibility_mobile and profile in {"desktop-web", "desktop-app"}:
        matrix.append({"label": "390x844", "width": 390, "height": 844, "scope": "compatibility"})

    for item in matrix:
        item["weight"] = WEIGHTS[item["scope"]]

    return {
        "profile": profile,
        "preset": resolved_preset,
        "scoring_policy": WEIGHTS,
        "viewports": matrix,
        "notes": [
            "Compatibility viewports do not reduce the main score.",
            "Desktop-first products should keep mobile checks compatibility-only unless the audit scope says otherwise.",
        ],
    }


def render_text(plan: dict) -> str:
    lines = [f"Profile: {plan['profile']}", f"Preset: {plan['preset']}", "Viewports:"]
    for item in plan["viewports"]:
        lines.append(f"- {item['label']} [{item['scope']}] weight={item['weight']}")
    lines.append("Notes:")
    for note in plan["notes"]:
        lines.append(f"- {note}")
    return "\n".join(lines)


def main() -> int:
    args = parse_args()
    plan = build_plan(args.profile, args.preset, args.include_compatibility_mobile)
    if args.format == "text":
        sys.stdout.write(render_text(plan) + "\n")
    else:
        sys.stdout.write(json.dumps(plan, indent=2) + "\n")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())

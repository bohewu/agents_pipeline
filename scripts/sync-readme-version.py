#!/usr/bin/env python3
"""Synchronize the README's current-release block with VERSION."""

from __future__ import annotations

import argparse
import re
import sys
from pathlib import Path


CURRENT_MARKERS = ("<!-- BEGIN current-release -->", "<!-- END current-release -->")
FROZEN_MARKERS = ("<!-- BEGIN legacy-opencode-v0.26.1 -->", "<!-- END legacy-opencode-v0.26.1 -->")


class ReadmeVersionSyncError(RuntimeError):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--version-file", default="VERSION")
    parser.add_argument("--readme", default="README.md")
    parser.add_argument("--check", action="store_true")
    return parser.parse_args()


def load_version(path: Path) -> str:
    version = path.read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ReadmeVersionSyncError(f"VERSION must be MAJOR.MINOR.PATCH. Got: {version}")
    return version


def marker_span(text: str, markers: tuple[str, str], label: str) -> tuple[int, int]:
    start_marker, end_marker = markers
    if text.count(start_marker) != 1 or text.count(end_marker) != 1:
        raise ReadmeVersionSyncError(f"README must contain exactly one {label} marker pair.")
    start = text.index(start_marker)
    end = text.index(end_marker, start) + len(end_marker)
    return start, end


def sync_readme_text(readme_text: str, version: str) -> tuple[str, int]:
    marker_span(readme_text, FROZEN_MARKERS, "frozen OpenCode v0.26.1")
    start, end = marker_span(readme_text, CURRENT_MARKERS, "current-release")
    block = readme_text[start:end]
    updated, tag_count = re.subn(r"v\d+\.\d+\.\d+", f"v{version}", block)
    updated, version_count = re.subn(
        r"(?<=VERSION=)\d+\.\d+\.\d+", version, updated
    )
    if tag_count == 0:
        raise ReadmeVersionSyncError("README current-release block has no managed vMAJOR.MINOR.PATCH reference.")
    return readme_text[:start] + updated + readme_text[end:], tag_count + version_count


def main() -> int:
    args = parse_args()
    version_path = Path(args.version_file)
    readme_path = Path(args.readme)
    version = load_version(version_path)
    current = readme_path.read_text(encoding="utf-8")
    updated, _count = sync_readme_text(current, version)
    if args.check:
        if current != updated:
            print(f"{readme_path} is out of sync with {version_path} (expected v{version}).", file=sys.stderr)
            return 1
        print(f"{readme_path} current-release block matches VERSION={version}.")
        return 0
    if current != updated:
        readme_path.write_text(updated, encoding="utf-8")
        print(f"Updated {readme_path} current-release block to v{version}.")
    else:
        print(f"{readme_path} already matches VERSION={version}.")
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ReadmeVersionSyncError as error:
        print(error, file=sys.stderr)
        raise SystemExit(1)

#!/usr/bin/env python3

import argparse
import re
import sys
from pathlib import Path


MANAGED_REPLACEMENTS = (
    (
        r'\$tag = "v\d+\.\d+\.\d+"',
        lambda version, tag: f'$tag = "{tag}"',
        7,
        "$tag PowerShell snippets",
    ),
    (
        r'tag="v\d+\.\d+\.\d+"',
        lambda version, tag: f'tag="{tag}"',
        8,
        "tag shell snippets",
    ),
    (
        r'\$release = "v\d+\.\d+\.\d+"',
        lambda version, tag: f'$release = "{tag}"',
        1,
        "$release PowerShell snippet",
    ),
    (
        r'release="v\d+\.\d+\.\d+"',
        lambda version, tag: f'release="{tag}"',
        1,
        "release shell snippet",
    ),
    (
        r"`VERSION=\d+\.\d+\.\d+` must release as `v\d+\.\d+\.\d+`",
        lambda version, tag: f"`VERSION={version}` must release as `{tag}`",
        1,
        "VERSION/tag alignment note",
    ),
    (
        r"SemVer without `v`, for example `\d+\.\d+\.\d+`",
        lambda version, tag: f"SemVer without `v`, for example `{version}`",
        1,
        "SemVer example",
    ),
    (
        r"\(for example: `v\d+\.\d+\.\d+`\)\.",
        lambda version, tag: f"(for example: `{tag}`).",
        1,
        "tag example with colon",
    ),
    (
        r"\(for example `v\d+\.\d+\.\d+`\)",
        lambda version, tag: f"(for example `{tag}`)",
        1,
        "tag example without colon",
    ),
    (
        r"git tag v\d+\.\d+\.\d+",
        lambda version, tag: f"git tag {tag}",
        1,
        "git tag example",
    ),
    (
        r"git push origin v\d+\.\d+\.\d+",
        lambda version, tag: f"git push origin {tag}",
        1,
        "git push example",
    ),
)


class ReadmeVersionSyncError(RuntimeError):
    pass


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Sync README pinned release examples with the root VERSION file."
    )
    parser.add_argument(
        "--version-file",
        default="VERSION",
        help="Path to VERSION file (default: VERSION)",
    )
    parser.add_argument(
        "--readme",
        default="README.md",
        help="Path to README file (default: README.md)",
    )
    parser.add_argument(
        "--check",
        action="store_true",
        help="Fail if the README is out of sync instead of writing changes.",
    )
    return parser.parse_args()


def load_version(version_path: Path) -> str:
    version = version_path.read_text(encoding="utf-8").strip()
    if not re.fullmatch(r"\d+\.\d+\.\d+", version):
        raise ReadmeVersionSyncError(
            f"VERSION must be MAJOR.MINOR.PATCH. Got: {version}"
        )
    return version


def sync_readme_text(
    readme_text: str, version: str
) -> tuple[str, list[tuple[str, int, int]]]:
    tag = f"v{version}"
    updated = readme_text
    counts = []

    for pattern, replacement, expected_count, label in MANAGED_REPLACEMENTS:
        updated, actual_count = re.subn(pattern, replacement(version, tag), updated)
        counts.append((label, expected_count, actual_count))

    mismatches = [
        (label, expected_count, actual_count)
        for label, expected_count, actual_count in counts
        if actual_count != expected_count
    ]
    if mismatches:
        details = "\n".join(
            f"- {label}: expected {expected_count}, found {actual_count}"
            for label, expected_count, actual_count in mismatches
        )
        raise ReadmeVersionSyncError(
            "README pinned-version structure no longer matches the managed sync patterns.\n"
            "Update scripts/sync-readme-version.py to cover the new README layout.\n"
            f"{details}"
        )

    return updated, counts


def main() -> int:
    args = parse_args()
    version_path = Path(args.version_file)
    readme_path = Path(args.readme)

    version = load_version(version_path)
    current = readme_path.read_text(encoding="utf-8")
    updated, _counts = sync_readme_text(current, version)

    if args.check:
        if current != updated:
            print(
                f"{readme_path} is out of sync with {version_path} (expected v{version}).",
                file=sys.stderr,
            )
            return 1

        print(f"{readme_path} pinned release examples already match VERSION={version}.")
        return 0

    if current != updated:
        readme_path.write_text(updated, encoding="utf-8")
        print(f"Updated {readme_path} pinned release examples to v{version}.")
    else:
        print(f"{readme_path} already matches VERSION={version}.")

    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(main())
    except ReadmeVersionSyncError as error:
        print(str(error), file=sys.stderr)
        raise SystemExit(1)

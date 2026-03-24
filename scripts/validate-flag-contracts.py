#!/usr/bin/env python3
"""Validate run-command quick-reference flags against orchestrator docs."""

from __future__ import annotations

import argparse
import re
import sys
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable, List


FLAG_PATTERN = re.compile(r"--[a-z0-9-]+(?:=(?:<[^>\s`]+>|[a-z0-9+|.-]+))?", re.IGNORECASE)


@dataclass(frozen=True)
class SectionSpec:
    path: Path
    start: str
    stop: str
    label: str


@dataclass(frozen=True)
class ContractSpec:
    name: str
    quick_ref: SectionSpec
    source_of_truth: SectionSpec


def _repo_root() -> Path:
    return Path(__file__).resolve().parent.parent


def _contracts(repo_root: Path) -> List[ContractSpec]:
    return [
        ContractSpec(
            name="run-pipeline",
            quick_ref=SectionSpec(
                path=repo_root / "opencode" / "commands" / "run-pipeline.md",
                start=r"^### Supported flags \(quick reference\)$",
                stop=r"^## ",
                label="run-pipeline quick reference",
            ),
            source_of_truth=SectionSpec(
                path=repo_root / "opencode" / "agents" / "orchestrator-pipeline.md",
                start=r"^Flag semantics:$",
                stop=r"^If no scout flag is provided:",
                label="orchestrator-pipeline flag semantics",
            ),
        ),
        ContractSpec(
            name="run-flow",
            quick_ref=SectionSpec(
                path=repo_root / "opencode" / "commands" / "run-flow.md",
                start=r"^- Supported flags \(Flow-only, minimal\):",
                stop=r"^## Examples",
                label="run-flow quick reference",
            ),
            source_of_truth=SectionSpec(
                path=repo_root / "opencode" / "agents" / "orchestrator-flow.md",
                start=r"^## FLOW FLAGS \(QUICK REFERENCE\)$",
                stop=r"^## ",
                label="orchestrator-flow quick reference",
            ),
        ),
        ContractSpec(
            name="run-modernize",
            quick_ref=SectionSpec(
                path=repo_root / "opencode" / "commands" / "run-modernize.md",
                start=r"^### Supported flags \(quick reference\)$",
                stop=r"^## Examples",
                label="run-modernize quick reference",
            ),
            source_of_truth=SectionSpec(
                path=repo_root / "opencode" / "agents" / "orchestrator-modernize.md",
                start=r"^Flag semantics:$",
                stop=r"^If conflicting flags exist:",
                label="orchestrator-modernize flag semantics",
            ),
        ),
    ]


def _read_lines(path: Path) -> List[str]:
    try:
        return path.read_text(encoding="utf-8").splitlines()
    except FileNotFoundError:
        raise SystemExit(f"[ERROR] File not found: {path}")


def _extract_section(spec: SectionSpec) -> List[str]:
    lines = _read_lines(spec.path)
    start_re = re.compile(spec.start)
    stop_re = re.compile(spec.stop)

    start_index = None
    for index, line in enumerate(lines):
        if start_re.search(line):
            start_index = index + 1
            break

    if start_index is None:
        raise SystemExit(f"[ERROR] Could not find start marker for {spec.label}: {spec.start}")

    section: List[str] = []
    for line in lines[start_index:]:
        if stop_re.search(line):
            break
        section.append(line)

    if not section:
        raise SystemExit(f"[ERROR] Extracted empty section for {spec.label}")

    return section


def _extract_flags(lines: Iterable[str]) -> List[str]:
    flags: List[str] = []
    for line in lines:
        candidate = re.split(r"\s[—–]\s|\s->\s", line, maxsplit=1)[0]
        for code in re.findall(r"`([^`]+)`", candidate):
            flags.extend(FLAG_PATTERN.findall(code))
    return flags


def _format_flags(flags: Iterable[str]) -> str:
    return ", ".join(flags)


def _compare(contract: ContractSpec) -> List[str]:
    quick_flags = _extract_flags(_extract_section(contract.quick_ref))
    source_flags = _extract_flags(_extract_section(contract.source_of_truth))

    errors: List[str] = []

    if quick_flags != source_flags:
        quick_only = [flag for flag in quick_flags if flag not in source_flags]
        source_only = [flag for flag in source_flags if flag not in quick_flags]

        errors.append(f"[FAIL] {contract.name}: flag contract mismatch")
        errors.append(f"  quick-ref order : {_format_flags(quick_flags)}")
        errors.append(f"  source order    : {_format_flags(source_flags)}")
        if quick_only:
            errors.append(f"  quick-ref only  : {_format_flags(quick_only)}")
        if source_only:
            errors.append(f"  source only     : {_format_flags(source_only)}")

        max_len = max(len(quick_flags), len(source_flags))
        for index in range(max_len):
            quick_flag = quick_flags[index] if index < len(quick_flags) else "<missing>"
            source_flag = source_flags[index] if index < len(source_flags) else "<missing>"
            if quick_flag != source_flag:
                errors.append(
                    f"  first order mismatch at position {index + 1}: quick-ref={quick_flag} source={source_flag}"
                )
                break
    else:
        errors.append(
            f"[OK] {contract.name}: {len(quick_flags)} quick-reference flags match {contract.source_of_truth.label}"
        )

    return errors


def _build_parser() -> argparse.ArgumentParser:
    return argparse.ArgumentParser(
        description=(
            "Check that run-command quick-reference flag lists stay aligned with the "
            "authoritative orchestrator docs for Flow, Pipeline, and Modernize."
        )
    )


def main() -> int:
    _build_parser().parse_args()

    repo_root = _repo_root()
    failures = False

    for contract in _contracts(repo_root):
        messages = _compare(contract)
        for message in messages:
            stream = sys.stderr if message.startswith("[FAIL]") else sys.stdout
            print(message, file=stream)
        if any(message.startswith("[FAIL]") for message in messages):
            failures = True

    return 1 if failures else 0


if __name__ == "__main__":
    raise SystemExit(main())

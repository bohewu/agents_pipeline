#!/usr/bin/env python3
"""Shared validation for paths written into generated shell instructions.

The runtime exporters place absolute support paths inside prompts that can be
executed by either Bash or PowerShell.  Those paths are intentionally kept
human-readable instead of shell-escaped for one specific host shell, so reject
characters that can change parsing in either shell before generating output.
"""

from __future__ import annotations

import os
from pathlib import Path
import stat


# Generated executable paths are persisted inside double quotes for both Bash
# and PowerShell.  In that shared quoting form, dollar expansion, backtick
# expansion/escaping, and a literal double quote can still change parsing.
# A POSIX filename's literal backslash can also alter Bash double-quote parsing;
# normal Windows separators are converted to ``/`` by ``Path.as_posix()``.
# Apostrophes, parentheses, ampersands, semicolons, and spaces remain valid.
SHELL_ACTIVE_PATH_CHARS = frozenset("$`\"\\")


def is_linklike(path: Path) -> bool:
    """Return whether *path* is a symlink, junction, or other reparse point."""

    if path.is_symlink():
        return True
    is_junction = getattr(path, "is_junction", None)
    if is_junction and is_junction():
        return True
    try:
        attributes = getattr(path.lstat(), "st_file_attributes", 0)
    except OSError:
        return False
    return bool(
        attributes
        & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400)
    )


def normalized_path_text(value: str | os.PathLike[str]) -> str:
    """Return an absolute lexical spelling without following filesystem links."""

    expanded = Path(value).expanduser()
    # ``resolve()`` would collapse a symlink/junction before the caller can
    # enforce its link-safety policy. ``abspath`` removes lexical ``.``/``..``
    # components while deliberately preserving the addressed filesystem leaf.
    return Path(os.path.abspath(os.fspath(expanded))).as_posix()


def validate_generated_shell_path(
    value: str | os.PathLike[str], label: str
) -> str:
    """Validate and return a normalized path safe for generated shell text.

    This is a refusal boundary, not an escaping helper: generated instructions
    must stay portable between Bash and PowerShell, whose escaping rules differ.
    """

    normalized = normalized_path_text(value)
    for character in normalized:
        codepoint = ord(character)
        if codepoint < 0x20 or codepoint == 0x7F:
            raise ValueError(
                f"{label} contains a control character that is unsafe in generated shell instructions"
            )
        if character in SHELL_ACTIVE_PATH_CHARS:
            raise ValueError(
                f"{label} contains shell-active character U+{codepoint:04X} "
                "that is unsafe in generated shell instructions"
            )
    return normalized

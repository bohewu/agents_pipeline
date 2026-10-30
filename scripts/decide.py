#!/usr/bin/env python3
"""Explicit, local credential setup and launcher for the Decisions tool.

No key creation, dotenv discovery, shell evaluation, or network requests here.
"""

from __future__ import annotations

import argparse
import base64
import getpass
import json
import os
from pathlib import Path
import re
import stat
import subprocess
import sys
import tempfile
import warnings


TOOL = Path(__file__).resolve().parents[1] / "tools" / "decisions.js"
IS_WINDOWS = os.name == "nt"
MAX_ENV_BYTES = 64 * 1024
KEY_LINE = re.compile(r"^\s*(?:export\s+)?OPENAI_API_KEY\s*=\s*(.*?)\s*$")
KEY_VALUE = re.compile(r"sk-[A-Za-z0-9_-]{8,2048}\Z")


class SetupError(Exception):
    """A fixed message safe to display without secret or subprocess output."""


class SafeParser(argparse.ArgumentParser):
    def error(self, message):
        # argparse's default diagnostics echo rejected argv, including accidental keys.
        self.exit(2, "Invalid arguments; use --help. Never pass a key as an argument.\n")


def windows_acl(target: Path, *, protect: bool) -> None:
    # Pass the path as data; never interpolate paths or credentials into code.
    common = """
$ErrorActionPreference = 'Stop'
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$allowed = @($sid.Value, 'S-1-5-18', 'S-1-5-32-544')
$file = $env:AGENTS_PIPELINE_DECIDE_FILE
"""
    script = common + ("""
$acl = [System.Security.AccessControl.FileSecurity]::new()
$acl.SetAccessRuleProtection($true, $false)
foreach ($id in $allowed) {
    $identity = [System.Security.Principal.SecurityIdentifier]::new($id)
    $rule = [System.Security.AccessControl.FileSystemAccessRule]::new($identity, [System.Security.AccessControl.FileSystemRights]::FullControl, [System.Security.AccessControl.AccessControlType]::Allow)
    $acl.AddAccessRule($rule)
}
# Persist only the DACL we changed; leave owner/group/audit state alone.
$info = [System.IO.FileInfo]::new($file)
$info.SetAccessControl($acl)
""" if protect else """
# Avoid cmdlet autoloading across PowerShell 7 / Windows PowerShell environments.
$info = [System.IO.FileInfo]::new($file)
$acl = $info.GetAccessControl()
if (-not $acl.AreAccessRulesProtected) { exit 10 }
$canRead = $false
foreach ($rule in $acl.GetAccessRules($true, $true, [Security.Principal.SecurityIdentifier])) {
    if ($rule.AccessControlType -eq 'Allow') {
        if ($allowed -notcontains $rule.IdentityReference.Value) { exit 11 }
        if ($rule.IdentityReference.Value -eq $sid.Value -and ($rule.FileSystemRights -band 1)) { $canRead = $true }
    }
}
if (-not $canRead) { exit 12 }
""")
    script = "try {\n" + script + "\nexit 0\n} catch {\n" + (
        "[Console]::Error.WriteLine($_.Exception.GetType().FullName + '|' + $_.FullyQualifiedErrorId)\nexit 40\n}"
    )
    try:
        result = subprocess.run(
            ["powershell.exe", "-NoProfile", "-NonInteractive", "-EncodedCommand",
             base64.b64encode(script.encode("utf-16-le")).decode("ascii")],
            env={**os.environ, "AGENTS_PIPELINE_DECIDE_FILE": str(target)},
            capture_output=True, check=False, timeout=15,
        )
    except (OSError, subprocess.TimeoutExpired) as from_error:
        raise SetupError("Unable to configure or verify the Windows credential ACL.") from from_error
    if result.returncode:
        reasons = {10: "inheritance is enabled", 11: "an unexpected account has access", 12: "current-account read access is missing"}
        reason = reasons.get(result.returncode, "application or inspection failed")
        # Only framework type/error identifiers are eligible diagnostics, never messages or paths.
        native_id = result.stderr.decode("utf-8", errors="replace").strip()
        if result.returncode == 40 and re.fullmatch(r"System\.[A-Za-z.]+Exception\|[A-Za-z][A-Za-z0-9_.,]{0,180}", native_id):
            reason += ": " + native_id
        raise SetupError("Windows credential ACL rejected: " + reason + ".")


def checked_target(raw: str, *, require_parent: bool = True) -> Path:
    # Keep lexical parents for traversal checks; resolve() would hide symlinks.
    target = Path(os.path.abspath(os.path.expanduser(raw)))
    for part in (*reversed(target.parents), target):
        try:
            info = part.lstat()
        except FileNotFoundError:
            continue
        attributes = getattr(info, "st_file_attributes", 0)
        if stat.S_ISLNK(info.st_mode) or attributes & getattr(stat, "FILE_ATTRIBUTE_REPARSE_POINT", 0x400):
            raise SetupError("Credential paths must not traverse symlinks, junctions or reparse points.")
    if require_parent and not target.parent.is_dir():
        raise SetupError("Create the credential file's parent directory first.")
    if target.exists():
        info = target.stat()
        if not stat.S_ISREG(info.st_mode) or info.st_nlink != 1:
            raise SetupError("Credential target must be a regular file with one link.")
    return target


def check_private(target: Path) -> None:
    info = target.stat()
    if IS_WINDOWS:
        windows_acl(target, protect=False)
    elif info.st_uid != os.getuid() or stat.S_IMODE(info.st_mode) & 0o077:
        raise SetupError("Credential file must belong to this account and have owner-only permissions (0600).")


def require_ignored(target: Path) -> None:
    try:
        root_result = subprocess.run(
            ["git", "-C", str(target.parent), "rev-parse", "--show-toplevel"],
            capture_output=True, check=False, timeout=10,
        )
        if root_result.returncode:
            # Do not treat repository corruption as proof this is outside Git.
            if any((parent / ".git").exists() for parent in target.parents):
                raise SetupError("Unable to establish credential target Git safety.")
            return
        root = Path(os.fsdecode(root_result.stdout).strip()).resolve()
        # Windows Git may expand an 8.3 path from TEMP to its long spelling.
        # Canonicalize only after checked_target has rejected link traversal.
        relative = (target.parent.resolve() / target.name).relative_to(root).as_posix()
        tracked = subprocess.run(
            ["git", "-C", str(root), "ls-files", "--error-unmatch", "--", relative],
            capture_output=True, check=False, timeout=10,
        )
        ignored = subprocess.run(
            ["git", "-C", str(root), "check-ignore", "--quiet", "--", relative],
            capture_output=True, check=False, timeout=10,
        )
        if tracked.returncode != 1 or ignored.returncode != 0:
            raise SetupError("Choose an ignored, untracked credential file; no Git settings were changed.")
    except (OSError, ValueError, subprocess.TimeoutExpired) as exc:
        raise SetupError("Unable to establish credential target Git safety; Git is required.") from exc


def read_env(target: Path) -> tuple[list[str], list[int]]:
    check_private(target)
    with target.open("rb") as handle:
        data = handle.read(MAX_ENV_BYTES + 1)
    if len(data) > MAX_ENV_BYTES:
        raise SetupError("Credential file exceeds 64 KiB.")
    try:
        lines = data.decode("utf-8").splitlines(keepends=True)
    except UnicodeError as exc:
        raise SetupError("Credential file must be UTF-8.") from exc
    matches = [i for i, line in enumerate(lines) if KEY_LINE.fullmatch(line.rstrip("\r\n"))]
    if len(matches) > 1:
        raise SetupError("Credential file has duplicate OPENAI_API_KEY entries.")
    return lines, matches


def load_key(target: Path) -> str:
    lines, matches = read_env(target)
    if not matches:
        raise SetupError("No OPENAI_API_KEY is configured in the selected file.")
    value = KEY_LINE.fullmatch(lines[matches[0]].rstrip("\r\n")).group(1)
    if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
        value = value[1:-1]
    if not KEY_VALUE.fullmatch(value):
        raise SetupError("The selected OPENAI_API_KEY has an unsupported format; no shell expansion is performed.")
    return value


def save_key(target: Path, key: str, *, replace: bool) -> None:
    if not KEY_VALUE.fullmatch(key):
        raise SetupError("The entered API key has an unsupported format.")
    target = checked_target(str(target))
    require_ignored(target)
    existed = target.exists()
    lines, matches = read_env(target) if existed else ([], [])
    if matches and not replace:
        raise SetupError("A key is already configured. Use setup --replace only for an intentional replacement.")
    if matches:
        lines[matches[0]] = "OPENAI_API_KEY=" + key + "\n"
    else:
        if lines and not lines[-1].endswith("\n"):
            lines[-1] += "\n"
        lines.append("OPENAI_API_KEY=" + key + "\n")
    data = "".join(lines).encode("utf-8")
    if len(data) > MAX_ENV_BYTES:
        raise SetupError("Updated credential file would exceed 64 KiB.")
    write_private_file(target, data)


def write_private_file(target: Path, data: bytes) -> None:
    """Publish a private file without exposing data or following link targets."""
    target = checked_target(str(target))
    require_ignored(target)
    existed = target.exists()
    if existed:
        check_private(target)
    descriptor, temporary = tempfile.mkstemp(prefix=".env.decide-", dir=target.parent)
    temporary_path = Path(temporary)
    try:
        # Apply access controls before writing any secret bytes.
        with os.fdopen(descriptor, "wb") as handle:
            require_ignored(temporary_path)
            if IS_WINDOWS:
                windows_acl(temporary_path, protect=True)
            check_private(temporary_path)
            handle.write(data)
            handle.flush()
            os.fsync(handle.fileno())
        checked_target(str(target))
        if existed:
            os.replace(temporary_path, target)
        else:
            # Atomic no-clobber publication, including if another setup raced us.
            os.link(temporary_path, target)
    finally:
        temporary_path.unlink(missing_ok=True)


def default_binding_path() -> Path:
    return Path.home() / ".agents-pipeline" / "decide.json"


def read_binding(config: Path) -> Path | None:
    config = checked_target(str(config), require_parent=False)
    if not config.exists():
        return None
    check_private(config)
    with config.open("rb") as handle:
        data = handle.read(MAX_ENV_BYTES + 1)
    try:
        value = json.loads(data) if len(data) <= MAX_ENV_BYTES else None
    except (ValueError, UnicodeError):
        value = None
    if (not isinstance(value, dict) or set(value) != {"version", "env_file"}
            or type(value["version"]) is not int or value["version"] != 1
            or not isinstance(value["env_file"], str) or "\0" in value["env_file"]
            or not Path(value["env_file"]).is_absolute()):
        raise SetupError("Invalid credential-location binding; no alternate credential was selected.")
    return Path(value["env_file"])


def bind(config: Path, target: Path, *, report: bool = True) -> None:
    # Validate without modifying or copying the selected credential.
    require_ignored(target)
    load_key(target)
    config = checked_target(str(config), require_parent=False)
    if config.resolve() == target.resolve():
        raise SetupError("The binding metadata and credential must be separate files.")
    read_binding(config)  # Never overwrite an unrelated existing file.
    config.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    write_private_file(config, (json.dumps({"version": 1, "env_file": str(target)}) + "\n").encode("utf-8"))
    if report:
        print(json.dumps({"bound": True, "binding_file": str(config), "env_file": str(target), "live_verified": False}))


def setup(target: Path, *, replace: bool, report: bool = True) -> None:
    require_ignored(target)
    if target.exists():
        _, matches = read_env(target)
        if matches and not replace:
            raise SetupError("A key is already configured. Use setup --replace only for an intentional replacement.")
    if not sys.stdin.isatty():
        raise SetupError("Run setup yourself in an interactive terminal; keys cannot be supplied through arguments or stdin.")
    print(f"Save dedicated OPENAI_API_KEY to {target} (plaintext with restricted permissions)?", file=sys.stderr)
    if input("Type yes to continue: ").strip().lower() != "yes":
        raise SetupError("Setup canceled; no key was saved.")
    with warnings.catch_warnings():
        warnings.simplefilter("error", getpass.GetPassWarning)
        try:
            key = getpass.getpass("Dedicated API key (hidden): ")
            repeated = getpass.getpass("Repeat API key (hidden): ")
        except getpass.GetPassWarning as exc:
            raise SetupError("Hidden terminal input is unavailable; no key was saved.") from exc
    if key != repeated:
        raise SetupError("The entries do not match; no key was saved.")
    save_key(target, key, replace=replace)
    if report:
        print(json.dumps({"configured": True, "env_file": str(target), "live_verified": False}))


def interactive_terminal() -> bool:
    try:
        return sys.stdin.isatty() and sys.stdout.isatty()
    except (AttributeError, OSError):
        return False


def choose_numbered(title: str, choices: tuple[str, ...]) -> str:
    print(title)
    for index, choice in enumerate(choices, start=1):
        print(f"  {index}) {choice}")
    while True:
        answer = input(f"Select [1-{len(choices)}] (default 1): ").strip()
        if not answer:
            return choices[0]
        if answer.isdigit() and 1 <= int(answer) <= len(choices):
            return choices[int(answer) - 1]
        print("Invalid selection; enter one of the displayed numbers.")


def configure(config: Path, env_file: str | None, *, replace: bool) -> None:
    """One optional setup flow: choose a location, prepare its key, then bind it."""
    interactive = interactive_terminal()
    config = checked_target(str(config), require_parent=False)
    selected = read_binding(config)
    if env_file is None:
        if not interactive:
            raise SetupError("Pass --env-file outside an interactive terminal, or run the entrypoint in a terminal for guided setup.")
        default = selected or Path.home() / ".agents-pipeline-decide.env"
        env_file = input(f"Credential file [{default}]: ").strip() or str(default)
        if env_file.startswith("sk-"):
            raise SetupError("Enter a file path here; keys belong only in the hidden key prompt.")
    target = checked_target(env_file)
    if config.resolve() == target.resolve():
        raise SetupError("The binding metadata and credential must be separate files.")
    require_ignored(target)
    _, matches = read_env(target) if target.exists() else ([], [])
    if matches and interactive and not replace:
        replace = choose_numbered("Key already configured", ("Use existing key", "Replace key")) == "Replace key"
    if replace or not matches:
        if not interactive:
            raise SetupError("Run set in an interactive terminal to enter a key safely.")
        print("Create a dedicated project API key in OpenAI Platform if needed; enter it only at the hidden prompt below.")
        setup(target, replace=replace, report=False)
    bind(config, target, report=not interactive)
    if interactive:
        print(f"Configured. Credential file: {target}")
        print(f"Saved location: {config}")
        print("No API request was made.")


def main(argv: list[str] | None = None) -> int:
    parser = SafeParser(description="Optional Decisions tool. Run without an action in a terminal for the set/status/clear menu.")
    parser.add_argument("--config-file", help="Override the per-user credential-location binding file (before the command)")
    commands = parser.add_subparsers(dest="command", metavar="{set,status,clear,run}")
    public_help = {"set": "Guide credential setup and remember its location.", "status": "Show local configuration status.",
                   "clear": "Remove only the saved location.", "run": "Evaluate a selected request."}
    # Keep the original lower-level commands compatible, outside the normal menu/help.
    for command in (*public_help, "setup", "bind"):
        child = commands.add_parser(command, **({"help": public_help[command]} if command in public_help else {}))
        if command != "clear":
            child.add_argument("--env-file", required=command == "bind", help="Explicit private env file; overrides the saved location for this call")
        if command in ("set", "setup"):
            child.add_argument("--replace", action="store_true", help="Enter a replacement key locally; does not revoke any Platform key")
        elif command == "run":
            child.add_argument("--input", required=True, help="Request JSON file, or - for stdin")
            child.add_argument("--dry-run", action="store_true")
    args = parser.parse_args(argv)
    try:
        if args.command is None:
            if not interactive_terminal():
                raise SetupError("Choose set, status, clear or run explicitly outside an interactive terminal.")
            print("Decide (optional)")
            action = choose_numbered("Choose an action", ("set", "status", "clear"))
            args = parser.parse_args((["--config-file", args.config_file] if args.config_file else []) + [action])
        # Dry-run does not touch credential files or inspect the key environment.
        if args.command == "run" and args.dry_run:
            return subprocess.run(["node", str(TOOL), "--input", args.input, "--dry-run"], check=False).returncode
        if args.command == "set":
            configure(Path(args.config_file) if args.config_file else default_binding_path(), args.env_file, replace=args.replace)
            return 0
        if args.command in ("bind", "clear"):
            config = Path(args.config_file) if args.config_file else default_binding_path()
            if args.command == "bind":
                bind(config, checked_target(args.env_file))
            else:
                config = checked_target(str(config), require_parent=False)
                if read_binding(config) is not None:
                    config.unlink()
                print(json.dumps({"bound": False, "binding_file": str(config)}))
            return 0
        target = checked_target(args.env_file) if args.env_file else None
        if target is None:
            config = Path(args.config_file) if args.config_file else default_binding_path()
            selected = read_binding(config)
            target = checked_target(str(selected)) if selected is not None else None
        if args.command == "setup":
            if target is None:
                raise SetupError("Choose --env-file or use bind --env-file before setup.")
            setup(target, replace=args.replace)
        elif args.command == "status":
            configured = False
            if target is not None and target.exists():
                load_key(target)
                configured = True
            print(json.dumps({"configured": configured, "env_file": str(target) if target is not None else None, "live_verified": False}))
        else:
            child_env = dict(os.environ)
            if target is not None:
                child_env["OPENAI_API_KEY"] = load_key(target)
            return subprocess.run(["node", str(TOOL), "--input", args.input], env=child_env, check=False).returncode
        return 0
    except (SetupError, OSError, UnicodeError, subprocess.SubprocessError) as exc:
        message = str(exc) if isinstance(exc, SetupError) else "Local credential or launcher operation failed; no secret details are shown."
        print(json.dumps({"status": "error", "error": message}), file=sys.stderr)
        return 2
    except (EOFError, KeyboardInterrupt):
        print("Setup canceled.", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())

# Local setup and rotation

Create one dedicated project API key per execution host in the intended OpenAI
organization/project. A Windows client executing remotely on Linux uses the
Linux host's credential; a local Windows execution needs its own binding.
Never send a key through chat, argv, screenshots or shell history. The local
script does not create, list or revoke Platform keys and makes no API calls.

Prefer the Runner's existing secret manager when available. Otherwise explicitly
choose an ignored private env file outside the installed support tree. Existing
repo `.env.local` is suitable when ignored; user-home storage outside Git is also
supported. Plaintext with restricted permissions is not an encrypted vault.
Do not store credentials inside `agents-pipeline/` support or a managed skill
directory: those directories are replaced by updates.

Resolve `../../../scripts/decide.sh`, `../../../scripts/decide.ps1`, or the direct
`../../../scripts/decide.py` entry relative to this reference file (installed
references are rewritten to the support tree). In a source checkout:

```text
bash scripts/decide.sh setup --env-file .env.local
bash scripts/decide.sh bind --env-file .env.local
bash scripts/decide.sh status
bash scripts/decide.sh run --input request.json --dry-run
bash scripts/decide.sh run --input request.json
```

Skip `setup` when the private key file is already configured: only `bind` is
needed once. It validates the existing file without changing its key, then saves
only the absolute location in `~/.agents-pipeline/decide.json` (on Windows,
`$env:USERPROFILE\.agents-pipeline\decide.json`). This per-user binding is outside
the replaceable installation tree and applies across workspaces. It contains
no key and is itself private. Updates do not reset it. `setup --env-file` alone
does not change the binding, so creating a canary key cannot switch active use.

`clear` removes only valid binding metadata, leaving the credential file intact.
An advanced Runner may select another metadata file with
`--config-file <absolute-file>` before the command. Do not put this file inside
the installation tree or use a credential file as metadata.

Windows entrypoints require PowerShell 7+, matching the profile-manager wrapper.
The direct Python entry also remains available (`py -3 scripts/decide.py`).
Paths containing spaces must be quoted. Python 3.11+ and Node.js 18+ are required.

For a Windows source clone, open PowerShell anywhere inside that clone. These
commands resolve its actual absolute paths rather than assuming a drive/user:

```powershell
$decideRepo = (git rev-parse --show-toplevel).Trim()
if ($LASTEXITCODE -ne 0) { throw 'Run this inside the agents_pipeline clone.' }
$decideScript = Join-Path $decideRepo 'scripts\decide.ps1'
$decideEnvFile = Join-Path $decideRepo '.env.local'
pwsh -NoProfile -File $decideScript setup --env-file $decideEnvFile
pwsh -NoProfile -File $decideScript bind --env-file $decideEnvFile
pwsh -NoProfile -File $decideScript status
pwsh -NoProfile -File $decideScript run --input request.json --dry-run
```

After a future default global install that includes this skill, the Windows
script is at `$env:USERPROFILE\.codex\agents-pipeline\scripts\decide.ps1`.
Keep its credential outside the replaceable support tree, for example:

```powershell
$decideScript = Join-Path $env:USERPROFILE '.codex\agents-pipeline\scripts\decide.ps1'
$decideEnvFile = Join-Path $env:USERPROFILE '.agents-pipeline-decide.env'
pwsh -NoProfile -File $decideScript setup --env-file $decideEnvFile
pwsh -NoProfile -File $decideScript bind --env-file $decideEnvFile
pwsh -NoProfile -File $decideScript status
```

A custom Codex home has a different script location. These examples do not
install or update anything. For requests, use the same variables with
`pwsh -NoProfile -File $decideScript run --input request.json`.
The matching default POSIX entry is
`bash "$HOME/.codex/agents-pipeline/scripts/decide.sh"`.

Run `setup` yourself in an interactive terminal. It shows the absolute destination,
requires `yes`, and asks for the key twice with echo disabled. It creates an
owner-only file on POSIX or a Windows ACL restricted to the current account,
SYSTEM and Administrators. ACL setup/verification requires Windows PowerShell.
An unsupported ACL, unsafe path or noninteractive input fails without accepting
secret input. Never pipe or embed a key in a setup command.

An existing file must already have restricted permissions. On POSIX, the operator
can apply `chmod 600 .env.local` before setup. Symlinks, junctions, reparse points,
nonregular/multiply-linked files, tracked files and unignored Git targets are
refused; temporary `.env.decide-*` staging files must also be ignored when inside
Git (this repo's `.env.*` rule covers both). No Git ignore rules or hooks are
modified. Other env-file lines are
preserved. Duplicate key entries or shell expressions are rejected. Status shows
only configured/not-configured and the path; it does not prove access or credit.

Install once, set up once. Updates leave an external credential file in place.
The launcher reads it afresh for each invocation and injects the key only into
the Decisions child process. Precedence is explicit `--env-file`, then the saved
location, then (only when unbound) the explicitly provided process environment.
Invalid metadata or an invalid selected file never falls back to another key.
Dry-run ignores metadata and credentials entirely, even if arguments select them.

For replacement/rotation:

1. Create a replacement in the same intended project, leaving the old key valid.
2. Use `setup --env-file <new-private-file>` and explicitly authorize a small live
   `run` with that new file. A mock or dry-run does not verify the key.
3. After success, use `bind --env-file <new-private-file>`, or use
   `setup --replace` to enter the verified new key into the currently bound file.
   Replacement is explicit and preserves unrelated env-file entries. Confirm one
   invocation with the active binding before revocation.
4. Once old requests have finished, revoke the old key in Platform. The script
   does not manage expiry, refresh keys, revoke keys or retry with an older key.

Never expiry avoids expiry-based downtime for occasional use, when allowed by
organization policy; it does not remove manual revocation/rotation. Neither
ChatGPT login nor Codex OAuth is used to renew a project API key.

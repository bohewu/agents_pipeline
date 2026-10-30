# Optional local setup and rotation

`$decide` has its own standalone setup script. Run it only when you want this
optional tool; the main installer and workspace profile never launch its setup.
From a source checkout, open your terminal and run:

```bash
bash scripts/decide.sh
```

```powershell
pwsh -NoProfile -File scripts/decide.ps1
```

Both show the same numbered `set / status / clear` menu, like the workspace
profile manager. Choose `set` and follow the prompts:

1. Choose a credential file. The default is your saved location, or
   `~/.agents-pipeline-decide.env` on first use. An ignored repo `.env.local`
   also works. Keep it outside the replaceable installation/skill directories.
2. Use an existing key, or enter a new one twice at the hidden prompt. For a new
   or replacement key the script shows the destination and requires `yes`.
3. The script prepares the private file and remembers its location together.
   You do not need to create an env file manually or run a separate bind command.

Create a dedicated project API key in the intended OpenAI organization/project
yourself before entering it. The script does not create, list or revoke Platform
keys, and setup makes no API request. Never put a key in chat, command arguments,
screenshots or shell history, and never pipe a key into setup.

Use one dedicated key per execution host. A Windows client executing remotely on
Linux uses that Linux host's credential; local Windows execution needs its own
setup. Python 3.11+ and Node.js 18+ are required; the Windows wrapper requires
PowerShell 7+, matching the profile-manager wrapper. Quote paths with spaces.

After a default global installation that includes this tool, the standalone
entrypoints are:

```bash
bash "$HOME/.codex/agents-pipeline/scripts/decide.sh"
```

```powershell
pwsh -NoProfile -File "$env:USERPROFILE\.codex\agents-pipeline\scripts\decide.ps1"
```

A custom Codex home changes that script location. These commands do not install
or update anything. In a Windows source clone, use `scripts\decide.ps1` from
that clone instead. The script resolves its own helper regardless of your
current directory. Direct `python3 scripts/decide.py` or
`py -3 scripts/decide.py` invocation also works.

## After setup

The explicit commands below work with either wrapper; `set`, `status` and
`clear` are also available in the menu:

```text
set
status
clear
run --input request.json --dry-run
run --input request.json
```

An explicit `$decide` request authorizes one bounded live call using its valid
saved credential binding; do not ask reuse-versus-new again for ordinary use.
Setting up a credential alone does not authorize automatic workflow calls.
Direct `run` without `--dry-run` is a live request and needs authorization.
`status` shows only configuration and paths; it does not verify API access or
credit. `clear` removes only the saved location, leaving the credential intact.

Only the absolute path is saved in `~/.agents-pipeline/decide.json` (Windows:
`$env:USERPROFILE\.agents-pipeline\decide.json`), outside the replaced support
tree. It contains no key. Updates preserve this metadata and external credential
file; no repeat setup or `--env-file` is needed for later requests. An advanced
Runner may override the metadata file with `--config-file <file>` before the
command; it must be separate from the credential file.

The launcher reads the key afresh for each request and injects it only into the
Decisions child process. Precedence is an explicit `--env-file`, then the saved
location, then (only when unbound) process-local `OPENAI_API_KEY` from your secret
manager. Invalid metadata or a selected invalid file fails without falling back
to another key. Dry-run ignores metadata and credentials entirely.

## Local storage and replacement

Files use owner-only POSIX permissions or a Windows ACL restricted to the
current account, SYSTEM and Administrators; Windows ACL handling requires
Windows PowerShell. Restricted plaintext storage is not an encrypted vault.
Existing files must already be private (`chmod 600` on POSIX). Unsafe links,
nonregular/multiply-linked files, tracked files and unignored Git targets are
refused. Temporary `.env.decide-*` files must also be ignored inside Git (this
repo's `.env.*` rule covers them). No ignore rules or hooks are modified.
Unrelated env-file lines are preserved; duplicate key entries and shell
expressions are rejected.

For replacement, create a new key in the same intended project while the old key
remains valid. Choose `set` and `Replace key`, or use `set --replace`. This changes
local storage only; it does not revoke the old key. Verify the new key with a
separately authorized small live request before revoking the old key in Platform.

For a canary before switching the active location, the compatible low-level
`setup --env-file <new-private-file>` command creates a key file without changing
the saved location. Test it with `run --env-file <new-private-file> --input
<request>`, then use `set --env-file <new-private-file>` to select it after success.
Dry-run does not verify a key. Neither ChatGPT login nor Codex OAuth renews a
project API key; expiry, rotation and revocation remain manual.

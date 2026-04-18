# INSTALLER_MODEL — General local installation

## 1. Purpose

Installer turns source repo contents into a self-contained local web client installation. It also installs required OpenCode assets into the user's local OpenCode config, using the same general model as installing other agent settings.

After installation, the user should not need the source repo path.

## 2. Installer commands

Minimum required shell UX:

```bash
./install.sh web-client
./install.sh web-client --dry-run
./install.sh web-client --force
./install.sh web-client --uninstall
./install.sh web-client --opencode-config-dir ~/.config/opencode
./install.sh web-client --bin-dir ~/.local/bin
```

PowerShell equivalent should exist for Windows if the repo supports Windows:

```powershell
.\install.ps1 web-client
```

If the repo already has an installer framework, add `web-client` as a component/subcommand rather than creating a conflicting installer.

## 3. Installation targets

### 3.1 Web client runtime

Use XDG-style paths:

```text
$XDG_DATA_HOME/opencode-codex-web
fallback: ~/.local/share/opencode-codex-web
```

Content:

```text
opencode-codex-web/
  install-manifest.json
  server/
  client/
  tools/provider-usage.py
  assets/
```

### 3.2 Web client app config/state/cache

```text
$XDG_CONFIG_HOME/opencode-codex-web/config.json
fallback: ~/.config/opencode-codex-web/config.json

$XDG_STATE_HOME/opencode-codex-web/workspaces.json
fallback: ~/.local/state/opencode-codex-web/workspaces.json

$XDG_CACHE_HOME/opencode-codex-web/
fallback: ~/.cache/opencode-codex-web/
```

### 3.3 Executable command

Default binary dir resolution:

1. `--bin-dir`
2. `$OPENCODE_WEB_BIN_DIR`
3. `$XDG_BIN_DIR`
4. `$HOME/.local/bin`
5. `$HOME/bin`

Create executable shim:

```text
<binDir>/opencode-codex-web
```

Shim points to installed `dist/bin/opencode-codex-web.js` or bundled executable.

### 3.4 OpenCode assets

Default OpenCode config dir resolution:

1. `--opencode-config-dir`
2. `$OPENCODE_CONFIG_DIR` at install time
3. `$XDG_CONFIG_HOME/opencode`
4. `~/.config/opencode`

Install assets:

```text
<opencodeConfigDir>/plugins/effort-control.js
<opencodeConfigDir>/plugins/effort-control/state.js
<opencodeConfigDir>/commands/usage.md
```

The provider usage Python tool is installed with the web client runtime:

```text
<dataDir>/tools/provider-usage.py
```

Optional: install a small wrapper command into OpenCode commands that calls the bundled tool path. If the command file requires an absolute path, rewrite it during install.

## 4. Install manifest

Write:

```json
{
  "schemaVersion": 1,
  "product": "opencode-codex-web",
  "version": "0.1.0",
  "installedAt": "2026-04-18T00:00:00.000Z",
  "source": {
    "repo": "bohewu/agents_pipeline",
    "commit": "<optional>",
    "pathAtInstallTime": "<optional, diagnostic only>"
  },
  "paths": {
    "dataDir": "...",
    "configDir": "...",
    "stateDir": "...",
    "cacheDir": "...",
    "bin": ".../opencode-codex-web",
    "opencodeConfigDir": ".../.config/opencode"
  },
  "assets": {
    "tools": {
      "providerUsagePy": ".../tools/provider-usage.py"
    },
    "opencode": {
      "effortPlugin": ".../plugins/effort-control.js",
      "effortStateHelper": ".../plugins/effort-control/state.js",
      "usageCommand": ".../commands/usage.md"
    }
  }
}
```

`pathAtInstallTime` is only diagnostic. Runtime must not require it.

## 5. Idempotency

Re-running installer must:

- preserve user app config unless `--reset-config`。
- preserve workspace registry unless `--reset-state`。
- replace web runtime bundle atomically。
- replace managed OpenCode assets only if checksum differs or `--force`。
- write backup files before overwriting user-modified assets。

Backup naming:

```text
<file>.bak.<timestamp>
```

## 6. Asset ownership markers

Installed OpenCode asset files must include a short header:

```text
// Installed by opencode-codex-web installer.
// Managed asset: effort-control.
// Source: <repo>/<version>.
```

For markdown command:

```markdown
<!-- Installed by opencode-codex-web installer. Managed asset: usage command. -->
```

Installer uses markers + checksum to decide safe overwrite.

If target file exists without marker, do not overwrite unless `--force`; write `.candidate` and show warning.

## 7. Dry run

`--dry-run` prints:

- files to create/update。
- files to backup。
- binary path。
- OpenCode config dir。
- detected OpenCode binary/version。
- missing dependencies。

No filesystem mutation.

## 8. Uninstall

`--uninstall` removes:

- web runtime bundle。
- executable shim。
- installed OpenCode assets with ownership marker。

Default: preserve app config/state/workspaces.

Optional:

```bash
./install.sh web-client --uninstall --purge
```

`--purge` removes app config/state/cache too.

Never remove user OpenCode config directory.

## 9. Dependency checks

Required:

- Node.js for web runtime.
- OpenCode CLI for managed upstream.

Optional but recommended:

- Python 3 for usage tool。
- Git for workspace root discovery。

Installer should not fail hard on missing OpenCode or Python unless `--strict` is passed. The runtime diagnostics panel will show remediation.

## 10. Post-install output

Installer must print:

```text
Installed opencode-codex-web.
Command: opencode-codex-web --open
Web runtime: <dataDir>
OpenCode config: <opencodeConfigDir>
Installed OpenCode assets:
  - effort-control plugin
  - usage command
  - provider-usage tool
```

## 11. Update behavior

Updating to a new version:

1. Stop running local app if possible, or install to temp dir then swap on next launch。
2. Update web runtime bundle。
3. Update managed assets with backup。
4. Keep workspace registry and user settings。
5. Record previous version in manifest.

## 12. Runtime source repo independence test

Installer acceptance must include:

```bash
./install.sh web-client
mv <source-repo> <source-repo>.moved
opencode-codex-web --no-open --port 45678
curl http://127.0.0.1:45678/api/diagnostics/install
```

Expected diagnostics:

```json
{
  "app": {
    "sourceRepoRequired": false
  }
}
```


# External Dependencies And Release-Install Risk Notes

## Scope

The current repository contains no helper that directly calls provider quota, image-generation, skill-catalog, or model APIs. Exporters, direct installers, schema validation, and the neutral status writer operate on local files.

Network access is used by the supported release bootstraps to discover and download published GitHub release bundles. Generated agents subsequently use their selected runtime's own authentication, network, billing, and policy boundary.

## Supported release bootstraps

The current networked bootstrap entry points are:

- `scripts/bootstrap-install-codex.sh`
- `scripts/bootstrap-install-codex.ps1`
- `scripts/bootstrap-install-claude.sh`
- `scripts/bootstrap-install-claude.ps1`
- `scripts/bootstrap-install-copilot.sh`
- `scripts/bootstrap-install-copilot.ps1`

Each bootstrap downloads a release bundle into a temporary directory, verifies it, runs the corresponding local installer from that bundle, and removes the temporary directory unless `--keep-temp` / `-KeepTemp` is selected.

These neutral-bundle bootstraps support `v0.28.0` and newer. For an older tag, use the bootstrap file shipped at that tag because pre-v0.28 releases used a different bundle layout.

## GitHub services used

The bootstraps use:

- GitHub Releases REST API to resolve `latest` or an explicit tag
- release-asset download URLs for the archive and checksum manifest
- optional GitHub Artifact Attestation verification through `gh attestation verify`

Release discovery is anonymous; the scripts do not read `GITHUB_TOKEN` or `GH_TOKEN`. Anonymous GitHub API rate limits therefore apply.

No project source files, prompts, runtime credentials, or generated artifacts are uploaded by these bootstrap scripts. Ordinary GitHub request metadata such as IP address and user agent remains visible to GitHub.

## Integrity checks

The release install sequence is:

1. Resolve one published release.
2. Select the platform archive and its `SHA256SUMS` asset.
3. Download both assets.
4. Compute SHA-256 locally and require an exact checksum match.
5. If a compatible `gh` CLI is available, verify the archive attestation against:
   - repository `bohewu/agents_pipeline`
   - signer workflow `.github/workflows/release-bundle.yml`
   - the resolved tag source ref
   - GitHub-hosted runners only
6. Verify the extracted bundle contains the files required by the selected runtime installer.
7. Run the installer.

Checksum verification is mandatory. Attestation verification is opportunistic: it is skipped when `gh` is unavailable or lacks `gh attestation verify`. When attestation verification is attempted and fails, the bootstrap fails.

Use `--verbose` / `-Verbose` to see attestation decisions and additional bootstrap details.

## Reproducibility

Prefer an explicit immutable release tag:

```bash
bash scripts/bootstrap-install-codex.sh --version v0.28.0 --dry-run
```

`--version latest` is convenient but mutable: two runs can resolve different releases. A pinned tag plus mandatory checksum and successful attestation provides the strongest supported release-install evidence.

Dry-run resolves and reports the intended actions without modifying the install target. It may still require GitHub network access to resolve release metadata.

## Platform dependencies

macOS/Linux bootstraps require:

- `bash`
- `curl`
- `python3`
- `tar`
- `sha256sum` or `shasum`

Windows bootstraps require:

- PowerShell 7+
- `Invoke-RestMethod`, `Invoke-WebRequest`, `Get-FileHash`, and archive extraction support supplied by PowerShell/.NET
- Python 3.11 or newer available to the selected runtime installer

Optional on every platform:

- GitHub CLI with `gh attestation verify` support
- authenticated `gh` state when GitHub requires it for attestation lookup

The target runtime CLI is required to use generated roles but is not required merely to inspect a dry-run.

## Expected failure modes

- GitHub API rate limiting or service outage
- proxy, TLS, DNS, or firewall failure
- requested tag or expected release asset missing
- incomplete or malformed release metadata
- archive/checksum download failure
- missing local checksum utility
- checksum mismatch
- attestation verification failure when verification is available
- malformed archive or missing required bundle files
- insufficient permission to write the selected install target
- an install target containing control or shell-interpolation characters that cannot be represented safely in portable generated command snippets
- missing Python, Node.js, Bash, or PowerShell runtime required by the selected path

Never bypass a checksum or attestation failure by manually running an unverified extracted installer. Re-download the pinned release and investigate the publication chain.

## Runtime trust boundaries

The supported installers generate configuration for runtimes that have their own external dependencies:

- Codex uses the user's Codex installation, login, provider access, permissions, sandbox, and service terms.
- Claude Code uses the user's Claude Code installation, login, permissions, and service terms.
- GitHub Copilot uses the user's selected Copilot surface, authentication, model availability, permissions, and service terms.

This repository does not proxy those runtime calls or copy runtime credentials. Optional model profiles name runtime models but do not verify entitlement or current availability.

The neutral status writer (`tools/status-event.js`) performs local filesystem work only. It does not send status, checkpoint, prompt, task, agent, or evidence data to an external service.

## Reporting problems

Include the following when reporting a release-install dependency failure:

- selected runtime and platform
- exact bootstrap command with secrets removed
- pinned tag or `latest`
- whether failure occurred during release lookup, download, checksum, attestation, extraction, or local installation
- whether `gh attestation verify --help` is available
- whether the same pinned release reproduces after removing proxy/cache effects
- dry-run output and non-sensitive stderr

Do not attach runtime tokens, auth files, cookies, or private prompt/artifact contents.

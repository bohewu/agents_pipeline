#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [string]$Target,
    [string]$ClaudeMd,
    [switch]$NoRunner,
    [switch]$DryRun,
    [switch]$NoBackup,
    [string]$AgentProfile,
    [string]$ModelSet,
    [string]$ProfileDir,
    [string]$ModelSetDir,
    [string]$UniformModel
)

$ErrorActionPreference = "Stop"

function Assert-GeneratedShellPath {
    param([string]$Value, [string]$Label)

    $candidate = $Value
    if ([System.IO.Path]::DirectorySeparatorChar -eq [char]0x5c) {
        $candidate = $candidate.Replace([char]0x5c, [char]0x2f)
    }
    foreach ($character in $candidate.ToCharArray()) {
        if ([char]::IsControl($character) -or [int]$character -in @(0x24, 0x60, 0x22, 0x5c)) {
            throw "$Label contains a shell-active or control character that is unsafe in generated shell instructions."
        }
    }
}

function Get-DefaultTarget {
    return Join-Path (Join-Path $HOME ".claude") "agents"
}

function Get-PythonCommand {
    $py = Get-Command -Name py -ErrorAction SilentlyContinue
    if ($py) { return $py.Source }
    foreach ($name in @("python", "python3")) {
        $python = Get-Command -Name $name -ErrorAction SilentlyContinue
        if ($python) { return $python.Source }
    }
    throw "Python runtime not found. Install python, python3, or py launcher."
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$assetRoot = Resolve-Path (Join-Path $scriptRoot "..")
$sourceAgents = Join-Path $assetRoot "agents"
$defaultProfileDir = Join-Path $assetRoot "tools/agent-profiles"
$modesFile = Join-Path $assetRoot "modes.json"
$catalogFile = Join-Path $assetRoot "AGENTS.md"
$exportScript = Join-Path $assetRoot "scripts/export-claude-agents.py"
$supportSyncScript = Join-Path $assetRoot "scripts/sync-runtime-support.py"
$profileTool = Join-Path $assetRoot "tools/agent-profile.py"
$modelFlags = [bool]($AgentProfile -or $ModelSet -or $ProfileDir -or $ModelSetDir -or $UniformModel)
if (-not $ProfileDir) {
    $ProfileDir = $defaultProfileDir
}
if (-not $ModelSetDir) {
    $ModelSetDir = Join-Path $assetRoot "runtimes/claude/model-sets"
}

if (-not (Test-Path -LiteralPath $sourceAgents -PathType Container)) {
    throw "Source agents directory not found: $sourceAgents"
}
if (-not (Test-Path -LiteralPath $exportScript -PathType Leaf)) {
    throw "Export script not found: $exportScript"
}
if (-not (Test-Path -LiteralPath $supportSyncScript -PathType Leaf)) {
    throw "Support sync script not found: $supportSyncScript"
}
if (-not (Test-Path -LiteralPath $profileTool -PathType Leaf)) {
    throw "Agent profile manager not found: $profileTool"
}
if (-not (Test-Path -LiteralPath $modesFile -PathType Leaf)) {
    throw "Mode manifest not found: $modesFile"
}
if (-not (Test-Path -LiteralPath $catalogFile -PathType Leaf)) {
    throw "Agent catalog not found: $catalogFile"
}

if ($PSBoundParameters.ContainsKey("Target") -and [string]::IsNullOrWhiteSpace($Target)) {
    throw "Target path must not be empty."
}
if (-not $PSBoundParameters.ContainsKey("Target")) {
    $Target = Get-DefaultTarget
}

if ($Target -match '^-{1,2}[A-Za-z]') {
    throw "Target path '$Target' looks like a switch, not a filesystem path. Pass -Target explicitly if needed."
}
Assert-GeneratedShellPath -Value $Target -Label "Target path"
if ($ClaudeMd) {
    Assert-GeneratedShellPath -Value $ClaudeMd -Label "CLAUDE.md path"
}

$pythonCmd = Get-PythonCommand
$targetInputPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Target)
if (Test-Path -LiteralPath $targetInputPath) {
    $targetItem = Get-Item -LiteralPath $targetInputPath -Force
    if (($targetItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Target path must not be a symbolic link or junction: $targetInputPath"
    }
    if (-not $targetItem.PSIsContainer) {
        throw "Target path is not a directory: $targetInputPath"
    }
}
$targetPath = [string](& $pythonCmd -c 'import os, sys; from pathlib import Path; path = Path(os.path.abspath(os.path.expanduser(sys.argv[1]))); print(path.parent.resolve(strict=False) / path.name)' $targetInputPath)
if ($LASTEXITCODE -ne 0 -or [string]::IsNullOrWhiteSpace($targetPath)) {
    throw "Unable to resolve target path before installation."
}
$supportRoot = Join-Path (Split-Path -Parent $targetPath) "agents-pipeline"

Write-Host "Source agents: $sourceAgents"
Write-Host "Target: $targetPath"
Write-Host "DryRun: $DryRun"
Write-Host "Cleanup: stale generated Claude Code subagent files only"

$existingAgents = @()
if (Test-Path -LiteralPath $targetPath -PathType Container) {
    $existingAgents = Get-ChildItem -Path $targetPath -Filter "*.md" -File -ErrorAction SilentlyContinue
}

if (-not $NoBackup -and $existingAgents.Count -gt 0) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupDir = Join-Path $targetPath ".backup-agents-pipeline-claude-$stamp"
    if ($DryRun) {
        Write-Host "Would create backup: $backupDir"
    } else {
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        foreach ($item in $existingAgents) {
            Copy-Item -LiteralPath $item.FullName -Destination $backupDir -Force
        }
        Write-Host "Backup created: $backupDir"
    }
}

if ($DryRun) {
    Write-Host "Would ensure target directory exists: $targetPath"
} else {
    New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
}

# Auto-detect CLAUDE.md path. Global ~/.claude/agents writes under ~/.claude;
# project <root>/.claude/agents writes to <root>/CLAUDE.md.
if (-not $NoRunner -and -not $ClaudeMd) {
    $agentsParent = Split-Path -Parent $targetInputPath
    $globalClaudeDir = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath(
        (Join-Path $HOME ".claude")
    )
    if ($agentsParent -eq $globalClaudeDir) {
        $ClaudeMd = Join-Path $agentsParent "CLAUDE.md"
    } elseif ((Split-Path -Leaf $agentsParent) -eq ".claude") {
        $ClaudeMd = Join-Path (Split-Path -Parent $agentsParent) "CLAUDE.md"
    } else {
        $ClaudeMd = Join-Path $agentsParent "CLAUDE.md"
    }
}

$exportArgs = @(
    $exportScript,
    "--source-agents", $sourceAgents,
    "--modes-file", $modesFile,
    "--catalog", $catalogFile,
    "--target-dir", $targetPath,
    "--resolve-support-refs-to", $supportRoot,
    "--strict"
)
if (-not $NoRunner -and $ClaudeMd) {
    $exportArgs += @("--claude-md", $ClaudeMd)
}
if ($DryRun) {
    $exportArgs += "--dry-run"
}
if ($AgentProfile) {
    $exportArgs += @("--agent-profile", $AgentProfile)
}
if ($ModelSet) {
    $exportArgs += @("--model-set", $ModelSet)
}
if ($modelFlags) {
    $exportArgs += @("--profile-dir", $ProfileDir, "--model-set-dir", $ModelSetDir)
}
if ($UniformModel) {
    $exportArgs += @("--uniform-model", $UniformModel)
}

$profileArgs = @(
    $profileTool,
    "record",
    "--runtime", "claude",
    "--target", $targetPath,
    "--asset-root", ([string]$assetRoot)
)
if ($AgentProfile) {
    $profileArgs += @("--profile", $AgentProfile)
}
if ($ModelSet) {
    $profileArgs += @("--model-set", $ModelSet)
}
if ($UniformModel) {
    $profileArgs += @("--uniform-model", $UniformModel)
}
if ($DryRun) {
    $profileArgs += "--dry-run"
}

$supportArgs = @(
    $supportSyncScript,
    "--source-root", $assetRoot,
    "--target-root", $supportRoot
)
if ($DryRun) {
    $supportArgs += "--dry-run"
}
if (-not $DryRun) {
    $preflightArgs = @($exportArgs) + "--dry-run"
    & $pythonCmd @preflightArgs | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Claude Code subagent preflight failed with exit code $LASTEXITCODE."
    }
    $profilePreflightArgs = @($profileArgs) + "--dry-run"
    & $pythonCmd @profilePreflightArgs | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "Claude profile manifest preflight failed with exit code $LASTEXITCODE."
    }
}
& $pythonCmd @supportArgs
if ($LASTEXITCODE -ne 0) {
    throw "Claude support tree sync failed with exit code $LASTEXITCODE."
}

& $pythonCmd @exportArgs
if ($LASTEXITCODE -ne 0) {
    throw "Claude Code subagent export failed with exit code $LASTEXITCODE."
}
& $pythonCmd @profileArgs
if ($LASTEXITCODE -ne 0) {
    throw "Claude profile manifest write failed with exit code $LASTEXITCODE."
}

Write-Host ""
Write-Host "Claude Code subagents directory: $targetPath"

if ($DryRun) {
    Write-Host "Dry run complete. No files were written."
} else {
    Write-Host "Install complete."
}

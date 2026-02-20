#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [string]$Target,
    [switch]$DryRun,
    [switch]$NoBackup
)

$ErrorActionPreference = "Stop"

function Get-DefaultTarget {
    if ($env:XDG_CONFIG_HOME) {
        return Join-Path $env:XDG_CONFIG_HOME "copilot\agents"
    }
    return Join-Path (Join-Path $HOME ".config") "copilot\agents"
}

function Get-PythonCommand {
    $py = Get-Command -Name py -ErrorAction SilentlyContinue
    if ($py) { return $py.Source }
    $python = Get-Command -Name python -ErrorAction SilentlyContinue
    if ($python) { return $python.Source }
    throw "Python runtime not found. Install python or py launcher."
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..")
$sourceAgents = Join-Path $repoRoot "opencode/agents"
$exportScript = Join-Path $repoRoot "scripts/export-copilot-agents.py"

if (-not (Test-Path -LiteralPath $sourceAgents -PathType Container)) {
    throw "Source agents directory not found: $sourceAgents"
}
if (-not (Test-Path -LiteralPath $exportScript -PathType Leaf)) {
    throw "Export script not found: $exportScript"
}

if (-not $Target) {
    $Target = Get-DefaultTarget
}

$targetPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Target)
$pythonCmd = Get-PythonCommand

Write-Host "Source agents: $sourceAgents"
Write-Host "Target: $targetPath"
Write-Host "DryRun: $DryRun"

$existingAgents = @()
if (Test-Path -LiteralPath $targetPath -PathType Container) {
    $existingAgents = Get-ChildItem -Path $targetPath -Filter "*.agent.md" -File -ErrorAction SilentlyContinue
}

if (-not $NoBackup -and $existingAgents.Count -gt 0) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupDir = Join-Path $targetPath ".backup-agents-pipeline-copilot-$stamp"
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

$exportArgs = @(
    $exportScript,
    "--source-agents", $sourceAgents,
    "--target-dir", $targetPath,
    "--strict"
)
if ($DryRun) {
    $exportArgs += "--dry-run"
}

& $pythonCmd @exportArgs
if ($LASTEXITCODE -ne 0) {
    throw "Copilot agent export failed with exit code $LASTEXITCODE."
}

Write-Host ""
Write-Host "Suggested VS Code settings.json snippet:"
Write-Host "{"
Write-Host "  `"chat.agentFilesLocations`": ["
Write-Host "    `"$targetPath`""
Write-Host "  ]"
Write-Host "}"

if ($DryRun) {
    Write-Host "Dry run complete. No files were written."
} else {
    Write-Host "Install complete."
}

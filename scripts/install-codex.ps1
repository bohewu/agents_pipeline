#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [string]$Target,
    [switch]$DryRun,
    [switch]$NoBackup,
    [switch]$Force
)

$ErrorActionPreference = "Stop"

function Get-DefaultTarget {
    return Join-Path $HOME ".codex"
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
$exportScript = Join-Path $repoRoot "scripts/export-codex-agents.py"

if (-not (Test-Path -LiteralPath $sourceAgents -PathType Container)) {
    throw "Source agents directory not found: $sourceAgents"
}
if (-not (Test-Path -LiteralPath $exportScript -PathType Leaf)) {
    throw "Export script not found: $exportScript"
}

if (-not $Target) {
    $Target = Get-DefaultTarget
}

if ($Target -match '^-{1,2}[A-Za-z]') {
    throw "Target path '$Target' looks like a switch, not a filesystem path. Pass -Target explicitly and use -Force:`$true for overwrite mode."
}

$targetPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Target)
$pythonCmd = Get-PythonCommand

Write-Host "Source agents: $sourceAgents"
Write-Host "Target: $targetPath"
Write-Host "DryRun: $DryRun"
Write-Host "Force: $Force"

$existingConfig = $null
$existingRoles = @()
if (Test-Path -LiteralPath $targetPath -PathType Container) {
    $configPath = Join-Path $targetPath "config.toml"
    if (Test-Path -LiteralPath $configPath -PathType Leaf) {
        $existingConfig = Get-Item -LiteralPath $configPath
    }

    $agentsDir = Join-Path $targetPath "agents"
    if (Test-Path -LiteralPath $agentsDir -PathType Container) {
        $existingRoles = Get-ChildItem -Path $agentsDir -Filter "*.toml" -File -ErrorAction SilentlyContinue
    }
}

if (-not $NoBackup -and ($existingConfig -or $existingRoles.Count -gt 0)) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupDir = Join-Path $targetPath ".backup-agents-pipeline-codex-$stamp"
    if ($DryRun) {
        Write-Host "Would create backup: $backupDir"
    } else {
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        if ($existingConfig) {
            Copy-Item -LiteralPath $existingConfig.FullName -Destination $backupDir -Force
        }
        if ($existingRoles.Count -gt 0) {
            $backupAgentsDir = Join-Path $backupDir "agents"
            New-Item -ItemType Directory -Path $backupAgentsDir -Force | Out-Null
            foreach ($item in $existingRoles) {
                Copy-Item -LiteralPath $item.FullName -Destination $backupAgentsDir -Force
            }
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
if ($Force) {
    $exportArgs += "--force"
}
if ($DryRun) {
    $exportArgs += "--dry-run"
}

& $pythonCmd @exportArgs
if ($LASTEXITCODE -ne 0) {
    throw "Codex role export failed with exit code $LASTEXITCODE."
}

Write-Host ""
Write-Host "Codex usage note: invoke generated roles by name in prompts."
Write-Host "Example: Have 'orchestrator-general' draft a plan and 'reviewer' validate the outcome."

if ($DryRun) {
    Write-Host "Dry run complete. No files were written."
} else {
    Write-Host "Install complete. Generated Codex config is ready at: $targetPath"
}

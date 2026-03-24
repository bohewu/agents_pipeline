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
        return Join-Path $env:XDG_CONFIG_HOME "opencode/plugins/status-runtime"
    }
    return Join-Path $HOME ".config/opencode/plugins/status-runtime"
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..")
$sourceDir = Join-Path $repoRoot "opencode/plugins/status-runtime"

if (-not (Test-Path -LiteralPath $sourceDir -PathType Container)) {
    throw "Source plugin directory not found: $sourceDir"
}

if (-not $Target) {
    $Target = Get-DefaultTarget
}

if ($Target -match '^-{1,2}[A-Za-z]') {
    throw "Target path '$Target' looks like a switch, not a filesystem path. Pass -Target explicitly if needed."
}

$targetPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Target)
$targetParent = Split-Path -Parent $targetPath
$pluginName = Split-Path -Leaf $sourceDir

Write-Host "Source plugin: $sourceDir"
Write-Host "Target: $targetPath"
Write-Host "DryRun: $DryRun"
Write-Host "Plugin scope: OpenCode only"

if (-not $NoBackup -and (Test-Path -LiteralPath $targetPath -PathType Container)) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupDir = Join-Path $targetParent ".backup-agents-pipeline-$pluginName-$stamp"
    if ($DryRun) {
        Write-Host "Would create backup: $backupDir"
    } else {
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        Copy-Item -LiteralPath $targetPath -Destination $backupDir -Recurse -Force
        Write-Host "Backup created: $backupDir"
    }
}

if ($DryRun) {
    Write-Host "Would ensure target directory exists: $targetPath"
    Write-Host "Would sync: $sourceDir -> $targetPath"
    Write-Host "Dry run complete. No files were written."
    exit 0
}

New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
Copy-Item -Path (Join-Path $sourceDir "*") -Destination $targetPath -Recurse -Force
Write-Host "Synced: $sourceDir -> $targetPath"
Write-Host "Install complete. OpenCode plugin is ready at: $targetPath"

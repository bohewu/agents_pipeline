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
        return Join-Path $env:XDG_CONFIG_HOME "opencode"
    }
    return Join-Path $HOME ".config/opencode"
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..")
$sourceRoot = Join-Path $repoRoot "opencode"

if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) {
    throw "Source directory not found: $sourceRoot"
}

if (-not $Target) {
    $Target = Get-DefaultTarget
}

$targetPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Target)
$items = @("agents", "commands", "protocols", "tools")
$exampleConfig = Join-Path $repoRoot "opencode.json.example"

Write-Host "Source: $sourceRoot"
Write-Host "Target: $targetPath"
Write-Host "DryRun: $DryRun"

$needsBackup = $false
foreach ($item in $items) {
    $dest = Join-Path $targetPath $item
    if (Test-Path -LiteralPath $dest) {
        $needsBackup = $true
        break
    }
}

if (-not $NoBackup -and $needsBackup) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupDir = Join-Path $targetPath ".backup-agents-pipeline-$stamp"
    if ($DryRun) {
        Write-Host "Would create backup: $backupDir"
    } else {
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        foreach ($item in $items) {
            $dest = Join-Path $targetPath $item
            if (Test-Path -LiteralPath $dest) {
                Copy-Item -LiteralPath $dest -Destination $backupDir -Recurse -Force
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

foreach ($item in $items) {
    $src = Join-Path $sourceRoot $item
    if (-not (Test-Path -LiteralPath $src)) {
        continue
    }

    $dest = Join-Path $targetPath $item
    if ($DryRun) {
        Write-Host "Would sync: $src -> $dest"
        continue
    }

    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    Copy-Item -Path (Join-Path $src "*") -Destination $dest -Recurse -Force
    Write-Host "Synced: $src -> $dest"
}

$destConfig = Join-Path $targetPath "opencode.json.example"
if (Test-Path -LiteralPath $exampleConfig) {
    if ($DryRun) {
        Write-Host "Would copy: $exampleConfig -> $destConfig"
    } else {
        Copy-Item -LiteralPath $exampleConfig -Destination $destConfig -Force
        Write-Host "Copied: $destConfig"
    }
}

if ($DryRun) {
    Write-Host "Dry run complete. No files were written."
} else {
    Write-Host "Install complete."
}

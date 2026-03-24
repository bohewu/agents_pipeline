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
        return Join-Path $env:XDG_CONFIG_HOME "opencode/plugins/status-runtime.js"
    }
    return Join-Path $HOME ".config/opencode/plugins/status-runtime.js"
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..")
$sourceEntryFile = Join-Path $repoRoot "opencode/plugins/status-runtime.js"
$sourceSupportDir = Join-Path $repoRoot "opencode/plugins/status-runtime"

if (-not (Test-Path -LiteralPath $sourceEntryFile -PathType Leaf)) {
    throw "Source plugin entry file not found: $sourceEntryFile"
}

if (-not (Test-Path -LiteralPath $sourceSupportDir -PathType Container)) {
    throw "Source plugin support directory not found: $sourceSupportDir"
}

if (-not $Target) {
    $Target = Get-DefaultTarget
}

if ($Target -match '^-{1,2}[A-Za-z]') {
    throw "Target path '$Target' looks like a switch, not a filesystem path. Pass -Target explicitly if needed."
}

$targetPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Target)
$existingTarget = Get-Item -LiteralPath $targetPath -Force -ErrorAction SilentlyContinue
if ($existingTarget -and $existingTarget.PSIsContainer) {
    throw "Target path '$targetPath' is a directory. OpenCode plugin targets must be a JS/TS entry file path."
}

$targetParent = Split-Path -Parent $targetPath
$pluginName = Split-Path -Leaf $sourceSupportDir
$entryName = Split-Path -Leaf $sourceEntryFile
$targetSupportDir = Join-Path $targetParent $pluginName

Write-Host "Source plugin entry: $sourceEntryFile"
Write-Host "Source plugin support dir: $sourceSupportDir"
Write-Host "Target entry: $targetPath"
Write-Host "Target support dir: $targetSupportDir"
Write-Host "DryRun: $DryRun"
Write-Host "Plugin scope: OpenCode only"

if (-not $NoBackup -and ((Test-Path -LiteralPath $targetPath) -or (Test-Path -LiteralPath $targetSupportDir))) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupDir = Join-Path $targetParent ".backup-agents-pipeline-$pluginName-$stamp"
    if ($DryRun) {
        Write-Host "Would create backup: $backupDir"
    } else {
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        if (Test-Path -LiteralPath $targetPath) {
            Copy-Item -LiteralPath $targetPath -Destination (Join-Path $backupDir $entryName) -Force
        }
        if (Test-Path -LiteralPath $targetSupportDir) {
            Copy-Item -LiteralPath $targetSupportDir -Destination $backupDir -Recurse -Force
        }
        Write-Host "Backup created: $backupDir"
    }
}

if ($DryRun) {
    Write-Host "Would ensure plugin directory exists: $targetParent"
    if (Test-Path -LiteralPath $targetSupportDir) {
        Write-Host "Would replace existing support directory: $targetSupportDir"
    }
    Write-Host "Would copy entry file: $sourceEntryFile -> $targetPath"
    Write-Host "Would sync support dir: $sourceSupportDir -> $targetSupportDir"
    Write-Host "Dry run complete. No files were written."
    exit 0
}

New-Item -ItemType Directory -Path $targetParent -Force | Out-Null
Copy-Item -LiteralPath $sourceEntryFile -Destination $targetPath -Force
if (Test-Path -LiteralPath $targetSupportDir) {
    Remove-Item -LiteralPath $targetSupportDir -Recurse -Force
}
New-Item -ItemType Directory -Path $targetSupportDir -Force | Out-Null
Copy-Item -Path (Join-Path $sourceSupportDir "*") -Destination $targetSupportDir -Recurse -Force
Write-Host "Copied entry file: $sourceEntryFile -> $targetPath"
Write-Host "Synced support dir: $sourceSupportDir -> $targetSupportDir"
Write-Host "Install complete. OpenCode plugin is ready at: $targetPath"

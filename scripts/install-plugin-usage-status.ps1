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
        return Join-Path $env:XDG_CONFIG_HOME "opencode/plugins/usage-status.js"
    }
    return Join-Path $HOME ".config/opencode/plugins/usage-status.js"
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..")
$sourceEntryFile = Join-Path $repoRoot "opencode/plugins/usage-status.js"
$sourceSupportDir = Join-Path $repoRoot "opencode/plugins/usage-status"

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
$openCodeRoot = Split-Path -Parent $targetParent
$configPath = Join-Path $openCodeRoot "tui.json"
$tuiEntryPath = Join-Path $targetSupportDir "index.js"
$relativeSpec = "./plugins/usage-status/index.js"

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
    Write-Host "Would register TUI plugin in config: $configPath -> $relativeSpec"
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

$config = $null
if (Test-Path -LiteralPath $configPath -PathType Leaf) {
    $raw = Get-Content -LiteralPath $configPath -Raw
    if (-not [string]::IsNullOrWhiteSpace($raw)) {
        $config = $raw | ConvertFrom-Json -AsHashtable
    }
}
if (-not $config) {
    $config = @{
        '$schema' = 'https://opencode.ai/tui.json'
        plugin = @()
    }
}
if (-not $config.ContainsKey('plugin') -or $config.plugin -isnot [System.Collections.IList]) {
    $config.plugin = @()
}

$updatedPlugins = @()
foreach ($entry in $config.plugin) {
    if ($entry -is [string]) {
        if ($entry -eq $relativeSpec -or $entry -eq ([Uri]$targetPath).AbsoluteUri -or $entry -eq ([Uri]$tuiEntryPath).AbsoluteUri) {
            continue
        }
        $updatedPlugins += $entry
        continue
    }

    if ($entry -is [System.Collections.IList] -and $entry.Count -gt 0 -and $entry[0] -is [string]) {
        if ($entry[0] -eq $relativeSpec -or $entry[0] -eq ([Uri]$targetPath).AbsoluteUri -or $entry[0] -eq ([Uri]$tuiEntryPath).AbsoluteUri) {
            if ($entry.Count -gt 1) {
                $updatedPlugins += ,@($relativeSpec) + @($entry[1..($entry.Count - 1)])
            } else {
                $updatedPlugins += ,@($relativeSpec)
            }
            $relativeSpec = $null
            continue
        }
    }

    $updatedPlugins += $entry
}

if ($relativeSpec) {
    $updatedPlugins += $relativeSpec
}

$config.plugin = $updatedPlugins
$configJson = $config | ConvertTo-Json -Depth 20
Set-Content -LiteralPath $configPath -Value $configJson -Encoding utf8

Write-Host "Copied entry file: $sourceEntryFile -> $targetPath"
Write-Host "Synced support dir: $sourceSupportDir -> $targetSupportDir"
Write-Host "Registered TUI plugin: $tuiEntryPath"
Write-Host "Install complete. OpenCode plugin is ready at: $targetPath"

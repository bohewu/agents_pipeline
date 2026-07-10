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
        return Join-Path $env:XDG_CONFIG_HOME "opencode/plugins/effort-control.js"
    }
    return Join-Path $HOME ".config/opencode/plugins/effort-control.js"
}

function ConvertTo-NormalizedLocalPath {
    param([string]$Value)

    $text = $Value.Trim().Replace('\', '/')
    $folded = $text.TrimEnd('/').ToLowerInvariant()
    if ($folded -in @(
        './plugins/effort-control/index.js',
        'plugins/effort-control/index.js',
        './plugins/effort-control.js',
        'plugins/effort-control.js'
    )) {
        return $folded
    }

    if ($folded.StartsWith('file:')) {
        $uri = [Uri]$text
        $path = [Uri]::UnescapeDataString($uri.LocalPath).Replace('\', '/')
        if ($path -match '^/[A-Za-z]:/') {
            $path = $path.Substring(1)
        }
        return $path.TrimEnd('/').ToLowerInvariant()
    }

    if ($text.Contains('://')) {
        return $null
    }
    if ([System.IO.Path]::IsPathRooted($text) -or $text -match '^[A-Za-z]:/') {
        return $folded
    }
    return $null
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
    throw "Target path '$targetPath' is a directory. The legacy plugin target must be an entry file path."
}

$targetParent = Split-Path -Parent $targetPath
$targetSupportDir = Join-Path $targetParent 'effort-control'
$openCodeRoot = Split-Path -Parent $targetParent
$configPath = Join-Path $openCodeRoot 'tui.json'
$tuiIndexPath = Join-Path $targetSupportDir 'index.js'
$targetFolded = $targetPath.Replace('\', '/').TrimEnd('/').ToLowerInvariant()
$indexFolded = $tuiIndexPath.Replace('\', '/').TrimEnd('/').ToLowerInvariant()

function Test-EffortControlEntry {
    param($Value)

    if ($Value -isnot [string]) {
        return $false
    }
    $normalized = ConvertTo-NormalizedLocalPath -Value $Value
    if ($null -eq $normalized) {
        return $false
    }
    if ($normalized -in @(
        './plugins/effort-control/index.js',
        'plugins/effort-control/index.js',
        './plugins/effort-control.js',
        'plugins/effort-control.js',
        $targetFolded,
        $indexFolded
    )) {
        return $true
    }
    return $normalized.EndsWith('/plugins/effort-control/index.js') -or
        $normalized.EndsWith('/plugins/effort-control.js')
}

$config = $null
$configChanged = $false
$removedRegistrations = 0
if (Test-Path -LiteralPath $configPath -PathType Leaf) {
    $rawConfig = Get-Content -LiteralPath $configPath -Raw
    if (-not [string]::IsNullOrWhiteSpace($rawConfig)) {
        try {
            $config = $rawConfig | ConvertFrom-Json -AsHashtable
        } catch {
            throw "Cannot safely update '$configPath': $($_.Exception.Message)"
        }
    }

    if ($config -is [System.Collections.IDictionary] -and
        $config.Contains('plugin') -and
        $config['plugin'] -is [System.Collections.IList]) {
        $updatedPlugins = [System.Collections.ArrayList]::new()
        foreach ($entry in $config['plugin']) {
            $candidate = $entry
            if ($entry -is [System.Collections.IList] -and $entry.Count -gt 0) {
                $candidate = $entry[0]
            }
            if (Test-EffortControlEntry -Value $candidate) {
                $removedRegistrations += 1
            } else {
                [void]$updatedPlugins.Add($entry)
            }
        }
        if ($removedRegistrations -gt 0) {
            $config['plugin'] = @($updatedPlugins)
            $configChanged = $true
        }
    }
}

$entryExists = Test-Path -LiteralPath $targetPath
$supportExists = Test-Path -LiteralPath $targetSupportDir

Write-Host "Legacy effort-control entry: $targetPath"
Write-Host "Legacy effort-control support dir: $targetSupportDir"
Write-Host "OpenCode TUI config: $configPath"
Write-Host "Matching TUI registrations: $removedRegistrations"
Write-Host "DryRun: $DryRun"

if (-not $entryExists -and -not $supportExists -and -not $configChanged) {
    Write-Host "No legacy effort-control assets or TUI registrations found."
    return
}

if (-not $NoBackup) {
    $stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
    $suffix = [Guid]::NewGuid().ToString('N').Substring(0, 8)
    $backupDir = Join-Path $openCodeRoot ".backup-agents-pipeline-effort-control-retirement-$stamp-$suffix"
    if ($DryRun) {
        Write-Host "Would create retirement backup: $backupDir"
    } else {
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        if ($entryExists) {
            Copy-Item -LiteralPath $targetPath -Destination (Join-Path $backupDir (Split-Path -Leaf $targetPath)) -Force
        }
        if ($supportExists) {
            Copy-Item -LiteralPath $targetSupportDir -Destination (Join-Path $backupDir 'effort-control') -Recurse -Force
        }
        if ($configChanged) {
            Copy-Item -LiteralPath $configPath -Destination (Join-Path $backupDir 'tui.json') -Force
        }
        Write-Host "Retirement backup created: $backupDir"
    }
}

if ($DryRun) {
    if ($entryExists) {
        Write-Host "Would remove legacy entry: $targetPath"
    }
    if ($supportExists) {
        Write-Host "Would remove legacy support dir: $targetSupportDir"
    }
    if ($configChanged) {
        Write-Host "Would remove $removedRegistrations effort-control registration(s) from: $configPath"
    }
    Write-Host "Dry run complete. No files were changed."
    return
}

if ($entryExists) {
    Remove-Item -LiteralPath $targetPath -Force
    Write-Host "Removed legacy entry: $targetPath"
}
if ($supportExists) {
    Remove-Item -LiteralPath $targetSupportDir -Recurse -Force
    Write-Host "Removed legacy support dir: $targetSupportDir"
}
if ($configChanged) {
    $configJson = $config | ConvertTo-Json -Depth 100
    $temporaryConfig = "$configPath.agents-pipeline-$([Guid]::NewGuid().ToString('N')).tmp"
    try {
        [System.IO.File]::WriteAllText(
            $temporaryConfig,
            $configJson + [Environment]::NewLine,
            [System.Text.UTF8Encoding]::new($false)
        )
        Move-Item -LiteralPath $temporaryConfig -Destination $configPath -Force
    } finally {
        if (Test-Path -LiteralPath $temporaryConfig) {
            Remove-Item -LiteralPath $temporaryConfig -Force
        }
    }
    Write-Host "Removed $removedRegistrations effort-control registration(s) from: $configPath"
}

Write-Host "Legacy OpenCode effort-control cleanup complete."

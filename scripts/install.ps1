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
$manifestName = ".agents-pipeline-manifest.txt"

if (-not (Test-Path -LiteralPath $sourceRoot -PathType Container)) {
    throw "Source directory not found: $sourceRoot"
}

function Get-RelativeInstallPath {
    param(
        [string]$BasePath,
        [string]$ChildPath
    )

    return [System.IO.Path]::GetRelativePath($BasePath, $ChildPath).Replace('\', '/')
}

function Remove-EmptyParentDirectories {
    param(
        [string]$StartPath,
        [string]$StopPath
    )

    $current = Split-Path -Parent $StartPath
    while ($current -and $current.StartsWith($StopPath, [System.StringComparison]::OrdinalIgnoreCase)) {
        if ($current -eq $StopPath) {
            break
        }
        if (-not (Test-Path -LiteralPath $current -PathType Container)) {
            break
        }
        $children = Get-ChildItem -LiteralPath $current -Force -ErrorAction SilentlyContinue
        if ($children.Count -gt 0) {
            break
        }
        Remove-Item -LiteralPath $current -Force
        $current = Split-Path -Parent $current
    }
}

if (-not $Target) {
    $Target = Get-DefaultTarget
}

if ($Target -match '^-{1,2}[A-Za-z]') {
    throw "Target path '$Target' looks like a switch, not a filesystem path. Pass -Target explicitly if needed."
}

$targetPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Target)
$items = @("agents", "commands", "protocols", "tools")
$exampleConfig = Join-Path $repoRoot "opencode.json.example"
$manifestPath = Join-Path $targetPath $manifestName

$managedRelativePaths = New-Object System.Collections.Generic.List[string]
foreach ($item in $items) {
    $src = Join-Path $sourceRoot $item
    if (-not (Test-Path -LiteralPath $src -PathType Container)) {
        continue
    }
    Get-ChildItem -LiteralPath $src -Recurse -File | ForEach-Object {
        $managedRelativePaths.Add((Get-RelativeInstallPath -BasePath $sourceRoot -ChildPath $_.FullName))
    }
}
if (Test-Path -LiteralPath $exampleConfig -PathType Leaf) {
    $managedRelativePaths.Add("opencode.json.example")
}
$managedRelativePaths = $managedRelativePaths | Sort-Object -Unique

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
if (-not $needsBackup -and (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
    $needsBackup = $true
}
if (-not $needsBackup -and (Test-Path -LiteralPath (Join-Path $targetPath "opencode.json.example") -PathType Leaf)) {
    $needsBackup = $true
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
        $destExampleConfig = Join-Path $targetPath "opencode.json.example"
        if (Test-Path -LiteralPath $destExampleConfig -PathType Leaf) {
            Copy-Item -LiteralPath $destExampleConfig -Destination $backupDir -Force
        }
        if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
            Copy-Item -LiteralPath $manifestPath -Destination $backupDir -Force
        }
        Write-Host "Backup created: $backupDir"
    }
}

if ($DryRun) {
    Write-Host "Would ensure target directory exists: $targetPath"
} else {
    New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
}

if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
    $previousManagedPaths = Get-Content -LiteralPath $manifestPath | Where-Object { $_ }
    $managedLookup = @{}
    foreach ($relativePath in $managedRelativePaths) {
        $managedLookup[$relativePath] = $true
    }

    foreach ($relativePath in $previousManagedPaths) {
        if ($managedLookup.ContainsKey($relativePath)) {
            continue
        }
        $stalePath = Join-Path $targetPath ($relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
        if (-not (Test-Path -LiteralPath $stalePath -PathType Leaf)) {
            continue
        }
        if ($DryRun) {
            Write-Host "Would remove stale managed file: $stalePath"
            continue
        }
        Remove-Item -LiteralPath $stalePath -Force
        Remove-EmptyParentDirectories -StartPath $stalePath -StopPath $targetPath
        Write-Host "Removed stale managed file: $stalePath"
    }
} elseif (-not $DryRun) {
    Write-Host "No previous installer manifest found; stale cleanup starts after this install."
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
    Write-Host "Would write installer manifest: $manifestPath"
} else {
    Set-Content -LiteralPath $manifestPath -Value $managedRelativePaths -Encoding utf8
    Write-Host "Updated manifest: $manifestPath"
}

if ($DryRun) {
    Write-Host "Dry run complete. No files were written."
} else {
    Write-Host "Install complete."
}

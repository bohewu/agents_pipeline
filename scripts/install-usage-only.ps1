#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [string]$OpenCodeTarget,
    [string]$UsagePluginTarget,
    [switch]$DryRun,
    [switch]$NoBackup
)

$ErrorActionPreference = "Stop"

function Get-DefaultOpenCodeTarget {
    if ($env:XDG_CONFIG_HOME) {
        return Join-Path $env:XDG_CONFIG_HOME "opencode"
    }
    return Join-Path $HOME ".config/opencode"
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

function Invoke-InstallScript {
    param(
        [string]$ScriptPath,
        [hashtable]$Params
    )

    $global:LASTEXITCODE = 0
    & $ScriptPath @Params
    if (-not $?) {
        throw "Installer failed: $ScriptPath"
    }
    if ($null -ne $LASTEXITCODE -and $LASTEXITCODE -ne 0) {
        throw "Installer failed: $ScriptPath (exit code $LASTEXITCODE)"
    }
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..")
$sourceRoot = Join-Path $repoRoot "opencode"
$manifestName = ".agents-pipeline-usage-manifest.txt"
$managedRelativePaths = @(
    "agents/usage-inspector.md",
    "commands/usage.md",
    "tools/provider-usage.ts",
    "tools/provider-usage.py"
)

if (-not $OpenCodeTarget) {
    $OpenCodeTarget = Get-DefaultOpenCodeTarget
}

if ($OpenCodeTarget -match '^-{1,2}[A-Za-z]') {
    throw "OpenCode target path '$OpenCodeTarget' looks like a switch, not a filesystem path."
}

$openCodeTargetPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($OpenCodeTarget)
$manifestPath = Join-Path $openCodeTargetPath $manifestName

if (-not $UsagePluginTarget) {
    $UsagePluginTarget = Join-Path $openCodeTargetPath "plugins/usage-status.js"
}

if ($UsagePluginTarget -match '^-{1,2}[A-Za-z]') {
    throw "Usage plugin target path '$UsagePluginTarget' looks like a switch, not a filesystem path."
}

Write-Host "Source root: $sourceRoot"
Write-Host "OpenCode target: $openCodeTargetPath"
Write-Host "Usage plugin target: $UsagePluginTarget"
Write-Host "DryRun: $DryRun"
Write-Host "Install scope: usage command/tool/plugin only"

if (-not $NoBackup) {
    $needsBackup = $false
    foreach ($relativePath in $managedRelativePaths) {
        $targetFile = Join-Path $openCodeTargetPath ($relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
        if (Test-Path -LiteralPath $targetFile -PathType Leaf) {
            $needsBackup = $true
            break
        }
    }
    if (-not $needsBackup -and (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        $needsBackup = $true
    }

    if ($needsBackup) {
        $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
        $backupDir = Join-Path $openCodeTargetPath ".backup-agents-pipeline-usage-$stamp"
        if ($DryRun) {
            Write-Host "Would create backup: $backupDir"
        } else {
            New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
            foreach ($relativePath in $managedRelativePaths) {
                $targetFile = Join-Path $openCodeTargetPath ($relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
                if (Test-Path -LiteralPath $targetFile -PathType Leaf) {
                    $destinationDir = Join-Path $backupDir (Split-Path -Parent $relativePath)
                    New-Item -ItemType Directory -Path $destinationDir -Force | Out-Null
                    Copy-Item -LiteralPath $targetFile -Destination (Join-Path $destinationDir (Split-Path -Leaf $relativePath)) -Force
                }
            }
            if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
                Copy-Item -LiteralPath $manifestPath -Destination $backupDir -Force
            }
            Write-Host "Backup created: $backupDir"
        }
    }
}

if ($DryRun) {
    Write-Host "Would ensure OpenCode target exists: $openCodeTargetPath"
} else {
    New-Item -ItemType Directory -Path $openCodeTargetPath -Force | Out-Null
}

if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
    $currentLookup = @{}
    foreach ($relativePath in $managedRelativePaths) {
        $currentLookup[$relativePath] = $true
    }
    foreach ($relativePath in (Get-Content -LiteralPath $manifestPath | Where-Object { $_ })) {
        if ($currentLookup.ContainsKey($relativePath)) {
            continue
        }
        $stalePath = Join-Path $openCodeTargetPath ($relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
        if (-not (Test-Path -LiteralPath $stalePath -PathType Leaf)) {
            continue
        }
        if ($DryRun) {
            Write-Host "Would remove stale managed file: $stalePath"
            continue
        }
        Remove-Item -LiteralPath $stalePath -Force
        Remove-EmptyParentDirectories -StartPath $stalePath -StopPath $openCodeTargetPath
        Write-Host "Removed stale managed file: $stalePath"
    }
}

foreach ($relativePath in $managedRelativePaths) {
    $sourceFile = Join-Path $sourceRoot ($relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
    if (-not (Test-Path -LiteralPath $sourceFile -PathType Leaf)) {
        throw "Required source file not found: $sourceFile"
    }

    $targetFile = Join-Path $openCodeTargetPath ($relativePath.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
    $targetDir = Split-Path -Parent $targetFile
    if ($DryRun) {
        Write-Host "Would copy: $sourceFile -> $targetFile"
        continue
    }

    New-Item -ItemType Directory -Path $targetDir -Force | Out-Null
    Copy-Item -LiteralPath $sourceFile -Destination $targetFile -Force
    Write-Host "Copied: $sourceFile -> $targetFile"
}

if ($DryRun) {
    Write-Host "Would write manifest: $manifestPath"
} else {
    Set-Content -LiteralPath $manifestPath -Value $managedRelativePaths -Encoding utf8
    Write-Host "Updated manifest: $manifestPath"
}

$pluginParams = @{}
if ($DryRun) {
    $pluginParams.DryRun = $true
}
if ($NoBackup) {
    $pluginParams.NoBackup = $true
}
$pluginParams.Target = $UsagePluginTarget

Write-Host ""
Invoke-InstallScript -ScriptPath (Join-Path $scriptRoot "install-plugin-usage-status.ps1") -Params $pluginParams
Write-Host ""

if ($DryRun) {
    Write-Host "Usage-only install completed in dry-run mode."
} else {
    Write-Host "Usage-only install completed."
}

#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [string]$OpenCodeTarget,
    [string]$PluginTarget,
    [string]$UsagePluginTarget,
    [string]$EffortPluginTarget,
    [string]$CopilotTarget,
    [string]$ClaudeTarget,
    [string]$CodexTarget,
    [switch]$DryRun,
    [switch]$NoBackup,
    [switch]$ForceCodex
)

$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path

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

$openCodeParams = @{}
$pluginParams = @{}
$usagePluginParams = @{}
$effortPluginParams = @{}
$copilotParams = @{}
$claudeParams = @{}
$codexParams = @{}

foreach ($params in @($openCodeParams, $pluginParams, $usagePluginParams, $effortPluginParams, $copilotParams, $claudeParams, $codexParams)) {
    if ($DryRun) {
        $params.DryRun = $true
    }
    if ($NoBackup) {
        $params.NoBackup = $true
    }
}

if ($OpenCodeTarget) {
    $openCodeParams.Target = $OpenCodeTarget
}
if ($PluginTarget) {
    $pluginParams.Target = $PluginTarget
} elseif ($OpenCodeTarget) {
    $pluginParams.Target = Join-Path $OpenCodeTarget "plugins/status-runtime.js"
}
if ($UsagePluginTarget) {
    $usagePluginParams.Target = $UsagePluginTarget
} elseif ($PluginTarget) {
    $usagePluginParams.Target = Join-Path (Split-Path -Parent $PluginTarget) "usage-status.js"
} elseif ($OpenCodeTarget) {
    $usagePluginParams.Target = Join-Path $OpenCodeTarget "plugins/usage-status.js"
}
if ($EffortPluginTarget) {
    $effortPluginParams.Target = $EffortPluginTarget
} elseif ($PluginTarget) {
    $effortPluginParams.Target = Join-Path (Split-Path -Parent $PluginTarget) "effort-control.js"
} elseif ($OpenCodeTarget) {
    $effortPluginParams.Target = Join-Path $OpenCodeTarget "plugins/effort-control.js"
}
if ($CopilotTarget) {
    $copilotParams.Target = $CopilotTarget
}
if ($ClaudeTarget) {
    $claudeParams.Target = $ClaudeTarget
}
if ($CodexTarget) {
    $codexParams.Target = $CodexTarget
}
if ($ForceCodex) {
    $codexParams.Force = $true
}

Write-Host "Running local installers with shared flags: dry-run=$DryRun, no-backup=$NoBackup"
Write-Host "Note: OpenCode plugin installation applies to OpenCode only."
Write-Host ""

Invoke-InstallScript -ScriptPath (Join-Path $scriptRoot "install.ps1") -Params $openCodeParams
Write-Host ""
Invoke-InstallScript -ScriptPath (Join-Path $scriptRoot "install-plugin-status-runtime.ps1") -Params $pluginParams
Write-Host ""
Invoke-InstallScript -ScriptPath (Join-Path $scriptRoot "install-plugin-usage-status.ps1") -Params $usagePluginParams
Write-Host ""
Invoke-InstallScript -ScriptPath (Join-Path $scriptRoot "install-plugin-effort-control.ps1") -Params $effortPluginParams
Write-Host ""
Invoke-InstallScript -ScriptPath (Join-Path $scriptRoot "install-copilot.ps1") -Params $copilotParams
Write-Host ""
Invoke-InstallScript -ScriptPath (Join-Path $scriptRoot "install-claude.ps1") -Params $claudeParams
Write-Host ""
Invoke-InstallScript -ScriptPath (Join-Path $scriptRoot "install-codex.ps1") -Params $codexParams
Write-Host ""

if ($DryRun) {
    Write-Host "All local installers completed in dry-run mode."
} else {
    Write-Host "All local installers completed."
}

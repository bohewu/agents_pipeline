#!/usr/bin/env pwsh
$ErrorActionPreference = 'Stop'

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$remover = Join-Path $repoRoot 'scripts/remove-plugin-effort-control.ps1'
$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ('agents-pipeline-remove-effort-test-' + [Guid]::NewGuid().ToString('N'))
$previousXdgConfigHome = $env:XDG_CONFIG_HOME

function ConvertTo-FileUri {
    param([string]$Path)

    $builder = [UriBuilder]::new()
    $builder.Scheme = 'file'
    $builder.Host = ''
    $builder.Path = $Path
    return $builder.Uri.AbsoluteUri
}

function Write-Fixture {
    param(
        [string]$TargetFile,
        [string]$ConfigPath
    )

    $supportDir = Join-Path (Split-Path -Parent $TargetFile) 'effort-control'
    New-Item -ItemType Directory -Path $supportDir -Force | Out-Null
    Set-Content -LiteralPath $TargetFile -Value 'legacy entry' -Encoding utf8
    Set-Content -LiteralPath (Join-Path $supportDir 'index.js') -Value 'legacy support' -Encoding utf8

    $plugins = [System.Collections.ArrayList]::new()
    [void]$plugins.Add('./plugins/effort-control/index.js')
    [void]$plugins.Add(@((ConvertTo-FileUri -Path (Join-Path $supportDir 'index.js')), @{ legacyOption = $true }))
    [void]$plugins.Add((Join-Path $supportDir 'index.js'))
    [void]$plugins.Add((ConvertTo-FileUri -Path $TargetFile))
    [void]$plugins.Add('https://example.invalid/plugins/effort-control/index.js')
    [void]$plugins.Add('./plugins/usage-status/index.js')
    [void]$plugins.Add(@('./plugins/other/index.js', @{ keep = $true }))

    $config = @{
        '$schema' = 'https://opencode.ai/tui.json'
        theme = 'keep-me'
        plugin = @($plugins)
    }
    New-Item -ItemType Directory -Path (Split-Path -Parent $ConfigPath) -Force | Out-Null
    $config | ConvertTo-Json -Depth 20 | Set-Content -LiteralPath $ConfigPath -Encoding utf8
}

function Assert-TuiPreserved {
    param([string]$ConfigPath)

    $config = Get-Content -LiteralPath $ConfigPath -Raw | ConvertFrom-Json
    if ($config.theme -ne 'keep-me') {
        throw 'Retirement cleanup changed an unrelated TUI property.'
    }
    $plugins = @($config.plugin)
    if ($plugins.Count -ne 3) {
        throw "Expected three unrelated plugin entries after cleanup, found $($plugins.Count)."
    }
    if ($plugins[0] -ne 'https://example.invalid/plugins/effort-control/index.js') {
        throw 'Retirement cleanup removed a non-file URI with a similar path.'
    }
    if ($plugins[1] -ne './plugins/usage-status/index.js') {
        throw 'Retirement cleanup changed the usage-status registration.'
    }
    if ($plugins[2][0] -ne './plugins/other/index.js' -or -not $plugins[2][1].keep) {
        throw 'Retirement cleanup changed an unrelated tuple plugin entry.'
    }
}

try {
    $defaultXdg = Join-Path $tempRoot 'default-xdg'
    $defaultRoot = Join-Path $defaultXdg 'opencode'
    $defaultTarget = Join-Path $defaultRoot 'plugins/effort-control.js'
    $defaultSupport = Join-Path $defaultRoot 'plugins/effort-control'
    $defaultConfig = Join-Path $defaultRoot 'tui.json'
    Write-Fixture -TargetFile $defaultTarget -ConfigPath $defaultConfig
    $env:XDG_CONFIG_HOME = $defaultXdg

    $digestBefore = (Get-FileHash -LiteralPath $defaultConfig -Algorithm SHA256).Hash
    $dryRunOutput = & $remover -DryRun 6>&1 | Out-String
    $digestAfter = (Get-FileHash -LiteralPath $defaultConfig -Algorithm SHA256).Hash
    if ($digestBefore -ne $digestAfter -or
        -not (Test-Path -LiteralPath $defaultTarget) -or
        -not (Test-Path -LiteralPath $defaultSupport)) {
        throw 'PowerShell dry-run changed legacy effort-control files.'
    }
    if ($dryRunOutput -notmatch 'Dry run complete\. No files were changed\.') {
        throw 'PowerShell dry-run did not report completion.'
    }

    & $remover
    if ((Test-Path -LiteralPath $defaultTarget) -or (Test-Path -LiteralPath $defaultSupport)) {
        throw 'PowerShell default cleanup did not remove legacy plugin assets.'
    }
    Assert-TuiPreserved -ConfigPath $defaultConfig

    $backupDir = Get-ChildItem -LiteralPath $defaultRoot -Directory -Force -Filter '.backup-agents-pipeline-effort-control-retirement-*' | Select-Object -First 1
    if (-not $backupDir -or
        -not (Test-Path -LiteralPath (Join-Path $backupDir.FullName 'effort-control.js')) -or
        -not (Test-Path -LiteralPath (Join-Path $backupDir.FullName 'effort-control/index.js')) -or
        -not (Test-Path -LiteralPath (Join-Path $backupDir.FullName 'tui.json'))) {
        throw 'PowerShell cleanup did not preserve the expected retirement backup.'
    }

    $customRoot = Join-Path $tempRoot 'custom/opencode'
    $customTarget = Join-Path $customRoot 'plugins/legacy-effort-entry.js'
    $customSupport = Join-Path $customRoot 'plugins/effort-control'
    $customConfig = Join-Path $customRoot 'tui.json'
    Write-Fixture -TargetFile $customTarget -ConfigPath $customConfig

    & $remover -Target $customTarget -NoBackup
    if ((Test-Path -LiteralPath $customTarget) -or (Test-Path -LiteralPath $customSupport)) {
        throw 'PowerShell custom-target cleanup did not remove legacy plugin assets.'
    }
    Assert-TuiPreserved -ConfigPath $customConfig
    if (Get-ChildItem -LiteralPath $customRoot -Directory -Force -Filter '.backup-agents-pipeline-effort-control-retirement-*') {
        throw '-NoBackup unexpectedly created a PowerShell retirement backup.'
    }

    & $remover -Target $customTarget -NoBackup
    Write-Host 'PowerShell effort-control retirement tests passed.'
} finally {
    if ($null -eq $previousXdgConfigHome) {
        Remove-Item Env:XDG_CONFIG_HOME -ErrorAction SilentlyContinue
    } else {
        $env:XDG_CONFIG_HOME = $previousXdgConfigHome
    }
    if (Test-Path -LiteralPath $tempRoot) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}

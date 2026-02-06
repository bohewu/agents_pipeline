#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [string]$Repo = "bohewu/agents_pipeline",
    [string]$Version = "latest",
    [string]$Target,
    [switch]$NoBackup,
    [switch]$DryRun,
    [switch]$KeepTemp
)

$ErrorActionPreference = "Stop"

function Get-ReleaseApiUrl {
    param(
        [string]$RepoName,
        [string]$VersionValue
    )

    if ($VersionValue -eq "latest") {
        return "https://api.github.com/repos/$RepoName/releases/latest"
    }

    $tag = if ($VersionValue.StartsWith("v")) { $VersionValue } else { "v$VersionValue" }
    return "https://api.github.com/repos/$RepoName/releases/tags/$tag"
}

$apiUrl = Get-ReleaseApiUrl -RepoName $Repo -VersionValue $Version
$headers = @{
    "Accept" = "application/vnd.github+json"
    "User-Agent" = "agents-pipeline-bootstrap"
}

Write-Host "Release API: $apiUrl"

$release = Invoke-RestMethod -Headers $headers -Uri $apiUrl -Method Get
if (-not $release) {
    throw "Failed to resolve release metadata."
}

$asset = $release.assets |
    Where-Object { $_.name -match "^agents-pipeline-opencode-bundle-.*\.zip$" } |
    Select-Object -First 1

if (-not $asset) {
    throw "No release zip asset found matching agents-pipeline-opencode-bundle-*.zip"
}

$checksumAsset = $release.assets |
    Where-Object { $_.name -match "^agents-pipeline-opencode-bundle-.*\.SHA256SUMS\.txt$" } |
    Select-Object -First 1

if (-not $checksumAsset) {
    throw "No checksum asset found matching agents-pipeline-opencode-bundle-*.SHA256SUMS.txt"
}

Write-Host "Selected asset: $($asset.name)"
Write-Host "Download URL: $($asset.browser_download_url)"
Write-Host "Checksum asset: $($checksumAsset.name)"
if ($Target) {
    Write-Host "Install target override: $Target"
}

if ($DryRun) {
    Write-Host "Dry run complete. No files were downloaded or installed."
    return
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("agents-pipeline-bootstrap-" + [Guid]::NewGuid().ToString("N"))
$archivePath = Join-Path $tempRoot $asset.name
$checksumsPath = Join-Path $tempRoot $checksumAsset.name
$extractRoot = Join-Path $tempRoot "extract"

try {
    New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null
    New-Item -ItemType Directory -Path $extractRoot -Force | Out-Null

    Invoke-WebRequest -Headers $headers -Uri $asset.browser_download_url -OutFile $archivePath
    Invoke-WebRequest -Headers $headers -Uri $checksumAsset.browser_download_url -OutFile $checksumsPath

    $expectedHash = $null
    foreach ($line in Get-Content -LiteralPath $checksumsPath) {
        if ($line -match "^\s*([A-Fa-f0-9]{64})\s+\*?(.+)$") {
            $assetName = $matches[2].Trim()
            if ($assetName -eq $asset.name) {
                $expectedHash = $matches[1].ToLowerInvariant()
                break
            }
        }
    }

    if (-not $expectedHash) {
        throw "Could not find checksum for asset '$($asset.name)' in '$($checksumAsset.name)'."
    }

    $actualHash = (Get-FileHash -LiteralPath $archivePath -Algorithm SHA256).Hash.ToLowerInvariant()
    if ($actualHash -ne $expectedHash) {
        throw "Checksum verification failed for '$($asset.name)'. Expected $expectedHash but got $actualHash."
    }

    Write-Host "Checksum verified: $($asset.name)"

    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot -Force

    $bundleDir = Get-ChildItem -Path $extractRoot -Directory | Select-Object -First 1
    if (-not $bundleDir) {
        throw "Bundle root directory not found after extraction."
    }

    $installScript = Join-Path $bundleDir.FullName "scripts/install.ps1"
    if (-not (Test-Path -LiteralPath $installScript -PathType Leaf)) {
        throw "Install script not found in bundle: $installScript"
    }

    $installArgs = @()
    if ($Target) {
        $installArgs += @("-Target", $Target)
    }
    if ($NoBackup) {
        $installArgs += "-NoBackup"
    }

    & $installScript @installArgs
}
finally {
    if (-not $KeepTemp -and (Test-Path -LiteralPath $tempRoot)) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}

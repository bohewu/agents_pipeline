#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [string]$Repo = "bohewu/agents_pipeline",
    [string]$Version = "latest",
    [string]$OpenCodeTarget,
    [string]$PluginTarget,
    [string]$UsagePluginTarget,
    [string]$EffortPluginTarget,
    [string]$CopilotTarget,
    [string]$ClaudeTarget,
    [string]$CodexTarget,
    [switch]$NoBackup,
    [switch]$ForceCodex,
    [switch]$DryRun,
    [switch]$KeepTemp,
    [string]$AgentProfile,
    [string]$ModelSet,
    [string]$ProfileDir,
    [string]$ModelSetDir,
    [string]$UniformModel
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

function Resolve-BundleDirectory {
    param(
        [string]$ExtractRoot
    )

    if ((Test-Path -LiteralPath (Join-Path $ExtractRoot "scripts") -PathType Container) -and
        (Test-Path -LiteralPath (Join-Path $ExtractRoot "opencode") -PathType Container)) {
        return $ExtractRoot
    }

    $directories = Get-ChildItem -Path $ExtractRoot -Directory | Select-Object -First 2
    if ($directories.Count -eq 1) {
        return $directories[0].FullName
    }

    throw "Bundle root directory not found after extraction."
}

function Test-ReleaseBundle {
    param(
        [string]$BundleDir
    )

    $requiredPaths = @(
        (Join-Path $BundleDir "opencode/plugins/status-runtime.js"),
        (Join-Path $BundleDir "opencode/plugins/status-runtime"),
        (Join-Path $BundleDir "opencode/plugins/usage-status.js"),
        (Join-Path $BundleDir "opencode/plugins/usage-status"),
        (Join-Path $BundleDir "opencode/plugins/effort-control.js"),
        (Join-Path $BundleDir "opencode/plugins/effort-control"),
        (Join-Path $BundleDir "scripts/install-all-local.ps1"),
        (Join-Path $BundleDir "scripts/install-plugin-status-runtime.ps1"),
        (Join-Path $BundleDir "scripts/install-plugin-usage-status.ps1"),
        (Join-Path $BundleDir "scripts/install-plugin-effort-control.ps1"),
        (Join-Path $BundleDir "scripts/install.ps1"),
        (Join-Path $BundleDir "scripts/install-copilot.ps1"),
        (Join-Path $BundleDir "scripts/install-claude.ps1"),
        (Join-Path $BundleDir "scripts/install-codex.ps1")
    )

    foreach ($requiredPath in $requiredPaths) {
        if (-not (Test-Path -LiteralPath $requiredPath)) {
            throw "Bundle verification failed. Missing required path: $requiredPath"
        }
    }
}

function Test-GhAttestationSupport {
    param(
        [string]$AssetName
    )

    if (-not (Get-Command gh -ErrorAction SilentlyContinue)) {
        Write-Verbose "Skipping attestation verification for $AssetName`: gh CLI not found."
        return $false
    }

    & gh attestation verify --help *> $null
    if ($LASTEXITCODE -ne 0) {
        Write-Verbose "Skipping attestation verification for $AssetName`: installed gh CLI does not support 'gh attestation verify'."
        return $false
    }

    return $true
}

function Verify-ReleaseAttestation {
    param(
        [string]$ArchivePath,
        [string]$RepoName,
        [string]$ReleaseTag,
        [string]$AssetName
    )

    if (-not (Test-GhAttestationSupport -AssetName $AssetName)) {
        return
    }

    Write-Verbose "Verifying attestation: $AssetName"
    & gh attestation verify $ArchivePath --repo $RepoName --signer-workflow "$RepoName/.github/workflows/release-bundle.yml" --source-ref "refs/tags/$ReleaseTag" --deny-self-hosted-runners
    if ($LASTEXITCODE -ne 0) {
        throw "Attestation verification failed for '$AssetName'."
    }
    Write-Verbose "Attestation verified: $AssetName"
}

foreach ($targetValue in @($OpenCodeTarget, $PluginTarget, $UsagePluginTarget, $EffortPluginTarget, $CopilotTarget, $ClaudeTarget, $CodexTarget)) {
    if ($targetValue -and $targetValue -match '^-{1,2}[A-Za-z]') {
        throw "Target path '$targetValue' looks like a switch, not a filesystem path. Pass the explicit target parameter with a path value."
    }
}

$apiUrl = Get-ReleaseApiUrl -RepoName $Repo -VersionValue $Version
$headers = @{
    "Accept" = "application/vnd.github+json"
    "User-Agent" = "agents-pipeline-bootstrap-all-local"
}

Write-Host "Release API: $apiUrl"

$release = Invoke-RestMethod -Headers $headers -Uri $apiUrl -Method Get
if (-not $release) {
    throw "Failed to resolve release metadata."
}

$releaseTag = [string]$release.tag_name
if ([string]::IsNullOrWhiteSpace($releaseTag)) {
    throw "Release metadata missing tag_name."
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

Write-Verbose "Resolved release tag: $releaseTag"
Write-Host "Selected asset: $($asset.name)"
Write-Host "Download URL: $($asset.browser_download_url)"
Write-Host "Checksum asset: $($checksumAsset.name)"
Write-Host "Install scope: all supported bundle deliverables"

if ($DryRun) {
    Write-Host "Dry run complete. No files were downloaded or installed."
    return
}

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("agents-pipeline-bootstrap-all-local-" + [Guid]::NewGuid().ToString("N"))
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
    Verify-ReleaseAttestation -ArchivePath $archivePath -RepoName $Repo -ReleaseTag $releaseTag -AssetName $asset.name

    Expand-Archive -LiteralPath $archivePath -DestinationPath $extractRoot -Force

    $bundleDir = Resolve-BundleDirectory -ExtractRoot $extractRoot
    Test-ReleaseBundle -BundleDir $bundleDir

    $installScript = Join-Path $bundleDir "scripts/install-all-local.ps1"
    if (-not (Test-Path -LiteralPath $installScript -PathType Leaf)) {
        throw "Install script not found in bundle: $installScript"
    }

    $installParams = @{}
    if ($OpenCodeTarget) {
        $installParams.OpenCodeTarget = $OpenCodeTarget
    }
    if ($PluginTarget) {
        $installParams.PluginTarget = $PluginTarget
    }
    if ($UsagePluginTarget) {
        $installParams.UsagePluginTarget = $UsagePluginTarget
    }
    if ($EffortPluginTarget) {
        $installParams.EffortPluginTarget = $EffortPluginTarget
    }
    if ($CopilotTarget) {
        $installParams.CopilotTarget = $CopilotTarget
    }
    if ($ClaudeTarget) {
        $installParams.ClaudeTarget = $ClaudeTarget
    }
    if ($CodexTarget) {
        $installParams.CodexTarget = $CodexTarget
    }
    if ($NoBackup) {
        $installParams.NoBackup = $true
    }
    if ($ForceCodex) {
        $installParams.ForceCodex = $true
    }
    if ($AgentProfile) {
        $installParams.AgentProfile = $AgentProfile
    }
    if ($ModelSet) {
        $installParams.ModelSet = $ModelSet
    }
    if ($ProfileDir) {
        $installParams.ProfileDir = $ProfileDir
    }
    if ($ModelSetDir) {
        $installParams.ModelSetDir = $ModelSetDir
    }
    if ($UniformModel) {
        $installParams.UniformModel = $UniformModel
    }

    & $installScript @installParams
}
finally {
    if (-not $KeepTemp -and (Test-Path -LiteralPath $tempRoot)) {
        Remove-Item -LiteralPath $tempRoot -Recurse -Force
    }
}

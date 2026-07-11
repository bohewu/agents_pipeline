#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [string]$Repo = "bohewu/agents_pipeline",
    [string]$Version = "latest",
    [string]$Target,
    [switch]$NoBackup,
    [switch]$DryRun,
    [switch]$KeepTemp,
    [string]$AgentProfile,
    [string]$ModelSet,
    [string]$ProfileDir,
    [string]$ModelSetDir,
    [string]$UniformModel
)

$ErrorActionPreference = "Stop"

function Assert-GeneratedShellPath {
    param([string]$Value, [string]$Label)

    $candidate = $Value
    if ([System.IO.Path]::DirectorySeparatorChar -eq [char]0x5c) {
        $candidate = $candidate.Replace([char]0x5c, [char]0x2f)
    }
    foreach ($character in $candidate.ToCharArray()) {
        if ([char]::IsControl($character) -or [int]$character -in @(0x24, 0x60, 0x22, 0x5c)) {
            throw "$Label contains a shell-active or control character that is unsafe in generated shell instructions."
        }
    }
}

if ($PSBoundParameters.ContainsKey("Target") -and [string]::IsNullOrWhiteSpace($Target)) {
    throw "Target path must not be empty."
}
if ($PSBoundParameters.ContainsKey("Target") -and $Target.TrimStart() -match '^-{1,2}[A-Za-z]') {
    throw "Target path '$Target' looks like a switch, not a filesystem path. Pass -Target explicitly if needed."
}
Assert-GeneratedShellPath -Value $(
    if ($Target) { $Target } else { Join-Path (Join-Path $HOME ".copilot") "agents" }
) -Label "Target path"

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

function Assert-NeutralBundleRelease {
    param([string]$ReleaseTag)

    $match = [regex]::Match($ReleaseTag, '^v?(\d+)\.(\d+)\.(\d+)(?:[-+].*)?$')
    if (-not $match.Success) {
        throw "Unsupported release tag format: $ReleaseTag"
    }
    $resolvedVersion = [version]::new(
        [int]$match.Groups[1].Value,
        [int]$match.Groups[2].Value,
        [int]$match.Groups[3].Value
    )
    if ($resolvedVersion -lt [version]"0.28.0") {
        throw "The current neutral Copilot bootstrap supports v0.28.0 or newer. For an older release, use the bootstrap shipped with that release."
    }
}

function Resolve-BundleDirectory {
    param(
        [string]$ExtractRoot
    )

    if ((Test-Path -LiteralPath (Join-Path $ExtractRoot "scripts") -PathType Container) -and
        (Test-Path -LiteralPath (Join-Path $ExtractRoot "agents") -PathType Container)) {
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
        (Join-Path $BundleDir "agents"),
        (Join-Path $BundleDir "AGENTS.md"),
        (Join-Path $BundleDir "modes.json"),
        (Join-Path $BundleDir "tools/agent-profiles"),
        (Join-Path $BundleDir "tools/agent-profile.py"),
        (Join-Path $BundleDir "tools/status-event.js"),
        (Join-Path $BundleDir "protocols"),
        (Join-Path $BundleDir "skills"),
        (Join-Path $BundleDir "runtimes/copilot/model-sets"),
        (Join-Path $BundleDir "scripts/export-copilot-agents.py"),
        (Join-Path $BundleDir "scripts/install-copilot.ps1"),
        (Join-Path $BundleDir "scripts/path_safety.py"),
        (Join-Path $BundleDir "scripts/sync-runtime-support.py")
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

$apiUrl = Get-ReleaseApiUrl -RepoName $Repo -VersionValue $Version
$headers = @{
    "Accept" = "application/vnd.github+json"
    "User-Agent" = "agents-pipeline-bootstrap-copilot"
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
Assert-NeutralBundleRelease -ReleaseTag $releaseTag

$asset = $release.assets |
    Where-Object { $_.name -match "^agents-pipeline-bundle-.*\.zip$" } |
    Select-Object -First 1

if (-not $asset) {
    throw "No release zip asset found matching agents-pipeline-bundle-*.zip"
}

$checksumAsset = $release.assets |
    Where-Object { $_.name -match "^agents-pipeline-bundle-.*\.SHA256SUMS\.txt$" } |
    Select-Object -First 1

if (-not $checksumAsset) {
    throw "No checksum asset found matching agents-pipeline-bundle-*.SHA256SUMS.txt"
}

Write-Verbose "Resolved release tag: $releaseTag"
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

$tempRoot = Join-Path ([System.IO.Path]::GetTempPath()) ("agents-pipeline-bootstrap-copilot-" + [Guid]::NewGuid().ToString("N"))
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

    $installScript = Join-Path $bundleDir "scripts/install-copilot.ps1"
    if (-not (Test-Path -LiteralPath $installScript -PathType Leaf)) {
        throw "Install script not found in bundle: $installScript"
    }

    $installParams = @{}
    if ($Target) {
        $installParams.Target = $Target
    }
    if ($NoBackup) {
        $installParams.NoBackup = $true
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

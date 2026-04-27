#!/usr/bin/env pwsh
[CmdletBinding()]
param()

$ErrorActionPreference = "Stop"
$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "..")
$psInstaller = Join-Path $repoRoot "opencode/tools/agent-profile.ps1"
$shInstaller = Join-Path $repoRoot "opencode/tools/agent-profile.sh"
$sourceAgents = Join-Path $repoRoot "opencode/agents"

$failures = 0

function Write-Pass($Name) { Write-Host "PASS $Name" }
function Write-Fail($Name, $Message) { $script:failures++; Write-Host "FAIL $Name - $Message" }

function Assert-True($Name, $Condition, $Message) {
    if ($Condition) { Write-Pass $Name } else { Write-Fail $Name $Message }
}

function Assert-Contains($Name, $Text, $Needle) {
    Assert-True $Name ($Text -like "*$Needle*") "Expected output to contain '$Needle'."
}

function Assert-FileExists($Name, $Path) {
    Assert-True $Name (Test-Path -LiteralPath $Path -PathType Leaf) "Expected file to exist: $Path"
}

function Assert-FileNotExists($Name, $Path) {
    Assert-True $Name (-not (Test-Path -LiteralPath $Path -PathType Leaf)) "Expected file not to exist: $Path"
}

function Assert-Equal($Name, $Actual, $Expected) {
    Assert-True $Name ($Actual -eq $Expected) "Expected '$Expected', got '$Actual'."
}

function Invoke-Captured {
    param([Parameter(Mandatory = $true)][string[]] $Command)
    $output = & $Command[0] @($Command[1..($Command.Count - 1)]) 2>&1 | Out-String
    return [pscustomobject]@{ ExitCode = $LASTEXITCODE; Output = $output }
}

function Get-SourceHashes {
    $hashes = @{}
    Get-ChildItem -LiteralPath $sourceAgents -Filter "*.md" -File | ForEach-Object {
        $hashes[$_.Name] = (Get-FileHash -Algorithm SHA256 -LiteralPath $_.FullName).Hash
    }
    return $hashes
}

function Assert-HashesEqual($Before, $After) {
    foreach ($key in $Before.Keys) {
        Assert-Equal "source unchanged $key" $After[$key] $Before[$key]
    }
}

try {
    $beforeHashes = Get-SourceHashes

    $list = Invoke-Captured @("pwsh", "-NoProfile", "-File", $psInstaller, "list")
    Assert-Equal "ps list exit" $list.ExitCode 0
    foreach ($needle in @("frugal", "balanced", "premium", "uniform", "openai", "anthropic", "google")) {
        Assert-Contains "ps list contains $needle" $list.Output $needle
    }

    $tmp = Join-Path ([System.IO.Path]::GetTempPath()) ("agent-profile-ps-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $tmp -Force | Out-Null
    try {
        $install = Invoke-Captured @("pwsh", "-NoProfile", "-File", $psInstaller, "install", "balanced", "-ModelSet", "anthropic", "-Workspace", $tmp)
        Assert-Equal "ps install exit" $install.ExitCode 0
        $manifestPath = Join-Path $tmp ".opencode/.agents-pipeline-agent-profile.json"
        $reviewerPath = Join-Path $tmp ".opencode/agents/reviewer.md"
        $peonPath = Join-Path $tmp ".opencode/agents/peon.md"
        Assert-FileExists "ps manifest exists" $manifestPath
        Assert-FileExists "ps reviewer exists" $reviewerPath
        Assert-FileExists "ps peon exists" $peonPath
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        Assert-Equal "ps manifest profile" $manifest.profile "balanced"
        Assert-Equal "ps manifest model set" $manifest.modelSet "anthropic"
        Assert-Equal "ps manifest tool" $manifest.tool "agents_pipeline.agent-profile"
        Assert-Contains "ps reviewer strong model" (Get-Content -LiteralPath $reviewerPath -Raw) "model: anthropic/claude-opus-4-7"
        Assert-Contains "ps peon mini model" (Get-Content -LiteralPath $peonPath -Raw) "model: anthropic/claude-haiku-4-5"
        Assert-HashesEqual $beforeHashes (Get-SourceHashes)

        $status = Invoke-Captured @("pwsh", "-NoProfile", "-File", $psInstaller, "status", "-Workspace", $tmp)
        Assert-Equal "ps status exit" $status.ExitCode 0
        Assert-Contains "ps status balanced" $status.Output "balanced"
        Assert-Contains "ps status anthropic" $status.Output "anthropic"

        $manualPath = Join-Path $tmp ".opencode/agents/manual-agent.md"
        Set-Content -LiteralPath $manualPath -Value "UNMANAGED SENTINEL" -Encoding utf8
        $clear = Invoke-Captured @("pwsh", "-NoProfile", "-File", $psInstaller, "clear", "-Workspace", $tmp)
        Assert-Equal "ps clear exit" $clear.ExitCode 0
        Assert-FileNotExists "ps manifest removed" $manifestPath
        Assert-FileNotExists "ps reviewer removed" $reviewerPath
        Assert-FileExists "ps manual preserved" $manualPath
    } finally {
        Remove-Item -LiteralPath $tmp -Recurse -Force -ErrorAction SilentlyContinue
    }

    $dryTmp = Join-Path ([System.IO.Path]::GetTempPath()) ("agent-profile-dry-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path $dryTmp -Force | Out-Null
    try {
        $dry = Invoke-Captured @("pwsh", "-NoProfile", "-File", $psInstaller, "install", "balanced", "-ModelSet", "openai", "-Workspace", $dryTmp, "-DryRun")
        Assert-Equal "ps dry run exit" $dry.ExitCode 0
        Assert-Contains "ps dry run output" $dry.Output "No files were written"
        Assert-FileNotExists "ps dry manifest absent" (Join-Path $dryTmp ".opencode/.agents-pipeline-agent-profile.json")
        Assert-FileNotExists "ps dry reviewer absent" (Join-Path $dryTmp ".opencode/agents/reviewer.md")
    } finally {
        Remove-Item -LiteralPath $dryTmp -Recurse -Force -ErrorAction SilentlyContinue
    }

    $forceTmp = Join-Path ([System.IO.Path]::GetTempPath()) ("agent-profile-force-" + [guid]::NewGuid().ToString("N"))
    New-Item -ItemType Directory -Path (Join-Path $forceTmp ".opencode/agents") -Force | Out-Null
    try {
        $reviewerPath = Join-Path $forceTmp ".opencode/agents/reviewer.md"
        Set-Content -LiteralPath $reviewerPath -Value "UNMANAGED SENTINEL" -Encoding utf8
        $skip = Invoke-Captured @("pwsh", "-NoProfile", "-File", $psInstaller, "install", "balanced", "-Workspace", $forceTmp)
        Assert-Equal "ps unmanaged skip exit" $skip.ExitCode 0
        Assert-Contains "ps unmanaged preserved" (Get-Content -LiteralPath $reviewerPath -Raw) "UNMANAGED SENTINEL"
        Assert-Contains "ps unmanaged warning" $skip.Output "skipped unmanaged"
        $force = Invoke-Captured @("pwsh", "-NoProfile", "-File", $psInstaller, "install", "balanced", "-Workspace", $forceTmp, "-Force")
        Assert-Equal "ps force exit" $force.ExitCode 0
        Assert-Contains "ps force reviewer model" (Get-Content -LiteralPath $reviewerPath -Raw) "model: openai/gpt-5.5"
    } finally {
        Remove-Item -LiteralPath $forceTmp -Recurse -Force -ErrorAction SilentlyContinue
    }

    $uniformFail = Invoke-Captured @("pwsh", "-NoProfile", "-File", $psInstaller, "install", "uniform", "-Workspace", ([System.IO.Path]::GetTempPath()))
    Assert-True "ps uniform without model fails" ($uniformFail.ExitCode -ne 0) "Expected uniform without model to fail."

    if (Get-Command bash -ErrorAction SilentlyContinue) {
        $shList = Invoke-Captured @("bash", $shInstaller, "list")
        Assert-Equal "sh list exit" $shList.ExitCode 0
        Assert-Contains "sh list model sets" $shList.Output "Model sets"

        $shTmp = Join-Path ([System.IO.Path]::GetTempPath()) ("agent-profile-sh-" + [guid]::NewGuid().ToString("N"))
        New-Item -ItemType Directory -Path $shTmp -Force | Out-Null
        try {
            $shInstall = Invoke-Captured @("bash", $shInstaller, "install", "balanced", "--model-set", "google", "--workspace", $shTmp)
            Assert-Equal "sh install exit" $shInstall.ExitCode 0
            $shReviewer = Join-Path $shTmp ".opencode/agents/reviewer.md"
            Assert-Contains "sh reviewer model" (Get-Content -LiteralPath $shReviewer -Raw) "model: google/gemini-3.1-pro-preview"
            $shManifest = Get-Content -LiteralPath (Join-Path $shTmp ".opencode/.agents-pipeline-agent-profile.json") -Raw | ConvertFrom-Json
            Assert-Equal "sh manifest model set" $shManifest.modelSet "google"
        } finally {
            Remove-Item -LiteralPath $shTmp -Recurse -Force -ErrorAction SilentlyContinue
        }
    }
} catch {
    Write-Fail "unexpected exception" $_.Exception.Message
}

if ($failures -gt 0) {
    Write-Host "Agent profile validation failed: $failures failure(s)."
    exit 1
}

Write-Host "Agent profile validation passed."

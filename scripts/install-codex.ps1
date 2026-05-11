#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [string]$Target,
    [string]$WorkspaceRoot,
    [switch]$DryRun,
    [switch]$NoBackup,
    [switch]$Force,
    [string]$AgentProfile,
    [string]$ModelSet,
    [string]$ProfileDir,
    [string]$ModelSetDir,
    [string]$UniformModel
)

$ErrorActionPreference = "Stop"

function Get-DefaultTarget {
    return Join-Path $HOME ".codex"
}

function Get-GlobalAgentsMergePath {
    param([string]$TargetPath)

    $overridePath = Join-Path $TargetPath "AGENTS.override.md"
    if (Test-Path -LiteralPath $overridePath -PathType Leaf) {
        $overrideContent = Get-Content -LiteralPath $overridePath -Raw
        if (-not [string]::IsNullOrWhiteSpace($overrideContent)) {
            return $overridePath
        }
    }

    return (Join-Path $TargetPath "AGENTS.md")
}

function Test-WindowsAppsPythonAlias {
    param([string]$CommandPath)

    return $CommandPath -like "*\Microsoft\WindowsApps\python*.exe"
}

function Get-PythonInvocation {
    $py = Get-Command -Name py -ErrorAction SilentlyContinue
    if ($py) {
        return @($py.Source, "-3")
    }

    foreach ($name in @("python", "python3")) {
        $command = Get-Command -Name $name -ErrorAction SilentlyContinue
        if (-not $command) {
            continue
        }
        if (Test-WindowsAppsPythonAlias -CommandPath $command.Source) {
            continue
        }
        return @($command.Source)
    }

    throw "Python runtime not found. Install Python or the py launcher. Windows Store python aliases are not supported for this installer."
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$assetRoot = Resolve-Path (Join-Path $scriptRoot "..")
$installedSourceAgents = Join-Path $assetRoot "agents"
if (Test-Path -LiteralPath $installedSourceAgents -PathType Container) {
    $sourceAgents = $installedSourceAgents
    $defaultProfileDir = Join-Path $assetRoot "tools/agent-profiles"
} else {
    $sourceAgents = Join-Path $assetRoot "opencode/agents"
    $defaultProfileDir = Join-Path $assetRoot "opencode/tools/agent-profiles"
}
$mergeScript = Join-Path $assetRoot "scripts/install-codex-config.py"
$modelFlags = [bool]($AgentProfile -or $ModelSet -or $ProfileDir -or $ModelSetDir -or $UniformModel)
if (-not $ProfileDir) {
    $ProfileDir = $defaultProfileDir
}
if (-not $ModelSetDir) {
    $ModelSetDir = Join-Path $assetRoot "codex/tools/model-sets"
}

if (-not (Test-Path -LiteralPath $sourceAgents -PathType Container)) {
    throw "Source agents directory not found: $sourceAgents"
}
if (-not (Test-Path -LiteralPath $mergeScript -PathType Leaf)) {
    throw "Codex install helper not found: $mergeScript"
}

if (-not $Target) {
    $Target = Get-DefaultTarget
}

if ($Target -match '^-{1,2}[A-Za-z]') {
    throw "Target path '$Target' looks like a switch, not a filesystem path. Pass -Target explicitly with a filesystem path value."
}

$targetPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Target)
$workspaceRootPath = $null
$workspaceAgentsPath = $null
$globalAgentsMergePath = $null
if ($WorkspaceRoot) {
    $workspaceRootPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($WorkspaceRoot)
    $expectedWorkspaceTarget = [System.IO.Path]::GetFullPath((Join-Path $workspaceRootPath ".codex"))
    if ([System.IO.Path]::GetFullPath($targetPath) -eq $expectedWorkspaceTarget) {
        $workspaceAgentsPath = Join-Path $workspaceRootPath "AGENTS.md"
    }
}
if (-not $workspaceAgentsPath) {
    $globalAgentsMergePath = Get-GlobalAgentsMergePath -TargetPath $targetPath
}
$pythonInvocation = @(Get-PythonInvocation)
$pythonCmd = $pythonInvocation[0]
$pythonArgs = @()
if ($pythonInvocation.Count -gt 1) {
    $pythonArgs = $pythonInvocation[1..($pythonInvocation.Count - 1)]
}

Write-Host "Source agents: $sourceAgents"
Write-Host "Target: $targetPath"
if ($workspaceRootPath) {
    Write-Host "Workspace root: $workspaceRootPath"
}
if ($globalAgentsMergePath) {
    Write-Host "Managed global AGENTS merge: $globalAgentsMergePath"
}
Write-Host "DryRun: $DryRun"
Write-Host "Managed merge: preserve non-agent Codex settings"
Write-Host "Cleanup: stale managed Codex agent outputs"

$existingConfig = $null
$existingRoles = @()
$existingManifest = $null
$existingSupportTree = $null
$existingWorkspaceAgents = $null
$existingGlobalAgents = @()
if (Test-Path -LiteralPath $targetPath -PathType Container) {
    $configPath = Join-Path $targetPath "config.toml"
    if (Test-Path -LiteralPath $configPath -PathType Leaf) {
        $existingConfig = Get-Item -LiteralPath $configPath
    }

    $manifestPath = Join-Path $targetPath ".agents-pipeline-codex-manifest.json"
    if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
        $existingManifest = Get-Item -LiteralPath $manifestPath
    }

    $agentsDir = Join-Path $targetPath "agents"
    if (Test-Path -LiteralPath $agentsDir -PathType Container) {
        $existingRoles = Get-ChildItem -Path $agentsDir -Filter "*.toml" -File -ErrorAction SilentlyContinue
    }

    $supportTree = Join-Path $targetPath "opencode"
    if (Test-Path -LiteralPath $supportTree -PathType Container) {
        $existingSupportTree = Get-Item -LiteralPath $supportTree
    }

    if ($globalAgentsMergePath) {
        foreach ($globalAgentsName in @("AGENTS.md", "AGENTS.override.md")) {
            $candidate = Join-Path $targetPath $globalAgentsName
            if (Test-Path -LiteralPath $candidate -PathType Leaf) {
                $existingGlobalAgents += Get-Item -LiteralPath $candidate
            }
        }
    }
}
if ($workspaceAgentsPath -and (Test-Path -LiteralPath $workspaceAgentsPath -PathType Leaf)) {
    $existingWorkspaceAgents = Get-Item -LiteralPath $workspaceAgentsPath
}

if (-not $NoBackup -and ($existingConfig -or $existingManifest -or $existingRoles.Count -gt 0 -or $existingSupportTree -or $existingWorkspaceAgents -or $existingGlobalAgents.Count -gt 0)) {
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $backupBase = if (Test-Path -LiteralPath $targetPath -PathType Container) {
        $targetPath
    } elseif ($workspaceRootPath) {
        $workspaceRootPath
    } else {
        Split-Path -Parent $targetPath
    }
    $backupDir = Join-Path $backupBase ".backup-agents-pipeline-codex-$stamp"
    if ($DryRun) {
        Write-Host "Would create backup: $backupDir"
    } else {
        New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
        if ($existingConfig) {
            Copy-Item -LiteralPath $existingConfig.FullName -Destination $backupDir -Force
        }
        if ($existingManifest) {
            Copy-Item -LiteralPath $existingManifest.FullName -Destination $backupDir -Force
        }
        if ($existingRoles.Count -gt 0) {
            $backupAgentsDir = Join-Path $backupDir "agents"
            New-Item -ItemType Directory -Path $backupAgentsDir -Force | Out-Null
            foreach ($item in $existingRoles) {
                Copy-Item -LiteralPath $item.FullName -Destination $backupAgentsDir -Force
            }
        }
        if ($existingSupportTree) {
            Copy-Item -LiteralPath $existingSupportTree.FullName -Destination $backupDir -Recurse -Force
        }
        if ($existingWorkspaceAgents) {
            Copy-Item -LiteralPath $existingWorkspaceAgents.FullName -Destination (Join-Path $backupDir "AGENTS.md") -Force
        }
        foreach ($item in $existingGlobalAgents) {
            Copy-Item -LiteralPath $item.FullName -Destination (Join-Path $backupDir $item.Name) -Force
        }
        Write-Host "Backup created: $backupDir"
    }
}

if ($DryRun) {
    Write-Host "Would ensure target directory exists: $targetPath"
} else {
    New-Item -ItemType Directory -Path $targetPath -Force | Out-Null
}

$exportArgs = @(
    $mergeScript,
    "--source-agents", $sourceAgents,
    "--target-dir", $targetPath,
    "--strict"
)
if ($DryRun) {
    $exportArgs += "--dry-run"
}
if ($WorkspaceRoot) {
    $exportArgs += @("--workspace-root", $WorkspaceRoot)
}
if ($AgentProfile) {
    $exportArgs += @("--agent-profile", $AgentProfile)
}
if ($ModelSet) {
    $exportArgs += @("--model-set", $ModelSet)
}
if ($modelFlags) {
    $exportArgs += @("--profile-dir", $ProfileDir, "--model-set-dir", $ModelSetDir)
}
if ($UniformModel) {
    $exportArgs += @("--uniform-model", $UniformModel)
}

& $pythonCmd @pythonArgs @exportArgs
if ($LASTEXITCODE -ne 0) {
    throw "Codex role export failed with exit code $LASTEXITCODE."
}

Write-Host ""
if ($globalAgentsMergePath) {
    Write-Host "Codex usage note: installer-managed global AGENTS routing lives at $globalAgentsMergePath."
    Write-Host "Manual snippet reference remains in docs/codex-mapping.md#global-custom-instructions-snippet if you are not using the installer."
} else {
    Write-Host "Codex usage note: the optional manual snippet is in docs/codex-mapping.md#global-custom-instructions-snippet."
}
Write-Host "Then use aliases like '使用flow ...' / 'use pipeline ...', or direct role-name prompts when needed."
Write-Host "Example: Have 'orchestrator-general' draft a plan and 'reviewer' validate the outcome."

if ($DryRun) {
    Write-Host "Dry run complete. No files were written."
} else {
    Write-Host "Install complete. Generated Codex config is ready at: $targetPath"
}

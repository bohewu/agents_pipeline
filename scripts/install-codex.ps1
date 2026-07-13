#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [string]$Target,
    [string]$WorkspaceRoot,
    [string]$GlobalAgentsTarget,
    [string]$UserSkillsRoot,
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

function Get-DefaultTarget {
    return Join-Path $HOME ".codex"
}

function Test-SamePath {
    param([string]$Left, [string]$Right)

    $leftFull = [System.IO.Path]::GetFullPath($Left)
    $rightFull = [System.IO.Path]::GetFullPath($Right)
    $comparison = if ([System.IO.Path]::DirectorySeparatorChar -eq [char]0x5c) {
        [System.StringComparison]::OrdinalIgnoreCase
    } else {
        [System.StringComparison]::Ordinal
    }
    return [string]::Equals($leftFull, $rightFull, $comparison)
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
$sourceAgents = Join-Path $assetRoot "agents"
$modesFile = Join-Path $assetRoot "modes.json"
$defaultProfileDir = Join-Path $assetRoot "tools/agent-profiles"
$mergeScript = Join-Path $assetRoot "scripts/install-codex-config.py"
$supportSyncScript = Join-Path $assetRoot "scripts/sync-runtime-support.py"
$skillSyncScript = Join-Path $assetRoot "scripts/sync-codex-skills.py"
$projectProfileScript = Join-Path $assetRoot "scripts/codex-project-profile.py"
$sourceSkills = Join-Path $assetRoot "skills"
$modelFlags = [bool]($AgentProfile -or $ModelSet -or $ProfileDir -or $ModelSetDir -or $UniformModel)
if (-not $ProfileDir) {
    $ProfileDir = $defaultProfileDir
}
if (-not $ModelSetDir) {
    $ModelSetDir = Join-Path $assetRoot "runtimes/codex/model-sets"
}

if (-not (Test-Path -LiteralPath $sourceAgents -PathType Container)) {
    throw "Source agents directory not found: $sourceAgents"
}
if (-not (Test-Path -LiteralPath $modesFile -PathType Leaf)) {
    throw "Mode manifest not found: $modesFile"
}
if (-not (Test-Path -LiteralPath $mergeScript -PathType Leaf)) {
    throw "Codex install helper not found: $mergeScript"
}
if (-not (Test-Path -LiteralPath $supportSyncScript -PathType Leaf)) {
    throw "Neutral support sync helper not found: $supportSyncScript"
}
if (-not (Test-Path -LiteralPath $skillSyncScript -PathType Leaf)) {
    throw "Codex skill sync helper not found: $skillSyncScript"
}
if (-not (Test-Path -LiteralPath $projectProfileScript -PathType Leaf)) {
    throw "Codex project profile helper not found: $projectProfileScript"
}

$targetWasExplicit = $PSBoundParameters.ContainsKey("Target")
if ($targetWasExplicit -and [string]::IsNullOrWhiteSpace($Target)) {
    throw "Target path must not be empty or whitespace."
}
if (-not $targetWasExplicit) {
    $Target = Get-DefaultTarget
}

if ($Target.TrimStart() -match '^-{1,2}[A-Za-z]') {
    throw "Target path '$Target' looks like a switch, not a filesystem path. Pass -Target explicitly with a filesystem path value."
}
Assert-GeneratedShellPath -Value $Target -Label "Target path"
if ($WorkspaceRoot) {
    Assert-GeneratedShellPath -Value $WorkspaceRoot -Label "Workspace root"
}
if ($GlobalAgentsTarget) {
    Assert-GeneratedShellPath -Value $GlobalAgentsTarget -Label "Global AGENTS target"
}
if ($PSBoundParameters.ContainsKey("UserSkillsRoot") -and [string]::IsNullOrWhiteSpace($UserSkillsRoot)) {
    throw "User skills root must not be empty or whitespace."
}
if ($PSBoundParameters.ContainsKey("UserSkillsRoot") -and $UserSkillsRoot.TrimStart() -match '^-{1,2}[A-Za-z]') {
    throw "User skills root '$UserSkillsRoot' looks like a switch, not a filesystem path."
}

$targetPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Target)
if (Test-Path -LiteralPath $targetPath) {
    $targetItem = Get-Item -LiteralPath $targetPath -Force
    if (($targetItem.Attributes -band [System.IO.FileAttributes]::ReparsePoint) -ne 0) {
        throw "Target path must not be a symbolic link or junction: $targetPath"
    }
    if (-not $targetItem.PSIsContainer) {
        throw "Target path is not a directory: $targetPath"
    }
}
$globalAgentsTargetPath = $null
if ($GlobalAgentsTarget) {
    $globalAgentsTargetPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($GlobalAgentsTarget)
}
$userSkillsRootWasExplicit = $PSBoundParameters.ContainsKey("UserSkillsRoot")
$userSkillsRootPath = if ($userSkillsRootWasExplicit) {
    $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($UserSkillsRoot)
} else {
    $null
}
$workspaceRootPath = $null
$workspaceAgentsPath = $null
$globalAgentsMergePath = $null
$globalAgentsMergeDir = if ($globalAgentsTargetPath) { $globalAgentsTargetPath } else { $targetPath }
if ($WorkspaceRoot) {
    $workspaceRootPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($WorkspaceRoot)
}
if (-not $globalAgentsTargetPath -and $workspaceRootPath) {
    $expectedWorkspaceTarget = [System.IO.Path]::GetFullPath((Join-Path $workspaceRootPath ".codex"))
    if ([System.IO.Path]::GetFullPath($targetPath) -eq $expectedWorkspaceTarget) {
        $workspaceAgentsPath = Join-Path $workspaceRootPath "AGENTS.md"
    }
}
$workspaceMaterialization = $false
if ($workspaceRootPath) {
    $workspaceMaterialization = Test-SamePath -Left $targetPath -Right (Join-Path $workspaceRootPath ".codex")
}
$activeGlobalTarget = Test-SamePath -Left $targetPath -Right (Get-DefaultTarget)
if (-not $activeGlobalTarget -and $env:CODEX_HOME) {
    $activeGlobalTarget = Test-SamePath -Left $targetPath -Right $env:CODEX_HOME
}
if ($modelFlags -and (-not $workspaceMaterialization -or $activeGlobalTarget)) {
    throw "Codex agent model profiles are workspace-only. Pass -WorkspaceRoot and target that workspace's .codex directory, or use the installed profile manager with scope workspace."
}
if ($workspaceMaterialization -and $userSkillsRootWasExplicit) {
    throw "-UserSkillsRoot is only valid for global Codex installs; direct workspace materialization never installs user skills."
}
$installUserSkills = $false
if (-not $workspaceMaterialization) {
    if ($userSkillsRootWasExplicit) {
        $installUserSkills = $true
    } elseif (Test-SamePath -Left $targetPath -Right (Get-DefaultTarget)) {
        $userSkillsRootPath = Join-Path $HOME ".agents/skills"
        $installUserSkills = $true
    }
}
if (-not $workspaceAgentsPath) {
    $globalAgentsMergePath = Get-GlobalAgentsMergePath -TargetPath $globalAgentsMergeDir
}
$pythonInvocation = @(Get-PythonInvocation)
$pythonCmd = $pythonInvocation[0]
$pythonArgs = @()
if ($pythonInvocation.Count -gt 1) {
    $pythonArgs = $pythonInvocation[1..($pythonInvocation.Count - 1)]
}
& $pythonCmd @pythonArgs -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)"
if ($LASTEXITCODE -ne 0) {
    throw "Codex installer requires Python 3.11 or newer."
}

Write-Host "Source agents: $sourceAgents"
Write-Host "Target: $targetPath"
if ($workspaceRootPath) {
    Write-Host "Workspace root: $workspaceRootPath"
}
if ($globalAgentsMergePath) {
    Write-Host "Managed global AGENTS merge: $globalAgentsMergePath"
}
if ($installUserSkills) {
    Write-Host "Managed Codex user skills: $userSkillsRootPath"
}
Write-Host "DryRun: $DryRun"
Write-Host "Managed merge: preserve non-agent Codex settings"
Write-Host "Cleanup: stale managed Codex agent outputs"

$skillSyncArgs = @()
if ($installUserSkills) {
    $skillSyncArgs = @(
        $skillSyncScript,
        "--source-skills-root", $sourceSkills,
        "--user-skills-root", $userSkillsRootPath
    )
    & $pythonCmd @pythonArgs @skillSyncArgs --dry-run
    if ($LASTEXITCODE -ne 0) {
        throw "Codex skill sync preflight failed with exit code $LASTEXITCODE."
    }
}

$existingConfig = $null
$existingRoles = @()
$existingManifest = $null
$existingWorkspaceAgents = $null
$existingGlobalAgents = @()
if (Test-Path -LiteralPath $targetPath -PathType Container) {
    $configPath = Join-Path $targetPath "config.toml"
    if (Test-Path -LiteralPath $configPath -PathType Leaf) {
        $existingConfig = Get-Item -LiteralPath $configPath
    }

    $manifestPath = Join-Path $targetPath ".agents-pipeline-codex-manifest.json"
    if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
        # PowerShell treats dotfiles as hidden on Unix-like hosts; -Force keeps
        # repeat installs portable after Test-Path has found the manifest.
        $existingManifest = Get-Item -LiteralPath $manifestPath -Force
    }

    $agentsDir = Join-Path $targetPath "agents"
    if (Test-Path -LiteralPath $agentsDir -PathType Container) {
        $existingRoles = Get-ChildItem -Path $agentsDir -Filter "*.toml" -File -ErrorAction SilentlyContinue
    }

}
if ($globalAgentsMergePath -and (Test-Path -LiteralPath $globalAgentsMergeDir -PathType Container)) {
    foreach ($globalAgentsName in @("AGENTS.md", "AGENTS.override.md")) {
        $candidate = Join-Path $globalAgentsMergeDir $globalAgentsName
        if (Test-Path -LiteralPath $candidate -PathType Leaf) {
            $existingGlobalAgents += Get-Item -LiteralPath $candidate
        }
    }
}
if ($workspaceAgentsPath -and (Test-Path -LiteralPath $workspaceAgentsPath -PathType Leaf)) {
    $existingWorkspaceAgents = Get-Item -LiteralPath $workspaceAgentsPath
}

# The namespaced agents-pipeline support tree is generated and re-synced on every install; backing
# it up makes repeated installs grow quickly without preserving user state.
if (-not $NoBackup -and ($existingConfig -or $existingManifest -or $existingRoles.Count -gt 0 -or $existingWorkspaceAgents -or $existingGlobalAgents.Count -gt 0)) {
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
    "--modes-file", $modesFile,
    "--target-dir", $targetPath,
    "--strict"
)
if ($DryRun) {
    $exportArgs += "--dry-run"
}
if ($WorkspaceRoot) {
    $exportArgs += @("--workspace-root", $WorkspaceRoot)
}
if ($globalAgentsTargetPath) {
    $exportArgs += @("--global-agents-target", $globalAgentsTargetPath)
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

if ($installUserSkills -and -not $DryRun) {
    & $pythonCmd @pythonArgs @skillSyncArgs
    if ($LASTEXITCODE -ne 0) {
        throw "Codex skill sync failed with exit code $LASTEXITCODE."
    }
}

Write-Host ""
if ($globalAgentsMergePath) {
    Write-Host "Codex usage note: installer-managed global AGENTS routing lives at $globalAgentsMergePath."
    Write-Host "Manual snippet reference remains in docs/codex-mapping.md#global-custom-instructions-snippet if you are not using the installer."
} else {
    Write-Host "Codex usage note: the optional manual snippet is in docs/codex-mapping.md#global-custom-instructions-snippet."
}
if ($installUserSkills) {
    Write-Host 'Formal workflow entry points: `$run-adaptive`, `$run-simple`, `$run-flow`, `$run-pipeline`, `$run-general`, `$run-spec`, `$run-ci`, `$run-modernize`, `$run-analysis`, `$run-ux`, and `$run-committee`.'
    Write-Host 'For the full workflow, prefer `$run-pipeline <task>`. `use pipeline` and `使用 pipeline` remain compatibility aliases.'
} else {
    Write-Host 'This target did not modify the Codex user skill root. Formal entry points are the `$run-*` skills once installed globally.'
    Write-Host '`use pipeline` and `使用 pipeline` remain compatibility aliases.'
}
Write-Host "Example: Have 'orchestrator-general' draft a plan and 'reviewer' validate the outcome."

if ($DryRun) {
    Write-Host "Dry run complete. No files were written."
} else {
    Write-Host "Install complete. Generated Codex config is ready at: $targetPath"
}

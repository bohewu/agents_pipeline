#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [string]$Target,
    [switch]$DryRun,
    [switch]$NoBackup
)

$ErrorActionPreference = "Stop"

Write-Verbose "Repo-managed skills are mirrored into ~/.agents/skills and ~/.claude/skills by default."

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
$managedDirectories = @(
    @{ Source = (Join-Path $repoRoot "opencode/agents"); Destination = "agents" },
    @{ Source = (Join-Path $repoRoot "opencode/commands"); Destination = "commands" },
    @{ Source = (Join-Path $repoRoot "opencode/protocols"); Destination = "protocols" },
    @{ Source = (Join-Path $repoRoot "opencode/tools"); Destination = "tools" },
    @{ Source = (Join-Path $repoRoot "opencode/skills"); Destination = "skills" },
    @{ Source = (Join-Path $repoRoot "codex/tools/model-sets"); Destination = "codex/tools/model-sets" },
    @{ Source = (Join-Path $repoRoot "copilot/tools/model-sets"); Destination = "copilot/tools/model-sets" },
    @{ Source = (Join-Path $repoRoot "claude/tools/model-sets"); Destination = "claude/tools/model-sets" }
)
$managedFiles = @(
    @{ Source = (Join-Path $repoRoot "opencode.json.example"); Destination = "opencode.json.example" },
    @{ Source = (Join-Path $repoRoot "scripts/agent_model_profiles.py"); Destination = "scripts/agent_model_profiles.py" },
    @{ Source = (Join-Path $repoRoot "scripts/export-codex-agents.py"); Destination = "scripts/export-codex-agents.py" },
    @{ Source = (Join-Path $repoRoot "scripts/export-copilot-agents.py"); Destination = "scripts/export-copilot-agents.py" },
    @{ Source = (Join-Path $repoRoot "scripts/export-claude-agents.py"); Destination = "scripts/export-claude-agents.py" },
    @{ Source = (Join-Path $repoRoot "scripts/install-codex-config.py"); Destination = "scripts/install-codex-config.py" },
    @{ Source = (Join-Path $repoRoot "scripts/install-codex.sh"); Destination = "scripts/install-codex.sh" },
    @{ Source = (Join-Path $repoRoot "scripts/install-codex.ps1"); Destination = "scripts/install-codex.ps1" },
    @{ Source = (Join-Path $repoRoot "scripts/install-copilot.sh"); Destination = "scripts/install-copilot.sh" },
    @{ Source = (Join-Path $repoRoot "scripts/install-copilot.ps1"); Destination = "scripts/install-copilot.ps1" },
    @{ Source = (Join-Path $repoRoot "scripts/install-claude.sh"); Destination = "scripts/install-claude.sh" },
    @{ Source = (Join-Path $repoRoot "scripts/install-claude.ps1"); Destination = "scripts/install-claude.ps1" }
)
$backupItems = @("agents", "commands", "protocols", "tools", "skills", "scripts", "codex", "copilot", "claude")

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

function Sync-SkillMirrors {
    param(
        [string]$SkillSourceRoot,
        [string[]]$MirrorRoots,
        [switch]$DryRun,
        [switch]$NoBackup
    )

    if (-not (Test-Path -LiteralPath $SkillSourceRoot -PathType Container)) {
        return
    }

    $skillDirs = @(Get-ChildItem -LiteralPath $SkillSourceRoot -Directory | Sort-Object Name)
    if ($skillDirs.Count -eq 0) {
        return
    }

    foreach ($mirrorRoot in $MirrorRoots) {
        Write-Host "Skill mirror target: $mirrorRoot"

        $needsBackup = $false
        foreach ($skillDir in $skillDirs) {
            if (Test-Path -LiteralPath (Join-Path $mirrorRoot $skillDir.Name)) {
                $needsBackup = $true
                break
            }
        }

        if (-not $NoBackup -and $needsBackup) {
            $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
            $backupDir = Join-Path $mirrorRoot ".backup-agents-pipeline-skills-$stamp"
            if ($DryRun) {
                Write-Host "Would create skill mirror backup: $backupDir"
            } else {
                New-Item -ItemType Directory -Path $backupDir -Force | Out-Null
                foreach ($skillDir in $skillDirs) {
                    $existingSkill = Join-Path $mirrorRoot $skillDir.Name
                    if (Test-Path -LiteralPath $existingSkill) {
                        Copy-Item -LiteralPath $existingSkill -Destination (Join-Path $backupDir $skillDir.Name) -Recurse -Force
                    }
                }
                Write-Host "Skill mirror backup created: $backupDir"
            }
        }

        if ($DryRun) {
            Write-Host "Would ensure skill mirror root exists: $mirrorRoot"
        } else {
            New-Item -ItemType Directory -Path $mirrorRoot -Force | Out-Null
        }

        foreach ($skillDir in $skillDirs) {
            $destSkill = Join-Path $mirrorRoot $skillDir.Name
            if ($DryRun) {
                Write-Host "Would mirror skill: $($skillDir.FullName) -> $destSkill"
                continue
            }

            if (Test-Path -LiteralPath $destSkill) {
                Remove-Item -LiteralPath $destSkill -Recurse -Force
            }
            Copy-Item -LiteralPath $skillDir.FullName -Destination $destSkill -Recurse -Force
            Write-Host "Mirrored skill: $($skillDir.Name) -> $destSkill"
        }
    }
}

if (-not $Target) {
    $Target = Get-DefaultTarget
}

function Copy-ManagedFile {
    param(
        [Parameter(Mandatory = $true)][string]$SourcePath,
        [Parameter(Mandatory = $true)][string]$DestinationPath
    )

    $destinationParent = Split-Path -Parent $DestinationPath
    if ($destinationParent) {
        New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
    }
    Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath -Force

    if (-not $IsWindows -and $SourcePath.EndsWith('.sh', [System.StringComparison]::OrdinalIgnoreCase)) {
        try {
            $mode = [System.IO.File]::GetUnixFileMode($SourcePath)
            [System.IO.File]::SetUnixFileMode($DestinationPath, $mode)
        } catch {
            Write-Verbose "Unable to preserve Unix mode for ${DestinationPath}: $($_.Exception.Message)"
        }
    }
}

if ($Target -match '^-{1,2}[A-Za-z]') {
    throw "Target path '$Target' looks like a switch, not a filesystem path. Pass -Target explicitly if needed."
}

$targetPath = $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Target)
$manifestPath = Join-Path $targetPath $manifestName
$skillMirrorRoots = @(
    (Join-Path $HOME ".agents/skills"),
    (Join-Path $HOME ".claude/skills")
)

$managedRelativePaths = New-Object System.Collections.Generic.List[string]
foreach ($entry in $managedDirectories) {
    $src = $entry.Source
    if (-not (Test-Path -LiteralPath $src -PathType Container)) {
        continue
    }
    Get-ChildItem -LiteralPath $src -Recurse -File | ForEach-Object {
        $relativeChild = Get-RelativeInstallPath -BasePath $src -ChildPath $_.FullName
        $managedRelativePaths.Add(($entry.Destination.TrimEnd('/') + "/" + $relativeChild).Replace('\\', '/'))
    }
}
foreach ($entry in $managedFiles) {
    if (Test-Path -LiteralPath $entry.Source -PathType Leaf) {
        $managedRelativePaths.Add($entry.Destination.Replace('\\', '/'))
    }
}
$managedRelativePaths = $managedRelativePaths | Sort-Object -Unique

Write-Host "Source: $sourceRoot"
Write-Host "Target: $targetPath"
Write-Host "DryRun: $DryRun"

$needsBackup = $false
foreach ($item in $backupItems) {
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
        foreach ($item in $backupItems) {
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

foreach ($entry in $managedDirectories) {
    $src = $entry.Source
    if (-not (Test-Path -LiteralPath $src)) {
        continue
    }

    $dest = Join-Path $targetPath $entry.Destination
    if ($DryRun) {
        Write-Host "Would sync: $src -> $dest"
        continue
    }

    New-Item -ItemType Directory -Path $dest -Force | Out-Null
    Copy-Item -Path (Join-Path $src "*") -Destination $dest -Recurse -Force
    Write-Host "Synced: $src -> $dest"
}

foreach ($entry in $managedFiles) {
    if (-not (Test-Path -LiteralPath $entry.Source -PathType Leaf)) {
        continue
    }

    $destination = Join-Path $targetPath ($entry.Destination.Replace('/', [System.IO.Path]::DirectorySeparatorChar))
    if ($DryRun) {
        Write-Host "Would copy: $($entry.Source) -> $destination"
    } else {
        Copy-ManagedFile -SourcePath $entry.Source -DestinationPath $destination
        Write-Host "Copied: $destination"
    }
}

if ($DryRun) {
    Write-Host "Would write installer manifest: $manifestPath"
} else {
    Set-Content -LiteralPath $manifestPath -Value $managedRelativePaths -Encoding utf8
    Write-Host "Updated manifest: $manifestPath"
}

Sync-SkillMirrors -SkillSourceRoot (Join-Path $sourceRoot "skills") -MirrorRoots $skillMirrorRoots -DryRun:$DryRun -NoBackup:$NoBackup

if ($DryRun) {
    Write-Host "Dry run complete. No files were written."
} else {
    Write-Host "Install complete."
}

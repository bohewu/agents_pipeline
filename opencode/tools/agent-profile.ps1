#!/usr/bin/env pwsh
[CmdletBinding()]
param(
    [Parameter(Position = 0, Mandatory = $true)]
    [ValidateSet("install", "status", "clear", "list")]
    [string] $Action,

    [Parameter(Position = 1)]
    [string] $Profile,

    [string] $Model,
    [string] $ModelSet,
    [ValidateSet("opencode", "codex", "copilot", "claude")]
    [string] $Runtime = "opencode",
    [string] $Target,
    [string] $UniformModel,
    [string] $Workspace = ".",
    [string] $SourceAgents,
    [string] $ProfileDir,
    [string] $ModelSetDir,
    [string] $ClaudeMd,
    [switch] $DryRun,
    [switch] $NoBackup,
    [switch] $NoRunner,
    [switch] $Force
)

$ErrorActionPreference = "Stop"
$Utf8NoBom = [System.Text.UTF8Encoding]::new($false)
$Runtime = $Runtime.ToLowerInvariant()

function Resolve-AbsolutePath {
    param([Parameter(Mandatory = $true)][string] $Path)
    return $ExecutionContext.SessionState.Path.GetUnresolvedProviderPathFromPSPath($Path)
}

function Read-TextFile {
    param([Parameter(Mandatory = $true)][string] $Path)
    return [System.IO.File]::ReadAllText($Path, $Utf8NoBom)
}

function Write-TextFile {
    param(
        [Parameter(Mandatory = $true)][string] $Path,
        [Parameter(Mandatory = $true)][string] $Text
    )
    $parent = Split-Path -Parent $Path
    if ($parent) {
        New-Item -ItemType Directory -Path $parent -Force | Out-Null
    }
    [System.IO.File]::WriteAllText($Path, $Text, $Utf8NoBom)
}

function Get-Sha256Bytes {
    param([Parameter(Mandatory = $true)][byte[]] $Bytes)
    $sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $hash = $sha.ComputeHash($Bytes)
        return "sha256:" + (($hash | ForEach-Object { $_.ToString("x2") }) -join "")
    } finally {
        $sha.Dispose()
    }
}

function Get-Sha256File {
    param([Parameter(Mandatory = $true)][string] $Path)
    return Get-Sha256Bytes -Bytes ([System.IO.File]::ReadAllBytes($Path))
}

function Get-Sha256Text {
    param([Parameter(Mandatory = $true)][string] $Text)
    return Get-Sha256Bytes -Bytes ($Utf8NoBom.GetBytes($Text))
}

function Read-JsonFile {
    param([Parameter(Mandatory = $true)][string] $Path)
    if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        throw "JSON file not found: $Path"
    }
    try {
        return (Read-TextFile -Path $Path | ConvertFrom-Json -ErrorAction Stop)
    } catch {
        throw "Invalid JSON file '$Path': $($_.Exception.Message)"
    }
}

function Get-ObjectKeys {
    param([Parameter(Mandatory = $true)] $Object)
    return @($Object.PSObject.Properties.Name)
}

function Test-SafeName {
    param([Parameter(Mandatory = $true)][string] $Name)
    return $Name -match '^[A-Za-z0-9][A-Za-z0-9._-]*$'
}

function Assert-SafeName {
    param(
        [Parameter(Mandatory = $true)][string] $Name,
        [Parameter(Mandatory = $true)][string] $Kind
    )
    if (-not (Test-SafeName -Name $Name)) {
        throw "Invalid $Kind '$Name': expected a basename using letters, digits, dot, underscore, or hyphen."
    }
}

function Test-SafeModelId {
    param([Parameter(Mandatory = $true)][string] $ModelId)
    return $ModelId -match '^[A-Za-z0-9][A-Za-z0-9._:/@+-]*$'
}

function Assert-SafeModelId {
    param(
        [Parameter(Mandatory = $true)][string] $ModelId,
        [Parameter(Mandatory = $true)][string] $Context
    )
    if (-not (Test-SafeModelId -ModelId $ModelId)) {
        throw "Invalid model id for ${Context}: expected a single-line provider/model scalar without spaces or YAML control characters."
    }
}

function Assert-ProfileSchema {
    param(
        [Parameter(Mandatory = $true)] $ProfileObject,
        [Parameter(Mandatory = $true)][string] $Path
    )
    if (-not $ProfileObject.name -or -not $ProfileObject.runtime -or -not $ProfileObject.description -or -not $ProfileObject.models) {
        throw "Invalid profile schema in '$Path': expected name, runtime, description, and models."
    }
    if ($ProfileObject.runtime -ne "opencode") {
        throw "Invalid profile runtime in '$Path': expected 'opencode'."
    }
    $keys = @(Get-ObjectKeys -Object $ProfileObject.models)
    if ($keys.Count -eq 0) {
        throw "Invalid profile schema in '$Path': models must not be empty."
    }
    foreach ($key in $keys) {
        Assert-SafeName -Name $key -Kind "agent name"
        $tier = [string]$ProfileObject.models.$key
        Assert-SafeName -Name $tier -Kind "model tier"
        if ([string]::IsNullOrWhiteSpace($tier)) {
            throw "Invalid profile schema in '$Path': model tier for '$key' is empty."
        }
    }
}

function Assert-ModelSetSchema {
    param(
        [Parameter(Mandatory = $true)] $ModelSetObject,
        [Parameter(Mandatory = $true)][string] $Path
    )
    if (-not $ModelSetObject.name -or -not $ModelSetObject.runtime -or -not $ModelSetObject.description -or -not $ModelSetObject.tiers) {
        throw "Invalid model set schema in '$Path': expected name, runtime, description, and tiers."
    }
    if ($ModelSetObject.runtime -ne "opencode") {
        throw "Invalid model set runtime in '$Path': expected 'opencode'."
    }
    foreach ($required in @("mini", "standard", "strong")) {
        if (-not $ModelSetObject.tiers.PSObject.Properties[$required]) {
            throw "Invalid model set schema in '$Path': missing tier '$required'."
        }
        if ([string]::IsNullOrWhiteSpace([string]$ModelSetObject.tiers.$required)) {
            throw "Invalid model set schema in '$Path': tier '$required' is empty."
        }
        Assert-SafeModelId -ModelId ([string]$ModelSetObject.tiers.$required) -Context "$Path tier '$required'"
    }
}

function Assert-RuntimeModelSetSchema {
    param(
        [Parameter(Mandatory = $true)] $ModelSetObject,
        [Parameter(Mandatory = $true)][string] $Path,
        [Parameter(Mandatory = $true)][string] $ExpectedRuntime
    )
    if (-not $ModelSetObject.name -or -not $ModelSetObject.runtime -or -not $ModelSetObject.description -or -not $ModelSetObject.tiers) {
        throw "Invalid model set schema in '$Path': expected name, runtime, description, and tiers."
    }
    if ($ModelSetObject.runtime -ne $ExpectedRuntime) {
        throw "Invalid model set runtime in '$Path': expected '$ExpectedRuntime'."
    }
    foreach ($required in @("mini", "standard", "strong")) {
        if (-not $ModelSetObject.tiers.PSObject.Properties[$required]) {
            throw "Invalid model set schema in '$Path': missing tier '$required'."
        }
        $value = $ModelSetObject.tiers.$required
        if ($null -eq $value -or ([string]$value).Length -eq 0) {
            throw "Invalid model set schema in '$Path': tier '$required' is empty."
        }
    }
}

function Format-RuntimeTier {
    param([Parameter(Mandatory = $true)] $Value)
    if ($Value -is [string]) {
        return $Value
    }
    return ($Value | ConvertTo-Json -Compress -Depth 20)
}

function Write-RuntimeProfileList {
    param(
        [Parameter(Mandatory = $true)][string] $RuntimeName,
        [Parameter(Mandatory = $true)][string] $ProfileDirPath,
        [Parameter(Mandatory = $true)][string] $ModelSetDirPath
    )
    if (-not (Test-Path -LiteralPath $ProfileDirPath -PathType Container)) {
        throw "Profile directory not found: $ProfileDirPath"
    }
    if (-not (Test-Path -LiteralPath $ModelSetDirPath -PathType Container)) {
        throw "Model set directory not found for runtime '$RuntimeName': $ModelSetDirPath"
    }

    Write-Host "Runtime: $RuntimeName"
    Write-Host "Profiles:"
    foreach ($file in @(Get-ChildItem -LiteralPath $ProfileDirPath -Filter "*.json" -File | Sort-Object Name)) {
        $profileObject = Read-JsonFile -Path $file.FullName
        Assert-ProfileSchema -ProfileObject $profileObject -Path $file.FullName
        $count = @(Get-ObjectKeys -Object $profileObject.models).Count
        Write-Host ("- {0}: {1} agents. {2}" -f $profileObject.name, $count, $profileObject.description)
    }
    Write-Host "- uniform: built-in mode; use -UniformModel or 'uniform -Model' to apply one runtime model to every generated agent."

    Write-Host "Model sets ($RuntimeName):"
    foreach ($file in @(Get-ChildItem -LiteralPath $ModelSetDirPath -Filter "*.json" -File | Sort-Object Name)) {
        $modelSetObject = Read-JsonFile -Path $file.FullName
        Assert-RuntimeModelSetSchema -ModelSetObject $modelSetObject -Path $file.FullName -ExpectedRuntime $RuntimeName
        Write-Host ("- {0}: mini={1}, standard={2}, strong={3}" -f $modelSetObject.name, (Format-RuntimeTier $modelSetObject.tiers.mini), (Format-RuntimeTier $modelSetObject.tiers.standard), (Format-RuntimeTier $modelSetObject.tiers.strong))
    }
}

function Get-RuntimeInstallerUnavailableMessage {
    param(
        [Parameter(Mandatory = $true)][string] $RuntimeName,
        [Parameter(Mandatory = $true)][string] $InstallerPath
    )
    return "Runtime installer script not found for '$RuntimeName': $InstallerPath. Run this tool from a cloned agents_pipeline repo or an extracted release bundle that includes scripts/install-<runtime>.*, or invoke scripts/install-$RuntimeName.* directly from that repo/bundle."
}

function Get-RuntimeTargetFromWorkspace {
    param(
        [Parameter(Mandatory = $true)][string] $RuntimeName,
        [Parameter(Mandatory = $true)][string] $WorkspacePath
    )
    switch ($RuntimeName) {
        "opencode" { return (Join-Path (Join-Path $WorkspacePath ".opencode") "agents") }
        "claude" { return (Join-Path (Join-Path $WorkspacePath ".claude") "agents") }
        "copilot" { return (Join-Path (Join-Path $WorkspacePath ".copilot") "agents") }
        "codex" { return (Join-Path $WorkspacePath ".codex") }
        default { throw "Unsupported runtime: $RuntimeName" }
    }
}

function Invoke-RuntimeInstall {
    param(
        [Parameter(Mandatory = $true)][string] $RuntimeName,
        [Parameter(Mandatory = $true)][string] $RepoRoot,
        [Parameter(Mandatory = $true)][string] $ProfileDirPath,
        [Parameter(Mandatory = $true)][string] $ModelSetDirPath
    )
    $installer = Join-Path $RepoRoot "scripts/install-$RuntimeName.ps1"
    if (-not (Test-Path -LiteralPath $installer -PathType Leaf)) {
        throw (Get-RuntimeInstallerUnavailableMessage -RuntimeName $RuntimeName -InstallerPath $installer)
    }
    if (-not $Profile) {
        throw "install requires a profile: frugal, balanced, premium, or uniform."
    }
    if ($RuntimeName -ne "claude" -and ($ClaudeMd -or $NoRunner)) {
        throw "-ClaudeMd and -NoRunner are only supported with -Runtime claude."
    }

    $installParams = @{}
    if ($Target) {
        $installParams["Target"] = $Target
    }
    if ($DryRun) {
        $installParams["DryRun"] = $true
    }
    if ($NoBackup) {
        $installParams["NoBackup"] = $true
    }
    if ($Force -and $RuntimeName -eq "codex") {
        $installParams["Force"] = $true
    }
    if ($RuntimeName -eq "claude") {
        if ($ClaudeMd) {
            $installParams["ClaudeMd"] = $ClaudeMd
        }
        if ($NoRunner) {
            $installParams["NoRunner"] = $true
        }
    }

    if ($Profile -eq "uniform") {
        $runtimeUniformModel = if ($UniformModel) { $UniformModel } else { $Model }
        if (-not $runtimeUniformModel) {
            throw "install uniform requires -UniformModel (or -Model for compatibility)."
        }
        if ($Model -and $UniformModel -and $Model -ne $UniformModel) {
            throw "install uniform received different values for -Model and -UniformModel."
        }
        $installParams["UniformModel"] = $runtimeUniformModel
    } else {
        if ($UniformModel) {
            throw "-UniformModel is only valid with the built-in 'uniform' profile."
        }
        if ($Model) {
            throw "Named runtime profiles are tier-map driven. Use -ModelSet, or use 'uniform -UniformModel'."
        }
        if (-not $ModelSet) {
            throw "install $Profile -Runtime $RuntimeName requires -ModelSet."
        }
        Assert-SafeName -Name $Profile -Kind "profile"
        $installParams["AgentProfile"] = $Profile
        $installParams["ModelSet"] = $ModelSet
        $installParams["ProfileDir"] = $ProfileDirPath
        $installParams["ModelSetDir"] = $ModelSetDirPath
    }

    & $installer @installParams
}

function Get-ManagedLookup {
    param([string] $ManifestPath)
    $lookup = @{}
    if (-not (Test-Path -LiteralPath $ManifestPath -PathType Leaf)) {
        return $lookup
    }
    $manifest = Read-JsonFile -Path $ManifestPath
    foreach ($item in @($manifest.managedFiles)) {
        if ($item.file) {
            $lookup[[string]$item.file] = [string]$item.targetHash
        }
    }
    return $lookup
}

function Assert-ChildPath {
    param(
        [Parameter(Mandatory = $true)][string] $Parent,
        [Parameter(Mandatory = $true)][string] $Child
    )
    $parentFull = [System.IO.Path]::GetFullPath($Parent)
    $childFull = [System.IO.Path]::GetFullPath($Child)
    $prefix = $parentFull.TrimEnd([System.IO.Path]::DirectorySeparatorChar, [System.IO.Path]::AltDirectorySeparatorChar) + [System.IO.Path]::DirectorySeparatorChar
    if (-not $childFull.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
        throw "Path escapes managed directory: $Child"
    }
    return $childFull
}

function Test-SafeRelativeFile {
    param([Parameter(Mandatory = $true)][string] $RelativePath)
    if ([System.IO.Path]::IsPathRooted($RelativePath)) {
        return $false
    }
    $parts = $RelativePath -split '[\\/]+'
    if ($parts.Count -eq 0) {
        return $false
    }
    foreach ($part in $parts) {
        if ([string]::IsNullOrWhiteSpace($part) -or $part -eq "." -or $part -eq "..") {
            return $false
        }
    }
    return $true
}

function Get-OrCreateBackupDir {
    param(
        [Parameter(Mandatory = $true)][string] $OpenCodeDir,
        [ref] $BackupDir
    )
    if ($BackupDir.Value) {
        return $BackupDir.Value
    }
    $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
    $BackupDir.Value = Join-Path $OpenCodeDir ".backup-agent-profile-$stamp"
    New-Item -ItemType Directory -Path $BackupDir.Value -Force | Out-Null
    return $BackupDir.Value
}

function Backup-File {
    param(
        [Parameter(Mandatory = $true)][string] $Path,
        [Parameter(Mandatory = $true)][string] $OpenCodeDir,
        [ref] $BackupDir
    )
    if ($NoBackup -or -not (Test-Path -LiteralPath $Path -PathType Leaf)) {
        return
    }
    $backupRoot = Get-OrCreateBackupDir -OpenCodeDir $OpenCodeDir -BackupDir $BackupDir
    $relative = [System.IO.Path]::GetRelativePath($OpenCodeDir, $Path)
    if ($relative.StartsWith("..")) {
        $relative = Split-Path -Leaf $Path
    }
    $destination = Join-Path $backupRoot $relative
    $destinationParent = Split-Path -Parent $destination
    if ($destinationParent) {
        New-Item -ItemType Directory -Path $destinationParent -Force | Out-Null
    }
    Copy-Item -LiteralPath $Path -Destination $destination -Force
}

function Patch-AgentFrontmatterModel {
    param(
        [Parameter(Mandatory = $true)][string] $Text,
        [Parameter(Mandatory = $true)][string] $Model
    )
    $match = [regex]::Match($Text, '(?s)\A---[ \t]*(?:\r?\n)(?<front>.*?)(?:\r?\n)---[ \t]*(?<rest>(?:\r?\n|\z).*)')
    if (-not $match.Success) {
        return $null
    }

    $front = $match.Groups['front'].Value
    $rest = $match.Groups['rest'].Value
    $lines = New-Object System.Collections.Generic.List[string]
    foreach ($line in ($front -split '\r?\n')) {
        if ($line -match '^\s*model\s*:') {
            continue
        }
        $lines.Add($line)
    }

    $insertAt = $lines.Count
    foreach ($key in @("mode", "description", "name")) {
        $found = $false
        for ($i = 0; $i -lt $lines.Count; $i++) {
            if ($lines[$i] -match ("^\s*" + [regex]::Escape($key) + "\s*:")) {
                $insertAt = $i + 1
                $found = $true
                break
            }
        }
        if ($found) {
            break
        }
    }
    $lines.Insert($insertAt, "model: $Model")
    return "---`n" + ($lines -join "`n") + "`n---" + $rest
}

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$repoRoot = Resolve-Path (Join-Path $scriptRoot "../..")
if (-not $SourceAgents) {
    $SourceAgents = Join-Path $scriptRoot "../agents"
}
if (-not $ProfileDir) {
    $ProfileDir = Join-Path $scriptRoot "agent-profiles"
}
if (-not $ModelSetDir -and $Runtime -eq "opencode") {
    $ModelSetDir = Join-Path $scriptRoot "model-sets"
}
if (-not $ModelSetDir -and $Runtime -ne "opencode") {
    $ModelSetDir = Join-Path $repoRoot "$Runtime/tools/model-sets"
}

$hasExplicitTarget = $PSBoundParameters.ContainsKey("Target")
$hasExplicitWorkspace = $PSBoundParameters.ContainsKey("Workspace")

if ($Runtime -eq "opencode") {
    if ($hasExplicitTarget) {
        if ($hasExplicitWorkspace) {
            $targetFull = [System.IO.Path]::GetFullPath((Resolve-AbsolutePath $Target))
            $workspaceFull = [System.IO.Path]::GetFullPath((Resolve-AbsolutePath $Workspace))
            if ($targetFull -ne $workspaceFull) {
                throw "-Target and -Workspace both set different paths for -Runtime opencode."
            }
        } else {
            $Workspace = $Target
        }
    }
    if ($UniformModel) {
        if ($Profile -eq "uniform" -and -not $Model) {
            $Model = $UniformModel
        } elseif ($Model -and $Model -ne $UniformModel) {
            throw "install uniform received different values for -Model and -UniformModel."
        } elseif ($Profile -ne "uniform") {
            throw "-UniformModel is only valid with the built-in 'uniform' profile."
        }
    }
}

$sourceAgentsPath = Resolve-AbsolutePath $SourceAgents
$profileDirPath = Resolve-AbsolutePath $ProfileDir
$modelSetDirPath = Resolve-AbsolutePath $ModelSetDir
$workspacePath = Resolve-AbsolutePath $Workspace
$openCodeDir = Join-Path $workspacePath ".opencode"
$targetAgentsDir = Join-Path $openCodeDir "agents"
$manifestPath = Join-Path $openCodeDir ".agents-pipeline-agent-profile.json"

if ($Runtime -ne "opencode") {
    if ($Action -eq "list") {
        Write-RuntimeProfileList -RuntimeName $Runtime -ProfileDirPath $profileDirPath -ModelSetDirPath $modelSetDirPath
        return
    }
    if ($Action -ne "install") {
        throw "$Action is unsupported for -Runtime $Runtime; supported actions are install and list."
    }
    if ([string]::IsNullOrWhiteSpace($Target)) {
        $Target = Get-RuntimeTargetFromWorkspace -RuntimeName $Runtime -WorkspacePath $workspacePath
    }
    Invoke-RuntimeInstall -RuntimeName $Runtime -RepoRoot $repoRoot -ProfileDirPath $profileDirPath -ModelSetDirPath $modelSetDirPath
    return
}

if ($Action -eq "list") {
    if (-not (Test-Path -LiteralPath $ProfileDirPath -PathType Container)) {
        throw "Profile directory not found: $ProfileDirPath"
    }
    if (-not (Test-Path -LiteralPath $ModelSetDirPath -PathType Container)) {
        throw "Model set directory not found: $ModelSetDirPath"
    }

    Write-Host "Profiles:"
    foreach ($file in @(Get-ChildItem -LiteralPath $ProfileDirPath -Filter "*.json" -File | Sort-Object Name)) {
        $profileObject = Read-JsonFile -Path $file.FullName
        Assert-ProfileSchema -ProfileObject $profileObject -Path $file.FullName
        $count = @(Get-ObjectKeys -Object $profileObject.models).Count
        Write-Host ("- {0}: {1} agents, default model set '{2}'. {3}" -f $profileObject.name, $count, $profileObject.modelSet, $profileObject.description)
    }
    Write-Host "- uniform: built-in mode; requires -Model and applies that exact model to every source agent."

    Write-Host "Model sets:"
    foreach ($file in @(Get-ChildItem -LiteralPath $ModelSetDirPath -Filter "*.json" -File | Sort-Object Name)) {
        $modelSetObject = Read-JsonFile -Path $file.FullName
        Assert-ModelSetSchema -ModelSetObject $modelSetObject -Path $file.FullName
        Write-Host ("- {0}: mini={1}, standard={2}, strong={3}" -f $modelSetObject.name, $modelSetObject.tiers.mini, $modelSetObject.tiers.standard, $modelSetObject.tiers.strong)
    }
    return
}

if ($Action -eq "status") {
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        Write-Host "No agent model profile installed for workspace: $workspacePath"
        return
    }
    $manifest = Read-JsonFile -Path $manifestPath
    $warnings = @($manifest.warnings)
    $managed = @($manifest.managedFiles)
    Write-Host "Profile: $($manifest.profile)"
    Write-Host "Mode: $($manifest.mode)"
    if ($manifest.modelSet) {
        Write-Host "Model set: $($manifest.modelSet)"
    }
    Write-Host "Generated at: $($manifest.generatedAt)"
    Write-Host "Source agents: $($manifest.sourceAgentsDir)"
    Write-Host "Target agents: $($manifest.targetAgentsDir)"
    Write-Host "Managed files: $($managed.Count)"
    Write-Host "Warnings: $($warnings.Count)"
    foreach ($warning in $warnings) {
        Write-Host "- $warning"
    }
    foreach ($item in $managed) {
        $file = [string]$item.file
        if (-not (Test-SafeRelativeFile -RelativePath $file)) {
            Write-Host "Missing/unsafe managed file entry: $file"
            continue
        }
        $path = Assert-ChildPath -Parent $targetAgentsDir -Child (Join-Path $targetAgentsDir $file)
        if (-not (Test-Path -LiteralPath $path -PathType Leaf)) {
            Write-Host "Missing managed file: $file"
        }
    }
    return
}

if ($Action -eq "clear") {
    if (-not (Test-Path -LiteralPath $manifestPath -PathType Leaf)) {
        Write-Host "No agent model profile installed; nothing to clear."
        return
    }
    $manifest = Read-JsonFile -Path $manifestPath
    $backupDir = $null
    foreach ($item in @($manifest.managedFiles)) {
        $file = [string]$item.file
        if (-not (Test-SafeRelativeFile -RelativePath $file)) {
            throw "Unsafe managed file entry in manifest: $file"
        }
        $targetPath = Assert-ChildPath -Parent $targetAgentsDir -Child (Join-Path $targetAgentsDir $file)
        if ($DryRun) {
            Write-Host "Would remove managed file: $targetPath"
            continue
        }
        if (Test-Path -LiteralPath $targetPath -PathType Leaf) {
            $expectedHash = [string]$item.targetHash
            if ($expectedHash -and (Get-Sha256File -Path $targetPath) -ne $expectedHash -and -not $Force) {
                Write-Host "Warning: skipped changed managed file without -Force: $targetPath"
                continue
            }
            Backup-File -Path $targetPath -OpenCodeDir $openCodeDir -BackupDir ([ref]$backupDir)
            Remove-Item -LiteralPath $targetPath -Force
            Write-Host "Removed managed file: $targetPath"
        }
    }
    if ($DryRun) {
        Write-Host "Would remove manifest: $manifestPath"
        Write-Host "Dry run complete. No files were written."
        return
    }
    Backup-File -Path $manifestPath -OpenCodeDir $openCodeDir -BackupDir ([ref]$backupDir)
    Remove-Item -LiteralPath $manifestPath -Force
    Write-Host "Agent model profile cleared."
    return
}

if ($Action -ne "install") {
    throw "Unsupported action: $Action"
}

if (-not $Profile) {
    throw "install requires a profile: frugal, balanced, premium, or uniform."
}
if (-not (Test-Path -LiteralPath $sourceAgentsPath -PathType Container)) {
    throw "Source agents directory not found: $sourceAgentsPath"
}

$warnings = New-Object System.Collections.Generic.List[string]
$entries = New-Object System.Collections.Generic.List[object]
$profilePath = $null
$modelSetPath = $null
$modelSetName = $null
$mode = "profile"

if ($Profile -eq "uniform") {
    if ([string]::IsNullOrWhiteSpace($Model)) {
        throw "install uniform requires -Model."
    }
    Assert-SafeModelId -ModelId $Model -Context "uniform -Model"
    $mode = "uniform"
    $agentFiles = @(Get-ChildItem -LiteralPath $sourceAgentsPath -Filter "*.md" -File | Sort-Object BaseName)
    foreach ($file in $agentFiles) {
        Assert-SafeName -Name $file.BaseName -Kind "agent filename"
        $entries.Add([pscustomobject]@{
            agent = $file.BaseName
            tier = $null
            model = $Model
            sourcePath = $file.FullName
        })
    }
} else {
    Assert-SafeName -Name $Profile -Kind "profile"
    if ($Model) {
        throw "Named profiles are tier-map driven. Use -ModelSet to choose a provider catalog, or use 'uniform -Model'."
    }
    if (-not (Test-Path -LiteralPath $ProfileDirPath -PathType Container)) {
        throw "Profile directory not found: $ProfileDirPath"
    }
    if (-not (Test-Path -LiteralPath $ModelSetDirPath -PathType Container)) {
        throw "Model set directory not found: $ModelSetDirPath"
    }
    $profilePath = Join-Path $ProfileDirPath "$Profile.json"
    $profileObject = Read-JsonFile -Path $profilePath
    Assert-ProfileSchema -ProfileObject $profileObject -Path $profilePath
    $modelSetName = if ($ModelSet) { $ModelSet } else { [string]$profileObject.modelSet }
    if ([string]::IsNullOrWhiteSpace($modelSetName)) {
        throw "Profile '$Profile' does not declare modelSet; pass -ModelSet explicitly."
    }
    Assert-SafeName -Name $modelSetName -Kind "model set"
    $modelSetPath = Join-Path $ModelSetDirPath "$modelSetName.json"
    $modelSetObject = Read-JsonFile -Path $modelSetPath
    Assert-ModelSetSchema -ModelSetObject $modelSetObject -Path $modelSetPath

    foreach ($agent in @(Get-ObjectKeys -Object $profileObject.models | Sort-Object)) {
        Assert-SafeName -Name $agent -Kind "agent name"
        $tier = [string]$profileObject.models.$agent
        if (-not $modelSetObject.tiers.PSObject.Properties[$tier]) {
            throw "Profile '$Profile' maps '$agent' to unknown tier '$tier' for model set '$modelSetName'."
        }
        $sourcePath = Join-Path $sourceAgentsPath "$agent.md"
        $sourcePath = Assert-ChildPath -Parent $sourceAgentsPath -Child $sourcePath
        if (-not (Test-Path -LiteralPath $sourcePath -PathType Leaf)) {
            $warnings.Add("Profile references missing source agent: $agent")
            continue
        }
        $entries.Add([pscustomobject]@{
            agent = $agent
            tier = $tier
            model = [string]$modelSetObject.tiers.$tier
            sourcePath = $sourcePath
        })
    }
}

$previousManagedLookup = Get-ManagedLookup -ManifestPath $manifestPath
$newManagedLookup = @{}
$managedFiles = New-Object System.Collections.Generic.List[object]
$backupDir = $null

foreach ($entry in @($entries | Sort-Object agent)) {
    $targetFile = "$($entry.agent).md"
    if (-not (Test-SafeRelativeFile -RelativePath $targetFile)) {
        throw "Unsafe target file name generated for agent: $($entry.agent)"
    }
    $targetPath = Join-Path $targetAgentsDir $targetFile
    $targetPath = Assert-ChildPath -Parent $targetAgentsDir -Child $targetPath
    $sourceText = Read-TextFile -Path $entry.sourcePath
    $patched = Patch-AgentFrontmatterModel -Text $sourceText -Model $entry.model
    if ($null -eq $patched) {
        $warnings.Add("Source agent has unsupported frontmatter; skipped: $($entry.agent)")
        continue
    }

    $targetExists = Test-Path -LiteralPath $targetPath -PathType Leaf
    $isManaged = $previousManagedLookup.ContainsKey($targetFile)
    if ($targetExists -and -not $isManaged -and -not $Force) {
        $warnings.Add("Skipped unmanaged target without -Force: $targetFile")
        Write-Host "Warning: skipped unmanaged target without -Force: $targetPath"
        continue
    }
    if ($targetExists -and $isManaged -and -not $Force) {
        $previousHash = $previousManagedLookup[$targetFile]
        if ($previousHash -and (Get-Sha256File -Path $targetPath) -ne $previousHash) {
            $warnings.Add("Skipped changed managed target without -Force: $targetFile")
            Write-Host "Warning: skipped changed managed target without -Force: $targetPath"
            continue
        }
    }

    $newManagedLookup[$targetFile] = $true
    $sourceHash = Get-Sha256File -Path $entry.sourcePath
    $targetHash = Get-Sha256Text -Text $patched
    $managedFiles.Add([pscustomobject]@{
        agent = $entry.agent
        file = $targetFile
        tier = $entry.tier
        model = $entry.model
        sourcePath = [System.IO.Path]::GetFullPath($entry.sourcePath)
        sourceHash = $sourceHash
        targetHash = $targetHash
    })

    if ($DryRun) {
        if ($targetExists) {
            Write-Host "Would overwrite: $targetPath"
        } else {
            Write-Host "Would write: $targetPath"
        }
        continue
    }
    if ($targetExists) {
        Backup-File -Path $targetPath -OpenCodeDir $openCodeDir -BackupDir ([ref]$backupDir)
    }
    Write-TextFile -Path $targetPath -Text $patched
    Write-Host "Wrote: $targetPath"
}

if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
    $previousManifest = Read-JsonFile -Path $manifestPath
    foreach ($item in @($previousManifest.managedFiles)) {
        $file = [string]$item.file
        if (-not $file -or $newManagedLookup.ContainsKey($file)) {
            continue
        }
        if (-not (Test-SafeRelativeFile -RelativePath $file)) {
            throw "Unsafe managed file entry in previous manifest: $file"
        }
        $stalePath = Assert-ChildPath -Parent $targetAgentsDir -Child (Join-Path $targetAgentsDir $file)
        if (-not (Test-Path -LiteralPath $stalePath -PathType Leaf)) {
            continue
        }
        if ($DryRun) {
            Write-Host "Would remove stale managed file: $stalePath"
            continue
        }
        Backup-File -Path $stalePath -OpenCodeDir $openCodeDir -BackupDir ([ref]$backupDir)
        Remove-Item -LiteralPath $stalePath -Force
        Write-Host "Removed stale managed file: $stalePath"
    }
}

if ($DryRun) {
    Write-Host "Dry run complete. No files were written."
    return
}

if (Test-Path -LiteralPath $manifestPath -PathType Leaf) {
    Backup-File -Path $manifestPath -OpenCodeDir $openCodeDir -BackupDir ([ref]$backupDir)
}

$manifest = [pscustomobject]@{
    tool = "agents_pipeline.agent-profile"
    version = 2
    profile = $Profile
    mode = $mode
    modelSet = $modelSetName
    workspace = [System.IO.Path]::GetFullPath($workspacePath)
    sourceAgentsDir = [System.IO.Path]::GetFullPath($sourceAgentsPath)
    profilePath = if ($profilePath) { [System.IO.Path]::GetFullPath($profilePath) } else { $null }
    modelSetPath = if ($modelSetPath) { [System.IO.Path]::GetFullPath($modelSetPath) } else { $null }
    targetAgentsDir = [System.IO.Path]::GetFullPath($targetAgentsDir)
    generatedAt = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    managedFiles = @($managedFiles | Sort-Object agent)
    warnings = @($warnings)
}

Write-TextFile -Path $manifestPath -Text (($manifest | ConvertTo-Json -Depth 20) + "`n")
Write-Host "Profile installed. Restart OpenCode to reload workspace agents."

Describe "install-codex.ps1 python resolution" {
    It "prefers the py launcher and pins -3" {
        $scriptPath = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).ProviderPath "scripts/install-codex.ps1"
        $binDir = Join-Path $TestDrive "bin"
        $logPath = Join-Path $TestDrive "py.log"
        New-Item -ItemType Directory -Path $binDir | Out-Null
        @"
@echo off
setlocal
> "$logPath" echo %*
exit /b 0
"@ | Set-Content -Path (Join-Path $binDir "py.cmd") -Encoding Ascii

        $previousPath = $env:PATH
        try {
            $env:PATH = "$binDir;$previousPath"
            & $scriptPath -Target ".\.tmp-codex-install" -DryRun | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "Expected install-codex.ps1 dry-run to succeed via py launcher shim. Exit code: $LASTEXITCODE"
            }
        }
        finally {
            $env:PATH = $previousPath
        }

        $loggedArgs = Get-Content -Path $logPath -Raw
        if ($loggedArgs -notmatch "^-3\s") {
            throw "Expected py launcher invocation to start with '-3'. Logged args: $loggedArgs"
        }
        if ($loggedArgs -notmatch "install-codex-config\.py") {
            throw "Expected py launcher invocation to include install-codex-config.py. Logged args: $loggedArgs"
        }
    }

    It "skips the WindowsApps python alias and uses python3 fallback" {
        $scriptPath = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).ProviderPath "scripts/install-codex.ps1"
        $logPath = Join-Path $TestDrive "python3.log"
        $python3Shim = Join-Path $TestDrive "python3.cmd"
        @"
@echo off
setlocal
> "$logPath" echo %*
exit /b 0
"@ | Set-Content -Path $python3Shim -Encoding Ascii

        Mock Get-Command { $null } -ParameterFilter { $Name -eq "py" }
        Mock Get-Command { [pscustomobject]@{ Source = "C:\Users\test\AppData\Local\Microsoft\WindowsApps\python.exe" } } -ParameterFilter { $Name -eq "python" }
        Mock Get-Command { [pscustomobject]@{ Source = $python3Shim } } -ParameterFilter { $Name -eq "python3" }

        & $scriptPath -Target ".\.tmp-codex-install" -DryRun | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Expected install-codex.ps1 dry-run to succeed via python3 fallback. Exit code: $LASTEXITCODE"
        }

        $loggedArgs = Get-Content -Path $logPath -Raw
        if ($loggedArgs -notmatch "install-codex-config\.py") {
            throw "Expected python3 fallback invocation to include install-codex-config.py. Logged args: $loggedArgs"
        }
    }

    It "forwards workspace root to the merge helper" {
        $scriptPath = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).ProviderPath "scripts/install-codex.ps1"
        $binDir = Join-Path $TestDrive "bin-workspace"
        $logPath = Join-Path $TestDrive "workspace.log"
        $workspaceRoot = Join-Path $TestDrive "workspace"
        $targetPath = Join-Path $workspaceRoot ".codex"
        New-Item -ItemType Directory -Path $binDir | Out-Null
        New-Item -ItemType Directory -Path $workspaceRoot | Out-Null
        @"
@echo off
setlocal
> "$logPath" echo %*
exit /b 0
"@ | Set-Content -Path (Join-Path $binDir "py.cmd") -Encoding Ascii

        $previousPath = $env:PATH
        try {
            $env:PATH = "$binDir;$previousPath"
            & $scriptPath -Target $targetPath -WorkspaceRoot $workspaceRoot -AgentProfile balanced -ModelSet openai -DryRun | Out-Null
            if ($LASTEXITCODE -ne 0) {
                throw "Expected install-codex.ps1 dry-run with workspace root to succeed. Exit code: $LASTEXITCODE"
            }
        }
        finally {
            $env:PATH = $previousPath
        }

        $loggedArgs = Get-Content -Path $logPath -Raw
        if ($loggedArgs -notmatch "--workspace-root") {
            throw "Expected install-codex.ps1 to forward --workspace-root. Logged args: $loggedArgs"
        }
        if ($loggedArgs -notmatch [regex]::Escape($workspaceRoot)) {
            throw "Expected install-codex.ps1 to forward the workspace root path. Logged args: $loggedArgs"
        }
        if ($loggedArgs -notmatch "--agent-profile" -or $loggedArgs -notmatch "balanced") {
            throw "Expected install-codex.ps1 to forward the workspace model profile. Logged args: $loggedArgs"
        }
    }

    It "fails clearly when only WindowsApps aliases are available" {
        $scriptPath = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).ProviderPath "scripts/install-codex.ps1"
        Mock Get-Command { $null } -ParameterFilter { $Name -eq "py" }
        Mock Get-Command { [pscustomobject]@{ Source = "C:\Users\test\AppData\Local\Microsoft\WindowsApps\python.exe" } } -ParameterFilter { $Name -eq "python" }
        Mock Get-Command { [pscustomobject]@{ Source = "C:\Users\test\AppData\Local\Microsoft\WindowsApps\python3.exe" } } -ParameterFilter { $Name -eq "python3" }

        try {
            & $scriptPath -Target ".\.tmp-codex-install" -DryRun | Out-Null
            throw "Expected install-codex.ps1 to fail when only WindowsApps aliases are available."
        }
        catch {
            $message = $_.Exception.Message
            if ($message -notlike "Python runtime not found. Install Python or the py launcher. Windows Store python aliases are not supported for this installer.") {
                throw "Unexpected error message when only WindowsApps aliases are available: $message"
            }
        }
    }
}

Describe "install-codex.ps1 target validation" {
    BeforeAll {
        $scriptPath = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).ProviderPath "scripts/install-codex.ps1"
    }

    It "rejects an explicitly empty or whitespace-only target" {
        foreach ($targetValue in @("", "   ")) {
            { & $scriptPath -Target $targetValue -DryRun } |
                Should -Throw "*Target path must not be empty or whitespace.*"
        }
    }

    It "rejects a switch-like target" {
        foreach ($targetValue in @("--dry-run", "  --dry-run")) {
            { & $scriptPath -Target $targetValue -DryRun } |
                Should -Throw "*looks like a switch*"
        }
    }

    It "rejects a shell-active target before writing" {
        $target = Join-Path $TestDrive 'unsafe$codex'

        { & $scriptPath -Target $target -NoBackup } |
            Should -Throw "*unsafe in generated shell instructions*"
        (Test-Path -LiteralPath $target) | Should -BeFalse
    }

    It "rejects an existing file target" {
        $targetFile = Join-Path $TestDrive "target-file"
        Set-Content -LiteralPath $targetFile -Value "not a directory"

        { & $scriptPath -Target $targetFile -DryRun } |
            Should -Throw "*Target path is not a directory:*"
    }

    It "rejects global named and uniform model profiles before writing" {
        foreach ($profileCase in @(
            @{ AgentProfile = "balanced"; ModelSet = "openai" },
            @{ UniformModel = "gpt-5.6-terra" }
        )) {
            $target = Join-Path $TestDrive ("global-profile-" + [guid]::NewGuid().ToString("N"))
            { & $scriptPath -Target $target -DryRun @profileCase } |
                Should -Throw "*workspace-only*"
            Test-Path -LiteralPath $target | Should -BeFalse
        }
    }

    It "does not treat a different global agents target as workspace scope" {
        $target = Join-Path $TestDrive "global-profile-bypass"
        $otherGlobal = Join-Path $TestDrive "other-global"

        { & $scriptPath -Target $target -GlobalAgentsTarget $otherGlobal -AgentProfile balanced -ModelSet openai -DryRun } |
            Should -Throw "*workspace-only*"
        Test-Path -LiteralPath $target | Should -BeFalse
    }

    It "rejects the default global target even when its parent is labeled a workspace" {
        $target = Join-Path $HOME ".codex"

        { & $scriptPath -Target $target -WorkspaceRoot $HOME -AgentProfile balanced -ModelSet openai -DryRun } |
            Should -Throw "*workspace-only*"
    }
}

Describe "bootstrap-install-codex.ps1 model profile boundary" {
    It "rejects a global model profile before download" {
        $bootstrap = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).ProviderPath "scripts/bootstrap-install-codex.ps1"
        $target = Join-Path $TestDrive "bootstrap-global-profile"

        { & $bootstrap -Target $target -AgentProfile balanced -ModelSet openai -DryRun } |
            Should -Throw "*workspace-only*"
        Test-Path -LiteralPath $target | Should -BeFalse
    }
}

Describe "install-codex.ps1 repeat installation" {
    It "reuses the hidden managed manifest across platforms" {
        $scriptPath = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).ProviderPath "scripts/install-codex.ps1"
        $targetPath = Join-Path $TestDrive "Codex Home With Spaces"

        & $scriptPath -Target $targetPath -NoBackup | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Expected first install to succeed. Exit code: $LASTEXITCODE"
        }
        & $scriptPath -Target $targetPath -NoBackup | Out-Null
        if ($LASTEXITCODE -ne 0) {
            throw "Expected repeat install to succeed. Exit code: $LASTEXITCODE"
        }

        Test-Path -LiteralPath (Join-Path $targetPath ".agents-pipeline-codex-manifest.json") -PathType Leaf |
            Should -BeTrue
        foreach ($role in Get-ChildItem -LiteralPath (Join-Path $targetPath "agents") -Filter "*.toml" -File) {
            (Get-Content -LiteralPath $role.FullName -Raw) |
                Should -Not -Match '(?m)^(model|model_provider)\s*='
        }
    }
}

Describe "install-codex.ps1 managed mode skills" {
    BeforeAll {
        $scriptPath = Join-Path (Resolve-Path (Join-Path $PSScriptRoot "..")).ProviderPath "scripts/install-codex.ps1"
        $managedSkillNames = @(
            "run-adaptive",
            "run-simple",
            "run-flow",
            "run-pipeline",
            "run-general",
            "run-spec",
            "run-ci",
            "run-modernize",
            "run-analysis",
            "run-ux",
            "run-committee"
        )
    }

    It "installs the exact formal skill collection into an explicit user root" {
        $targetPath = Join-Path $TestDrive "custom-codex-home"
        $userSkillsRoot = Join-Path $TestDrive "user-skills"

        $output = (& $scriptPath -Target $targetPath -UserSkillsRoot $userSkillsRoot -NoBackup *>&1 | Out-String)
        if ($LASTEXITCODE -ne 0) {
            throw "Expected managed skill install to succeed. Exit code: $LASTEXITCODE"
        }

        foreach ($skillName in $managedSkillNames) {
            Test-Path -LiteralPath (Join-Path $userSkillsRoot "$skillName/SKILL.md") -PathType Leaf |
                Should -BeTrue
            Test-Path -LiteralPath (Join-Path $userSkillsRoot "$skillName/agents/openai.yaml") -PathType Leaf |
                Should -BeTrue
            Test-Path -LiteralPath (Join-Path $userSkillsRoot "$skillName/.agents-pipeline-skill.json") -PathType Leaf |
                Should -BeTrue
        }
        Test-Path -LiteralPath (Join-Path $userSkillsRoot "run-goal") |
            Should -BeFalse
        $output | Should -Match '\$run-adaptive'
        $output | Should -Match '\$run-pipeline <task>'
        $output | Should -Match 'compatibility aliases'
    }

    It "refuses user-skill installation during direct workspace materialization" {
        $workspaceRoot = Join-Path $TestDrive "workspace"
        $targetPath = Join-Path $workspaceRoot ".codex"
        $userSkillsRoot = Join-Path $TestDrive "must-not-write"

        {
            & $scriptPath -Target $targetPath -WorkspaceRoot $workspaceRoot -UserSkillsRoot $userSkillsRoot -NoBackup
        } | Should -Throw "*never installs user skills*"
        Test-Path -LiteralPath $userSkillsRoot | Should -BeFalse
    }
}

Describe "install-codex.ps1 direct workspace materialization" {
    It "actual-installs complete workspace roles and support without user skills" {
        $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).ProviderPath
        $installer = Join-Path $repoRoot "scripts/install-codex.ps1"
        $workspace = Join-Path $TestDrive "materialized-workspace"
        $targetPath = Join-Path $workspace ".codex"

        & $installer -Target $targetPath -WorkspaceRoot $workspace -NoBackup | Out-Null
        $LASTEXITCODE | Should -Be 0

        @(Get-ChildItem -LiteralPath (Join-Path $targetPath "agents") -Filter "*.toml" -File).Count |
            Should -Be 45
        Test-Path -LiteralPath (Join-Path $targetPath "config.toml") -PathType Leaf |
            Should -BeTrue
        Test-Path -LiteralPath (Join-Path $targetPath "agents-pipeline") -PathType Container |
            Should -BeTrue
        Test-Path -LiteralPath (Join-Path $workspace "AGENTS.md") -PathType Leaf |
            Should -BeTrue
        Test-Path -LiteralPath (Join-Path $workspace ".agents/skills") |
            Should -BeFalse
        Test-Path -LiteralPath (Join-Path $targetPath ".agents/skills") |
            Should -BeFalse
    }
}

Describe "install-codex.ps1 workspace profile overlay" {
    It "keeps support and skills global while materializing project-local roles" {
        $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).ProviderPath
        $installer = Join-Path $repoRoot "scripts/install-codex.ps1"
        $targetPath = Join-Path $TestDrive "global-codex-home"
        $userSkillsRoot = Join-Path $TestDrive "global-user-skills"
        $workspace = Join-Path $TestDrive "workspace-profile"

        & $installer -Target $targetPath -UserSkillsRoot $userSkillsRoot -NoBackup | Out-Null
        $LASTEXITCODE | Should -Be 0
        $profileTool = Join-Path $targetPath "agents-pipeline/scripts/agent-profile.ps1"
        $globalRoleBefore = [System.IO.File]::ReadAllBytes(
            (Join-Path $targetPath "agents/executor.toml")
        )
        (Get-Content -LiteralPath (Join-Path $targetPath "agents/executor.toml") -Raw) |
            Should -Not -Match '(?m)^(model|model_provider)\s*='

        $previousCodexHome = $env:CODEX_HOME
        try {
            $env:CODEX_HOME = $targetPath
            & $profileTool set premium -Runtime codex -Scope workspace -Workspace $workspace -ModelSet openai -NoBackup | Out-Null
            $LASTEXITCODE | Should -Be 0

            $statusText = & $profileTool status -Runtime codex -Scope workspace -Workspace $workspace -Json 2>$null
            $LASTEXITCODE | Should -Be 0
            $status = ($statusText | Out-String) | ConvertFrom-Json
            $status.health | Should -Be "ok"
            $status.profile | Should -Be "premium"
            $status.project_trust | Should -Be "unknown"
            $status.profile_eligibility | Should -Be "ineligible"

            $localCodex = Join-Path $workspace ".codex"
            @(Get-ChildItem -LiteralPath (Join-Path $localCodex "agents") -Filter "*.toml" -File).Count |
                Should -Be 45
            (Get-Content -LiteralPath (Join-Path $localCodex "agents/executor.toml") -Raw) |
                Should -Match '(?m)^model\s*='
            Test-Path -LiteralPath (Join-Path $localCodex "config.toml") -PathType Leaf |
                Should -BeTrue
            Test-Path -LiteralPath (Join-Path $localCodex ".agents-pipeline-project-profile.json") -PathType Leaf |
                Should -BeTrue
            Test-Path -LiteralPath (Join-Path $localCodex "agents-pipeline") |
                Should -BeFalse
            @(Get-ChildItem -LiteralPath $userSkillsRoot -Directory -Filter "run-*").Count |
                Should -Be 11

            & $profileTool clear -Runtime codex -Scope workspace -Workspace $workspace | Out-Null
            $LASTEXITCODE | Should -Be 0
            Test-Path -LiteralPath (Join-Path $localCodex ".agents-pipeline-project-profile.json") |
                Should -BeFalse
            Test-Path -LiteralPath (Join-Path $localCodex "agents") |
                Should -BeFalse
            [Convert]::ToBase64String(
                [System.IO.File]::ReadAllBytes((Join-Path $targetPath "agents/executor.toml"))
            ) | Should -Be ([Convert]::ToBase64String($globalRoleBefore))
            (Get-Content -LiteralPath (Join-Path $targetPath "agents/executor.toml") -Raw) |
                Should -Not -Match '(?m)^(model|model_provider)\s*='
        }
        finally {
            $env:CODEX_HOME = $previousCodexHome
        }
    }
}

Describe "bootstrap-install-codex.ps1 release happy path" {
    It "downloads a verified neutral bundle and forwards workspace install arguments" {
        $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).ProviderPath
        $bootstrap = Join-Path $repoRoot "scripts/bootstrap-install-codex.ps1"
        $bundleName = "agents-pipeline-bundle-v0.28.0"
        $bundleRoot = Join-Path $TestDrive $bundleName
        $requiredDirectories = @(
            "agents",
            "protocols",
            "skills",
            "tools/status-runtime",
            "tools/agent-profiles",
            "runtimes/codex/model-sets",
            "scripts"
        )
        foreach ($relativePath in $requiredDirectories) {
            New-Item -ItemType Directory -Path (Join-Path $bundleRoot $relativePath) -Force | Out-Null
        }
        $requiredFiles = @(
            "AGENTS.md",
            "modes.json",
            "tools/status-event.js",
            "tools/agent-profile.py",
            "scripts/agent_model_profiles.py",
            "scripts/codex_mode_aliases.py",
            "scripts/codex-project-profile.py",
            "scripts/export-codex-agents.py",
            "scripts/install-codex-config.py",
            "scripts/path_safety.py",
            "scripts/sync-codex-skills.py",
            "scripts/sync-runtime-support.py"
        )
        foreach ($relativePath in $requiredFiles) {
            Set-Content -LiteralPath (Join-Path $bundleRoot $relativePath) -Value "fixture"
        }

        $installScript = Join-Path $bundleRoot "scripts/install-codex.ps1"
        @'
param(
    [string]$Target,
    [string]$WorkspaceRoot,
    [string]$GlobalAgentsTarget,
    [string]$UserSkillsRoot,
    [switch]$NoBackup,
    [switch]$Force,
    [string]$AgentProfile,
    [string]$ModelSet,
    [string]$ProfileDir,
    [string]$ModelSetDir,
    [string]$UniformModel
)
[ordered]@{
    Target = $Target
    WorkspaceRoot = $WorkspaceRoot
    GlobalAgentsTarget = $GlobalAgentsTarget
    NoBackup = $NoBackup.IsPresent
} | ConvertTo-Json | Set-Content -LiteralPath $env:BOOTSTRAP_INSTALL_LOG
'@ | Set-Content -LiteralPath $installScript

        $archive = Join-Path $TestDrive "$bundleName.zip"
        Compress-Archive -Path $bundleRoot -DestinationPath $archive
        $checksums = Join-Path $TestDrive "$bundleName.SHA256SUMS.txt"
        $archiveHash = (Get-FileHash -LiteralPath $archive -Algorithm SHA256).Hash.ToLowerInvariant()
        Set-Content -LiteralPath $checksums -Value "$archiveHash  $($archive | Split-Path -Leaf)"
        $releaseMetadata = Join-Path $TestDrive "release.json"
        [ordered]@{
            tag_name = "v0.28.0"
            assets = @(
                [ordered]@{
                    name = $archive | Split-Path -Leaf
                    browser_download_url = "https://example.invalid/$($archive | Split-Path -Leaf)"
                },
                [ordered]@{
                    name = $checksums | Split-Path -Leaf
                    browser_download_url = "https://example.invalid/$($checksums | Split-Path -Leaf)"
                }
            )
        } | ConvertTo-Json -Depth 5 | Set-Content -LiteralPath $releaseMetadata

        $installLog = Join-Path $TestDrive "bootstrap-install.json"
        $env:BOOTSTRAP_ARCHIVE = $archive
        $env:BOOTSTRAP_CHECKSUMS = $checksums
        $env:BOOTSTRAP_RELEASE = $releaseMetadata
        $env:BOOTSTRAP_INSTALL_LOG = $installLog
        Mock Invoke-RestMethod {
            Get-Content -LiteralPath $env:BOOTSTRAP_RELEASE -Raw | ConvertFrom-Json
        }
        Mock Invoke-WebRequest {
            param($Headers, $Uri, $OutFile)
            if ([string]$Uri -like "*.zip") {
                Copy-Item -LiteralPath $env:BOOTSTRAP_ARCHIVE -Destination $OutFile
            }
            else {
                Copy-Item -LiteralPath $env:BOOTSTRAP_CHECKSUMS -Destination $OutFile
            }
        }
        Mock Get-Command { $null } -ParameterFilter { $Name -eq "gh" }

        $workspace = Join-Path $TestDrive "workspace"
        $target = Join-Path $workspace ".codex"
        $globalAgents = Join-Path $TestDrive "global/AGENTS.md"
        & $bootstrap -Repo "example/project" -Version "v0.28.0" -Target $target -WorkspaceRoot $workspace -GlobalAgentsTarget $globalAgents -NoBackup

        Test-Path -LiteralPath $installLog -PathType Leaf | Should -BeTrue
        $forwarded = Get-Content -LiteralPath $installLog -Raw | ConvertFrom-Json
        $forwarded.Target | Should -Be $target
        $forwarded.WorkspaceRoot | Should -Be $workspace
        $forwarded.GlobalAgentsTarget | Should -Be $globalAgents
        $forwarded.NoBackup | Should -BeTrue
    }
}

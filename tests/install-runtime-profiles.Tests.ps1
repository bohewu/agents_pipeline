BeforeAll {
    $repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).ProviderPath
    $profileWrapper = Join-Path $repoRoot "scripts/agent-profile.ps1"
    $runtimeCases = @(
        @{
            Runtime = "claude"
            Count = 45
            Installer = Join-Path $repoRoot "scripts/install-claude.ps1"
            NoRunner = $true
        },
        @{
            Runtime = "copilot"
            Count = 55
            Installer = Join-Path $repoRoot "scripts/install-copilot.ps1"
            NoRunner = $false
        }
    )
}

Describe "PowerShell runtime profile installer smoke" {
    It "rejects shell-active targets before writing for <Runtime>" -TestCases $runtimeCases {
        param($Runtime, $Count, $Installer, $NoRunner)

        $target = Join-Path $TestDrive ('unsafe$' + $Runtime)
        $installArgs = @{
            Target = $target
            NoBackup = $true
        }
        if ($NoRunner) {
            $installArgs.NoRunner = $true
        }

        { & $Installer @installArgs } |
            Should -Throw "*unsafe in generated shell instructions*"
        (Test-Path -LiteralPath $target) | Should -BeFalse
    }

    It "actual-installs <Runtime> and reads deterministic status through the wrapper" -TestCases $runtimeCases {
        param($Runtime, $Count, $Installer, $NoRunner)

        $target = Join-Path $TestDrive "$Runtime agents with spaces"
        $installArgs = @{
            Target = $target
            NoBackup = $true
            AgentProfile = "balanced"
            ModelSet = "default"
        }
        if ($NoRunner) {
            $installArgs.NoRunner = $true
        }

        & $Installer @installArgs | Out-Null
        $LASTEXITCODE | Should -Be 0

        # PowerShell-style compatibility flags exercise wrapper argument forwarding.
        $statusText = & $profileWrapper -Action status -Runtime $Runtime -Target $target -Json
        $LASTEXITCODE | Should -Be 0
        $status = ($statusText | Out-String) | ConvertFrom-Json
        $status.installed | Should -BeTrue
        $status.runtime | Should -Be $Runtime
        $status.mode | Should -Be "profile"
        $status.profile | Should -Be "balanced"
        $status.model_set | Should -Be "default"
        $status.managed_generated_count | Should -Be $Count
        @($status.managed_generated_files).Count | Should -Be $Count

        $manifest = Join-Path $target ".agents-pipeline-runtime-profile.json"
        (Test-Path -LiteralPath $manifest -PathType Leaf) | Should -BeTrue
        $first = [System.IO.File]::ReadAllBytes($manifest)

        & $Installer @installArgs | Out-Null
        $LASTEXITCODE | Should -Be 0
        $second = [System.IO.File]::ReadAllBytes($manifest)
        [Convert]::ToBase64String($second) | Should -Be ([Convert]::ToBase64String($first))
    }

    It "canonicalizes a parent junction before installing <Runtime>" -TestCases $runtimeCases {
        param($Runtime, $Count, $Installer, $NoRunner)

        $actualParent = Join-Path $TestDrive "$Runtime-real"
        $linkedParent = Join-Path $TestDrive "$Runtime-link"
        New-Item -ItemType Directory -Path $actualParent -Force | Out-Null
        New-Item -ItemType Junction -Path $linkedParent -Target $actualParent | Out-Null
        $target = Join-Path $linkedParent "agents"
        $installArgs = @{
            Target = $target
            NoBackup = $true
            AgentProfile = "balanced"
            ModelSet = "default"
        }
        if ($NoRunner) {
            $installArgs.NoRunner = $true
        }

        & $Installer @installArgs | Out-Null
        $LASTEXITCODE | Should -Be 0

        $canonicalTarget = Join-Path $actualParent "agents"
        $manifestPath = Join-Path $canonicalTarget ".agents-pipeline-runtime-profile.json"
        (Test-Path -LiteralPath $manifestPath -PathType Leaf) | Should -BeTrue
        $manifest = Get-Content -LiteralPath $manifestPath -Raw | ConvertFrom-Json
        $manifest.managed_generated_count | Should -Be $Count
        (Resolve-Path -LiteralPath $manifest.target).ProviderPath | Should -Be (
            (Resolve-Path -LiteralPath $canonicalTarget).ProviderPath
        )
        (Test-Path -LiteralPath (Join-Path $actualParent "agents-pipeline") -PathType Container) | Should -BeTrue

        $statusText = & $profileWrapper -Action status -Runtime $Runtime -Target $target -Json
        $LASTEXITCODE | Should -Be 0
        $status = ($statusText | Out-String) | ConvertFrom-Json
        $status.installed | Should -BeTrue
        $status.health | Should -Be "ok"
    }

    It "keeps the Claude runner at the lexical workspace root when .claude is a junction" {
        $workspace = Join-Path $TestDrive "claude-workspace"
        $externalClaude = Join-Path $TestDrive "claude-external"
        New-Item -ItemType Directory -Path $workspace -Force | Out-Null
        New-Item -ItemType Directory -Path $externalClaude -Force | Out-Null
        New-Item -ItemType Junction -Path (Join-Path $workspace ".claude") -Target $externalClaude | Out-Null
        $target = Join-Path (Join-Path $workspace ".claude") "agents"
        $installer = Join-Path $repoRoot "scripts/install-claude.ps1"

        & $installer -Target $target -NoBackup -AgentProfile balanced -ModelSet default | Out-Null
        $LASTEXITCODE | Should -Be 0

        (Test-Path -LiteralPath (Join-Path $workspace "CLAUDE.md") -PathType Leaf) | Should -BeTrue
        (Test-Path -LiteralPath (Join-Path $externalClaude "CLAUDE.md")) | Should -BeFalse
        (Test-Path -LiteralPath (Join-Path (Join-Path $externalClaude "agents") ".agents-pipeline-runtime-profile.json") -PathType Leaf) | Should -BeTrue
    }
}

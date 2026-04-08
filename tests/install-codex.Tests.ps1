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

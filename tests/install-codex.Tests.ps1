$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
$scriptPath = Join-Path $repoRoot "scripts/install-codex.ps1"

function New-LoggingShim {
    param(
        [string]$Path,
        [string]$LogPath
    )

    @"
@echo off
setlocal
> "$LogPath" echo %*
exit /b 0
"@ | Set-Content -Path $Path -Encoding Ascii
}

Describe "install-codex.ps1 python resolution" {
    It "prefers the py launcher and pins -3" {
        $binDir = Join-Path $TestDrive "bin"
        $logPath = Join-Path $TestDrive "py.log"
        New-Item -ItemType Directory -Path $binDir | Out-Null
        New-LoggingShim -Path (Join-Path $binDir "py.cmd") -LogPath $logPath

        $previousPath = $env:PATH
        try {
            $env:PATH = "$binDir;$previousPath"
            & $scriptPath -Target ".\.tmp-codex-install" -DryRun | Out-Null
            $LASTEXITCODE | Should Be 0
        }
        finally {
            $env:PATH = $previousPath
        }

        $loggedArgs = Get-Content -Path $logPath -Raw
        $loggedArgs | Should Match "^-3\s"
        $loggedArgs | Should Match "install-codex-config\.py"
    }

    It "skips the WindowsApps python alias and uses python3 fallback" {
        $logPath = Join-Path $TestDrive "python3.log"
        $python3Shim = Join-Path $TestDrive "python3.cmd"
        New-LoggingShim -Path $python3Shim -LogPath $logPath

        Mock Get-Command { $null } -ParameterFilter { $Name -eq "py" }
        Mock Get-Command { [pscustomobject]@{ Source = "C:\Users\test\AppData\Local\Microsoft\WindowsApps\python.exe" } } -ParameterFilter { $Name -eq "python" }
        Mock Get-Command { [pscustomobject]@{ Source = $python3Shim } } -ParameterFilter { $Name -eq "python3" }

        & $scriptPath -Target ".\.tmp-codex-install" -DryRun | Out-Null
        $LASTEXITCODE | Should Be 0

        (Get-Content -Path $logPath -Raw) | Should Match "install-codex-config\.py"
    }

    It "fails clearly when only WindowsApps aliases are available" {
        Mock Get-Command { $null } -ParameterFilter { $Name -eq "py" }
        Mock Get-Command { [pscustomobject]@{ Source = "C:\Users\test\AppData\Local\Microsoft\WindowsApps\python.exe" } } -ParameterFilter { $Name -eq "python" }
        Mock Get-Command { [pscustomobject]@{ Source = "C:\Users\test\AppData\Local\Microsoft\WindowsApps\python3.exe" } } -ParameterFilter { $Name -eq "python3" }

        { & $scriptPath -Target ".\.tmp-codex-install" -DryRun } | Should Throw "Python runtime not found. Install Python or the py launcher. Windows Store python aliases are not supported for this installer."
    }
}

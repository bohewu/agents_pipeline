#!/usr/bin/env pwsh

$ErrorActionPreference = "Stop"
$Arguments = @($args)
$tool = Join-Path (Split-Path -Parent $MyInvocation.MyCommand.Path) "../tools/agent-profile.py"
if (-not (Test-Path -LiteralPath $tool -PathType Leaf)) {
    throw "Agent profile manager not found: $tool"
}

$python = $null
$pythonPrefix = @()
$py = Get-Command -Name py -ErrorAction SilentlyContinue
if ($py) {
    $python = $py.Source
    $pythonPrefix = @("-3")
} else {
    foreach ($name in @("python3", "python")) {
        $candidate = Get-Command -Name $name -ErrorAction SilentlyContinue
        if ($candidate -and $candidate.Source -notlike "*\Microsoft\WindowsApps\python*.exe") {
            $python = $candidate.Source
            break
        }
    }
}
if (-not $python) {
    throw "Python runtime not found. Install Python 3.11 or newer."
}

& $python @pythonPrefix -c "import sys; raise SystemExit(0 if sys.version_info >= (3, 11) else 1)"
if ($LASTEXITCODE -ne 0) {
    throw "Agent profile manager requires Python 3.11 or newer."
}

& $python @pythonPrefix $tool @Arguments
exit $LASTEXITCODE

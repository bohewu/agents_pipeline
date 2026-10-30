#!/usr/bin/env pwsh

$ErrorActionPreference = "Stop"
$Arguments = @($args)
$tool = [System.IO.Path]::Combine($PSScriptRoot, "decide.py")
if (-not [System.IO.File]::Exists($tool)) {
    throw "Decide launcher not found: $tool"
}

$python = $null
$pythonPrefix = @()
$py = Get-Command -Name py -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if ($py) {
    $python = $py.Source
    $pythonPrefix = @("-3")
} else {
    foreach ($name in @("python3", "python")) {
        $candidate = Get-Command -Name $name -CommandType Application -ErrorAction SilentlyContinue |
            Where-Object { $_.Source -notlike "*\Microsoft\WindowsApps\python*.exe" } |
            Select-Object -First 1
        if ($candidate) {
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
    throw "Decide requires Python 3.11 or newer."
}

& $python @pythonPrefix $tool @Arguments
exit $LASTEXITCODE

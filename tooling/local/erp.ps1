# A process-scoped launcher: never changes the machine/user PATH or another app.
[CmdletBinding()]
param(
    [Parameter(Position = 0)]
    [ValidateSet('check', 'dev', 'start', 'build', 'typecheck', 'lint', 'test', 'test:remediation', 'security:secrets', 'security:vendor')]
    [string] $Task = 'check',
    [string] $NodeDirectory = 'C:\dev\toolchains\node-v22.23.4-win-x64'
)

$ErrorActionPreference = 'Stop'
$erpRoot = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot '../..'))
$erpPackage = Get-Content -LiteralPath (Join-Path $erpRoot 'package.json') -Raw | ConvertFrom-Json
$erpNodeVersion = [string] $erpPackage.engines.node
$erpNpmVersion = ([string] $erpPackage.packageManager) -replace '^npm@', ''
if ($erpNodeVersion -notmatch '^\d+\.\d+\.\d+$' -or $erpNpmVersion -notmatch '^\d+\.\d+\.\d+$') {
    throw 'ERP requires exact engines.node and npm packageManager versions in package.json.'
}
if ($erpPackage.packageManager -ne "npm@$erpNpmVersion") {
    throw 'ERP package-manager and engine versions disagree; review them before running.'
}
$erpRuntime = (Resolve-Path -LiteralPath $NodeDirectory -ErrorAction Stop).ProviderPath
$erpNode = Join-Path $erpRuntime 'node.exe'
$erpNpm = Join-Path $erpRuntime 'node_modules/npm/bin/npm-cli.js'
if (!(Test-Path -LiteralPath $erpNode -PathType Leaf) -or !(Test-Path -LiteralPath $erpNpm -PathType Leaf)) {
    throw 'The selected ERP toolchain is incomplete. No installation or fallback to system Node was attempted.'
}

$erpOriginalPath = $env:PATH
$erpOriginalLocation = Get-Location
$erpExitCode = 0
try {
    # npm's child scripts also resolve the selected Node, not the shell default.
    $env:PATH = "$erpRuntime$([IO.Path]::PathSeparator)$erpOriginalPath"
    Set-Location -LiteralPath $erpRoot
    $erpActualNode = (& $erpNode --version | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $erpActualNode -ne "v$erpNodeVersion") {
        throw "ERP requires Node $erpNodeVersion; the selected toolchain reported $erpActualNode. Nothing was started."
    }
    $erpActualNpm = (& $erpNode $erpNpm --version | Out-String).Trim()
    if ($LASTEXITCODE -ne 0 -or $erpActualNpm -ne $erpNpmVersion) {
        throw "ERP requires npm $erpNpmVersion; the selected toolchain reported $erpActualNpm. Nothing was started."
    }
    if ($Task -eq 'check') {
        [PSCustomObject]@{ Node = $erpActualNode; Npm = $erpActualNpm; NodeExecutable = $erpNode; Project = $erpRoot } | ConvertTo-Json
    } else {
        if ($Task -eq 'dev' -or $Task -eq 'start') {
            Write-Warning 'This starts the local application with its existing environment. Localhost may use live data; saving can change live records.'
        }
        & $erpNode $erpNpm run $Task
        $erpExitCode = $LASTEXITCODE
    }
} finally {
    $env:PATH = $erpOriginalPath
    Set-Location -LiteralPath $erpOriginalLocation
}
if ($erpExitCode -ne 0) { exit $erpExitCode }

param(
    [Parameter(Mandatory=$true)][string]$OutputDirectory,
    [string]$JsonJar='C:\Program Files\Android\Android Studio\plugins\grazie\lib\org.json-json.jar'
)
$ErrorActionPreference='Stop'
$resolved=[IO.Path]::GetFullPath($OutputDirectory)
if(!$resolved.StartsWith('C:\dev\',[StringComparison]::OrdinalIgnoreCase)){throw 'Use a C:\dev output directory.'}
if((Test-Path -LiteralPath $resolved) -and @(Get-ChildItem -LiteralPath $resolved -Force).Count){throw 'Use a fresh output directory.'}
$classes=Join-Path $resolved 'classes'
New-Item -ItemType Directory -Force $classes | Out-Null
$production=@('CommunicationBudgetWorkspace','MobileCommunications') | ForEach-Object {Join-Path $PSScriptRoot "../../src/net/algt/mobiledms/$_.java"}
$hostFiles=@(Get-ChildItem -LiteralPath $PSScriptRoot -Recurse -Filter '*.java' -File)
& javac --release 8 -encoding UTF-8 -classpath $JsonJar -d $classes @production $hostFiles.FullName
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
& java -classpath "$classes;$JsonJar" net.algt.mobiledms.CommunicationBudgetWorkspaceTest
exit $LASTEXITCODE

param(
    [string]$OutputDirectory,
    [string]$JsonJar='C:\Program Files\Android\Android Studio\plugins\grazie\lib\org.json-json.jar'
)
$ErrorActionPreference='Stop'
if(!$OutputDirectory){throw 'Supply an empty output directory under C:\dev.'}
$resolved=[IO.Path]::GetFullPath($OutputDirectory)
if(!$resolved.StartsWith('C:\dev\',[StringComparison]::OrdinalIgnoreCase)){throw 'Use a C:\dev output directory.'}
if((Test-Path -LiteralPath $resolved) -and @(Get-ChildItem -LiteralPath $resolved -Force).Count){throw 'Use a fresh output directory.'}
$classes=Join-Path $resolved 'classes'
$data=Join-Path $resolved 'data'
New-Item -ItemType Directory -Force $classes,$data | Out-Null
$src=Join-Path $PSScriptRoot '../../src/net/algt/mobiledms'
$production=@('OfflineDocuments','OfflineGrant','LeasePolicy','EncryptedFiles') | ForEach-Object { Join-Path $src "$_.java" }
$hostFiles=@(Get-ChildItem -LiteralPath $PSScriptRoot -Recurse -Filter '*.java' -File)
& javac --release 8 -encoding UTF-8 -classpath $JsonJar -d $classes @production $hostFiles.FullName
if($LASTEXITCODE -ne 0){exit $LASTEXITCODE}
& java -classpath "$classes;$JsonJar" net.algt.mobiledms.OfflineLibraryHarness $data
exit $LASTEXITCODE

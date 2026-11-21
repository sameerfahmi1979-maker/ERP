param([Parameter(Mandatory=$true)][ValidatePattern('^mobile5_hr_[a-z0-9_]+$')][string]$Database)
$ErrorActionPreference='Stop'
$legacy=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'mobile-hr-self-service.native.sql')
$marker='CREATE TEMP TABLE mobile_case'
$at=$legacy.IndexOf($marker)
if($at -lt 0){throw 'Legacy synthetic setup changed.'}
$fixture=Get-Content -Raw -LiteralPath (Join-Path $PSScriptRoot 'mobile-5-hr-workflows.native.sql')
($legacy.Substring(0,$at)+$fixture+[Environment]::NewLine+'ROLLBACK;') | docker exec -i algt-hr-t00-db psql -X -v ON_ERROR_STOP=1 -U postgres -d $Database
exit $LASTEXITCODE

param(
    [Parameter(Mandatory)]
    [ValidateSet('build', 'test', 'test:runtime', 'test:agent', 'test:acceptance', 'test:ui', 'test:layout')]
    [string] $Task
)

$ErrorActionPreference = 'Stop'
New-Item -ItemType Directory -Path output/ci -Force | Out-Null
$log = Join-Path output/ci ($Task.Replace(':', '-') + '.log')
& npm run $Task 2>&1 | Tee-Object -FilePath $log
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

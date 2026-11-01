$ErrorActionPreference = 'Stop'

$repositoryRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$projectConfig = Get-Content (Join-Path $repositoryRoot 'supabase\config.toml') -Raw
$projectMatch = [regex]::Match($projectConfig, '(?m)^project_id\s*=\s*"([^"]+)"')

if (-not $projectMatch.Success) {
    throw 'Unable to determine the Supabase project_id from supabase/config.toml.'
}

$containerName = "supabase_db_$($projectMatch.Groups[1].Value)"
$runningContainers = & docker ps --filter "name=^/$containerName$" --format '{{.Names}}'
if ($LASTEXITCODE -ne 0) {
    throw 'Unable to query Docker. Ensure Docker is installed and running.'
}
if ($runningContainers -notcontains $containerName) {
    throw "Local Supabase database container '$containerName' is not running. Start it with 'npx supabase start'."
}

$legacyTests = Get-ChildItem $PSScriptRoot -Filter '*.sql' |
    Where-Object {
        $_.Name -notin @(
            '006_storage_security.sql',
            '017_access_security_privileges.sql',
            '018_scoped_rls.sql'
        )
    } |
    Sort-Object Name

foreach ($testFile in $legacyTests) {
    Write-Output "Running $($testFile.Name)"
    $sql = Get-Content $testFile.FullName -Raw
    $sql | & docker exec -i $containerName psql -U postgres -d postgres -v ON_ERROR_STOP=1
    if ($LASTEXITCODE -ne 0) {
        throw "Local SQL integration test failed: $($testFile.Name)"
    }
}

$pgTapTests = @(
    (Join-Path $PSScriptRoot '017_access_security_privileges.sql'),
    (Join-Path $PSScriptRoot '018_scoped_rls.sql')
)

Push-Location $repositoryRoot
try {
    Write-Output 'Running pgTAP access-security tests'
    & npx supabase test db $pgTapTests --local
    if ($LASTEXITCODE -ne 0) {
        throw 'Local pgTAP access-security tests failed.'
    }
}
finally {
    Pop-Location
}

Write-Output 'All local database tests passed.'

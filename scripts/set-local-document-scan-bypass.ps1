[CmdletBinding()]
param([switch]$Disable)

$ErrorActionPreference = 'Stop'

if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    $dockerBin = 'C:\Program Files\Docker\Docker\resources\bin'
    if (-not (Test-Path (Join-Path $dockerBin 'docker.exe'))) {
        throw 'Docker non disponibile.'
    }
    $env:Path = $dockerBin + ';' + $env:Path
}

$enabled = if ($Disable) { 'false' } else { 'true' }
& docker exec supabase_db_gestioneimmobili psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c `
    "update security.document_security_settings set allow_unscanned_downloads = $enabled where singleton returning allow_unscanned_downloads;"
if ($LASTEXITCODE -ne 0) {
    throw 'Impossibile configurare il bypass nel container Supabase locale.'
}
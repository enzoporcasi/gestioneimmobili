[CmdletBinding()]
param([switch]$Stop)

$ErrorActionPreference = 'Stop'
if (-not (Get-Command docker -ErrorAction SilentlyContinue)) {
    $dockerBin = 'C:\Program Files\Docker\Docker\resources\bin'
    if (-not (Test-Path (Join-Path $dockerBin 'docker.exe'))) { throw 'Docker non disponibile.' }
    $env:Path = $dockerBin + ';' + $env:Path
}
$container = 'gestioneimmobili_automation'
$existing = @(docker ps -a --filter "name=^/$container$" --format '{{.Names}}')
if ($LASTEXITCODE -ne 0) { throw 'Docker Desktop non risponde.' }
if ($Stop) {
    if ($existing -contains $container) {
        docker rm -f $container | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Arresto automazione fallito.' }
    }
    Write-Output 'Automazione locale arrestata; dati e coda notifiche conservati.'
    return
}

$root = Split-Path -Parent $PSScriptRoot
Push-Location $root
try {
    $statusOutput = @(npx --no-install supabase status --output json)
    if ($LASTEXITCODE -ne 0) { throw 'Avviare prima Supabase locale con npx supabase start.' }
    $status = ($statusOutput -join "`n") | ConvertFrom-Json
    if (-not $status.SERVICE_ROLE_KEY) { throw 'Chiave backend locale non disponibile.' }
    docker build -f scripts/automation/Dockerfile -t gestioneimmobili-automation:local .
    if ($LASTEXITCODE -ne 0) { throw 'Build worker automazione fallita.' }
    if ($existing -contains $container) {
        docker rm -f $container | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Sostituzione worker locale fallita.' }
    }
    $previous = [Environment]::GetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', 'Process')
    try {
        $env:SUPABASE_SERVICE_ROLE_KEY = $status.SERVICE_ROLE_KEY
        docker run -d --name $container --restart unless-stopped --network supabase_network_gestioneimmobili `
            --read-only --cap-drop ALL --security-opt no-new-privileges `
            --env SUPABASE_SERVICE_ROLE_KEY --env SUPABASE_URL=http://kong:8000 `
            --env SMTP_HOST=inbucket --env SMTP_PORT=1025 `
            --env 'SMTP_FROM=GestioneImmobili <notifiche@gestioneimmobili.test>' `
            --env APP_URL=http://127.0.0.1:5173 gestioneimmobili-automation:local | Out-Null
        if ($LASTEXITCODE -ne 0) { throw 'Avvio worker automazione fallito.' }
    } finally {
        [Environment]::SetEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY', $previous, 'Process')
    }
    Write-Output 'Automazione locale avviata. Email di test: http://127.0.0.1:54324'
} finally {
    Pop-Location
}
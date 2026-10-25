param(
    [Parameter(Mandatory = $true)]
    [string]$PublishableKey,

    [Parameter(Mandatory = $true)]
    [string]$SecretKey
)

$ErrorActionPreference = "Stop"

# Variabili usate dallo script Node.js eseguito su Windows.
$env:SUPABASE_URL = "http://127.0.0.1:54321"
$env:SUPABASE_ANON_KEY = $PublishableKey.Trim()
$env:SUPABASE_SERVICE_ROLE_KEY = $SecretKey.Trim()

# URL pubblico eventualmente utile ad altri script locali.
$env:SUPABASE_PUBLIC_URL = "http://127.0.0.1:54321"

if ([string]::IsNullOrWhiteSpace($env:SUPABASE_ANON_KEY)) {
    throw "SUPABASE_ANON_KEY non valorizzata."
}

if ([string]::IsNullOrWhiteSpace($env:SUPABASE_SERVICE_ROLE_KEY)) {
    throw "SUPABASE_SERVICE_ROLE_KEY non valorizzata."
}

if (-not $env:SUPABASE_ANON_KEY.StartsWith("sb_publishable_")) {
    Write-Warning "La Publishable Key non inizia con sb_publishable_. Controlla il valore restituito da 'npx supabase status'."
}

if (-not $env:SUPABASE_SERVICE_ROLE_KEY.StartsWith("sb_secret_")) {
    Write-Warning "La Secret Key non inizia con sb_secret_. Controlla il valore restituito da 'npx supabase status'."
}

Write-Host "Variabili Supabase configurate nella sessione PowerShell corrente." -ForegroundColor Green
Write-Host "SUPABASE_URL=$env:SUPABASE_URL"
Write-Host "SUPABASE_PUBLIC_URL=$env:SUPABASE_PUBLIC_URL"
Write-Host "SUPABASE_ANON_KEY configurata: $(-not [string]::IsNullOrWhiteSpace($env:SUPABASE_ANON_KEY))"
Write-Host "SUPABASE_SERVICE_ROLE_KEY configurata: $(-not [string]::IsNullOrWhiteSpace($env:SUPABASE_SERVICE_ROLE_KEY))"

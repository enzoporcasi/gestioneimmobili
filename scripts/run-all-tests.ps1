[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$PublishableKey,

    [Parameter(Mandatory = $true)]
    [string]$SecretKey,

    [string]$SupabaseUrl = "http://127.0.0.1:54321",

    [string]$FunctionEnvFile = ".\supabase\functions\.env.local",

    [switch]$SkipDbReset,

    [switch]$SkipEdgeFunction,

    [switch]$KeepEdgeFunctionRunning
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$script:Passed = [System.Collections.Generic.List[string]]::new()
$script:Failed = [System.Collections.Generic.List[string]]::new()
$edgeProcess = $null
$edgeStdOut = Join-Path $env:TEMP "gestioneimmobili-edge-stdout.log"
$edgeStdErr = Join-Path $env:TEMP "gestioneimmobili-edge-stderr.log"

function Write-Step([string]$Message) {
    Write-Host "`n==> $Message" -ForegroundColor Cyan
}

function Write-Pass([string]$Name) {
    $script:Passed.Add($Name)
    Write-Host "PASS: $Name" -ForegroundColor Green
}

function Assert-Command([string]$Name) {
    if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
        throw "Comando non trovato: $Name"
    }
}

function Invoke-Native {
    param(
        [Parameter(Mandatory = $true)][string]$Description,
        [Parameter(Mandatory = $true)][scriptblock]$Command
    )

    Write-Step $Description
    & $Command
    if ($LASTEXITCODE -ne 0) {
        throw "$Description fallito con exit code $LASTEXITCODE"
    }
    Write-Pass $Description
}

function Get-DbContainer {
    param(
        [int]$TimeoutSeconds = 90,
        [int]$PollMilliseconds = 1000
    )

    $deadline = (Get-Date).AddSeconds(
        $TimeoutSeconds
    )

    while ((Get-Date) -lt $deadline) {

        $containers = @(
            docker ps -a `
                --filter "name=supabase_db" `
                --format "{{.Names}}"
        )

        if ($LASTEXITCODE -ne 0) {
            Start-Sleep `
                -Milliseconds $PollMilliseconds

            continue
        }

        $name = $containers |
            Where-Object {
                -not [string]::IsNullOrWhiteSpace($_)
            } |
            Select-Object -First 1

        if (-not [string]::IsNullOrWhiteSpace($name)) {

            $name = $name.Trim()

            $running = docker inspect `
                --format "{{.State.Running}}" `
                $name

            if ($LASTEXITCODE -eq 0 -and
                $running.Trim() -eq "true") {

                $health = docker inspect `
                    --format "{{if .State.Health}}{{.State.Health.Status}}{{else}}none{{end}}" `
                    $name

                if ($LASTEXITCODE -eq 0) {

                    $health = $health.Trim()

                    if ($health -eq "healthy" -or
                        $health -eq "none") {

                        Write-Host `
                            "Database container: $name" `
                            -ForegroundColor DarkGray

                        Write-Host `
                            "Docker health: $health" `
                            -ForegroundColor DarkGray

                        return $name
                    }
                }
            }
        }

        Start-Sleep `
            -Milliseconds $PollMilliseconds
    }

    Write-Host "`nContainer Supabase rilevati:" `
        -ForegroundColor Yellow

    docker ps -a `
        --format "table {{.Names}}`t{{.Image}}`t{{.Status}}" |
        Select-String "supabase"

    throw @"
Container PostgreSQL Supabase non disponibile entro
$TimeoutSeconds secondi.

Eseguire:
  npx supabase status
  docker ps -a
"@
}
function Invoke-SqlTest {
    param(
        [Parameter(Mandatory = $true)][System.IO.FileInfo]$File,
        [Parameter(Mandatory = $true)][string]$DbContainer
    )

    Write-Step "SQL test $($File.Name)"
    $sql = Get-Content -LiteralPath $File.FullName -Raw
    $sql | & docker exec -i $DbContainer psql -v ON_ERROR_STOP=1 -U postgres -d postgres
    if ($LASTEXITCODE -ne 0) {
        $script:Failed.Add($File.Name)
        throw "Test SQL fallito: $($File.Name)"
    }
    Write-Pass $File.Name
}

function Wait-EdgeFunction {
    param([System.Diagnostics.Process]$Process)

    $deadline = (Get-Date).AddSeconds(45)
    while ((Get-Date) -lt $deadline) {
        if ($Process.HasExited) {
            $stderr = if (Test-Path $edgeStdErr) { Get-Content $edgeStdErr -Raw } else { "" }
            throw "Edge Function terminata prematuramente. Log: $stderr"
        }

        $combined = ""
        if (Test-Path $edgeStdOut) { $combined += Get-Content $edgeStdOut -Raw }
        if (Test-Path $edgeStdErr) { $combined += Get-Content $edgeStdErr -Raw }
        if ($combined -match "Serving functions on") {
            Write-Pass "Edge Function avviata"
            return
        }
        Start-Sleep -Milliseconds 500
    }

    throw "Timeout durante l'avvio della Edge Function. Controllare $edgeStdOut e $edgeStdErr"
}

try {
    Write-Host "GestioneImmobili - Test regressione locale" -ForegroundColor Yellow

    # Usa come root la cartella dalla quale viene invocato lo script.
    $repoRoot = (Get-Location).Path
    if (-not (Test-Path (Join-Path $repoRoot "supabase\config.toml"))) {
        throw "Eseguire lo script dalla root del repository: supabase/config.toml non trovato."
    }

    Assert-Command "docker"
    Assert-Command "node"
    Assert-Command "npm"
    Assert-Command "npx"

    $PublishableKey = $PublishableKey.Trim()
    $SecretKey = $SecretKey.Trim()
    if ([string]::IsNullOrWhiteSpace($PublishableKey) -or [string]::IsNullOrWhiteSpace($SecretKey)) {
        throw "PublishableKey e SecretKey sono obbligatorie."
    }

    # Variabili valide soltanto per questo processo e processi figli.
    $env:SUPABASE_URL = $SupabaseUrl.TrimEnd('/')
    $env:SUPABASE_PUBLIC_URL = $SupabaseUrl.TrimEnd('/')
    $env:SUPABASE_ANON_KEY = $PublishableKey
    $env:SUPABASE_SERVICE_ROLE_KEY = $SecretKey

    Invoke-Native "Verifica Docker" { docker info | Out-Null }
    Invoke-Native "Verifica Supabase CLI" { npx supabase --version }

    # Avvia lo stack se non e' gia' disponibile.
    $dbContainer = (& docker ps --filter "name=supabase_db" --format "{{.Names}}" | Select-Object -First 1)
    if ([string]::IsNullOrWhiteSpace($dbContainer)) {
        Invoke-Native "Avvio Supabase locale" { npx supabase start }
    } else {
        Write-Pass "Supabase locale gia avviato"
    }

    if (-not $SkipDbReset) {
        Invoke-Native "Reset database e applicazione migration/seed" { npx supabase db reset }
    } else {
        Write-Host "SKIP: db reset" -ForegroundColor Yellow
    }

    Write-Step "Attesa disponibilita database dopo il reset"
    $dbContainer = Get-DbContainer -TimeoutSeconds 90
    Write-Pass "Database Supabase disponibile"

    $testsDir = Join-Path $repoRoot "supabase\tests"
    if (-not (Test-Path $testsDir)) {
        throw "Cartella test non trovata: $testsDir"
    }

    # Esegue tutti i test SQL presenti, in ordine lessicografico.
    $sqlTests = Get-ChildItem -LiteralPath $testsDir -Filter "*.sql" -File | Sort-Object Name
    if ($sqlTests.Count -eq 0) {
        throw "Nessun test SQL trovato in $testsDir"
    }

    foreach ($test in $sqlTests) {
        Invoke-SqlTest -File $test -DbContainer $dbContainer
    }

    # Test Node.js. 012 richiede la Edge Function; avviamola prima di tutti i test JS.
    $nodeTests = Get-ChildItem -LiteralPath $testsDir -Filter "*.mjs" -File | Sort-Object Name

    if ($nodeTests.Count -gt 0) {
        $packageJson = Join-Path $repoRoot "package.json"
        if (-not (Test-Path $packageJson)) {
            throw "package.json non trovato."
        }

        Invoke-Native "Verifica dipendenze npm" { npm install --ignore-scripts }

        if (-not $SkipEdgeFunction) {
            $functionIndex = Join-Path $repoRoot "supabase\functions\create-document-download-url\index.ts"
            if (-not (Test-Path $functionIndex)) {
                throw "Edge Function non trovata: $functionIndex"
            }
            if (-not (Test-Path $FunctionEnvFile)) {
                throw "File env della Edge Function non trovato: $FunctionEnvFile"
            }

            Remove-Item $edgeStdOut, $edgeStdErr -Force -ErrorAction SilentlyContinue
            Write-Step "Avvio Edge Function create-document-download-url"

            $arguments = @(
                "/d", "/s", "/c",
                "npx supabase functions serve create-document-download-url --env-file `"$FunctionEnvFile`""
            )
            $edgeProcess = Start-Process `
                -FilePath "cmd.exe" `
                -ArgumentList $arguments `
                -WorkingDirectory $repoRoot `
                -RedirectStandardOutput $edgeStdOut `
                -RedirectStandardError $edgeStdErr `
                -PassThru `
                -WindowStyle Hidden

            Wait-EdgeFunction -Process $edgeProcess
        } else {
            Write-Host "SKIP: avvio Edge Function; si presume gia running" -ForegroundColor Yellow
        }

        foreach ($test in $nodeTests) {
            Invoke-Native "Node test $($test.Name)" { node $test.FullName }
        }
    }

    Write-Host "`n==============================================" -ForegroundColor Green
    Write-Host "TUTTI I TEST SONO PASSATI" -ForegroundColor Green
    Write-Host "Test passati: $($script:Passed.Count)" -ForegroundColor Green
    Write-Host "==============================================" -ForegroundColor Green
}
catch {
    Write-Host "`n==============================================" -ForegroundColor Red
    Write-Host "TEST SUITE FALLITA" -ForegroundColor Red
    Write-Host $_.Exception.Message -ForegroundColor Red
    Write-Host "Test passati prima dell'errore: $($script:Passed.Count)" -ForegroundColor Yellow
    if (Test-Path $edgeStdErr) {
        Write-Host "`nUltime righe Edge Function stderr:" -ForegroundColor Yellow
        Get-Content $edgeStdErr -Tail 30
    }
    exit 1
}
finally {
    if ($edgeProcess -and -not $KeepEdgeFunctionRunning) {
        try {
            if (-not $edgeProcess.HasExited) {
                Write-Host "`nArresto Edge Function avviata dalla suite..." -ForegroundColor DarkGray
                Stop-Process -Id $edgeProcess.Id -Force -ErrorAction SilentlyContinue
                # Ferma eventuali figli creati da cmd/npx associati al serve locale.
                & taskkill /PID $edgeProcess.Id /T /F 2>$null | Out-Null
            }
        } catch {
            Write-Warning "Impossibile arrestare automaticamente la Edge Function: $($_.Exception.Message)"
        }
    }
}

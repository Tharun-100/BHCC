param(
    [Security.SecureString]$PostgresPassword
)

$ErrorActionPreference = "Stop"

$backendDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$psqlCandidates = @(
    "C:\Program Files\PostgreSQL\18\bin\psql.exe",
    "C:\Program Files\PostgreSQL\17\bin\psql.exe",
    "C:\Program Files\PostgreSQL\16\bin\psql.exe",
    "C:\Program Files\PostgreSQL\15\bin\psql.exe"
)
$psqlPath = $psqlCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1

if (-not $psqlPath) {
    throw "PostgreSQL psql.exe was not found. Install PostgreSQL before running this script."
}

function New-RandomString {
    param([int]$Length)

    $characters = "abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789_-"
    $bytes = New-Object byte[] $Length
    $generator = [System.Security.Cryptography.RandomNumberGenerator]::Create()
    try {
        $generator.GetBytes($bytes)
    }
    finally {
        $generator.Dispose()
    }
    return -join ($bytes | ForEach-Object { $characters[$_ % $characters.Length] })
}

function Invoke-Psql {
    param([string[]]$Arguments)

    $result = & $psqlPath @Arguments
    if ($LASTEXITCODE -ne 0) {
        throw "PostgreSQL command failed. Check the postgres password and try again."
    }
    return ($result | Out-String).Trim()
}

$securePassword = $PostgresPassword
if (-not $securePassword) {
    $securePassword = Read-Host "Enter the password for the PostgreSQL 'postgres' user" -AsSecureString
}
$passwordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($securePassword)

try {
    $env:PGPASSWORD = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($passwordPointer)
    Invoke-Psql -Arguments @("-U", "postgres", "-h", "localhost", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", "SELECT 1;") | Out-Null

    $applicationPassword = New-RandomString -Length 32
    $djangoSecret = New-RandomString -Length 64

    $roleExists = Invoke-Psql -Arguments @("-U", "postgres", "-h", "localhost", "-d", "postgres", "-tAc", "SELECT 1 FROM pg_roles WHERE rolname='bhcc_user';")
    if ($roleExists -ne "1") {
        Invoke-Psql -Arguments @("-U", "postgres", "-h", "localhost", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", "CREATE ROLE bhcc_user LOGIN PASSWORD '$applicationPassword';") | Out-Null
    }
    else {
        Invoke-Psql -Arguments @("-U", "postgres", "-h", "localhost", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", "ALTER ROLE bhcc_user WITH LOGIN PASSWORD '$applicationPassword';") | Out-Null
    }

    $databaseExists = Invoke-Psql -Arguments @("-U", "postgres", "-h", "localhost", "-d", "postgres", "-tAc", "SELECT 1 FROM pg_database WHERE datname='bhcc';")
    if ($databaseExists -ne "1") {
        Invoke-Psql -Arguments @("-U", "postgres", "-h", "localhost", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", "CREATE DATABASE bhcc OWNER bhcc_user;") | Out-Null
    }
    else {
        Invoke-Psql -Arguments @("-U", "postgres", "-h", "localhost", "-d", "postgres", "-v", "ON_ERROR_STOP=1", "-c", "ALTER DATABASE bhcc OWNER TO bhcc_user;") | Out-Null
    }

    $environmentContent = @"
DJANGO_SECRET_KEY=$djangoSecret
DJANGO_DEBUG=true
DJANGO_ALLOWED_HOSTS=localhost,127.0.0.1
CORS_ALLOWED_ORIGINS=http://localhost:3000

POSTGRES_DB_HOST=localhost
POSTGRES_DB_PORT=5432
POSTGRES_DB_NAME=bhcc
POSTGRES_DB_USER=bhcc_user
POSTGRES_DB_PASSWORD=$applicationPassword
POSTGRES_DB_SSLMODE=prefer

RAZORPAY_KEY_ID=
RAZORPAY_KEY_SECRET=
SENDGRID_API_KEY=
CLINIC_TO_EMAIL=bhaktivedantahealthcarecentre@gmail.com
"@
    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText((Join-Path $backendDirectory ".env"), $environmentContent, $utf8WithoutBom)

    $pythonCandidates = @(
        (Join-Path $backendDirectory ".venv\Scripts\python.exe"),
        (Join-Path $backendDirectory "venv\Scripts\python.exe")
    )
    $pythonPath = $pythonCandidates | Where-Object { Test-Path $_ } | Select-Object -First 1
    if (-not $pythonPath) {
        throw "The backend virtual environment was not found. Create it and install requirements first."
    }

    Push-Location $backendDirectory
    try {
        & $pythonPath manage.py migrate --noinput
        if ($LASTEXITCODE -ne 0) {
            throw "Django migrations failed."
        }
    }
    finally {
        Pop-Location
    }

    Write-Host ""
    Write-Host "BHCC PostgreSQL setup completed successfully." -ForegroundColor Green
    Write-Host "Start Django with: python manage.py runserver 0.0.0.0:8000"
}
finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($passwordPointer)
}

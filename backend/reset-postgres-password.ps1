$ErrorActionPreference = "Stop"

$identity = [Security.Principal.WindowsIdentity]::GetCurrent()
$principal = New-Object Security.Principal.WindowsPrincipal($identity)
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw "Run PowerShell as Administrator, then run this script again."
}

$backendDirectory = Split-Path -Parent $MyInvocation.MyCommand.Path
$serviceName = "postgresql-x64-18"
$psqlPath = "C:\Program Files\PostgreSQL\18\bin\psql.exe"
$authenticationPath = "C:\Program Files\PostgreSQL\18\data\pg_hba.conf"

if (-not (Test-Path $psqlPath) -or -not (Test-Path $authenticationPath)) {
    throw "PostgreSQL 18 files were not found in the expected installation directory."
}
if (-not (Get-Service -Name $serviceName -ErrorAction SilentlyContinue)) {
    throw "The PostgreSQL 18 Windows service was not found."
}

$newSecurePassword = Read-Host "Choose a new password for the PostgreSQL 'postgres' user" -AsSecureString
$confirmedSecurePassword = Read-Host "Confirm the new password" -AsSecureString
$newPasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($newSecurePassword)
$confirmedPasswordPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($confirmedSecurePassword)

try {
    $newPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($newPasswordPointer)
    $confirmedPassword = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($confirmedPasswordPointer)

    if ($newPassword -ne $confirmedPassword) {
        throw "Passwords do not match."
    }
    if ($newPassword.Length -lt 12) {
        throw "Use a password containing at least 12 characters."
    }
    if ($newPassword -notmatch '^[A-Za-z0-9_@#%+=.-]+$') {
        throw "For this reset, use only letters, numbers, and these symbols: _ @ # % + = . -"
    }

    $originalAuthentication = [System.IO.File]::ReadAllText($authenticationPath)
    $temporaryAuthentication = $originalAuthentication
    $temporaryAuthentication = $temporaryAuthentication -replace '(?m)^(\s*host\s+all\s+all\s+127\.0\.0\.1/32\s+)\S+', '${1}trust'
    $temporaryAuthentication = $temporaryAuthentication -replace '(?m)^(\s*host\s+all\s+all\s+::1/128\s+)\S+', '${1}trust'

    if ($temporaryAuthentication -eq $originalAuthentication) {
        throw "Could not locate the localhost authentication rules in pg_hba.conf."
    }

    $utf8WithoutBom = New-Object System.Text.UTF8Encoding($false)
    try {
        [System.IO.File]::WriteAllText($authenticationPath, $temporaryAuthentication, $utf8WithoutBom)
        Restart-Service -Name $serviceName -Force
        Start-Sleep -Seconds 2

        Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
        & $psqlPath -U postgres -h 127.0.0.1 -d postgres -v ON_ERROR_STOP=1 -c "ALTER ROLE postgres WITH PASSWORD '$newPassword';"
        if ($LASTEXITCODE -ne 0) {
            throw "PostgreSQL rejected the password reset."
        }
    }
    finally {
        [System.IO.File]::WriteAllText($authenticationPath, $originalAuthentication, $utf8WithoutBom)
        Restart-Service -Name $serviceName -Force
        Start-Sleep -Seconds 2
    }

    $env:PGPASSWORD = $newPassword
    & $psqlPath -U postgres -h localhost -d postgres -v ON_ERROR_STOP=1 -c "SELECT 1;" | Out-Null
    if ($LASTEXITCODE -ne 0) {
        throw "The new PostgreSQL password could not be verified."
    }
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue

    & (Join-Path $backendDirectory "setup-postgres.ps1") -PostgresPassword $newSecurePassword
    if ($LASTEXITCODE -ne 0) {
        throw "PostgreSQL password was reset, but BHCC database setup did not finish."
    }

    Write-Host "PostgreSQL password reset and BHCC database setup completed." -ForegroundColor Green
}
finally {
    Remove-Item Env:PGPASSWORD -ErrorAction SilentlyContinue
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($newPasswordPointer)
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($confirmedPasswordPointer)
}

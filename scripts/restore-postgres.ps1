param([Parameter(Mandatory=$true)][string]$Backup, [switch]$ConfirmRestore)
$ErrorActionPreference = "Stop"
if (-not $ConfirmRestore) { throw "Restore replaces database contents. Re-run with -ConfirmRestore after verifying the target and backup." }
$resolved = (Resolve-Path -LiteralPath $Backup).Path
Get-Content -AsByteStream -Raw -LiteralPath $resolved | docker compose exec -T database sh -c 'pg_restore --clean --if-exists --no-owner -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
docker compose exec -T backend python manage.py migrate --noinput
Write-Output "Restore completed. Run application smoke tests before reopening traffic."

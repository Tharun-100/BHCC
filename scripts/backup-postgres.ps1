param([string]$Destination = ".\backups")
$ErrorActionPreference = "Stop"
New-Item -ItemType Directory -Force -Path $Destination | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$output = Join-Path (Resolve-Path $Destination) "bhcc-$stamp.dump"
docker compose exec -T database sh -c 'pg_dump -Fc -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | Set-Content -AsByteStream -Path $output
if ((Get-Item $output).Length -lt 1024) { throw "Backup is unexpectedly small; inspect the database container logs." }
Write-Output "Backup created: $output"

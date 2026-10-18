param([Parameter(Mandatory=$true)][string]$Arquivo,[Parameter(Mandatory=$true)][string]$NovoBanco)
$ErrorActionPreference='Stop'
if($NovoBanco -notmatch '^restore_[a-z0-9_]{1,48}$') { throw 'Use um novo nome começando por restore_ e apenas letras minúsculas, números e sublinhado.' }
$source=(Resolve-Path -LiteralPath $Arquivo).Path
Set-Location -LiteralPath (Join-Path $PSScriptRoot '..')
$container=(docker compose ps -q database).Trim()
if(!$container) { throw 'Banco deste projeto não está em execução.' }
$remote='/tmp/emendas-restore-'+[guid]::NewGuid().ToString()+'.dump'
try {
    docker exec $container createdb -U emendas $NovoBanco
    if($LASTEXITCODE -ne 0) { throw 'O banco de destino já existe ou não pôde ser criado. Nenhum banco foi sobrescrito.' }
    docker cp $source "${container}:$remote"
    if($LASTEXITCODE -ne 0) { throw 'A cópia do arquivo falhou.' }
    docker exec $container pg_restore -U emendas -d $NovoBanco --no-owner --no-acl --single-transaction $remote
    if($LASTEXITCODE -ne 0) { throw 'Restauração falhou; o banco de destino deve ser inspecionado antes de uso.' }
    docker exec $container psql -U emendas -d $NovoBanco -v ON_ERROR_STOP=1 -c 'TRUNCATE spring_session CASCADE;'
    if($LASTEXITCODE -ne 0) { throw 'Falha ao revogar as sessões da cópia restaurada.' }
    Write-Host "Cópia restaurada no novo banco $NovoBanco. O banco operacional foi preservado."
} finally { docker exec $container rm -f -- $remote }

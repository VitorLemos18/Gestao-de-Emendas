param([string]$Destino=(Join-Path $PSScriptRoot '../backups'))
$ErrorActionPreference='Stop'
Set-Location -LiteralPath (Join-Path $PSScriptRoot '..')
$container=(docker compose ps -q database).Trim()
if(!$container) { throw 'Banco deste projeto não está em execução.' }
$null=New-Item -ItemType Directory -Force -Path $Destino
$file=Join-Path ([IO.Path]::GetFullPath($Destino)) ('emendas-'+(Get-Date -Format 'yyyyMMdd-HHmmss')+'-'+[guid]::NewGuid().ToString('N').Substring(0,8)+'.dump')
$remote='/tmp/emendas-backup-'+[guid]::NewGuid().ToString()+'.dump'
try {
    docker exec $container pg_dump -U emendas -d emendas -Fc -f $remote
    if($LASTEXITCODE -ne 0) { throw 'O pg_dump falhou.' }
    docker cp "${container}:$remote" $file
    if($LASTEXITCODE -ne 0) { throw 'A cópia do backup falhou.' }
    Get-FileHash -LiteralPath $file -Algorithm SHA256 | Format-List
} finally { docker exec $container rm -f -- $remote }

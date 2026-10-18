$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
$target=Join-Path $PSScriptRoot '.env'
if(Test-Path -LiteralPath $target) { Write-Host 'O ambiente já está configurado. O arquivo .env foi preservado.'; exit 0 }
$bytes=New-Object byte[] 32
$rng=[System.Security.Cryptography.RandomNumberGenerator]::Create()
try { $rng.GetBytes($bytes) } finally { $rng.Dispose() }
$password=[Convert]::ToBase64String($bytes)
$text="DB_PASSWORD=$password`nDB_PORT=15432`nPORT=8000`nCOOKIE_SECURE=false`nDOCS_ENABLED=true`n"
[IO.File]::WriteAllText($target,$text,(New-Object Text.UTF8Encoding($false)))
Write-Host 'Configuração local criada. A senha do banco foi gerada; não compartilhe o arquivo .env.'

param([switch]$CriarAdministrador)
$ErrorActionPreference='Stop'
Set-Location -LiteralPath $PSScriptRoot
if(!(Test-Path -LiteralPath '.env')) { & (Join-Path $PSScriptRoot 'Preparar-Ambiente.ps1') }
foreach($line in Get-Content -LiteralPath '.env') {
    if($line -match '^([A-Z_]+)=(.*)$') { [Environment]::SetEnvironmentVariable($matches[1],$matches[2],'Process') }
}
$env:DB_URL="jdbc:postgresql://127.0.0.1:$($env:DB_PORT)/emendas"
$env:DB_USER='emendas'
docker compose up -d database
if($LASTEXITCODE -ne 0) { throw 'Não foi possível iniciar o banco.' }
if(!(Test-Path -LiteralPath 'target/emendas-backend-0.2.0.jar')) {
    & (Join-Path $PSScriptRoot 'mvnw.cmd') -B verify
    if($LASTEXITCODE -ne 0) { throw 'A verificação do projeto falhou.' }
}
try {
    if($CriarAdministrador) {
        $env:BOOTSTRAP_ADMIN_EMAIL=Read-Host 'E-mail do primeiro administrador'
        $env:BOOTSTRAP_ADMIN_NAME=Read-Host 'Nome do primeiro administrador'
        $secret=Read-Host 'Senha inicial (12 a 128 caracteres)' -AsSecureString
        $ptr=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($secret)
        try { $env:BOOTSTRAP_ADMIN_PASSWORD=[Runtime.InteropServices.Marshal]::PtrToStringBSTR($ptr) }
        finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($ptr) }
    }
    java -jar target/emendas-backend-0.2.0.jar
} finally {
    Remove-Item Env:BOOTSTRAP_ADMIN_PASSWORD -ErrorAction SilentlyContinue
    Remove-Item Env:BOOTSTRAP_ADMIN_EMAIL -ErrorAction SilentlyContinue
    Remove-Item Env:BOOTSTRAP_ADMIN_NAME -ErrorAction SilentlyContinue
}

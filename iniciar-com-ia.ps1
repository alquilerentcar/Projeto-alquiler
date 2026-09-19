$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

Write-Host 'Ativar assistente IA da Alquiler Rent Car'
Write-Host 'Cole sua chave da OpenAI abaixo. A digitação ficará oculta.'
$apiKeySecure = Read-Host 'OPENAI_API_KEY' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($apiKeySecure)
try {
    $env:OPENAI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}

if (-not $env:OPENAI_API_KEY.StartsWith('sk-')) {
    Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
    Write-Error 'A chave informada não parece ser uma chave da OpenAI.'
    exit 1
}

try {
    Write-Host 'Iniciando o site em http://localhost:3000'
    node server.js
} finally {
    Remove-Item Env:OPENAI_API_KEY -ErrorAction SilentlyContinue
}

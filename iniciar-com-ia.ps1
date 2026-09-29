$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

Write-Host 'Ativar assistente IA da Alquiler Rent Car'
Write-Host 'Cole sua chave do Gemini abaixo. A digitação ficará oculta.'
$apiKeySecure = Read-Host 'GEMINI_API_KEY' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($apiKeySecure)
try {
    $env:GEMINI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}

if ([string]::IsNullOrWhiteSpace($env:GEMINI_API_KEY) -or $env:GEMINI_API_KEY.Length -lt 20) {
    Remove-Item Env:GEMINI_API_KEY -ErrorAction SilentlyContinue
    Write-Error 'A chave informada não parece ser uma chave do Gemini.'
    exit 1
}

try {
    Write-Host 'Iniciando o site em http://localhost:3000'
    node server.js
} finally {
    Remove-Item Env:GEMINI_API_KEY -ErrorAction SilentlyContinue
}

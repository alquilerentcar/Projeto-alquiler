$ErrorActionPreference = 'Stop'
Set-Location -LiteralPath $PSScriptRoot

Write-Host 'Análise de documentos da Alquiler'
Write-Host 'A execução piloto analisará até 20 documentos de cinco clientes.'
$secure = Read-Host 'Cole a chave do Gemini' -AsSecureString
$pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secure)
try {
    $env:GEMINI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
} finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
}

$python = 'C:\Users\PC\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe'
if (-not (Test-Path -LiteralPath $python)) { throw 'Python do Codex não encontrado.' }
try {
    & $python "$PSScriptRoot\importar_documentos.py" --limite 20 --cliente ABMAEL --cliente 'ANA PAULA' --cliente ALEILSON --cliente STANLEY --cliente TITO
} finally {
    Remove-Item Env:GEMINI_API_KEY -ErrorAction SilentlyContinue
}

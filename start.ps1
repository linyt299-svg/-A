$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot

if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host '未找到 Node.js，请先安装 Node.js 18 或以上版本。' -ForegroundColor Red
    exit 1
}

$version = node --version
Write-Host "观澜投研 · StockLens  |  Node $version" -ForegroundColor DarkGreen
Write-Host '启动后访问：http://127.0.0.1:4173' -ForegroundColor Gray
node --watch server.js

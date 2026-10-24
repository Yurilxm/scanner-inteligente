Write-Host "Criando pasta e scripts do Control Excel..." -ForegroundColor Cyan

# Fonte unica dos scripts: a pasta Controle_Excel do repositorio
$sourcePath = Join-Path $PSScriptRoot "Controle_Excel"
foreach ($file in @("atualizar_planilha.py", "Atualizar_Planilha.bat")) {
    if (!(Test-Path (Join-Path $sourcePath $file))) {
        Write-Host "ERRO: $file nao encontrado em $sourcePath" -ForegroundColor Red
        exit 1
    }
}

if (!(Get-Command python -ErrorAction SilentlyContinue)) {
    Write-Host "ERRO: Python nao encontrado. Instale em python.org (marque 'Add to PATH')." -ForegroundColor Red
    exit 1
}

python -c "import openpyxl" 2>$null
if ($LASTEXITCODE -ne 0) {
    Write-Host "Instalando openpyxl (biblioteca para ler/gravar Excel)..."
    python -m pip install --user openpyxl
    if ($LASTEXITCODE -ne 0) {
        Write-Host "ERRO: nao foi possivel instalar o openpyxl." -ForegroundColor Red
        exit 1
    }
}

$desktopPath = [Environment]::GetFolderPath("Desktop")
$folderPath = Join-Path $desktopPath "Control_Planilha"
if (!(Test-Path -Path $folderPath)) {
    New-Item -ItemType Directory -Path $folderPath | Out-Null
}

# Atualiza so os scripts; CSVs, planilha e backups ja existentes na pasta sao preservados
Copy-Item (Join-Path $sourcePath "atualizar_planilha.py") $folderPath -Force
Copy-Item (Join-Path $sourcePath "Atualizar_Planilha.bat") $folderPath -Force

Write-Host "Tudo pronto! Pasta: $folderPath" -ForegroundColor Green

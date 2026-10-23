
Write-Host "Iniciando setup do Control..." -ForegroundColor Cyan
if (!(Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "ERRO: Node.js nao encontrado. Instale em nodejs.org" -ForegroundColor Red
    exit
}
Write-Host "Instalando dependencias..."
npm install
Write-Host "Rodando Expo Prebuild..."
npx expo prebuild --clean
Write-Host "Aplicando workaround do Gradle..."
$gradleFile = "android\app\build.gradle"
if (Test-Path $gradleFile) {
    $content = Get-Content $gradleFile -Raw
    if ($content -notmatch "buildStagingDirectory") {
        $content = $content -replace "android \{", "android {`n    externalNativeBuild {`n        cmake {`n            buildStagingDirectory file(\"C:/cxx-build\")`n        }`n    }"
        Set-Content -Path $gradleFile -Value $content
        Write-Host "Workaround aplicado!" -ForegroundColor Green
    }
}
Write-Host "Setup concluido! Rode: npx expo run:android --variant release" -ForegroundColor Cyan

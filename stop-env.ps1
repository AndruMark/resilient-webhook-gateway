Write-Host "Deteniendo contenedores de Docker..." -ForegroundColor Yellow
wsl docker compose down
Write-Host "Apagando WSL2 y liberando memoria RAM (Hyper-V / vmmem)..." -ForegroundColor Yellow
wsl --shutdown
Write-Host "`nWSL2 detenido por completo. Consumo de recursos: 0." -ForegroundColor Green

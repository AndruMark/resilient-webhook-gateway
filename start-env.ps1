Write-Host "Iniciando Docker y servicios en WSL2..." -ForegroundColor Cyan
wsl sudo service docker start
wsl docker compose up -d
Start-Sleep -Seconds 3
Test-NetConnection -ComputerName 127.0.0.1 -Port 5433
Write-Host "`nEntorno activo y listo para desarrollo." -ForegroundColor Green

# start-laptop.ps1
# Start harian (LAPTOP dev): Mosquitto + Backend (:3001) + Dashboard
# Jalanin tiap mau pake sistem dari laptop
#vsts jalanin nya .\scripts\start-laptop.ps1

$root = Split-Path -Parent $PSScriptRoot   # = folder project ini
$port = 3001
$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

Write-Host "=== START BRIDGE SHMS (LAPTOP) ===" -ForegroundColor Cyan

# 1. Mosquitto (service Windows)
Write-Host "[1/3] Mosquitto... " -NoNewline
$svc = Get-Service mosquitto -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq 'Running') {
    Write-Host "OK (running)" -ForegroundColor Green
} elseif ($svc) {
    Start-Service mosquitto -ErrorAction SilentlyContinue
    Start-Sleep 1
    if ((Get-Service mosquitto).Status -eq 'Running') { Write-Host "OK (started)" -ForegroundColor Green }
    else { Write-Host "GAGAL - cek manual" -ForegroundColor Red }
} else {
    Write-Host "GAGAL - mosquitto belum diinstall" -ForegroundColor Red
}

# 2. Backend via PM2 (port 3001)
Write-Host "[2/3] Backend (:3001)... " -NoNewline
if (Get-Command pm2 -ErrorAction SilentlyContinue) {
    Push-Location $root
    $env:HTTP_PORT = "$port"
    $list = pm2 list 2>$null
    if ($list -match "shms-laptop") {
        pm2 restart shms-laptop 2>$null
        Write-Host "OK (PM2 restart)" -ForegroundColor Green
    } else {
        pm2 start "dist\index.js" --name shms-laptop 2>$null
        Write-Host "OK (PM2 start)" -ForegroundColor Green
    }
    Pop-Location
} else {
    # Fallback: node background (build dulu kalau dist belum ada)
    Push-Location $root
    if (-not (Test-Path "dist\index.js")) { npm run build 2>$null }
    if (Get-NetTCPConnection -LocalPort $port -State Listen -ErrorAction SilentlyContinue) {
        Write-Host "OK (port $port sudah jalan)" -ForegroundColor Green
    } else {
        Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoExit", "-Command", "cd '$root'; `$env:HTTP_PORT='$port'; node dist/index.js"
        Write-Host "OK (background)" -ForegroundColor Green
    }
    Pop-Location
}

# 3. Buka dashboard
Write-Host "[3/3] Dashboard... " -NoNewline
Start-Process "http://localhost:$port"
Write-Host "OK" -ForegroundColor Green

# Info IP buat ESP32
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -eq 'Wi-Fi' }).IPAddress
Write-Host ""
Write-Host "IP Laptop (WiFi): $ip" -ForegroundColor Yellow
Write-Host "Isi IP di atas ke WiFi Manager ESP32" -ForegroundColor Gray
Write-Host ""
Write-Host "Done! Dashboard: http://localhost:$port" -ForegroundColor Cyan

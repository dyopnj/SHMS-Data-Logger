# start-minipc.ps1
# Start harian: Mosquitto + Backend + Dashboard
# Jalanin tiap mau pake sistem

$root = "D:\bridge-monitoring"
$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

Write-Host "=== START BRIDGE SHMS ===" -ForegroundColor Cyan

# 1. Mosquitto
Write-Host "[1/3] Mosquitto... " -NoNewline
$svc = Get-Service mosquitto -ErrorAction SilentlyContinue
if ($svc -and $svc.Status -eq 'Running') {
    Write-Host "OK (running)" -ForegroundColor Green
} elseif ($svc) {
    Start-Service mosquitto -ErrorAction SilentlyContinue
    Start-Sleep 1
    $svc = Get-Service mosquitto
    if ($svc.Status -eq 'Running') { Write-Host "OK (started)" -ForegroundColor Green }
    else { Write-Host "GAGAL — butuh Admin" -ForegroundColor Red }
} else {
    Write-Host "LEWAT — Mosquitto gak terinstall" -ForegroundColor Yellow
}

# 2. Backend via PM2
Write-Host "[2/3] Backend... " -NoNewline
$pm2Ok = Get-Command pm2 -ErrorAction SilentlyContinue
if ($pm2Ok) {
    $list = pm2 list 2>$null
    if ($list -match "shms-backend") {
        pm2 restart shms-backend 2>$null
        Write-Host "OK (PM2 restart)" -ForegroundColor Green
    } else {
        pm2 start "$root\dist\index.js" --name shms-backend 2>$null
        Write-Host "OK (PM2 start)" -ForegroundColor Green
    }
} else {
    # Fallback langsung
    $p = Get-Process -Name "node" -ErrorAction SilentlyContinue
    if ($p) {
        Write-Host "OK (sudah jalan)" -ForegroundColor Green
    } else {
        Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoExit", "-Command", "cd '$root'; npm run serve"
        Write-Host "OK (background)" -ForegroundColor Green
    }
}

# 3. Buka dashboard
Write-Host "[3/3] Dashboard... " -NoNewline
Start-Process "http://localhost:3000"
Write-Host "OK" -ForegroundColor Green

# Info IP buat ESP32
$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -eq 'Wi-Fi' }).IPAddress
Write-Host ""
Write-Host "IP Mini PC (WiFi): $ip" -ForegroundColor Yellow
Write-Host "Isi IP di atas ke WiFi Manager ESP32" -ForegroundColor Gray
Write-Host ""
Write-Host "Done! Dashboard: http://localhost:3000" -ForegroundColor Cyan

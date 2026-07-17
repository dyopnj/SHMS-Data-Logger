# start-minipc.ps1
# Start semua service: Mosquitto + Backend + Buka Dashboard
# Jalanin tiap mau pake sistem (setelah setup pertama via update-minipc.ps1)

$root = Split-Path -Parent $PSScriptRoot

Write-Host "=== START BRIDGE SHMS ===" -ForegroundColor Cyan

# 1. Mosquitto
Write-Host "[1/3] Mosquitto... " -NoNewline
$svc = Get-Service mosquitto -ErrorAction SilentlyContinue
if ($svc) {
    if ($svc.Status -ne 'Running') { Start-Service mosquitto }
    Write-Host "OK" -ForegroundColor Green
} else {
    Write-Host "LEWAT (gak terinstall)" -ForegroundColor Yellow
}

# 2. Backend via PM2 (kalo ada)
Write-Host "[2/3] Backend... " -NoNewline
$pm2Ok = $null -ne (Get-Command pm2 -ErrorAction SilentlyContinue)
if ($pm2Ok) {
    $pm2List = pm2 list 2>$null
    if ($pm2List -match "bridge-monitoring") {
        pm2 restart bridge-monitoring 2>$null
        Write-Host "OK (PM2 restart)" -ForegroundColor Green
    } else {
        pm2 start "$root/dist/index.js" --name bridge-monitoring 2>$null
        Write-Host "OK (PM2 start)" -ForegroundColor Green
    }
} else {
    # Fallback: start langsung di background process
    $p = Get-Process -Name "node" -ErrorAction SilentlyContinue | Where-Object { $_.CommandLine -match "dist/index" }
    if ($p) {
        Write-Host "OK (sudah jalan)" -ForegroundColor Green
    } else {
        Start-Process powershell -WindowStyle Hidden -ArgumentList "-NoExit", "-Command", "cd '$root'; npm run serve"
        Write-Host "OK (background)" -ForegroundColor Green
    }
}

# 3. Buka browser
Write-Host "[3/3] Dashboard... " -NoNewline
Start-Process "http://localhost:3000"
Write-Host "OK" -ForegroundColor Green

Write-Host ""
Write-Host "Done! Dashboard: http://localhost:3000" -ForegroundColor Cyan
Write-Host "[3/3] Dashboard:" -ForegroundColor Cyan
Write-Host "  Buka browser → http://localhost:3000" -ForegroundColor White
Write-Host ""

Write-Host "=== DONE ===" -ForegroundColor Green

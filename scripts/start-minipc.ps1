# start-minipc.ps1
# Start semua service: Mosquitto + Backend + Buka Dashboard
# Jalanin tiap mau pake sistem (setelah setup pertama via update-minipc.ps1)

$root = Split-Path -Parent $PSScriptRoot

Write-Host "=== START BRIDGE SHMS ===" -ForegroundColor Cyan

# 1. Mosquitto — coba service dulu, fallback start manual
Write-Host "[1/3] Mosquitto... " -NoNewline
$svc = Get-Service mosquitto -ErrorAction SilentlyContinue
if ($svc) {
    if ($svc.Status -eq 'Running') {
        Write-Host "OK (running)" -ForegroundColor Green
    } else {
        try {
            Start-Service mosquitto -ErrorAction Stop
            Write-Host "OK (service)" -ForegroundColor Green
        } catch {
            # Fallback: start manual biar gak perlu Admin
            $mosqExe = "C:\Program Files\Mosquitto\mosquitto.exe"
            $mosqConf = "C:\Program Files\Mosquitto\mosquitto.conf"
            if ((Test-Path $mosqExe) -and -not (Get-Process -Name mosquitto -ErrorAction SilentlyContinue)) {
                if (Test-Path $mosqConf) {
                    Start-Process $mosqExe -ArgumentList '-c', $mosqConf, '-v' -WindowStyle Hidden
                } else {
                    Start-Process $mosqExe -ArgumentList '-v' -WindowStyle Hidden
                }
                Write-Host "OK (manual)" -ForegroundColor Green
            } else {
                Write-Host "OK (sudah jalan)" -ForegroundColor Green
            }
        }
    }
} else {
    # Fallback kalo service gak terdaftar tapi exe ada
    $mosqExe = "C:\Program Files\Mosquitto\mosquitto.exe"
    $mosqConf = "C:\Program Files\Mosquitto\mosquitto.conf"
    if ((Test-Path $mosqExe) -and -not (Get-Process -Name mosquitto -ErrorAction SilentlyContinue)) {
        if (Test-Path $mosqConf) {
            Start-Process $mosqExe -ArgumentList '-c', $mosqConf, '-v' -WindowStyle Hidden
        } else {
            Start-Process $mosqExe -ArgumentList '-v' -WindowStyle Hidden
        }
        Write-Host "OK (manual)" -ForegroundColor Green
    } else {
        Write-Host "OK (sudah jalan)" -ForegroundColor Green
    }
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

# Info IP buat ESP32
Write-Host ""
Write-Host "[INFO] IP Mini PC — isi ke WiFi Manager ESP32:" -ForegroundColor Cyan
$adapters = Get-NetIPAddress -AddressFamily IPv4 | Where-Object {
    $_.InterfaceAlias -notlike '*Loopback*' -and
    $_.InterfaceAlias -notlike '*Virtual*' -and
    $_.InterfaceAlias -notlike '*Bluetooth*' -and
    $_.PrefixOrigin -ne 'WellKnown'
}
foreach ($a in $adapters) {
    Write-Host "  $($a.InterfaceAlias) : " -NoNewline -ForegroundColor Cyan
    Write-Host "$($a.IPAddress)" -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Done! Dashboard: http://localhost:3000" -ForegroundColor Cyan
Write-Host ""
Write-Host "=== DONE ===" -ForegroundColor Green

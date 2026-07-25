# update-minipc.ps1
# Setup pertama / update project di Mini PC Lenovo
# Jalanin: PowerShell → kanan "Run with PowerShell"

$root = "D:\bridge-monitoring"
$repoUrl = "https://github.com/dyopnj/SHMS-Data-Logger.git"
$logFile = "$root\setup.log"
$ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

function Log { param($m) "$ts $m" | Tee-Object -FilePath $logFile -Append }

# ─── CEK FOLDER ────────────────────────────────────
$existing = Test-Path $root
Log "============================================"
if (-not $existing) {
    Log "SETUP PERTAMA — Clone repo"
    Log "Repo: $repoUrl"
    git clone $repoUrl $root 2>&1 | ForEach-Object { Log $_ }
    if (-not (Test-Path $root)) { Log "ERROR: Clone gagal"; exit 1 }
} else {
    Log "UPDATE — Git pull"
    Push-Location $root
    git stash --include-untracked 2>$null
    git pull --rebase origin master 2>&1 | ForEach-Object { Log $_ }
    if ($LASTEXITCODE -ne 0) {
        Log "  Rebase gagal, fallback reset --hard"
        git fetch origin 2>$null
        git reset --hard origin/master 2>&1 | ForEach-Object { Log $_ }
    }
    Pop-Location
}

# ─── INSTALL DEPENDENCIES ──────────────────────────
Log "--- Install dependencies & build ---"
Push-Location $root
npm install 2>&1 | ForEach-Object { Log $_ }
npm run build 2>&1 | ForEach-Object { Log $_ }
Pop-Location

# ─── INSTALL PM2 (kalo belum) ──────────────────────
$pm2Ok = Get-Command pm2 -ErrorAction SilentlyContinue
if (-not $pm2Ok) {
    Log "--- Install PM2 ---"
    npm install -g pm2 2>&1 | ForEach-Object { Log $_ }
}

# ─── START MOSQUITTO SERVICE ───────────────────────
Log "--- Start Mosquitto ---"
$svc = Get-Service mosquitto -ErrorAction SilentlyContinue
if ($svc) {
    if ($svc.Status -eq 'Running') { Log "  Mosquitto: sudah running" }
    else {
        Start-Service mosquitto -ErrorAction SilentlyContinue
        Start-Sleep 1
        $svc = Get-Service mosquitto
        if ($svc.Status -eq 'Running') { Log "  Mosquitto: OK (service started)" }
        else { Log "  Mosquitto: GAGAL start — jalankan PowerShell sebagai Admin" }
    }
}

# ─── START BACKEND via PM2 ─────────────────────────
Log "--- Start Backend ---"
$list = pm2 list 2>$null
if ($list -match "shms-backend") {
    pm2 restart shms-backend 2>&1 | ForEach-Object { Log $_ }
    Log "  Backend: restart via PM2"
} else {
    pm2 start "$root\dist\index.js" --name shms-backend --log "$root\pm2.log" 2>&1 | ForEach-Object { Log $_ }
    Log "  Backend: start via PM2"
}
pm2 save 2>$null

# ─── INFO ──────────────────────────────────────────
Log "--- SETUP SELESAI ---"
Log "Dashboard : http://localhost:3000"
Log "PM2 status: pm2 status"

$ip = (Get-NetIPAddress -AddressFamily IPv4 | Where-Object { $_.InterfaceAlias -eq 'Wi-Fi' }).IPAddress
Log "IP Mini PC (WiFi): $ip"
Log "Isi IP di atas ke WiFi Manager ESP32 sebagai MQTT Broker"

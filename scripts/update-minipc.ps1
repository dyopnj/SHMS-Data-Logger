# update-minipc.ps1
# Satu klik SETUP + UPDATE: install dependencies + pull + build + restart
# Cara jalanin: klik kanan → "Run with PowerShell"

$root = Split-Path -Parent $PSScriptRoot
if (-not (Test-Path (Join-Path $root "package.json"))) {
    Write-Host "Folder ini bukan project SHMS. Jalankan script dari folder project yang sudah di-clone." -ForegroundColor Red
    exit 1
}

$logFile = Join-Path $root "setup.log"

function Log { param($msg) $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"; "$ts $msg" | Tee-Object -FilePath $logFile -Append }
function CheckApp { param($cmd) $null = Get-Command $cmd -ErrorAction SilentlyContinue; return $? }

Log "============================================"
Log "SETUP MINI PC - BRIDGE SHMS"
Log "============================================"

# ─── CEK & INSTALL ─────────────────────────────────

# 1. Git
Log "[1/6] Cek Git..."
if (CheckApp git) {
    Log "  OK Git sudah terinstall"
} else {
    Log "  Git belum ada. Install via winget..."
    winget install --id Git.Git --silent 2>&1 | ForEach-Object { Log $_ }
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    if (CheckApp git) {
        Log "  OK Git berhasil diinstall"
    } else {
        Log "  Git gagal install. Download manual dari https://git-scm.com/download/win"
        Read-Host "Tekan Enter setelah Git terinstall..."
    }
}

# 2. Node.js
Log "[2/6] Cek Node.js..."
if (CheckApp node) {
    $nv = node --version
    Log "  OK Node.js $nv"
} else {
    Log "  Node.js belum ada."
    Log '  Download & install dari https://nodejs.org/ (pilih LTS)'
    Log "  Pastikan centang 'Automatically install necessary tools'"
    Start-Process "https://nodejs.org/"
    Read-Host "Tekan Enter setelah Node.js terinstall..."
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    if (CheckApp node) {
        Log "  OK Node.js berhasil diinstall"
    } else {
        Log "  Node.js masih gak kedetek. Restart PowerShell & jalanin ulang script."
        Read-Host "Tekan Enter untuk lanjut..."
    }
}

# 3. Mosquitto
Log "[3/6] Cek Mosquitto..."
$mqttSvc = Get-Service mosquitto -ErrorAction SilentlyContinue
if ($mqttSvc) {
    Log "  OK Mosquitto sudah terinstall"
} else {
    Log "  Mosquitto belum ada. Install via winget..."
    winget install --id EclipseMosquitto.Mosquitto --silent 2>&1 | ForEach-Object { Log $_ }
    $mqttSvc = Get-Service mosquitto -ErrorAction SilentlyContinue
    if ($mqttSvc) {
        Log "  OK Mosquitto berhasil diinstall"
    } else {
        Log "  Mosquitto gagal install via winget."
        Log "  Download manual: https://mosquitto.org/download/"
        Read-Host "Tekan Enter setelah Mosquitto terinstall..."
        $mqttSvc = Get-Service mosquitto -ErrorAction SilentlyContinue
    }
}

# 4. Git pull
Log "[4/6] Git pull..."
try {
    Push-Location $root
    git stash --include-untracked 2>&1 | Out-Null
    git pull --rebase origin main 2>&1 | ForEach-Object { Log $_ }
    if ($LASTEXITCODE -ne 0) {
        Log "  Rebase gagal, fallback ke reset --hard..."
        git fetch origin 2>&1 | Out-Null
        git reset --hard origin/main 2>&1 | ForEach-Object { Log $_ }
    }
    Pop-Location
} catch {
    Log "  ERROR git pull: $_"
    Pop-Location
}

# 5. npm install + build
Log "[5/6] Install dependencies & build..."
Push-Location $root
npm install 2>&1 | ForEach-Object { Log $_ }
npm run build 2>&1 | ForEach-Object { Log $_ }
Pop-Location

# ─── JALANKAN SERVICE ──────────────────────────────

Log ""
Log "--- START SERVICE ---"

# Start Mosquitto
if ($mqttSvc) {
    if ($mqttSvc.Status -ne 'Running') {
        Start-Service mosquitto
        Log "  Mosquitto: di-start"
    } else {
        Log "  Mosquitto: sudah running"
    }
}

# Cek PM2
$pm2Ok = CheckApp pm2
if ($pm2Ok) {
    $pm2List = pm2 list 2>$null
    if ($pm2List -match "bridge-monitoring") {
        pm2 restart bridge-monitoring 2>&1 | ForEach-Object { Log $_ }
        Log "  Backend: di-restart via PM2"
    } else {
        Log "  Backend: jalankan 'pm2 start dist/index.js --name bridge-monitoring'"
    }
} else {
    Log "  Backend: buka PowerShell baru, lalu:"
    Log "    cd $root"
    Log "    npm run serve"
}

# Info dashboard
Log ""
Log "============================================"
Log "SETUP SELESAI"
Log "============================================"
Log "Dashboard: http://localhost:3000"
Log "Log file : $logFile"
Log ""
Log "Kalo pake mock data (testing tanpa ESP32):"
Log "  cd $root && npx tsx mock/publisher.ts"

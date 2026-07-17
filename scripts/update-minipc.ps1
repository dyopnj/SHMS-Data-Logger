# update-minipc.ps1
# Satu klik SETUP + UPDATE: install dependencies + pull + build + restart
# Jalanin:
#   - Pertama kali (Mini PC kosong): otomatis install Git, Mosquitto, Node.js
#   - Selanjutnya: git pull + npm install + build + restart backend
#
# Cara jalanin: klik kanan → "Run with PowerShell"

$root = Split-Path -Parent $PSScriptRoot
$logFile = Join-Path $root "setup.log"

function Log { param($msg) $ts = Get-Date -Format "yyyy-MM-dd HH:mm:ss"; "$ts $msg" | Tee-Object -FilePath $logFile -Append }
function CheckApp { param($name, $cmd) $null = Get-Command $cmd -ErrorAction SilentlyContinue; return $? }

Log "============================================"
Log "SETUP MINI PC - BRIDGE SHMS"
Log "============================================"

# ─── CEK & INSTALL DEPENDENCIES ─────────────────────────────────

# 1. Git
Log "[1/6] Cek Git..."
if (CheckApp "Git" git) {
    Log "  ✓ Git sudah terinstall"
} else {
    Log "  ✗ Git belum ada. Install via winget..."
    winget install --id Git.Git --silent 2>&1 | ForEach-Object { Log $_ }
    # winget butuh refresh PATH
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    if (CheckApp "Git" git) {
        Log "  ✓ Git berhasil diinstall"
    } else {
        Log "  ✗ Git gagal install. Install manual: https://git-scm.com/download/win"
        Read-Host "Tekan Enter setelah Git terinstall..."
    }
}

# 2. Node.js
Log "[2/6] Cek Node.js..."
if (CheckApp "Node" node) {
    $nv = node --version
    Log "  ✓ Node.js $nv"
} else {
    Log "  ✗ Node.js belum ada."
    Log "  Download & install dari https://nodejs.org/ (pilih LTS)"
    Log "  Pastikan centang 'Automatically install necessary tools'"
    Start-Process "https://nodejs.org/"
    Read-Host "Tekan Enter setelah Node.js terinstall..."
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    if (CheckApp "Node" node) {
        Log "  ✓ Node.js berhasil diinstall"
    } else {
        Log "  ✗ Node.js masih gak kedetek. Restart PowerShell & jalanin ulang script."
        Read-Host "Tekan Enter untuk lanjut..."
    }
}

# 3. Mosquitto
Log "[3/6] Cek Mosquitto..."
$mqttSvc = Get-Service mosquitto -ErrorAction SilentlyContinue
if ($mqttSvc) {
    Log "  ✓ Mosquitto sudah terinstall"
} else {
    Log "  ✗ Mosquitto belum ada. Install via winget..."
    winget install --id EclipseMosquitto.Mosquitto --silent 2>&1 | ForEach-Object { Log $_ }
    $mqttSvc = Get-Service mosquitto -ErrorAction SilentlyContinue
    if ($mqttSvc) {
        Log "  ✓ Mosquitto berhasil diinstall"
    } else {
        Log "  ✗ Mosquitto gagal install via winget."
        Log "  Download manual: https://mosquitto.org/download/"
        Read-Host "Tekan Enter setelah Mosquitto terinstall..."
        $mqttSvc = Get-Service mosquitto -ErrorAction SilentlyContinue
    }
}

# 4. Clone repo kalo belum ada
Log "[4/6] Cek repo..."
$gitDir = Join-Path $root ".git"
if (Test-Path $gitDir) {
    Log "  ✓ Repo sudah di-clone"
} else {
    Log "  ✗ Repo belum ada. Clone dari GitHub..."
    $parent = Split-Path $root -Parent
    Push-Location $parent
    git clone https://github.com/dyopnj/SHMS-Data-Logger.git 2>&1 | ForEach-Object { Log $_ }
    Pop-Location
    if (Test-Path $gitDir) {
        Log "  ✓ Clone berhasil"
    } else {
        Log "  ✗ Clone gagal. Cek koneksi internet & coba manual:"
        Log "    cd $parent && git clone https://github.com/dyopnj/SHMS-Data-Logger.git"
        Read-Host "Tekan Enter setelah repo siap..."
    }
}

# ─── UPDATE ────────────────────────────────────────────────────

# 5. Git pull
Log "[5/6] Git pull..."
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

# 6. npm install + build
Log "[6/6] Install dependencies & build..."
Push-Location $root
npm install 2>&1 | ForEach-Object { Log $_ }
npm run build 2>&1 | ForEach-Object { Log $_ }
Pop-Location

# ─── JALANKAN SERVICE ──────────────────────────────────────────

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
$pm2Ok = CheckApp "PM2" pm2
if ($pm2Ok) {
    $pm2List = pm2 list 2>$null
    if ($pm2List -match "bridge-monitoring") {
        pm2 restart bridge-monitoring 2>&1 | ForEach-Object { Log $_ }
        Log "  Backend: di-restart via PM2"
    } else {
        Log "  Backend: jalankan 'pm2 start dist/index.js --name bridge-monitoring'"
    }
} else {
    Log "  Backend: buka PowerShell baru → cd $root → npm run serve"
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
```


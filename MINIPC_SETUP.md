# Panduan Setup Mini PC — Bridge SHMS

> **Tujuan:** Menjalankan backend, MQTT broker, dan dashboard monitoring di Mini PC.
> **OS Target:** Windows (sama seperti laptop). 
> **Tidak ada CLI AI agent** — semua dijalankan manual.

---

## Daftar Isi

1. [Cek Prasyarat](#1-cek-prasyarat)
2. [Install Node.js](#2-install-nodejs)
3. [Install Mosquitto MQTT Broker](#3-install-mosquitto-mqtt-broker)
4. [Clone / Copy Project](#4-clone--copy-project)
5. [Install Dependency & Build](#5-install-dependency--build)
6. [Jalankan Semua](#6-jalankan-semua)
7. [Test & Verifikasi](#7-test--verifikasi)
8. [Deploy Firmware ESP32](#8-deploy-firmware-esp32)
9. [Update Kode (Pull Perubahan)](#9-update-kode-pull-perubahan)
10. [Troubleshooting](#10-troubleshooting)

---

## 1. Cek Prasyarat

Buka **PowerShell** atau **Command Prompt**, jalankan satu per satu:

```powershell
# Cek OS & arsitektur
winver
# → Minimal Windows 10 64-bit

# Cek RAM & disk kosong
systeminfo | findstr "Total Physical Memory"
fsutil volume diskfree C:
# → Minimal 2GB RAM, 500MB free disk

# Cek koneksi internet
ping google.com
# → Pastikan ada reply
```

---

## 2. Install Node.js

### 2.1 Download & Install

1. Buka https://nodejs.org/
2. Download versi **LTS** (misal 20.x atau 22.x) — pilih **Windows Installer (.msi) 64-bit**
3. Jalankan installer:
   - ✅ Centang "I accept the terms"
   - ✅ Biarkan default `C:\Program Files\nodejs\`
   - ✅ **Centang "Automatically install the necessary tools"** (ini akan install Chocolatey + Python + VS Build Tools)
   - Klik Install → tunggu selesai → restart PC

### 2.2 Verifikasi

Buka PowerShell baru, jalankan:

```powershell
node --version
# → Contoh: v20.18.0

npm --version
# → Contoh: 10.8.2
```

Jika muncul error `'node' is not recognized`, **restart dulu PowerShell**-nya. Kalau masih error, install ulang.

---

## 3. Install Mosquitto MQTT Broker

Ada 2 cara. Pilih salah satu.

### Cara A: Install via winget (Paling mudah)

```powershell
winget install EclipseMosquitto.Mosquitto
```

### Cara B: Install manual

1. Buka https://mosquitto.org/download/
2. Download **mosquitto-2.x.x-install-windows-x64.exe**
3. Jalankan installer:
   - ✅ Centang "Service" (biarkan jalan di background)
   - ✅ Default folder `C:\Program Files\Mosquitto\`
4. Selesai

### Cara C: Via Docker (kalau ada Docker Desktop)

```powershell
docker run -d `
  --name mqtt `
  -p 1883:1883 `
  -v "D:\Data Logger SHMS\broker\mosquitto.conf:C:\mosquitto\config\mosquitto.conf" `
  eclipse-mosquitto:2
```

### Verifikasi Mosquitto berjalan

```powershell
# Cek service
Get-Service mosquitto

# Atau cek port 1883 sudah listening
netstat -an | findstr ":1883"
```

> **Kalau pakai cara A/B:** Service Mosquitto otomatis jalan setelah install. Untuk mengubah konfigurasi, edit file `C:\Program Files\Mosquitto\mosquitto.conf` — isi sesuai `broker/mosquitto.conf` di project ini (allow anonymous, listener 1883).

---

## 4. Clone / Copy Project

> **PENTING:** Mini PC akan update dari Git. Jadi pakai **Git Clone**, jangan copy manual.

### Install Git (kalau belum ada)

```powershell
winget install Git.Git
```

### Clone repo

```powershell
cd D:\
git clone https://github.com/dyopnj/SHMS-Data-Logger.git
mv SHMS-Data-Logger bridge-monitoring   # rename biar pendek
cd bridge-monitoring
```

Atau dari flashdisk (hanya untuk pertama kali, lalu set remote git-nya):

```powershell
# Copy dari flashdisk dulu ke D:\bridge-monitoring
cd D:\bridge-monitoring
git init
git remote add origin https://github.com/dyopnj/SHMS-Data-Logger.git
git fetch origin
git reset --hard origin/main
```

---

## 5. Install Dependency & Build

```powershell
# Pindah ke folder project
cd D:\bridge-monitoring

# Install semua dependency (ini butuh koneksi internet)
npm install

# Kalau mau lihat progress-nya
# npm install akan download: express, mqtt, better-sqlite3, ws, typescript, tsx, dll

# Build TypeScript → JavaScript
npm run build

# Kalau build sukses, folder dist/ akan terisi
# Cek hasilnya:
dir dist
# → Harus ada file: index.js, api.js, mqtt.js, db.js, fft.js, config.js, types.js
```

### Troubleshooting `npm install`

| Error | Solusi |
|---|---|
| `'npm' is not recognized` | Restart PowerShell, atau install ulang Node.js |
| `better-sqlite3` gagal build | Install VS Build Tools: jalankan PowerShell sebagai Admin → `npm install --global windows-build-tools` |
| SSL/network error | `npm config set registry https://registry.npmjs.org/` lalu coba lagi |
| EACCES / permission | Jalankan PowerShell sebagai **Administrator** |
| Proses lambat | Biarkan, `npm install` perlu download beberapa package |

---

## 6. Jalankan Semua

Ada beberapa komponen yang harus jalan **bersamaan** di terminal terpisah:

### 6.1 Jalankan Mosquitto (kalau belum jalan)

```powershell
# Cek dulu
Get-Service mosquitto | Format-Table Status

# Kalau belum running:
Start-Service mosquitto

# Atau jalankan manual (untuk lihat log):
& "C:\Program Files\Mosquitto\mosquitto.exe" -c "C:\Program Files\Mosquitto\mosquitto.conf" -v
```

### 6.2 Jalankan Backend (Production)

Buka **PowerShell baru** (biarkan Mosquitto tetap jalan):

```powershell
cd D:\bridge-monitoring
npm run serve
```

Atau kalau mau langsung pakai TypeScript (tanpa build):

```powershell
cd D:\bridge-monitoring
npm run start
```

**Output yang diharapkan:**
```
[Gateway] Starting Bridge Monitoring Gateway...
[Gateway] Broker: mqtt://localhost:1883, Port: 3000
[API] Server at http://localhost:3000
[MQTT] Terhubung ke mqtt://localhost:1883
[MQTT] Subscribe: bridge/node_01/data, bridge/node_01/raw
[MQTT] Subscribe: bridge/node_02/data, bridge/node_02/raw
```

### 6.3 Buka Dashboard

1. Buka browser di Mini PC
2. Akses: `http://localhost:3000`
3. Dashboard akan muncul (masih kosong karena belum ada data sensor)

### 6.4 (Opsional) Jalankan Mock Publisher

Kalau mau test tanpa node ESP32 (dummy data):

Buka **PowerShell baru** (terminal ke-3):

```powershell
cd D:\bridge-monitoring
npx tsx mock\publisher.ts
```

**Output:**
```
[Mock] Connected to mqtt://localhost:1883
[Mock] Published 10 messages
[Mock] Published 10 messages
...
```

Dashboard sekarang harus menampilkan data real-time.

### Pakai Script (Rekomendasi)

Ada 2 script di folder `scripts/`:

```powershell
# Start semua service
.\scripts\start-minipc.ps1
# → Akan muncul petunjuk start Mosquitto + backend
```

### Ringkasan Terminal

| Terminal | Perintah | Fungsi |
|---|---|---|
| 1 | `Start-Service mosquitto` | MQTT broker |
| 2 | `npm run serve` | Backend + API + WebSocket |
| 3 (opsional) | `npx tsx mock\publisher.ts` | Mock data sensor |

---

## 7. Test & Verifikasi

### 7.1 Cek API

```powershell
# Test API endpoint — buka PowerShell lain
curl http://localhost:3000/api/node_01/config
# → {"node_id":"node_01","sampling_rate":200}

curl http://localhost:3000/api/threshold/vibration
# → {"param":"vibration","value":0.5}

curl http://localhost:3000/api/readings/node_01?limit=5
# → Array data sensor (kalau mock/nodes sudah kirim data)
```

### 7.2 Cek WebSocket

Buka browser → `http://localhost:3000` → buka **Developer Tools (F12)** → tab **Console**

Harusnya muncul koneksi WebSocket aktif (status "Connected" di pojok kanan atas dashboard).

### 7.3 Cek Database

Database file akan terbuat otomatis di `D:\bridge-monitoring\data.db`.

Untuk inspeksi manual:

```powershell
# Install sqlite3 CLI (opsional)
winget install SQLite.SQLite

sqlite3 data.db ".tables"
# → alerts, fft_results, node_config, readings, thresholds

sqlite3 data.db "SELECT count(*) FROM readings"
# → Jumlah data yang sudah masuk
```

### 7.4 Cek MQTT langsung (via mosquitto_sub)

```powershell
# Install mosquitto (sudah dari step 3)
& "C:\Program Files\Mosquitto\mosquitto_sub.exe" -h localhost -t "bridge/#" -v
# → Akan tampil semua message MQTT yang lewat
```

---

## 8. Deploy Firmware ESP32

### 8.1 Via PlatformIO (Rekomendasi)

Di laptop (bukan Mini PC):

```powershell
cd D:\Data Logger SHMS\node
pio run --target upload
```

### 8.2 Via Arduino IDE

1. Download & install Arduino IDE dari https://www.arduino.cc/en/software
2. Install ESP32 board support:
   - File → Preferences → "Additional Boards Manager URLs" → paste: `https://raw.githubusercontent.com/espressif/arduino-esp32/gh-pages/package_esp32_index.json`
   - Tools → Board → Boards Manager → cari "ESP32" → install
3. Install libraries:
   - Tools → Manage Libraries → cari & install:
     - `Adafruit MPU6050` by Adafruit
     - `PubSubClient` by Nick O'Leary
     - `RTClib` by Adafruit
     - `ArduinoJson` by Benoit Blanchon
4. Buka `node/node.ino` di Arduino IDE
5. Edit `config.h`:

```cpp
const char* WIFI_SSID = "SSID_WIFI_ANDA";
const char* WIFI_PASS = "PASSWORD_WIFI_ANDA";
const char* MQTT_BROKER = "192.168.1.XXX";  // ← GANTI dengan IP Mini PC
const char* NODE_ID = "node_01";            // node_02 untuk node kedua
```

> **Cara cari IP Mini PC:** Di PowerShell Mini PC jalanin `ipconfig | findstr "IPv4"`. Gunakan IP itu untuk `MQTT_BROKER`.

6. Pilih board: **Tools → Board → ESP32 Arduino → ESP32 Dev Module**
7. Klik **Upload** (panah kanan)
8. Setelah upload, buka **Tools → Serial Monitor** → set baud rate **115200** → lihat output

### 8.3 Cek Node Terkoneksi

Kalau ESP32 sudah connect, di terminal backend (terminal 2) akan muncul:

```
[MQTT] Message: bridge/node_01/data
[MQTT] Message: bridge/node_01/raw
```

Dan dashboard akan menampilkan data real-time dari node.

---

## 9. Update Kode (Pull Perubahan)

### Alur Update (Laptop → Mini PC)

```
Laptop:    git commit → git push
Mini PC:   jalanin update-minipc.ps1 (otomatis pull + install + build)
```

### Di Laptop — Push perubahan

```bash
cd "D:\Data Logger SHMS"
git add .
git commit -m "deskripsi perubahan"
git push
```

### Di Mini PC — Satu klik update

Ada 2 cara:

**Cara A: Klik kanan script (paling gampang)**
1. Buka File Explorer → `D:\bridge-monitoring\scripts\`
2. Klik kanan `update-minipc.ps1` → **Run with PowerShell**
3. Script otomatis:
   - ✅ `git pull --rebase` (ambil kode terbaru)
   - ✅ `npm install` (install dependency baru kalo ada)
   - ✅ `npm run build` (compile TypeScript)
   - ✅ Deteksi kalo pake PM2, restart otomatis
   - ✅ Cek Mosquitto jalan
4. Kalau backend **tidak** pakai PM2, manual restart:
   - Ctrl+C di terminal backend lama
   - `npm run serve`

**Cara B: Manual (PowerShell)**

```powershell
cd D:\bridge-monitoring
git pull
npm install
npm run build
# Ctrl+C di terminal backend, lalu:
npm run serve
```

> **Catatan:** `update-minipc.ps1` otomatis `git stash` perubahan lokal kalo ada konflik, jadi aman dijalanin kapan aja.

### Flow Update Harian

```
Laptop:
  edit kode → commit → push

Mini PC:
  klik 2x update-minipc.ps1 → done ✅
```

---

## 10. Troubleshooting

### Mosquitto gagal start

```
Error: Cannot open file C:\Program Files\Mosquitto\mosquitto.conf
```

**Solusi:** Jalankan PowerShell sebagai **Administrator**.

```
Error: Address already in use
```

**Solusi:** Port 1883 sudah dipakai. Cek dengan `netstat -ano | findstr :1883`. Matikan proses lain atau ganti port di konfigurasi.

### Backend error: `Cannot connect to MQTT`

```
[MQTT] Error: Connection refused
```

**Solusi:**
1. Pastikan Mosquitto sudah jalan (cek `Get-Service mosquitto`)
2. Cek firewall: `New-NetFirewallRule -DisplayName "MQTT 1883" -Direction Inbound -Protocol TCP -LocalPort 1883 -Action Allow`
3. Test koneksi: `& "C:\Program Files\Mosquitto\mosquitto_sub.exe" -h localhost -t "test"`

### Dashboard putih / blank

**Solusi:**
1. Buka DevTools (F12) → Console — lihat error
2. Pastikan folder `public/` ada di sebelah `dist/`
3. Pastikan path relatif benar — file `index.html` harus bisa akses `style.css` dan `app.js`

### Database error

```
SQLITE_CANTOPEN: unable to open database file
```

**Solusi:** Cek path `DB_PATH` di env variable. Default `./data.db` — pastikan user punya write access ke folder project.

### Mock publisher error

```
Cannot find module 'mqtt'
```

**Solusi:** Jalanin `npm install` dulu di folder project.

### Node ESP32 tidak connect WiFi

**Cek:**
1. SSID & password di `config.h` sudah benar
2. ESP32 dalam range WiFi
3. Mini PC dan ESP32 satu jaringan yang sama
4. Cek Serial Monitor di Arduino IDE untuk log koneksi

### Firewall blocking

Kalau dashboard kebuka dari browser device lain tapi data tidak masuk:

```powershell
# Buka port 1883 (MQTT) sama 3000 (HTTP)
New-NetFirewallRule -DisplayName "SHMS Port 3000" -Direction Inbound -Protocol TCP -LocalPort 3000 -Action Allow
New-NetFirewallRule -DisplayName "SHMS Port 1883" -Direction Inbound -Protocol TCP -LocalPort 1883 -Action Allow
```

### `better-sqlite3` rebuild error

Kalau pindah laptop/Mini PC dengan arsitektur berbeda:

```powershell
npm rebuild better-sqlite3
```

---

## Cheatsheet Cepat

### Pertama kali di Mini PC (baru clone)

```powershell
# 1. Install Node.js (download dari web)
# 2. Install Mosquitto
winget install EclipseMosquitto.Mosquitto

# 3. Setup project
cd D:\bridge-monitoring
npm install
npm run build

# 4. Jalanin Mosquitto
Start-Service mosquitto

# 5. Jalanin backend
npm run serve

# 6. Buka browser → http://localhost:3000
```

### Setiap kali mau pake (udah pernah setup)

```powershell
# 1. Mosquitto
Start-Service mosquitto

# 2. Backend
cd D:\bridge-monitoring
npm run serve

# 3. Browser → http://localhost:3000
```

### Setelah update kode

```powershell
# Cara termudah:
.\scripts\update-minipc.ps1

# Atau manual:
cd D:\bridge-monitoring
git pull
npm install
npm run build
# Ctrl+C di terminal backend, lalu:
npm run serve
```

---

## Bonus: PM2 — Biar Backend Auto-Restart

PM2 bikin backend tetap jalan meskipun terminal ditutup, dan auto-restart kalo crash.

```powershell
# Install PM2 global
npm install -g pm2

# Start backend dengan PM2
pm2 start dist/index.js --name bridge-monitoring

# Simpan konfigurasi biar jalan tiap reboot
pm2 save
pm2 startup

# Update kode + restart via PM2 (otomatis sama update-minipc.ps1)
git pull
npm install
npm run build
pm2 restart bridge-monitoring
```

### Kalo pake PM2, `update-minipc.ps1` otomatis detek & restart

Jadi tinggal klik kanan `update-minipc.ps1` → selesai.

## Struktur File (untuk referensi)

```
D:\bridge-monitoring\
├── package.json          # Dependency & script
├── tsconfig.json         # Konfigurasi TypeScript
├── MINIPC_SETUP.md       # Panduan ini
├── scripts\              # Script utility untuk Mini PC
│   ├── update-minipc.ps1 # Satu klik update dari git
│   └── start-minipc.ps1  # Panduan start service
├── broker\
│   └── mosquitto.conf    # Konfigurasi MQTT broker
├── src\                  # Source code TypeScript
│   ├── index.ts          # Entry point
│   ├── config.ts         # Konfigurasi (env vars)
│   ├── mqtt.ts           # MQTT subscriber
│   ├── api.ts            # Express server + WebSocket
│   ├── db.ts             # SQLite database
│   ├── fft.ts            # FFT analysis
│   └── types.ts          # Type definitions
├── public\               # Frontend (static files)
│   ├── index.html        # Dashboard HTML
│   ├── app.js            # Dashboard logic (Vanilla JS)
│   └── style.css         # Dashboard styling
├── mock\                 # Mock data publisher (testing)
│   └── publisher.ts
├── node\                 # Firmware ESP32
│   ├── node.ino          # Main sketch
│   ├── config.h          # WiFi & MQTT config
│   ├── sensor.ino        # MPU9250 driver
│   ├── storage.ino       # SD card & RTC
│   └── mqtt.ino          # MQTT publisher
├── dist\                 # Hasil build (auto-generated)
└── data.db               # Database (auto-generated)
```

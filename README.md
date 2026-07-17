# Bridge Structural Health Monitoring System

Gateway backend untuk sistem monitoring kesehatan jembatan.

## Stack

- **Backend**: Node.js + TypeScript + Express
- **Database**: SQLite (better-sqlite3)
- **MQTT Broker**: Mosquitto
- **Frontend**: Tailwind CSS + Plotly

## Arsitektur

```
[Node Sensor] --MQTT--> [Mosquitto] --> [Gateway (sub + FFT + API)] --> [SQLite]
                                                                           |
                                     [Dashboard] <-- WebSocket/REST ---------+
```

## Cara Pakai (Development di Laptop)

```bash
# 1. Install Mosquitto broker
#    - Windows: winget install EclipseMosquitto.Mosquitto
#    - Atau via Docker
docker run -d -p 1883:1883 --name mqtt eclipse-mosquitto:2

# 2. Install dependencies & jalankan
npm install
npm run dev
```

## Deploy ke Mini PC

Instruksi lengkap: [MINIPC_SETUP.md](MINIPC_SETUP.md)

```bash
# 1. Clone di Mini PC
git clone https://github.com/dyopnj/SHMS-Data-Logger.git

# 2. Install + Build
npm install
npm run build

# 3. Jalankan Mosquitto + Backend
.\scripts\start-minipc.ps1

# 4. Update setelah ada perubahan (dari laptop commit + push)
.\scripts\update-minipc.ps1
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `MQTT_BROKER` | `mqtt://localhost:1883` | Alamat MQTT broker |
| `HTTP_PORT` | `3000` | Port dashboard |
| `DB_PATH` | `./data.db` | Lokasi database |
| `NODE_IDS` | `node_01,node_02` | Daftar node ID |

## API

| Method | Path | Description |
|---|---|---|
| GET | `/api/readings/:nodeId?limit=N` | Data sensor historis |
| GET | `/api/alerts` | Log alert |
| GET | `/api/threshold/:param` | Nilai threshold |
| PUT | `/api/threshold/:param` | Ubah threshold |
| GET | `/api/node/:nodeId/config` | Konfigurasi node |
| PUT | `/api/node/:nodeId/config` | Ubah sampling rate |

## Node Sensor (ESP32)

Folder `node/` — firmware ESP32 untuk node sensor MPU9250.

### Hardware
- ESP32 Dev Board
- MPU9250 (accel + gyro + mag)
- Micro SD Card Module (SPI)
- RTC DS3231 (I2C)

### Fitur
- Sampling 200Hz, buffer 1 detik → RMS vibration
- Complementary filter → pitch/roll + delta dari baseline
- Kirim processed data via MQTT tiap 1 detik
- Kirim raw window (256 sampel) tiap 30 detik untuk FFT backend
- Backup semua data ke SD card (CSV)
- Auto-calibrate baseline tilt setelah 10 detik
- Heartbeat status tiap 30 detik

### Pakai PlatformIO
```bash
cd node
pio run --target upload
pio device monitor
```

### Pakai Arduino IDE
1. Buka `node/node.ino` di Arduino IDE
2. Install library: `Adafruit MPU6050`, `PubSubClient`, `RTClib`
3. Edit `config.h` — isi SSID, password, IP broker
4. Pilih board ESP32 Dev Module → Upload

### Edit config.h
```cpp
const char* WIFI_SSID = "SSID_ANDA";
const char* WIFI_PASS = "PASSWORD_ANDA";
const char* MQTT_BROKER = "192.168.1.100";
const char* NODE_ID = "node_01";
```

## Mock Publisher

Folder `mock/` — simulasi data sensor untuk testing tanpa hardware.

```bash
npm run dev          # (dari terminal 1 — backend)
npx tsx mock/publisher.ts   # (dari terminal 2 — mock)
```

Menerbitkan data palsu tiap 1 detik untuk kedua node, termasuk raw window tiap 30 detik.

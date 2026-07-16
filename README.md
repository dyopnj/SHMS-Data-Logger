# Bridge Structural Health Monitoring System

Gateway backend untuk sistem monitoring kesehatan jembatan.

## Stack

- **Backend**: Node.js + TypeScript + Express
- **Database**: SQLite (better-sqlite3)
- **MQTT Broker**: Mosquitto
- **Frontend**: Vanilla JS + Chart.js

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

```bash
git pull
npm install --production
npm run build
# Jalankan Mosquitto + npm run serve
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

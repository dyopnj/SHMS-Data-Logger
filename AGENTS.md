# AGENTS.md

## Firmware Node (ESP32, PlatformIO)

Path: `D:\Politeknik Negeri Jakarta\= SHM, SIMON BATAPA\Nodenode\NodeNode`

Struktur penting:
- `src/main.cpp` — entry point
- `src/config/config.h` — konstanta/default (sampling rate, publish interval, pin)
- `src/scheduler/task_manager.cpp` — task FreeRTOS (sampling, processing, MQTT publisher, FFT sender)
- `src/communication/mqtt_manager.cpp` — koneksi MQTT + publish
- `src/sensors/mpu9250.cpp`, `rtc_ds3231.cpp` — sensor
- `src/utils/payload_builder.cpp` — format payload JSON

Catatan sinkron config (sering jadi sumber mismatch):
- Firmware default `MQTT_PUBLISH_INTERVAL_DEFAULT_MS = 500`, `MIN = 500` (config.h)
- Server (repo ini) default `publish_interval = 1000` (src/db.ts, src/api.ts)
- Samakan kedua sisi bila mengubah interval.

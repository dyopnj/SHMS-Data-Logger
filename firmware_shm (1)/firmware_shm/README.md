# Node SHM Firmware (ESP32 + MPU9250 + DS3231)

Firmware Node **Structural Health Monitoring (SHM)** berbasis ESP32 dual-core
+ FreeRTOS. Node hanya melakukan **akuisisi data, preprocessing ringan,
logging lokal, dan pengiriman MQTT** — semua **FFT dilakukan di backend**,
node hanya mengirim raw window.

Dibangun di atas program referensi MPU9250 (SPI register-level) + RTC DS3231
(I2C register-level) + Kalman Filter yang sudah berjalan baik. Driver-driver
tersebut **dipertahankan tanpa perubahan logic** — lihat komentar
`PERTAHANKAN` di `src/sensors/*` dan `src/processing/kalman_filter.*`.

## Wiring

MPU9250 dan SD Card **berbagi satu bus SPI global (VSPI)** — SCK/MISO/MOSI
sama, hanya pin CS yang berbeda:

| Fungsi        | Pin ESP32 |
|---------------|-----------|
| SPI SCK  (bersama) | GPIO18 |
| SPI MISO (bersama) | GPIO23 |
| SPI MOSI (bersama) | GPIO19 |
| MPU9250 CS    | GPIO5  |
| SD Card CS    | GPIO32 |
| DS3231 SDA    | GPIO21 |
| DS3231 SCL    | GPIO22 |

Sesuaikan pin di `src/config/config.h` bila wiring aktual berbeda.

### Arsitektur SPI: satu bus global + SPI Manager

Firmware ini memakai **hanya satu bus SPI fisik** (objek `SPI` global
Arduino/VSPI). Tidak ada `SPIClass` kedua (HSPI) di mana pun dalam project
— desain dua-bus sebelumnya dihapus total karena pin HSPI custom terbukti
tidak stabil di pengujian lapangan, sedangkan satu bus VSPI dengan CS
terpisah + mutex bekerja stabil.

- **`src/utils/spi_manager.h/.cpp`** — modul pusat yang membuat `spiMutex`
  global (satu-satunya mutex bus SPI di seluruh firmware) dan memanggil
  `SPI.begin(18, 23, 19)` **tepat sekali** saat boot. Dipanggil paling awal
  di `main.cpp::setup()`, sebelum `mpu9250::init()` maupun `sdlog::init()`.
- **`src/sensors/mpu9250.cpp`** — setiap transfer register (`readRegister`,
  `writeRegister`, `read16`) mengambil `spimgr::spiMutex`, memaksa `SD_CS`
  HIGH, men-select `MPU_CS` LOW, transfer, lalu `MPU_CS` HIGH kembali &
  melepas mutex.
- **`src/storage/sd_logger.cpp`** — setiap operasi SD (`SD.begin`,
  `SD.open`, `SD.exists`, `SD.mkdir`, `File.read/write/flush/close`)
  dibungkus pola sebaliknya: ambil `spimgr::spiMutex`, paksa `MPU_CS` HIGH,
  select `SD_CS` LOW, operasi, `SD_CS` HIGH kembali, lepas mutex.
- Kedua device **tidak pernah** ter-select (CS LOW) bersamaan — dijamin
  oleh mutex + urutan CS di atas.
- `spiMutex` adalah **real FreeRTOS mutex** (`xSemaphoreCreateMutex()`,
  bukan binary semaphore), sehingga mendukung **priority inheritance**:
  jika SD Writer (prioritas 8) sedang memegang mutex saat Sensor Sampling
  (prioritas 10) menunggu, FreeRTOS otomatis menaikkan sementara prioritas
  SD Writer supaya cepat melepas lock — mengurangi risiko priority
  inversion walau memakai `portMAX_DELAY` (blocking, tanpa timeout).
- `sdFileMutex` (terpisah dari `spiMutex`) tetap ada, tapi perannya
  berbeda: melindungi **state internal** `sd_logger.cpp` (file handle,
  buffer tulis, cursor baca) dari akses bersamaan antara task SD Writer
  dan Sync Manager — bukan bus fisik.

## Build

```
pio run                 # build
pio run -t upload       # flash
pio device monitor      # serial monitor (115200)
```

Ubah kredensial WiFi & broker MQTT di `src/config/mqtt_config.h` sebelum
deploy.

## Arsitektur Task (FreeRTOS)

Lihat `src/config/freertos_config.h` untuk priority map, core assignment,
stack size, dan estimasi RAM/CPU lengkap. Ringkasan:

| Task | Core | Priority | Fungsi |
|---|---|---|---|
| Sensor Sampling | 0 | 10 | Baca MPU9250 @200Hz (`vTaskDelayUntil`) |
| Data Processing | 0 | 9 | Kalman, baseline delta, RMS, feed FFT buffer |
| SD Card Writer | 1 | 8 | Logging binary append-only |
| MQTT Publisher | 1 | 7 | Publish payload periodik |
| WiFi/MQTT Reconnect | 1 | 6 | Jaga koneksi + proses callback config |
| FFT Buffer Sender | 1 | 5 | Kirim raw window 256 sample |
| Config Handler | 1 | 4 | Eksekusi command remote |
| Sync Manager | 1 | 3 | Sinkronisasi data SD yang belum terkirim |
| Serial Debug | 1 | 2 | Monitoring lewat Serial |

Core 0 didedikasikan hanya untuk sampling + processing supaya stack
WiFi/MQTT (Core 1) tidak pernah mengganggu jitter sampling real-time.

## MQTT

### Publish

- `shm/<node_id>/data` — tiap 1 detik (configurable): pitch, roll, delta,
  RMS getaran.
- `shm/<node_id>/fft_raw` — tiap 10-30 detik (configurable): raw window
  256 sample (magnitude accel Z, gravitasi sudah dihilangkan).
- `shm/<node_id>/status` — balasan `request_status`.
- `shm/<node_id>/lwt` — Last-Will (`online`/`offline`, retained).

### Subscribe (remote command)

`shm/<node_id>/cmd/#` — lihat `src/config/mqtt_config.h` untuk daftar
sub-topic (`sampling_rate`, `publish_interval`, `raw_window_interval`,
`recalibrate`, `restart`, `request_status`). Payload berupa angka mentah
(untuk command bernilai) atau boleh kosong (untuk command aksi).

## Format SD Card (binary, append-only)

File: `/shm_logs/<node_id>_<YYYY-MM-DD>_<HH>.bin`, rotasi tiap 1 jam atau
10MB (mana lebih dulu). Setiap record 26 byte (packed struct `SDRecord`,
lihat `src/storage/sd_logger.h`):

```
uint32_t sequence
uint32_t timestamp
float    pitch
float    roll
float    pitch_delta
float    roll_delta
float    rms_vibration
uint16_t sampling_rate_hz
```

Checkpoint sinkronisasi (`last_sent_sequence`) disimpan di
`/shm_logs/checkpoint.dat` supaya bertahan lintas reboot — SyncManager
tidak akan pernah mengirim ulang data yang sudah terkirim.

## Keterbatasan & pengembangan lanjutan

- **Magnetometer**: field `mag_x/y/z` sudah ada di seluruh pipeline
  (`MPU9250Data`), tapi `mpu9250::readMagnetometer()` masih stub (return 0)
  karena AK8963 internal MPU9250 butuh inisialisasi I2C-master pass-through
  terpisah yang di luar scope "jangan ubah cara komunikasi MPU9250". Tinggal
  mengisi fungsi ini untuk mengaktifkan fusion yaw di masa depan.
- **Sync setelah rotasi file**: `SyncManager` menyapu file log yang sedang
  aktif; setelah file dirotasi (per jam/10MB), panggilan sync berikutnya
  otomatis menyasar file baru karena checkpoint bersifat global per
  `sequence`, bukan per file — namun backfill lintas banyak file historis
  sekaligus dalam satu pemanggilan belum diimplementasikan penuh dan bisa
  dikembangkan lebih lanjut jika downtime lapangan diperkirakan sangat lama.
- **OTA**: struktur modul sudah memisahkan concerns sehingga siap ditambah
  `ArduinoOTA`/esp_https_ota tanpa mengubah task lain.

## Menambah sensor / node baru

- Sensor baru: tambahkan driver di `src/sensors/`, tambahkan field ke
  `MPU9250Data` (`src/utils/data_structures.h`), isi di
  `task_sensor_sampling` (`src/scheduler/task_manager.cpp`).
- Node baru: cukup ubah `NODE_ID` di `src/config/config.h` — seluruh topic
  MQTT & nama file SD otomatis mengikuti.

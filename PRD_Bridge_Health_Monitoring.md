# Product Requirements Document (PRD)
## Sistem Monitoring Kesehatan Jembatan (Bridge Structural Health Monitoring)

**Versi:** 3.0
**Tanggal:** 1 Oktober 2026
**Status:** Fase 1 - Development & Testing (Laptop) — node fisik aktif

---

## 0. Referensi Silang: Firmware Node (PENTING)

> **Catatan untuk analis/developer/AI:** Sebelum menganalisis backend, memverifikasi
> format payload, atau mengerjakan integrasi model (mis. ANFIS), sumber kebenaran
> untuk sisi **node sensor (ESP32)** ada di luar repo ini:
>
> ```
> D:\Politeknik Negeri Jakarta\= SHM, SIMON BATAPA\Nodenode\NodeNode
> ```
>
> Folder firmware (`node/`, `firmware_shm/`) sudah **tidak ada** di repo backend ini
> (dihapus pada commit `654b7b8`). Jika analisis membutuhkan detail sampling,
> filter, format payload mentah, atau logika node lainnya, **wajib membaca file
> firmware di path di atas** terlebih dahulu.
>
> **Urutan prioritas sumber kebenaran:**
> 1. Kode aktual (`src/` di repo ini, dan `NodeNode/src/` untuk firmware)
> 2. PRD ini (kebutuhan & desain)
> 3. `README.md` (panduan pakai — sudah agak outdated)
>
> **Peta file firmware penting (NodeNode):**
>
> | Path | Isi |
> |---|---|
> | `src/config/config.h` | Konstanta: sampling 200Hz, RMS_WINDOW_SIZE=200, FFT_BUFFER_SIZE=256, pin, Kalman tuning |
> | `src/config/mqtt_config.h` | Definisi topic MQTT & kredensial |
> | `src/utils/payload_builder.cpp` | **Format JSON aktual** payload `/data`, `/raw`, `/status` |
> | `src/utils/data_structures.h` | Struct `MPU9250Data` & `ProcessedData` (POD, via FreeRTOS Queue) |
> | `src/sensors/mpu9250.cpp` | Driver SPI MPU9250, kalibrasi gyro, adaptive bias, deadband |
> | `src/processing/kalman_filter.cpp` | Kalman filter 2-state (pitch/roll) |
> | `src/processing/rms_calculator.h` | RMS sliding window 1 detik (200 sampel), gravitasi dihilangkan |
> | `src/processing/baseline.h` | Baseline pitch/roll (100 sampel kalibrasi) + delta |
> | `src/processing/fft_buffer.h` | Ring buffer 256 sampel raw accel (ESP32 **tidak** menghitung FFT) |
> | `src/scheduler/task_manager.cpp` | Orkestrasi FreeRTOS task: sampling, processing, MQTT, FFT sender, SD |
> | `src/communication/mqtt_manager.cpp` | Pub/Sub MQTT (PubSubClient) |
> | `src/storage/sd_logger.cpp` | Logging SD berbasis sesi (biner, `session_<id>.bin`) |
> | ~~`src/communication/mock_publisher.ps1`~~ | *(Dihapus)* Mock publisher sudah di-revert |
>
> **Temuan penting dari firmware (koreksi terhadap PRD versi lama):**
> - Filter yang benar-benar dipakai adalah **Kalman filter** (`kalman_filter.cpp`),
>   **bukan** complementary filter. PRD lama menyebut "Complementary/Kalman".
> - **Magnetometer belum berfungsi** — `readMagnetometer()` masih stub yang selalu
>   mengembalikan `0.0` (`mpu9250.cpp:186-193`), dan `payload_builder.cpp:33-35`
>   mengirim `mag_x/y/z = 0.0`. Jadi klaim "mag disimpan" hanya menyimpan nol.
> - **FFT buffer berisi axis Z saja**, bukan magnitude: `fftBuffer.addSample(sample.accel_z - 1.0f)`
>   (`task_manager.cpp:139`). Backend menerima getaran **vertikal** (gravitasi dikurangi).
> - Firmware **tidak** melakukan FFT (sesuai spesifikasi) — FFT murni di backend.
> - **SD Card berbasis sesi** — menulis hanya saat sesi uji aktif (`session_<id>.bin`);
>   di luar sesi, SD Card IDLE. Modul `sync_manager` (replay SD) sudah **dihapus total**.
> - **RTC guard** — pembacaan DS3231 diberi timeout I2C 25 ms; bila chip tidak merespons,
>   firmware fallback ke timer internal `millis()`.
> - **Feedback loop konfigurasi** — node membalas perintah konfigurasi via topik
>   `config_ack` (FR-04), dan `spiMutex` diberi timeout 20 ms agar sampling tidak hang.

---

## 1. Latar Belakang & Masalah

Jembatan memerlukan pemantauan kondisi struktural secara berkala untuk mendeteksi anomali seperti getaran berlebih atau deformasi/kemiringan yang dapat mengindikasikan penurunan kualitas struktur. Sistem monitoring manual bersifat reaktif dan tidak real-time. Diperlukan sistem monitoring otomatis berbasis IoT yang dapat memantau kondisi struktural jembatan secara real-time dan memberikan peringatan dini saat terjadi anomali.

## 2. Tujuan (Goals)

- Memantau kondisi getaran dan kemiringan struktur jembatan secara real-time
- Menyediakan data historis untuk analisis tren kondisi jembatan dari waktu ke waktu
- Memberikan peringatan (alert) otomatis saat data sensor melewati ambang batas (threshold) yang ditentukan
- Menyimpan arsip lokal per sesi uji (SD card) yang terisolasi per pengujian
- Membangun sistem yang dapat dikembangkan bertahap: mulai dari laptop (testing) hingga deployment penuh di mini PC
- Menyiapkan fondasi data (RMS, tilt, FFT, FDD, time-series 200 Hz) yang cukup untuk integrasi model klasifikasi ANFIS (lihat §11)

## 3. Non-Goals (Di Luar Cakupan)

- Sistem tidak melakukan analisis prediktif/predictive maintenance berbasis machine learning (di fase ini) — **namun PRD §11 menyiapkan jalur integrasi ANFIS untuk fase berikutnya**
- Sistem tidak terintegrasi dengan notifikasi eksternal (Telegram/email/SMS) pada MVP — alert hanya tampil di dashboard
- Sistem tidak menangani lebih dari 2 node pada fase ini (namun desain harus scalable)
- **Yaw/twist tidak dijadikan parameter monitoring utama** — meskipun MPU9250 memiliki magnetometer, data magnetometer disimpan namun tidak diolah jadi fitur utama, karena rawan interferensi magnetik dari struktur besi/baja jembatan
- Perhitungan FFT tidak dilakukan di node (ESP32), melainkan di backend/mini PC

## 4. Arsitektur Sistem

### 4.1 Komponen

| Komponen | Deskripsi |
|---|---|
| **Node Sensor (x2)** | MPU9250 (accel + gyro + magnetometer), SD Card Module, RTC Module. Sampling 200Hz. Mengukur getaran & kemiringan, publish data via MQTT, rekam arsip SD saat sesi uji aktif |
| **MQTT Broker** | Fase 1: berjalan di laptop (Mosquitto). Fase 2: berjalan di mini PC |
| **Backend Service** | Subscribe ke topic MQTT, parsing JSON, hitung FFT/FDD dari raw window data, simpan ke database saat sesi aktif, expose API untuk frontend |
| **Database** | Menyimpan data historis reading (saat sesi aktif), hasil FFT/FDD, konfigurasi threshold, log alert, riwayat sesi uji |
| **Frontend Dashboard** | Menampilkan data real-time, grafik historis, kurva spektrum FDD, status alert, kontrol sesi uji, panel konfigurasi (sampling rate & threshold) |

### 4.2 Diagram Alur Data (Fase 1 - Laptop)

```
[Node 1] --MQTT publish--\
                           --> [MQTT Broker @ Laptop] --> [Backend Subscriber + FFT] --> [Database]
[Node 2] --MQTT publish--/                                                                  |
                                                                                              v
                                                          [Frontend Dashboard] <-- [API/WebSocket]
```

### 4.3 Diagram Alur Data (Fase 2 - Mini PC, target akhir)

```
[Node 1] --MQTT publish--\
                           --> [MQTT Broker @ Mini PC] --> [Backend Subscriber + FFT] --> [Database]
[Node 2] --MQTT publish--/                                                                  |
                                                                                              v
                                                          [Frontend Dashboard] <-- [API/WebSocket]

* Laptop tidak lagi berperan. Deployment kode ke mini PC dilakukan via git clone/pull dari repository.
```

### 4.4 Penempatan Node

- Node 1 & Node 2 ditempatkan pada 2 titik berbeda di jembatan yang sama (contoh: tengah bentang & tumpuan)
- Masing-masing node memiliki `node_id` unik untuk identifikasi topic MQTT dan penamaan file di SD card

## 5. Spesifikasi Data

### 5.1 Parameter di Node

**Dibaca langsung dari sensor (200Hz):**

| Parameter | Sumber | Satuan | Keterangan |
|---|---|---|---|
| accel_x, accel_y, accel_z | MPU9250 accelerometer | g atau m/s² | Dipakai untuk hitung RMS & fusion tilt |
| gyro_x, gyro_y, gyro_z | MPU9250 gyroscope | °/s | Dipakai untuk fusion tilt (input Kalman) |
| mag_x, mag_y, mag_z | MPU9250 magnetometer | µT | **Belum diimplementasikan** — driver masih stub, dikirim sebagai `0.0` (`mpu9250.cpp:186`) |

**Dihitung di node (hasil olahan):**

| Parameter | Cara Hitung | Frekuensi Kirim |
|---|---|---|
| rms_vibration | RMS dari magnitude accel (√(x²+y²+z²) − gravitasi) dalam window 1 detik (200 sampel) | Tiap 1 detik |
| pitch, roll | **Kalman filter** 2-state dari accel + gyro (`kalman_filter.cpp`) | Tiap 1 detik |
| pitch_baseline, roll_baseline | Rata-rata pitch/roll selama 100 sampel kalibrasi awal (`baseline.h`) | Sekali, saat setup/recalibrate |
| pitch_delta, roll_delta | pitch/roll saat ini − baseline | Tiap 1 detik |
| raw_window[] | Ring buffer **256 sampel axis Z accel** (gravitasi dikurangi) | Berkala (default 15 s), dikirim sebagai batch untuk FFT di backend |

**Metadata tiap payload:**

| Parameter | Keterangan |
|---|---|
| node_id | ID unik tiap node (misal "node_01") |
| timestamp | Dari RTC (bila RTC error, backend memakai `received_utc` dari server) |
| sampling_rate_hz | Default 200Hz, dapat diubah via MQTT config |
| connection_status | Status koneksi/heartbeat node |

### 5.2 Data Olahan di Backend

| Parameter | Cara Hitung | Sumber |
|---|---|---|
| dominant_frequency | FFT dari raw_window[] (axis Z accel) yang dikirim node | Dihitung di backend/mini PC (bukan di ESP32) |
| Trend dominant_frequency | Riwayat dominant_frequency dari waktu ke waktu | Disimpan di database |
| Singular Value Spectrum (FDD) | Dekomposisi frekuensi domain (CPSD + eigenvalue 2x2) antar 2 node | Dihitung di backend, ditampilkan sebagai kurva λ₁ vs frekuensi |
| Jitter & actual sampling rate | e_i = (t_i − t_i−1) − T_nominal; median, p95, p99 | Dihitung di backend dari time-series 200 Hz |

### 5.3 Format Payload MQTT (JSON) — Processed Data (per 1 detik)

```json
{
  "schema_version": 1,
  "node_id": "node_01",
  "timestamp": "2026-10-01T10:00:00.000Z",
  "sampling_rate_hz": 200,
  "connection_status": "online",
  "boot_id": 3,
  "packet_seq": 42,
  "first_sample_seq": 8400,
  "sample_count": 200,
  "t0_us": 1789588281673000,
  "dt_us": 5000,
  "vibration": {
    "rms": 0.023
  },
  "tilt": {
    "pitch": 1.20,
    "roll": -0.85,
    "pitch_delta": 0.10,
    "roll_delta": -0.05
  },
  "magnetometer": {
    "mag_x": 0.0,
    "mag_y": 0.0,
    "mag_z": 0.0
  },
  "accelerometer": { "x": 0.01, "y": 0.02, "z": 1.00 },
  "gyroscope": { "x": 0.5, "y": -0.2, "z": 0.1 },
  "ax": [ ... 200 float ],
  "ay": [ ... 200 float ],
  "az": [ ... 200 float ]
}
```

> **Catatan (dari `payload_builder.cpp`):** key `accelerometer` & `gyroscope`
> selalu ada (snapshot raw untuk panel "Raw Sensor Data"), `magnetometer` selalu
> bernilai `0.0`. Time-series 200 Hz (`ax`, `ay`, `az`) disatukan ke payload `/data`
> per 1 detik lengkap dengan `boot_id`, `packet_seq`, `t0_us`, dan `dt_us`.
> `timestamp` berasal dari RTC; bila RTC hardware error, backend memakai waktu
> terima server (`received_utc`).

### 5.4 Format Payload MQTT (JSON) — Raw Window Data (berkala, untuk FFT/FDD)

```json
{
  "node_id": "node_01",
  "timestamp": "2026-10-01T10:00:00.000Z",
  "window_size": 256,
  "sampling_rate_hz": 200,
  "window_start_ms": 1789588281000,
  "window_end_ms": 1789588282275,
  "raw_accel": [0.012, -0.003, "... 256 angka float (axis Z accel, gravitasi dikurangi)"]
}
```

> **Catatan (dari `payload_builder.cpp`):** `raw_accel` berisi **axis Z saja**,
> bukan magnitude dan bukan xyz terpisah. `window_start_ms`/`window_end_ms`
> dipakai untuk sinkronisasi antar-node pada analisis FDD.

### 5.5 Topic Structure MQTT

| Topic | Arah | Fungsi |
|---|---|---|
| `bridge/{node_id}/data` | Node → Broker | Payload processed + time-series 200 Hz tiap 1 detik |
| `bridge/{node_id}/raw` | Node → Broker | Payload raw window berkala (untuk FFT/FDD) |
| `bridge/{node_id}/status` | Node → Broker | Status koneksi/heartbeat node |
| `bridge/{node_id}/config_ack` | Node → Broker | Konfirmasi perintah konfigurasi (FR-04) |
| `bridge/{node_id}/lwt` | Node → Broker | Last-Will & Testament (retained) — `online`/`offline` |
| `bridge/{node_id}/cmd/sampling_rate` | Broker → Node | Ubah sampling rate |
| `bridge/{node_id}/cmd/raw_window_interval` | Broker → Node | Ubah interval kirim raw window |
| `bridge/{node_id}/cmd/sensitivity_gain` | Broker → Node | Ubah full-scale accel (1/2/4/8) |
| `bridge/{node_id}/cmd/recalibrate` | Broker → Node | Ulang kalibrasi baseline |
| `bridge/{node_id}/cmd/restart` | Broker → Node | Restart node |
| `bridge/{node_id}/cmd/request_status` | Broker → Node | Minta status node |
| `bridge/{node_id}/cmd/session_start` | Broker → Node | Mulai sesi uji (mulai tulis SD `session_<id>.bin`) |
| `bridge/{node_id}/cmd/session_stop` | Broker → Node | Hentikan sesi uji (flush & tutup file SD) |

> Sumber: `NodeNode/src/config/mqtt_config.h`. Firmware subscribe ke wildcard
> `bridge/{node_id}/cmd/#`. Topic `.../cmd/publish_interval` **tidak lagi dipakai**
> karena pengiriman selalu dikunci pada batch 200 sampel per 1 detik.

## 6. Fitur MVP

| Fitur | Prioritas | Deskripsi |
|---|---|---|
| Real-time monitoring | Must Have | Dashboard menampilkan RMS getaran & tilt terkini dari kedua node |
| Data logging ke SD card (per sesi) | Must Have | Node menulis arsip SD (`session_<id>.bin`) hanya saat sesi uji aktif |
| Sesi uji & auto-export CSV | Must Have | Tombol Start/Stop sesi di dashboard + stopwatch; saat STOP otomatis ekspor 4 file CSV (agregat + raw 200 Hz) |
| Alert anomali (terpisah per parameter) | Must Have | Alert getaran & alert tilt masing-masing punya status sendiri; threshold dikonfigurasi manual, berlaku global untuk semua node |
| Dashboard historis | Must Have | Grafik/tabel data historis per node, dapat difilter berdasarkan rentang waktu |
| Perbandingan antar node | Must Have | Grafik getaran & tilt node 1 vs node 2 ditampilkan berdampingan |
| Analisis FFT + FDD (backend) | Must Have | Backend menghitung dominant frequency + kurva Singular Value Spectrum; dashboard menampilkan angka, tren, dan kurva interaktif |
| Konfigurasi sampling rate remote (terkonfirmasi) | Should Have | User dapat mengubah sampling rate node; node membalas konfirmasi `config_ack` |
| Statistik jitter & timing | Should Have | Kartu Delay/Rate Actual per node + ekspor kolom `dt_us`/`jitter_us` |
| Export alert log | Should Have | Alert log dapat diunduh (CSV) — belum diimplementasikan |

## 7. Kebutuhan Fungsional

1. Sistem harus dapat menerima data dari minimal 2 node secara simultan
2. Node melakukan sampling accel/gyro/mag pada 200Hz
3. Node menghitung RMS getaran & tilt (pitch/roll + delta dari baseline) setiap 1 detik dan mempublikasikannya
4. Node mengirim batch raw window (256 sampel) secara berkala untuk dianalisis FFT/FDD di backend
5. Backend menghitung dominant frequency dan Singular Value Spectrum (FDD) dari raw window data yang diterima
6. Sistem harus menyimpan data masuk (processed & raw) beserta timestamp node (`timestamp`) dan waktu terima server (`received_utc`) — penyimpanan database hanya aktif saat sesi uji berjalan (nol disk I/O saat IDLE)
7. Sistem harus mendeteksi ketika node terputus dari MQTT dan menandainya di dashboard
8. Node harus menulis arsip SD card (`session_<id>.bin`) hanya saat sesi uji aktif; di luar sesi, SD Card IDLE
9. Operator dapat memulai dan menghentikan sesi uji dari dashboard (tombol Start/Stop + stopwatch); saat sesi berhenti, sistem otomatis mengekspor file CSV ke folder `exports/`
10. User harus dapat mengatur nilai threshold alert (getaran & tilt) melalui dashboard — berlaku global untuk semua node
11. User harus dapat mengubah sampling rate node melalui dashboard; node mengirim balasan konfirmasi (`config_ack`) dan dashboard menampilkan status requested vs applied
12. Sistem harus menampilkan status alert getaran dan tilt secara terpisah dan jelas di dashboard
13. Dashboard harus menyediakan tampilan perbandingan data antar node
14. Sistem harus menghitung dan menampilkan statistik jitter sampling (median, p95, p99) serta actual sampling rate per node
15. Alert log harus dapat diekspor/diunduh dalam format CSV

## 8. Kebutuhan Non-Fungsional

- **Reliabilitas:** Data pengujian terisolasi bersih per sesi; arsip SD card direkam hanya saat sesi uji aktif. Firmware memakai timeout SPI/I2C dan penghapusan replay SD sehingga bebas dari crash Task Watchdog
- **Latency:** Data real-time harus tampil di dashboard dalam <2 detik dari saat node publish
- **Real-time performance node:** Loop pembacaan sensor pada 200Hz, kalkulasi RMS/tilt, penulisan SD card, dan publish MQTT harus berjalan stabil tanpa drop sampel signifikan
- **Portabilitas:** Seluruh stack (broker, backend, frontend) harus dapat dipindahkan dari laptop ke mini PC hanya dengan `git clone`/`git pull`, tanpa perubahan kode signifikan
- **Skalabilitas:** Arsitektur topic MQTT harus mendukung penambahan node di masa depan tanpa restrukturisasi besar

## 9. Dashboard — Struktur Tampilan

**A. Overview**
- Status node (online/offline, last update timestamp)
- Nilai real-time RMS getaran & tilt per node
- Indikator alert terpisah (getaran/tilt) per node
- Kartu live Delay & Rate Actual per node

**B. Perbandingan Node**
- Grafik RMS getaran node 1 vs node 2 (real-time & historis)
- Grafik tilt node 1 vs node 2

**C. Detail per Node**
- Grafik real-time RMS getaran
- Grafik real-time tilt (absolute + delta dari baseline)
- Dominant frequency (angka + tren dari waktu ke waktu)
- Grafik historis RMS & tilt

**D. Sesi Uji**
- Tombol Start/Stop sesi + stopwatch berjalan (di bar atas Home)
- Auto-export 4 file CSV saat Stop (agregat 1 detik + raw 200 Hz per node)

**E. Analisis FDD**
- Kurva Singular Value Spectrum (λ₁ vs frekuensi 0–100 Hz) interaktif di halaman Analysis
- Daftar puncak modal teridentifikasi (node pair, frequency, eigenvalue)

**F. Konfigurasi**
- Threshold alert (global — getaran & tilt masing-masing satu nilai untuk semua node)
- Sampling rate per node (remote config, default 200Hz) dengan badge status konfirmasi (Applied/Pending/Rejected)

**G. Alert Log**
- Tabel (timestamp, node, jenis alert, nilai saat itu)
- Fitur export/download (CSV) — belum diimplementasikan

**Catatan:** Raw sensor value (accel/gyro/mag mentah) tidak ditampilkan di dashboard utama. Panel debug terpisah untuk raw value masih dalam pembahasan (belum diputuskan prioritasnya).

## 10. Rencana Deployment (Fase)

| Fase | Lingkungan | Status |
|---|---|---|
| Fase 1 | MQTT Broker + Backend + Frontend di **laptop**, node fisik aktif untuk validasi end-to-end | Sedang berjalan |
| Fase 2 | Node fisik aktif, tetap terhubung ke broker di laptop untuk validasi end-to-end | Berjalan |
| Fase 3 | Migrasi penuh seluruh stack ke **mini PC** via git clone/pull, laptop dilepas total | Belum dimulai |

## 11. Integrasi Model ANFIS (Panduan Teknis)

Rencana penambahan modul klasifikasi berbasis **ANFIS** (Adaptive Neuro-Fuzzy
Inference System), mengikuti arsitektur backend yang sudah ada.

### 11.1 Ringkasan Kondisi Backend Saat Ini

| Aspek | Kondisi aktual |
|---|---|
| Bahasa/stack | Node.js + TypeScript (Express, ws, mqtt, better-sqlite3) |
| Data masuk | `ProcessedData` (RMS, pitch/roll/delta + time-series 200 Hz ax/ay/az) + `RawWindow` (256 sampel axis Z @ 200Hz) |
| Filter | Dilakukan di **node** (Kalman), bukan backend |
| FFT/FDD | Manual di `src/fft.ts` & `src/fdd.ts` — dominant_freq + Singular Value Spectrum (CPSD + eigenvalue 2x2) |
| Penyimpanan | SQLite (`readings`, `raw_batches`, `raw_windows`, `fft_results`, `fdd_results` (+`spectrum_json`), `test_sessions`, `alerts`, `thresholds`, `node_config`, `calibrations`, `acquisition_events`, `node_boots`, `export_history`); data hanya disimpan saat sesi aktif |
| Library ML/signal | **Tidak ada** (tidak ada scipy/numpy/fuzzy/tensorflow/ml-matrix) |
| Sampling rate | Default 200 Hz, dapat diubah remote (50–200 Hz) — jangan hardcode |
| Jumlah node | 2 (`node_01`, `node_02`) |

### 11.2 Titik Penambahan Modul (mengikuti pola yang ada)

```
src/
  anfis.ts        <- [BARU] model inferensi ANFIS (pola seperti fft.ts: fungsi murni)
  features.ts     <- [BARU, opsional] ekstraksi fitur dari reading + fft window
  db.ts           <- [UBAH] tambah tabel anfis_results + saveAnfis()
  mqtt.ts         <- [UBAH] panggil inferensi di handleProcessedData / handleRawWindow
  api.ts          <- [UBAH] endpoint GET /api/anfis/:nodeId
  types.ts        <- [UBAH] tambah interface AnifisResult
scripts/
  train-anfis.ts  <- [BARU, opsional] training offline (baca readings/fft_results)
```

**Alasan:** `fft.ts` adalah preseden modul komputasi murni → buat `src/anfis.ts`
dengan pola yang sama. Hook inferensi paling alami di `mqtt.ts`:
- `handleProcessedData` (`mqtt.ts:69`) — klasifikasi real-time berbasis RMS/tilt.
- `handleRawWindow` (`mqtt.ts:100`) — jika ANFIS butuh fitur domain frekuensi.

### 11.3 Fitur yang Tersedia untuk ANFIS

Sudah tersimpan per timestamp per node:
1. `rms` (getaran, g)
2. `pitch_delta`, `roll_delta` (pergeseran struktur, derajat)
3. `dominant_freq` (Hz, dari FFT 256 @ 200Hz → resolusi 0.78125 Hz)

Fitur tambahan yang perlu dikembangkan sendiri: energy band, spectral centroid,
kurtosis/crest factor, RMS multi-axis (saat ini FFT hanya axis Z).

### 11.4 Batasan & Catatan Penting

- **Tidak ada library FFT/ML** — ANFIS harus diimplementasikan manual atau tambah
  dependency (mis. `ml-matrix`/`mathjs` untuk matriks + gradient descent). Alternatif:
  training di Python (scikit-fuzzy/ANFIS) → ekspor parameter MF + consequent ke JSON →
  inferensi saja di TS.
- **Resolusi FFT kasar** (0.78125 Hz, Nyquist 100 Hz). Jika ANFIS butuh resolusi
  lebih halus, perlu window lebih besar (512/1024) atau zero-padding di node & backend.
- **Magnetometer = 0** — jangan jadikan fitur yaw/twist sampai driver AK8963 di node
  diimplementasikan.
- **Sampling rate dinamis** — baca `sampling_rate_hz` dari payload, jangan asumsikan 200.

---

## 12. Open Questions / Perlu Diputuskan Selanjutnya

- Granularitas data historis di dashboard (raw semua vs agregasi per menit/jam vs raw disimpan + query teragregasi)
- Perlu tidaknya panel debug raw sensor value (accel/gyro/mag mentah) — ditunda pembahasannya
- Nilai default threshold awal untuk getaran & tilt (sebelum user melakukan kalibrasi manual)
- Interval pengiriman raw_window (contoh: tiap 10 detik? 30 detik?) — perlu dipastikan tidak membebani bandwidth MQTT maupun proses backend
- Metadata lanjutan sesi uji (`condition_id`, `excitation_id`, `repetition_id`, posisi sensor) — ditunda sampai desain antarmuka siap

## 13. Metrik Keberhasilan

- Dashboard dapat menampilkan data real-time dari node fisik dengan latency <2 detik
- Node mampu sampling stabil di 200Hz tanpa drop signifikan; jitter p95 absolut ≤ 0,5 ms (500 µs)
- Sesi uji terisolasi bersih: saat IDLE database nol baris; saat Stop otomatis menghasilkan 4 file CSV (agregat + raw 200 Hz)
- Alert muncul secara akurat sesuai threshold yang dikonfigurasi, terpisah antara getaran & tilt
- FFT backend berhasil menghasilkan dominant frequency yang konsisten dari raw window data
- Kurva Singular Value Spectrum (FDD) tampil interaktif di dashboard dan menunjukkan puncak modal
- Perubahan konfigurasi sampling rate terkonfirmasi balik oleh node (`config_ack`) dan terlihat di dashboard
- Sistem berhasil dipindahkan ke mini PC hanya dengan git clone/pull tanpa modifikasi kode

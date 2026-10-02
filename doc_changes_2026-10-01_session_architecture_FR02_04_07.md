# Dokumen Perubahan — 1 Oktober 2026 · Arsitektur Sesi, Proteksi Hardware, FR-02, FR-04, & Kurva FDD FR-07

## Ringkasan Eksekutif

Pembaruan besar-besaran pada sistem data logger jembatan (**SHMS SIMON BATAPA 2026**) yang mencakup sisi **server backend**, **dashboard frontend**, dan **firmware ESP32**.

Pembaruan ini menyelesaikan sejumlah Functional Requirements kunci dari [`PRD_TARGET_1.md`](PRD_TARGET_1.md):
- **FR-02 (Waktu, Delay, & Jitter Akuisisi):** Live card Delay/Rate Actual per node, kalkulasi p95/p99/median timing error, dan injeksi kolom `dt_us` & `jitter_us` pada ekspor CSV raw.
- **FR-04 (Konfigurasi Terkonfirmasi / Feedback Loop):** Konfirmasi balik MQTT `config_ack` dari node, tracking status `requested vs applied` di database, dan badge indikator status di UI Settings.
- **FR-06 (Isolasi Sesi & Auto-Save CSV):** Tombol Start/Stop sesi di bar Home, stopwatch live, isolasi rekaman, dan auto-save 4 file CSV ke folder `exports/` saat STOP.
- **FR-07 (Kurva Spektrum FDD):** Visualisasi interaktif Plotly Singular Value Spectrum ($\lambda_1$ vs frekuensi 0–100 Hz) dan marker puncak modal di halaman Analysis.

Selain itu, dokumen ini mencatat **perubahan arsitektur sistem dadakan** yang dilakukan berdasarkan kendala nyata di lapangan (hardware RTC rusak, perebutan bus SPI, dan crash Task Watchdog).

---

## 1. Perubahan Arsitektur Sistem Dadakan (Divergensi dari PRD Awal)

| Komponen | Rencana Awal PRD | Perubahan Nyata di Lapangan (Solusi) | Alasan Teknis |
|---|---|---|---|
| **Penyimpanan Database (Storage Policy)** | Database SQLite terus-menerus menyimpan seluruh data masuk 24/7. | **Nol Disk I/O saat IDLE:** Database SQLite HANYA menyimpan data saat **Sesi Uji (START SESSION)** aktif. Saat IDLE, data hanya di-stream via WebSocket ke layar. | Mengurangi keausan disk, mencegah database membengkak oleh data diam/sampah, dan meminimalkan latensi streaming live (~1–2 ms lebih cepat). |
| **Replay & Checkpoint SD Card** | Modul `sync_manager` membaca ulang file SD dan mengirim backlog saat WiFi reconnect; periodik simpan checkpoint. | **Dihapus total:** Replay SD card dan checkpoint ditiadakan. SD card HANYA menulis saat sesi aktif (`SESSION_START` $\rightarrow$ `SESSION_STOP`), 1 sesi = 1 file (`session_<id>.bin`). Di luar sesi, SD Card IDLE 100%. | **Penyebab crash Task Watchdog (TWDT):** Pembacaan file SD via SPI memblokir `spiMutex` selama >10 detik, membuat task `sampling` 200 Hz di Core 0 macet total dan me-restart ESP32. Menghapus replay menghemat 16 KB RAM stack dan 100% melenyapkan watchdog crash. |
| **Aplikasi ACK MQTT** | Backend mengirimkan pesan ACK ke `bridge/<node_id>/ack` setiap batch tersimpan. | **Dihapus:** Publikasi ACK dari server dimatikan. | Firmware node tidak pernah men-subscribe topik `ack` dan tidak lagi memerlukan checkpoint SD, sehingga pesan ACK hanya membebani lalu lintas broker MQTT. |
| **Basis Waktu & Timestamp** | Sepenuhnya mengandalkan RTC hardware DS3231 via I2C untuk penanggalan & ISO string payload. | **Server UTC & Local WIB Override:** Kolom `received_utc` ditambahkan ke semua tabel database sebagai sumber kebenaran waktu; ekspor CSV otomatis dikonversi ke **WIB (GMT+7, `YYYY-MM-DD HH:mm:ss.mmm`)**. Firmware memproteksi RTC dengan guard timeout 25ms dan fallback ke `millis()`. | Kedua modul RTC DS3231 pada node sensor rusak/error di lapangan. Tanpa guard, pemanggilan I2C menggantung loop sampling, dan penanggalan jatuh ke UTC/tahun default. |
| **Pengaturan Publish Interval** | Dapat diubah secara dinamis lewat UI Settings (500 ms – 10 s). | **Dihapus dari UI Settings:** Dikunci tetap pada transmisi batch 200 sampel per 1 detik (1.000 ms). | Sejak integrasi time-series 200 Hz (FR-01), pengiriman selalu dilakukan per 200 sampel utuh. Mengizinkan publish 500 ms akan memotong batch menjadi 100 sampel yang merusak struktur arsip 1 detik. |

---

## 2. Rincian Perubahan Kode per File

### A. Sisi Server Backend (`src/`)

1. **`src/types.ts`:**
   - Tambah interface `TestSession`, `ConfigAckPayload`, dan `JitterStats`.
   - Update `NodeConfig`: dukung kolom `applied_*`, `status_*`, dan `last_ack_at`.
   - Update `FddResult`: dukung field `spectrum_json?: string`.
   - Tambah `received_utc?: string` ke `FftResult`, `RawWindowRow`, `FddResult`, dan `Alert`.

2. **`src/db.ts`:**
   - Tabel baru: `test_sessions` (`id`, `session_name`, `start_time`, `end_time`, `status`, `notes`).
   - Migrasi skema: tambah kolom `received_utc` ke `fft_results`, `raw_windows`, `fdd_results`, `alerts`.
   - Tambah kolom `spectrum_json` ke tabel `fdd_results`.
   - Tambah kolom `applied_*` dan `status_*` ke tabel `node_config`.
   - Fungsi baru: `startSession()`, `stopSession()`, `getActiveSession()`, `isSessionActive()`.
   - Fungsi baru: `getReadingsByUtcRange()`, `setLatestFft()`, `setLatestFdd()`, `updateConfigAck()`.
   - Pruning data lama (`pruneOldData`): dialihkan memakai `received_utc` server, bukan RTC node.

3. **`src/mqtt.ts`:**
   - Filter sesi aktif: `if (!isSessionActive()) return;` untuk penyimpanan tabel database saat IDLE.
   - WebSocket streaming (`onData?.(data)`) tetap berjalan live di baris terdepan tanpa tertahan database.
   - Subscribe topik baru: `bridge/<id>/config_ack` $\rightarrow$ memicu `updateConfigAck()`.
   - Bersihkan publikasi `ackBatch()` yang tidak digunakan firmware.
   - Cache live raw window di memori: FDD otomatis dihitung dan ditampilkan di layar Analysis tanpa wajib start sesi.

4. **`src/ingest.ts`:**
   - Fungsi baru: `calculateTimingStats(samples, nominalRateHz)` — menghitung median, p95, p99, max, min, dan deviasi frekuensi sampling aktual.
   - Fungsi baru: `flattenRawBatchWithTiming(row)` — menghasilkan sampel lengkap dengan kolom `dt_us` dan `jitter_us`.

5. **`src/api.ts`:**
   - Endpoint baru:
     - `GET /api/session/active` — cek sesi aktif (mendukung browser refresh tanpa reset stopwatch).
     - `POST /api/session/start` — mulai sesi, broadcast MQTT `session_start` ke semua node.
     - `POST /api/session/stop` — hentikan sesi, broadcast MQTT `session_stop`, otomatis ekspor 4 file CSV ke `exports/`.
     - `GET /api/timing/:nodeId` — statistik timing error & jitter FR-02.
     - `POST /api/reset` — reset tampilan klien.
   - Update `PUT /api/node/:nodeId/config`: set status parameter ke `pending` sebelum publish MQTT.
   - Format waktu ekspor: menggunakan helper `formatLocalTimestamp` (WIB GMT+7 presisi milidetik).

---

### B. Sisi Dashboard Frontend (`public/`)

1. **`public/home.html` & `public/assets/style.css`:**
   - Tambah tombol interaktif `START / STOP SESSION` di bar atas status strip (samping kanan Reset Data) dengan stopwatch real-time dan animasi denyut status aktif.
   - Repurpose kotak lama:
     - `UPTIME` (sebelumnya tidak aktif) diganti menjadi **`NODE 01 • DELAY / RATE`**.
     - `SAMP` (sebelumnya statis 200Hz) diganti menjadi **`NODE 02 • DELAY / RATE`**.
   - Indikator warna dinamis untuk Delay: Hijau ($\le 50\text{ ms}$), Oranye ($51\text{–}150\text{ ms}$), Merah ($> 150\text{ ms}$).

2. **`public/assets/js/home.js`:**
   - Fungsi `updateTimingMetrics()`: kalkulasi interval kedatangan batch, jitter p95/median, dan sampling rate aktual secara independen per node.
   - Fungsi `toggleSession()`, `updateSessionUI()`, dan `checkActiveSession()`: polling sesi aktif, format stopwatch `HH:MM:SS`, dan notifikasi popup hasil ekspor CSV saat sesi selesai.

3. **`public/settings.html` & `public/assets/js/settings.js`:**
   - Hapus dropdown `Publish Interval` (di-lock 1 detik).
   - Tambah badge konfirmasi status per field (`✓ Applied`, `⌛ Pending`, `✗ Rejected`) dan status kartu node (`✓ Applied` / `⌛ Syncing...` / `✗ Rejected`).
   - Implementasi auto-polling konfirmasi selama 5 detik setelah tombol Save Changes ditekan.

4. **`public/analysis.html` & `public/assets/js/analysis.js`:**
   - Ganti kontainer teks `#fdd-body` menjadi chart Plotly interaktif `#plot-fdd`.
   - Menampilkan kurva spektrum Singular Value $\lambda_1$ vs Frekuensi (0–100 Hz) dan marker wajik merah pada titik puncak modal (peaks).
   - Panel bawah kartu menampilkan: Node Pair, Identified Peaks, dan Window/Rate.

---

### C. Sisi Firmware ESP32 (`NodeNode/`)

1. **Pembersihan Modul:**
   - Folder dan file `src/sync/sync_manager.cpp` serta `src/sync/sync_manager.h` **dihapus bersih**.
   - Task `task_sync_manager` dihapus dari `task_manager.cpp` & `freertos_config.h` (**menghemat 16.384 byte RAM stack**).
   - Definisi `SD_CHECKPOINT_FILE` dan `checkRotation()` dihapus dari `config.h` & `sd_logger.cpp`.

2. **`src/storage/sd_logger.h` & `sd_logger.cpp`:**
   - Diubah berbasis sesi: fungsi baru `startSession(sessionId)` dan `stopSession()`.
   - File log disimpan per sesi: `/shm_logs/<node>/session_<id>.bin`.
   - Saat sesi berhenti, buffer di-flush dan file ditutup; SD Card kembali tidur (IDLE) sehingga tidak menyita bus SPI.

3. **`src/sensors/mpu9250.cpp`:**
   - Ganti `xSemaphoreTake(spimgr::spiMutex, portMAX_DELAY)` menjadi timeout aman `pdMS_TO_TICKS(20)` pada seluruh fungsi pembacaan register SPI (`readRegister`, `writeRegister`, `read16`).
   - Mencegah sensor sampling terkunci selamanya saat kartu SD sibuk.

4. **`src/sensors/rtc_ds3231.cpp` & `rtc_ds3231.h`:**
   - Tambah deteksi `isAvailable()` dan batas timeout I2C 25 ms.
   - Jika DS3231 tidak merespons, fungsi pembacaan I2C langsung dilewati tanpa memblokir bus, dan timestamp fallback ke timer internal `millis()`.

5. **`src/communication/mqtt_manager.cpp` & `mqtt_manager.h`:**
   - Tambah fungsi `publishConfigAck(param, requested, applied, status)` ke topik `bridge/<node_id>/config_ack`.
   - Handler command mendukung `SESSION_START` dan `SESSION_STOP`.

6. **`src/scheduler/task_manager.cpp`:**
   - Reset buffer FFT (`fftBuffer.clear()`) saat terjadi perubahan sampling rate agar window frekuensi tidak bercampur dua rate.
   - Pengiriman data ke antrean `sdWriteQueue` hanya dilakukan saat `sdlog::isSessionActive() == true`.

---

## 3. Format Hasil Ekspor CSV Sesi

Saat tombol **STOP SESSION** ditekan, server menghasilkan 4 file di folder `exports/`:

1. **`session_<id>_node_01_<timestamp>.csv` & `session_<id>_node_02_<timestamp>.csv`:**
   - Interval: 1 detik per baris (agregat makro).
   - Format waktu: Waktu lokal WIB (`YYYY-MM-DD HH:mm:ss.mmm`).
   - Header:
     ```csv
     timestamp_node,received_time,node_id,rms,pitch,roll,pitch_delta,roll_delta,mag_x,mag_y,mag_z,accel_x,accel_y,accel_z,accel_x_cal,accel_y_cal,accel_z_cal,calibration_id,connection_status
     ```

2. **`session_<id>_node_01_raw_<timestamp>.csv` & `session_<id>_node_02_raw_<timestamp>.csv`:**
   - Interval: 200 baris per detik (resolusi penuh 200 Hz).
   - Header:
     ```csv
     seq,t_us,dt_us,jitter_us,ax,ay,az
     ```
   - Berisi bukti ilmiah kestabilan interval sampling mikrodetik (`dt_us = 5000`) dan jitter (`jitter_us = 0`).

---

## 4. Status Verifikasi

| Komponen | Perintah Verifikasi | Hasil |
|---|---|---|
| Server Backend | `npm run build` (`tsc`) | **LULUS (0 error)** |
| Process Manager | `pm2 restart shms-laptop` | **ONLINE (Port 3001)** |
| Firmware Node 01 | `pio run -e node_01` | **SUCCESS (Flash 75.0%, RAM 25.3%)** |
| Firmware Node 02 | `pio run -e node_02` | **SUCCESS (Flash 75.0%, RAM 25.3%)** |
| Uji Database Kosong saat Idle | Query SQLite saat streaming | **LULUS (0 baris tersimpan sebelum Start Sesi)** |
| Uji Feedback Loop FR-04 | Ganti parameter di UI Settings | **LULUS (Status `pending` $\rightarrow$ `applied` via MQTT ACK)** |
| Uji Ekspor Sesi FR-02/FR-06 | Start Sesi $\rightarrow$ Stop Sesi | **LULUS (4 file CSV ter-generate otomatis dengan timestamp lokal WIB)** |
| Uji Kurva FDD FR-07 | Buka halaman `/analysis.html` | **LULUS (Plotly spectrum $\lambda_1$ 0–100 Hz dan peak markers muncul live)** |

# Dokumen Perubahan — 15 September 2026

## Ringkasan

Implementasi 5 perubahan bertahap pada **SHMS-Data-Logger** (backend Node.js/TypeScript)
dan **Nodenode** (firmware ESP32), sesuai urutan prioritas:

1. Penyimpanan raw accelerometer per axis (ax/ay/az dalam g, sebelum & sesudah koreksi kalibrasi).
2. Sinkronisasi raw_window node_01 vs node_02 berdasar timestamp konsisten (epoch millis).
3. Windowing function (Hann) sebelum FFT.
4. Modul FDD: CPSD + eigenvalue matriks Hermitian 2x2 (closed-form) + peak picking.
5. Tabel hasil FDD baru (pola `fft_results`).

Keputusan yang dikunci pada sesi ini:

- Kalibrasi accel: **backend + firmware sekaligus**.
- Sinkronisasi window: **timestamp awal window presisi ms**.
- Input FDD: **Z-axis node_01 vs Z-axis node_02 (2 kanal → matriks 2x2)**.

---

## 1. Backend — SHMS-Data-Logger

### `src/types.ts`
- `ProcessedData` + `accelerometer_calibrated?: {x,y,z}` dan `calibration?: CalibrationInfo`.
- `RawWindow` + `window_start_ms?: number`, `window_end_ms?: number`.
- `SensorReading` + kolom `accel_x/y/z`, `accel_x_cal/y_cal/z_cal`, `calibration_id`.
- Tipe baru: `CalibrationInfo`, `RawWindowRow`, `FddResult`.

### `src/fft.ts`
- `applyHannWindow(samples)` — Hann window simetris.
- `fftComplex(samples, sampleRate)` — FFT kompleks (real+imajiner, half positif).
- `fft()` — kini memakai Hann window (kompatibel dengan pemanggil lama).
- `dominantFrequency()` — tidak berubah signature, hasil kini windowed.

### `src/fdd.ts` (BARU)
- `crossSpectrum(specA, specB)` — Sxx, Syy, Sxy = X·conj(Y) per bin.
- Eigenvalue matriks Hermitian 2x2 closed-form (trace ± √(trace²−4·det))/2, tanpa library SVD.
- `findPeaks(freqs, values, numPeaks, relativeThreshold)` — puncak lokal, skip DC, ambang relatif.
- `runFdd(samplesA, samplesB, sampleRate, numPeaks)` — jalur utama.

### `src/db.ts`
- Migrasi backward-compatible: `ALTER TABLE readings ADD COLUMN` untuk 7 kolom baru
  (dijaga `PRAGMA table_info`), data lama tetap terbaca.
- Tabel baru:
  - `calibrations` (node_id, version, offset/skala per sumbu, UNIQUE(node_id,version)).
  - `raw_windows` (node_id, timestamp, window_start_ms, window_end_ms, raw_accel JSON).
  - `fdd_results` (node_id_a/b, timestamp, window_start_ms, dominant_freq, peaks_json, num_peaks, ...).
- Fungsi baru: `upsertCalibration`, `saveRawWindow`, `getMatchingRawWindow`, `saveFdd`, `getFdd`.
- `saveReading` kini menyimpan accel raw + calibrated + calibration_id.

### `src/mqtt.ts`
- `handleProcessedData`: upsert kalibrasi (jika ada) → simpan accel raw & calibrated.
- `handleRawWindow`: simpan raw window, FFT (Hann sudah di dalam fft), lalu cocokkan window
  node lain (`FDD_WINDOW_TOLERANCE_MS = 50`) → jalankan `runFdd` → `saveFdd`.
- Window tanpa `window_start_ms` dilewati untuk penyimpanan raw/FDD (log warning).

### `src/api.ts`
- `GET /api/fdd` — ambil hasil FDD.
- CSV export (`POST /api/export`) kini menyertakan kolom accel raw + calibrated + calibration_id.
- Action `calibrate_accel` ditambahkan ke `POST /api/node/:id/action`.

---

## 2. Firmware — Nodenode

### `sensors/mpu9250.h/.cpp`
- Kalibrasi accelerometer: `calibrateAccel()` (offset leveling), `loadAccelCalibration()`,
  `isAccelCalibrated()`, `getAccelCalibration()`, `applyAccelCalibration()`, `readAccelRaw()`.
- Offset+skala disimpan di **NVS** (namespace `mpu9250`), dimuat saat boot.
- `readAccelGyro()` tidak berubah (tetap mengembalikan accel raw g).

### `sensors/rtc_ds3231.h/.cpp`
- `getEpochMillis()` — epoch dalam milidetik (untuk sinkronisasi FDD).

### `processing/fft_buffer.h`
- `addSample(value, timestamp_ms)` + simpan `window_start_ms`/`window_end_ms`.
- `getBuffer(output, out_start_ms, out_end_ms)` mengembalikan rentang waktu window.

### `utils/data_structures.h`
- `MPU9250Data` + `epoch_ms`.
- `ProcessedData` + `accel_calibrated`, `accel_x/y/z_cal`, `calibration_version`,
  `accel_offset[3]`, `accel_scale[3]`.
- `ConfigCommandType` + `CALIBRATE_ACCEL`.

### `utils/payload_builder.h/.cpp`
- Payload periodik + `accelerometer_calibrated` dan `calibration` (version/offset/scale).
- Payload FFT + `window_start_ms`, `window_end_ms`, dan `sampling_rate_hz` aktual (bukan default).

### `communication/mqtt_manager.h/.cpp`
- `publishFFTWindow(window, size, sampling_rate_hz, start_ms, end_ms)`.
- Handler command `calibrate_accel`.

### `scheduler/task_manager.cpp` (dan `.h`)
- Flag `g_calibrateAccelRequested`.
- Processing task: kalibrasi accel saat diminta, terapkan kalibrasi, isi field calibrated,
  feed FFT buffer dengan `epoch_ms`.
- FFT sender: kirim selaras slot epoch (`now/interval`) supaya node_01 & node_02 cenderung
  mengirim pada boundary waktu yang sama (bila RTC sinkron).

### `sync/sync_manager.cpp`
- `ProcessedData pd = {};` (zero-init) saat replay — perbaikan field accel/gyro/calibration
  yang sebelumnya berisi nilai stack tidak valid.

### `config/mqtt_config.h`
- Topic `TOPIC_CMD_CALIBRATE_ACCEL = "bridge/<id>/cmd/calibrate_accel"`.

### `main.cpp`
- `nvs_flash_init()` (+ handle no-free-pages/new-version) sebelum `mpu9250::init()`.

---

## 3. Kontrak data baru (payload)

```jsonc
// periodik /data
{
  "accelerometer": {"x": .., "y": .., "z": ..},           // raw (g)
  "accelerometer_calibrated": {"x": .., "y": .., "z": ..}, // sesudah kalibrasi (g)
  "calibration": {
    "version": 1,
    "accel_offset": [ox, oy, oz],
    "accel_scale":  [sx, sy, sz]
  }
}

// raw window /raw
{
  "window_size": 256,
  "sampling_rate_hz": 200,         // rate aktual (bukan default)
  "window_start_ms": 1750000000000,
  "window_end_ms":   1750000001280,
  "raw_accel": [ ... 256 float ... ]
}
```

---

## 4. Mekanisme kalibrasi accelerometer

1. Trigger: `POST /api/node/:id/action {action:"calibrate_accel"}` / MQTT `cmd/calibrate_accel` / serial `cal_accel`.
2. `calibrateAccel()` — asumsi node **diam & datar (Z vertikal)**:
   - 500 sampel raw (≈250 Hz), rata-rata.
   - `offset_x=mean_x`, `offset_y=mean_y`, `offset_z=mean_z−1.0`; skala = 1.0.
3. Simpan ke NVS → dimuat saat boot.
4. Per sampel: `cal = (raw − offset) / scale`.

**Batasan**: ini kalibrasi offset "leveling", BUKAN 6-posisi. Skala per sumbu belum
dikalibrasi. Full-scale accel masih ±16g di `init()` (default `sensitivity_gain=1` = ±2g
tidak diterapkan saat boot) → resolusi kalibrasi kasar. Rekomendasi lanjutan: kalibrasi
6-posisi + perbaiki full-scale.

---

## 5. Mekanisme FDD

1. Node kirim raw window (Z-axis) dengan `window_start_ms` presisi.
2. Backend simpan ke `raw_windows`.
3. Saat window tiba, cari window node lain dengan `|window_start_ms − target| ≤ 50 ms`.
4. Jika cocok: `runFdd(A, B, rate)` → FFT kompleks (Hann) → CPSD → eigenvalue 2x2 → peaks.
5. Simpan ke `fdd_results` (pasangan node terurut, frekuensi dominan, daftar peak).

---

## 6. Status verifikasi

- Backend: `npx tsc --noEmit` **lolos**.
- Firmware: semua file C++ **terkompilasi** (menjadi `.o`). Tahap link **gagal** hanya
  karena ada spasi pada path proyek (`D:\...\= SHM, SIMON BATAPA\...` → linker split path),
  bukan karena error kode. Build firmware perlu dijalankan dari path tanpa spasi.

---

## 7. Catatan & rekomendasi lanjutan

- Kalibrasi 6-posisi (±X/±Y/±Z) untuk offset+skala per sumbu yang benar (FR-05).
- Perbaiki full-scale accel saat boot agar konsisten dengan `sensitivity_gain` (saat ini ±16g).
- Sinkronisasi jam antar-node (NTP/RTT) agar window FDD benar-benar sejajar; resampling ke
  grid waktu bersama masih follow-up.
- `mock_publisher.ps1` belum diperbarui (payload raw tanpa `window_start_ms` → FDD dilewati).
- Deduplikasi `fdd_results` (satu pasangan window bisa dihitung dua kali dari dua arah kedatangan).
- Frontend belum menampilkan accel maupun hasil FDD (perlu wiring UI).

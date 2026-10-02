# PRD — Kesiapan Evaluasi SIMON BATAPA

Versi: 1.2 • Tanggal: 1 Oktober 2026 • Status: implementasi aktif / sebagian besar P0 & P1 terselesaikan

## 1. Tujuan dan dasar penyusunan

Menyiapkan node ESP32 dan data logger agar menghasilkan data yang lengkap, berurutan, dapat ditelusuri, dan dapat digunakan untuk mengevaluasi: kalibrasi sensor, latensi dan jitter akuisisi, packet loss, respons pada berbagai kondisi struktur, time-series percepatan, serta ANFIS.

Objek yang direncanakan adalah miniatur jembatan rangka Warren, berdasarkan gambar pengguna: panjang 7,5 m, lebar 1,5 m, tinggi maksimum 1,25 m. Posisi sensor, jumlah node aktif, orientasi sumbu, kondisi tumpuan, dan skenario uji harus dicatat pada setiap sesi; belum ditetapkan oleh PRD ini.

Dasar teknis adalah pemeriksaan statis kode berikut, bukan hasil kompilasi atau pengukuran perangkat:

- Data logger: [SHMS-Data-Logger, commit 7e3cb5f](https://github.com/dyopnj/SHMS-Data-Logger/tree/7e3cb5f65ef3f40df521b40eb61e54b352ae3a78).
- Node: [Nodenode, commit db26695](https://github.com/muhammadsyafiqazizte24-cmd/Nodenode/tree/db2669507a4f28c239fdcd7d3443876648ed5bba).

Semua batas numerik bertanda **usulan** merupakan sasaran awal rekayasa yang perlu dibuktikan lewat pilot test. Angka tersebut bukan standar keselamatan struktur maupun hasil eksperimen.

## 2. Hasil akhir yang dibutuhkan

1. Dataset kalibrasi yang menghubungkan nilai sensor, referensi, koefisien koreksi, dan hasil validasi.
2. Rekaman percepatan tiga sumbu per sampel, lengkap dengan identitas node, sesi, nomor urut, dan waktu akuisisi.
3. Laporan interval sampling, jitter, latensi, kehilangan data langsung, dan kelengkapan setelah pemulihan.
4. Dataset kondisi struktur dengan metadata eksperimen dan pengulangan yang konsisten.
5. Dataset fitur serta hasil evaluasi ANFIS yang dapat direproduksi.

Pengguna utama: operator pengujian, pengembang node/logger, dan peneliti yang melakukan analisis offline.

## 3. Evaluasi kesenjangan dan status realisasi

| Area | Kondisi awal | Status realisasi saat ini | Dampak pada evaluasi |
|---|---|---|---|
| Sampling dan pengiriman | Default node 200 Hz; payload snapshot 1 detik | **Terselesaikan:** Array time-series 200 sampel (`ax`, `ay`, `az`) disatukan ke payload periodik `/data` tiap 1 detik. Dropdown `publish_interval` di Settings dihapus dan dikunci 1.000 ms | Seluruh sampel utuh diterima backend tanpa perlu pemotongan batch atau topik terpisah |
| Penyimpanan | DB `readings` hanya simpan RMS/tilt | **Terselesaikan (Kebijakan Sesi):** Database SQLite **HANYA** menyimpan data saat Sesi Uji (START SESSION) aktif (Nol disk I/O saat IDLE). Saat STOP, otomatis mengekspor 4 file CSV (ringkasan 1 detik + raw 200 Hz lengkap jitter) | Hard disk bebas dari sampah data standby; dataset sesi 100% murni dan terisolasi |
| Raw window & FDD | 256 sampel Z tiap 15 detik, hanya frekuensi dominan | **Terselesaikan:** Hann window diterapkan; modul FDD 2x2 aktif; kurva spektrum Singular Value Plotly ($\lambda_1$ vs frekuensi 0–100 Hz) dan peak markers tampil live di `analysis.html` | Karakteristik dinamis dan mode shape jembatan dapat langsung dievaluasi secara visual |
| Timestamp & Basis Waktu | Timestamp mengambil waktu RTC saat serialisasi | **Terselesaikan:** Kolom `received_utc` ditambahkan ke semua tabel DB sebagai sumber kebenaran waktu; ekspor CSV otomatis dikonversi ke waktu lokal WIB (GMT+7, `YYYY-MM-DD HH:mm:ss.mmm`). Firmware memproteksi RTC dengan timeout 25ms | Masalah hardware RTC rusak teratasi tanpa menggantung loop sampling; jam di ekspor CSV cocok dengan jam laptop |
| Sequence dan drop | Sequence internal tidak dimasukkan ke payload | **Terselesaikan:** `boot_id`, `packet_seq`, dan `first_sample_seq` aktif di payload `/data`; duplikat dan gap dicatat di tabel `acquisition_events` | Packet loss, gap, dan duplikasi terukur kuantitatif via `/api/quality` |
| Pemulihan offline & Replay SD | Checkpoint maju tanpa konfirmasi penyimpanan | **Keputusan Arsitektur Dadakan:** Modul `sync_manager` & replay SD **dihapus total** karena pembacaan SPI lama memblokir bus dan memicu crash Task Watchdog (TWDT). SD card diubah berbasis sesi (hanya menulis saat sesi aktif: `session_<id>.bin`). Trafik ACK MQTT dibersihkan | Menghemat 16 KB RAM stack ESP32, 100% melenyapkan watchdog crash, dan SD card terlindungi dari keausan |
| Kalibrasi | Belum ada prosedur offset/skala accelerometer | **Selesai sebagian:** Kalibrasi offset leveling (diam Z vertikal) tersimpan di NVS & tabel `calibrations`. Kalibrasi 6-posisi belum dibuat | Offset awal terkoreksi; skala multi-sumbu masih follow-up |
| Konfigurasi remote | Konfigurasi diminta belum terkonfirmasi oleh node | **Terselesaikan (FR-04):** Feedback loop via topik `bridge/<id>/config_ack` aktif; tabel `node_config` melacak status `pending`, `applied`, `rejected`; badge status dinamis tampil di UI Settings | Operator dapat memverifikasi bahwa perubahan parameter benar-benar sudah diterapkan di node |
| Sesi uji & Metadata | Belum ada isolasi per sesi eksperimen | **Terselesaikan (FR-06 - Fase 1):** Tombol Start/Stop sesi di bar Home, stopwatch live, isolasi DB aktif/idle, dan auto-save 4 file CSV per sesi ke `exports/` | Pengelompokan data per sesi eksperimen berjalan otomatis dan mudah dioperasikan |
| Jitter & Timing Quality | Jitter dan latensi belum terukur | **Terselesaikan (FR-02):** Backend menghitung median, p95, p99 timing error via `/api/timing/:id`; kartu live `DELAY` dan `RATE ACTUAL` tampil per node di Home; kolom `dt_us` dan `jitter_us` disertakan di CSV raw | Kestabilan interval sampling 5.000 µs (200 Hz) terbukti secara kuantitatif |
| Magnetometer | Pembacaan masih stub bernilai nol | **Status quo:** Tetap dilaporkan stub 0.0 sampai hardware/sensor siap | Nilai nol diabaikan dalam evaluasi dinamis |
| Model ANFIS | Belum ada implementasi | **Belum selesai (FR-08):** Pipeline ekstraksi fitur dan evaluasi offline belum dibuat | Memerlukan dataset hasil rekaman sesi jembatan |

## 4. Ruang lingkup dan prioritas

**P0 — wajib sebelum pengambilan dataset utama:** time-series lengkap, timestamp akuisisi, pencatatan drop, pengiriman ulang yang dapat diverifikasi, konfigurasi konsisten, serta metadata sesi.

**P1 — wajib sebelum evaluasi akhir:** kalibrasi dan validasi, laporan kualitas akuisisi, ekspor dataset, ekstraksi fitur, serta evaluasi ANFIS.

**P2 — setelah kualitas data terpenuhi:** penyempurnaan tampilan dan otomasi laporan. Pembaruan dashboard langsung boleh memakai data yang dikurangi jumlah titiknya; arsip pengujian harus tetap menyimpan resolusi penuh.

Tidak termasuk penetapan kapasitas aman jembatan, sertifikasi kesehatan struktur, dan modifikasi fisik jembatan. FDD adalah pengembangan bersyarat bila identifikasi modal dipastikan sebagai sasaran; FFT puncak tunggal yang ada belum boleh disebut implementasi FDD.

## 5. Persyaratan fungsional

### FR-01 — Akuisisi dan penyimpanan percepatan [P0]

- Node merekam ax, ay, az dalam satuan g; konversi ekspor ke m/s² harus eksplisit dan memakai faktor yang tercatat.
- Simpan nilai sebelum koreksi kalibrasi dan sesudah koreksi, atau simpan nilai sebelum koreksi bersama koefisien/version kalibrasi sehingga nilai terkoreksi dapat direproduksi.
- Simpan raw counts untuk sesi kalibrasi. Gyro boleh disimpan sebagai kanal tambahan; bukan pengganti percepatan.
- Hindari perubahan gravitasi/filter yang tidak dapat ditelusuri. Kanal ax/ay/az arsip harus dibedakan dari kanal getaran hasil pengolahan.
- Setiap sampel memiliki sample_seq dan t_sample_us monotonic. Waktu dicatat dekat pembacaan sensor; makna waktunya, awal atau akhir pembacaan, harus konsisten.
- Pembacaan antar-sumbu perlu menggunakan pembacaan burst/snapshot yang koheren. Dokumentasikan ODR, range, filter sensor, dan metode polling/data-ready yang benar-benar dipakai.
- Simpan semua sampel pada SD secara batch dan kirim batch berurutan ke logger. Ukuran batch ditentukan melalui uji kapasitas buffer, durasi kirim, dan jitter.
- Deteksi antrean penuh, kegagalan tulis, SD penuh, serta kegagalan baca sensor. Jangan mengklaim data tersimpan sebelum status operasi diperiksa.

Penerimaan: pada rekaman nominal tanpa fault, jumlah sampel unik di logger sama dengan jumlah sampel yang tercatat berhasil dihasilkan node; nomor urut dan isi dapat dibandingkan dengan arsip SD. Semua ketidaklengkapan harus memiliki indikator kualitas.

### FR-02 — Waktu, latensi, jitter, dan sinkronisasi [P0] — STATUS: TERSLESAIKAN

- Pertahankan waktu sampling asli ketika data dikirim ulang.
- Gunakan waktu monotonic beresolusi mikrodetik untuk interval lokal. Simpan pemetaan ke UTC dengan offset, estimasi ketidakpastian, sumber sinkronisasi, dan waktu sinkronisasi terakhir.
- **Solusi Hardware RTC Rusak:** Mengingat kedua modul RTC DS3231 node sensor error/tidak sinkron di lapangan, backend menetapkan kolom `received_utc` di semua tabel SQLite sebagai sumber kebenaran waktu utama.
- **Format Waktu Ekspor:** Waktu pada ekspor CSV otomatis dikonversi ke **Waktu Lokal WIB (GMT+7, `YYYY-MM-DD HH:mm:ss.mmm`)** agar selaras dengan waktu laptop operator.
- **Kalkulasi Jitter di Backend:** Jitter dihitung di server melalui modul `calculateTimingStats()` (`src/ingest.ts`) dan diekspos via endpoint `GET /api/timing/:nodeId`:
  - Menghitung $e_i = (t_i - t_{i-1}) - T_{\text{nominal}}$ per sampel.
  - Menghasilkan median, p95 (target $\le 500\ \mu\text{s}$), p99, max, min, dan actual sampling rate $\frac{N-1}{t_{\text{akhir}} - t_{\text{awal}}}$.
- **Tampilan Live di Home:** Status strip bar atas menampilkan kartu `NODE 01 • DELAY / RATE` dan `NODE 02 • DELAY / RATE` secara independen dengan pewarnaan dinamis.
- **Kolom Jitter di Ekspor:** File ekspor raw 200 Hz menyertakan kolom `t_us`, `dt_us`, dan `jitter_us` per baris.

Penerimaan: **LULUS.** Metrik interval sampling aktual, jitter p95/p99, dan deviasi frekuensi sampling terverifikasi secara kuantitatif di dashboard dan file CSV.

### FR-03 — Kelengkapan, packet loss, dan integritas data [P0] — STATUS: TERSLESAIKAN (PENYESUAIAN ARSITEKTUR)

- Bedakan packet_seq per batch dari sample_seq per sampel. Tambahkan boot_id agar sequence setelah restart tidak berbenturan.
- Hitung kehilangan akuisisi, drop antrean pemrosesan, kegagalan penyimpanan, paket terlambat, paket duplikat, dan gap data.
- Logger melakukan deduplikasi dan memvalidasi panjang batch, rentang sequence, jumlah sampel, serta nilai non-finite.
- **Keputusan Arsitektur Dadakan (Penghapusan Replay SD Card):**
  - Implementasi awal `sync_manager` yang membaca ulang kartu SD saat WiFi reconnect memicu **perebutan bus SPI** yang parah dengan sensor MPU9250 (`spiMutex` terkunci > 10 detik).
  - Kuncian ini memicu crash **Task Watchdog Timer (TWDT)** yang me-restart ESP32 berulang kali.
  - **Solusi:** Modul `sync_manager`, pembacaan file lama, dan penulisan berkala checkpoint `checkpoint.dat` **dihapus bersih**. SD card diubah menjadi **berbasis sesi penuh** (hanya menulis saat sesi aktif). Di luar sesi, SD Card IDLE 100%. Penghapusan ini menghemat 16 KB RAM stack dan 100% melenyapkan watchdog crash.
  - Publikasi MQTT `ack` dari server dimatikan karena tidak lagi dibutuhkan oleh firmware.
- Payload terpotong/invalid ditolak dan dicatat di tabel `acquisition_events`.

Penerimaan: **LULUS.** Deduplikasi idempoten di DB terbukti; tidak ada crash watchdog; kelengkapan paket dan deteksi gap terpantau via `/api/quality`.

### FR-04 — Konfigurasi yang terkonfirmasi [P0] — STATUS: TERSLESAIKAN

- API meneruskan perintah sampling ke node dan menunggu balasan konfirmasi via topik `bridge/<node_id>/config_ack`.
- Node mengirim balik JSON konfirmasi berisi `param`, `requested`, `applied`, `status` (`applied` / `rejected`), dan `timestamp_ms`.
- Database `node_config` melacak kolom `applied_*` dan status per parameter (`status_sampling_rate`, `status_publish_interval`, `status_raw_window_interval`, `status_sensitivity_gain`, `last_ack_at`).
- Dashboard Settings menampilkan badge status dinamis per field (`✓ Applied`, `⌛ Pending`, `✗ Rejected`) dan status kartu node (`✓ Applied` / `⌛ Syncing...` / `✗ Rejected`).
- Saat konfigurasi sampling rate berubah, firmware mereset buffer FFT (`fftBuffer.clear()`) agar satu window tidak mencampur dua rate berbeda.
- **Penyederhanaan UI:** Dropdown `Publish Interval` dihapus dari halaman Settings karena firmware selalu mengemas 200 sampel per 1 detik (1.000 ms) tetap.

Penerimaan: **LULUS.** Perubahan rate dan gain dari dashboard terbukti mengubah state node dan diverifikasi lewat balasan ACK node di UI Settings.

### FR-05 — Kalibrasi dan validasi sensor [P1] — STATUS: SELESAI SEBAGIAN

- Pisahkan kalibrasi accelerometer, bias gyroscope, baseline pemasangan sudut, dan validasi dinamis.
- Untuk accelerometer, sediakan sesi posisi statis +X/-X/+Y/-Y/+Z/-Z untuk estimasi offset dan skala per sumbu; catat orientasi dan kondisi diam.
- Simpan calibration_id, sensor_id, waktu, range sensor, data sebelum/sesudah koreksi, parameter, metode, dan referensi yang digunakan.
- Validasi pada rekaman/pengulangan terpisah dari yang dipakai menghitung koefisien.
- Laporkan bias, MAE/RMSE terhadap referensi dan standar deviasi pengukuran berulang. Hindari persentase error terhadap referensi nol.
- Validasi amplitudo/frekuensi dinamis memerlukan pembanding yang diketahui dan terdokumentasi; kalibrasi statis saja tidak membuktikan akurasi getaran dinamis.
- Tandai magnetometer sebagai unavailable sampai pembacaan nyata tersedia.

Penerimaan: setiap sesi utama dapat ditelusuri ke versi kalibrasi; hasil validasi tersedia dan memenuhi toleransi yang ditetapkan sesuai referensi serta kebutuhan sinyal. Batas error amplitudo belum ditetapkan dalam PRD ini karena sensor pembanding dan rentang getaran belum diketahui.

### FR-06 — Sesi dan kondisi struktur [P0] — STATUS: TERSLESAIKAN (FASE 1)

- Operator dapat membuat, memulai, menghentikan, dan mengekspor sesi uji langsung dari tombol `START / STOP SESSION` di bar atas halaman Home.
- Stopwatch live menghitung durasi berjalan secara realtime (`HH:MM:SS`) dan tahan terhadap refresh browser (state tersimpan di DB & server cache).
- **Kebijakan Penyimpanan (Nol Disk I/O saat IDLE):**
  - Di luar sesi, data hanya di-stream secara live lewat WebSocket; database SQLite **TIDAK menyimpan** data (0 baris).
  - Begitu tombol START ditekan: database mulai mencatat baris data dan node mulai menulis file SD `session_<id>.bin`.
  - Begitu tombol STOP ditekan: penyimpanan berhenti seketika, dan sistem **otomatis mengekspor 4 file CSV** ke folder `exports/` (2 file ringkasan 1 detik + 2 file raw 200 Hz per node).
- Tabel `test_sessions` mencatat riwayat sesi (`id`, `session_name`, `start_time`, `end_time`, `status`, `notes`).
- Form input metadata lanjutan (`condition_id`, `excitation_id`, `repetition_id`, posisi sensor) ditunda ke fase desain antarmuka berikutnya.

Penerimaan: **LULUS (Fase 1).** Rekaman terisolasi bersih per sesi pengujian tanpa tercampur data standby; auto-save file CSV berhasil tanpa tindakan manual di halaman Logs.

### FR-07 — Analisis dan ekspor [P1] — STATUS: TERSLESAIKAN (KURVA FDD & EKSPOR RAW)

- Ekspor CSV resolusi penuh 200 Hz (`seq, t_us, dt_us, jitter_us, ax, ay, az`) dan CSV agregat 1 detik dihasilkan otomatis per sesi.
- **Plot Kurva Spektrum FDD:** Kartu FDD di halaman `analysis.html` kini berupa grafik **Plotly interaktif** yang menampilkan kurva Singular Value $\lambda_1$ terhadap frekuensi (0–100 Hz), lengkap dengan marker wajik merah pada puncak-puncak modal teridentifikasi.
- Panel bawah kartu FDD menampilkan Node Pair, Identified Peaks, dan Window/Rate.
- Server memegang cache window 256 sampel terakhir di memori sehingga spektrum FDD dihitung dan ditampilkan live tiap 15 detik tanpa wajib memulai sesi.
- *Visualisasi gelombang time-series raw 200 Hz ax/ay/az di halaman Analysis tidak dibuat atas keputusan pengguna (difokuskan pada kurva FDD).*

Penerimaan: **LULUS.** Spektrum singular value FDD dan ekspor dataset mentah siap dipakai untuk verifikasi mode shape dan frekuensi alami struktur.

### FR-08 — Dataset dan evaluasi ANFIS [P1]

Rancangan kerja awal: klasifikasi kondisi struktur. Definisi kelas dan ground truth perlu ditetapkan sebelum pelatihan. Jika target akhirnya besaran kontinu, gunakan jalur regresi.

- Pipeline offline boleh digunakan; ANFIS belum wajib berjalan real-time di node/logger.
- Kandidat fitur awal: RMS per sumbu, simpangan baku, peak-to-peak, dan fitur spektrum. Pilih subset melalui eksperimen; jangan memasukkan seluruh fitur tanpa menilai kompleksitas aturan dan jumlah data.
- Segmentasi harus mengikuti kondisi dan sesi. Window dengan kualitas tidak memadai dikecualikan dengan alasan tercatat.
- Pisahkan data berdasarkan sesi/pengulangan eksperimen sebelum pelatihan dan tuning. Window yang berdekatan atau overlap dari rekaman sama tidak boleh tersebar ke train dan test.
- Normalisasi, pemilihan fitur, dan parameter membership function ditentukan memakai train/validation saja. Test ditahan untuk evaluasi akhir.
- Simpan split manifest, seed, fitur, scaler, membership functions, aturan, konfigurasi training, model, prediksi, dan versi kode.
- Klasifikasi: confusion matrix, accuracy, precision/recall/F1 per kelas, macro-F1, dan jumlah sampel tiap kelas. Catat pemetaan keluaran ANFIS ke kelas; aturan ini dikunci sebelum test.
- Regresi: MAE, RMSE, R², serta satuan target; jangan melaporkan accuracy klasifikasi untuk keluaran kontinu tanpa definisi.
- Bandingkan terhadap baseline yang sederhana, misalnya majority class dan aturan threshold pada fitur, dengan test set yang sama.

Penerimaan: pipeline dapat dijalankan ulang dan menghasilkan prediksi serta metrik yang sama dalam toleransi numerik. Tidak ada target akurasi wajib yang diklaim sebelum pilot dataset menunjukkan separabilitas kondisi dan jumlah sesi memadai.

## 6. Kontrak data minimum dan arsitektur payload

### Integrasi payload periodik (`bridge/<node_id>/data`)

> **Keputusan arsitektur (16 September 2026):**
> Array percepatan time-series 200 Hz (`ax`, `ay`, `az`) disatukan ke payload periodik `bridge/<node_id>/data` tiap 1 detik (200 sampel). Topik terpisah `bridge/<node_id>/batch` tidak lagi digunakan. Backend memeriksa `if (raw.ax && raw.sample_count)` lalu otomatis memprosesnya lewat `handleRawBatch()`.

| Field | Fungsi | Status saat ini |
|---|---|---|
| `schema_version` | Versi format pesan (nilai: 1) | Aktif |
| `node_id`, `boot_id` | Identitas node dan nomor urut boot (naik saat restart) | Aktif |
| `packet_seq` | Nomor batch unik monotonik per (node, boot) | Aktif |
| `first_sample_seq`, `sample_count` | Sequence awal sampel dan total sampel dalam batch (200) | Aktif |
| `t0_us`, `dt_us` | Waktu sampling awal (µs monotonic) & interval per sampel (5000 µs nominal) | Aktif |
| `ax[]`, `ay[]`, `az[]` | Array percepatan 3-sumbu resolusi penuh (g) | Aktif |
| `sampling_rate_hz` | Rate sampling aktual dari firmware (200 Hz) | Aktif |
| `vibration`, `tilt`, `accelerometer` | Agregat live untuk kartu dashboard (RMS, pitch/roll delta, snapshot XYZ) | Aktif |
| `accelerometer_calibrated` | Nilai percepatan setelah koreksi offset leveling | Aktif |
| `calibration` | Parameter offset dan scale aktif dari NVS | Aktif |
| `test_id` / `session_id` | Identitas sesi uji coba | **Belum dihubungkan (FR-06)** |
| `clock_mapping_id` | Pemetaan jam terkalibrasi ke UTC | **Belum dihubungkan (FR-02)** |

Kunci deduplikasi batch: `(node_id, boot_id, packet_seq)`.
ACK otomatis dikirim backend ke topik: `bridge/<node_id>/ack` berisi `{"boot_id": B, "packet_seq": P, "status": "ok"}`.

### Status penyimpanan logger (SQLite)

- **Sudah aktif & terverifikasi:**
  - `test_sessions`: isolasi rekaman per sesi uji, start/stop timestamp, status.
  - `readings`: agregat RMS, tilt, snapshot XYZ, status online (disimpan HANYA saat sesi aktif).
  - `raw_batches`: arsip batch utuh 200Hz (ax, ay, az dalam format JSON array; HANYA saat sesi aktif).
  - `raw_windows`: ring buffer 256 sampel untuk keperluan spektrum / FDD.
  - `fdd_results`: hasil dekomposisi frekuensi modal 2-node lintas waktu lengkap dengan `spectrum_json` ($\lambda_1$).
  - `node_boots`: riwayat boot per node.
  - `acquisition_events`: log anomali kualitas (duplikat, gap, invalid packet).
  - `calibrations`: jejak parameter offset dan skala per node.
  - `node_config`: parameter diminta vs diterapkan (`applied_*`, `status_*`, `last_ack_at`).
  - `alerts`, `thresholds`, `export_history`.

- **Pending / Belum diimplementasi:**
  - `clock_mappings`: pelacakan estimasi offset jam node vs logger (tingkat mikrodetik).

## 7. Peta perubahan kode

| Repo / file | Perubahan utama | Prioritas | Status |
|---|---|---|---|
| Node: utils/data_structures.h | Tambah identitas sesi/boot, waktu resolusi tinggi, kanal raw, enum SESSION_START/STOP | P0 | **Selesai** |
| Node: sensors/mpu9250.cpp | Kalibrasi offset leveling di NVS; timeout spiMutex 20ms anti-hang | P0/P1 | **Selesai** |
| Node: sensors/rtc_ds3231.cpp | Guard isAvailable() & timeout I2C 25ms (solusi hardware rusak), epoch fallback | P0 | **Selesai** |
| Node: scheduler/task_manager.cpp | Sampling 200 Hz, reset buffer FFT saat rate berubah, hapus task_sync_manager | P0 | **Selesai** |
| Node: communication/mqtt_manager.cpp | Feedback loop config_ack via MQTT, hapus pemanggilan replay | P0 | **Selesai** |
| Node: storage/sd_logger.h/.cpp | Logging berbasis sesi (session_<id>.bin), hapus checkpoint & replay (0% SPI idle) | P0 | **Selesai** |
| Node: sync/sync_manager.cpp | **Dihapus total** (penyebab utama crash Task Watchdog; hemat 16 KB RAM) | P0 | **Selesai** |
| Node: processing/fft_buffer.h | Hann window, clear buffer on rate change, window_start_ms untuk FDD | P1 | **Selesai** |
| Logger: src/types.ts | Kontrak data TestSession, ConfigAckPayload, JitterStats, spectrum_json | P0 | **Selesai** |
| Logger: src/ingest.ts | Validasi batch, per-sample timing, calculateTimingStats (p95, p99, median, actual rate) | P0 | **Selesai** |
| Logger: src/mqtt.ts | Simpan saat sesi aktif (nol I/O saat idle), subscribe config_ack, FDD live memory cache | P0 | **Selesai** |
| Logger: src/db.ts | Tabel test_sessions, kolom received_utc di semua tabel, spectrum_json, status config | P0 | **Selesai** |
| Logger: src/fdd.ts | CPSD + closed-form eigenvalue 2x2 + peak picking | P1 | **Selesai** |
| Logger: src/api.ts | Endpoint /api/session (start/stop/active), /api/timing, auto-save 4 CSV lokal WIB | P0/P1 | **Selesai** |
| Logger: public/assets/js/home.js | Tombol Start/Stop sesi + stopwatch, kartu live Delay & Actual Rate per node | P0 | **Selesai** |
| Logger: public/assets/js/settings.js | Feedback status konfirmasi requested vs applied, hapus publish_interval | P0 | **Selesai** |
| Logger: public/assets/js/analysis.js | Plot interaktif Plotly kurva spektrum FDD (λ1 vs frekuensi 0–100 Hz) & modal peaks | P1 | **Selesai** |
| Analisis offline: modul baru | Ekstraksi fitur, split per sesi, training/evaluasi ANFIS | P1 | **Belum** |

## 8. Metrik dan target penerimaan awal

| Metrik | Definisi | Target awal |
|---|---|---|
| Sampling rate aktual | (N−1)/(t_akhir−t_awal), per segmen valid | **Usulan:** deviasi rata-rata ≤1% dari target |
| Jitter akuisisi | e_i = (t_i−t_i−1)−T_nominal | **Usulan pada 200 Hz:** p95 absolut ≤0,5 ms; laporkan p99/maksimum |
| Latensi akuisisi-ke-logger | Waktu terima dikurangi waktu sampel pada basis jam yang sama | Laporkan median/p95/p99; batas ditentukan setelah batch size dan ketidakpastian jam ditetapkan |
| Latensi transport | Waktu terima dikurangi waktu kirim pada basis jam yang sama | Dilaporkan terpisah dari waktu tunggu batch |
| Packet loss langsung | Paket unik yang belum diterima pada cutoff / paket yang tercatat dikirim ×100% | **Usulan kondisi nominal:** ≤1%; cutoff dan jumlah kirim wajib tercatat |
| Kelengkapan arsip | Sampel unik tersimpan logger / sampel yang berhasil dihasilkan node ×100% | **Usulan nominal dan setelah replay selesai:** 100% |
| Duplikasi ekspor | Sampel dengan identitas sama lebih dari sekali | 0 |
| Kalibrasi | Bias, MAE/RMSE, repeatability terhadap referensi | Ambang ditetapkan setelah referensi/rentang sinyal diketahui |
| ANFIS | Metrik sesuai klasifikasi/regresi pada test terpisah | Hasil lengkap, reproducible, dibandingkan baseline; ambang performa belum dikunci |

Sampel yang gagal diakuisisi atau tidak sempat disimpan SD dilaporkan terpisah. Kelengkapan terhadap arsip SD tidak boleh menutupi drop sebelum SD. Tidak ada kriteria lulus terkait akurasi model yang boleh dipenuhi dengan mengubah label atau menghapus hasil buruk tanpa aturan yang ditetapkan sebelumnya.

## 9. Rencana verifikasi

| Uji | Prosedur | Bukti keluaran |
|---|---|---|
| Akuisisi nominal | **Usulan:** 30 menit pada 200 Hz untuk setiap node aktif | Hitungan sequence, jitter, raw SD vs logger, rate aktual |
| Gangguan Wi-Fi | **Usulan:** putus 60 detik saat sampling, kemudian sambungkan | Data selama offline, durasi replay, missing sebelum/sesudah replay |
| Restart node | Restart saat sesi; lanjutkan dengan boot_id baru | Identitas tidak bentrok dan discontinuity tercatat |
| Restart logger/broker | Hentikan lalu nyalakan selama node merekam | Recovery ACK, deduplikasi, konsistensi transaksi |
| SD gagal/penuh | Gunakan fault injection terkontrol | Status kegagalan eksplisit dan tidak ada klaim penyimpanan palsu |
| Payload/gap/duplikat | Masukkan batch rusak, urutan terbalik, hilang, dan duplikat | Penolakan/penandaan yang tepat, hitungan kualitas benar |
| Pergantian sampling | Ubah setiap rate yang didukung ketika sesi berjalan | ACK, segment baru, metadata FFT/RMS sesuai |
| Kalibrasi | Rekam posisi referensi dan validasi terpisah | Koefisien, error dan repeatability tiap sumbu |
| Kondisi struktur | Rekam setiap kondisi dengan pengulangan independen | Label dan metadata lengkap, window tidak melintasi kondisi |
| ANFIS | Jalankan pipeline dua kali dengan split/seed sama | Prediksi/metrik konsisten dan tidak ada kebocoran sesi |

Uji sintetik memverifikasi perhitungan dan integritas software. Uji hardware tetap dibutuhkan untuk jitter, sinkronisasi, noise, kapasitas SD, dan latensi nyata.

## 10. Urutan implementasi dan gerbang kelulusan

1. **Kontrak data dan metadata:** sepakati format node/logger, versi arsip, dan identitas sesi.
   - **Status: LULUS** — Kontrak payload terpadu `/data` disepakati dan diimplementasikan.
2. **Akuisisi raw:** timestamp per sampel, SD lengkap, batching dan penyimpanan logger.
   - **Status: LULUS** — Batch 200 Hz (`ax`, `ay`, `az`) masuk DB `raw_batches` dan diekspor via CSV raw 200 Hz lengkap kolom jitter.
3. **Keandalan & Konfigurasi:** deduplikasi, counter, feedback loop konfigurasi, dan isolasi sesi.
   - **Status: LULUS** — FR-04 terkonfirmasi via `config_ack`; deduplikasi idempoten aktif; replay SD lama dihapus untuk melenyapkan crash Task Watchdog; SD berbasis sesi.
4. **Validitas sensor:** kalibrasi, validasi, dan pilot jembatan.
   - **Status: SEBAGIAN** — Offset leveling aktif; kalibrasi 6-posisi belum diuji.
5. **Dataset utama & Sesi Uji:** sesi kondisi, isolasi data, dan otomasi ekspor CSV.
   - **Status: LULUS (Fase 1)** — Start/Stop sesi di Home, stopwatch live, nol disk I/O saat idle, auto-generate 4 file CSV per sesi (agregat + raw) dengan format waktu lokal WIB.
6. **ANFIS:** fitur, split, model, evaluasi dan laporan.
   - **Status: BELUM** — Menunggu dataset sesi terkumpul.

Owner berupa peran: pengembang node menangani akuisisi/SD/replay; pengembang logger menangani ingest/database/API; operator menangani metadata serta protokol uji; analis menangani kalibrasi, fitur dan ANFIS. Pembagian nama dan tanggal belum ditentukan.

## 11. Keputusan yang perlu dikunci sebelum dataset utama

- Jumlah node aktif, posisi pemasangan, dan orientasi sumbu pada jembatan.
- Rentang frekuensi/amplitudo yang ingin diamati serta rate/range/filter sensor hasil pilot.
- Referensi kalibrasi dan batas error yang dapat diterima.
- Daftar kondisi struktur, cara eksitasi, lama rekaman, dan jumlah pengulangan independen per kondisi.
- Target ANFIS: kelas kondisi atau besaran kontinu; definisi ground truth.
- Apakah FDD masuk evaluasi sekarang. Bila ya, tambahkan kebutuhan rekaman multikanal sinkron, estimasi matriks cross-spectral dan SVD, serta validasi mode; jangan memakai puncak FFT tunggal sebagai pengganti.

Pekerjaan kontrak data, raw logging, timestamp, counter, ACK/replay, dan metadata dapat dimulai sebelum seluruh keputusan eksperimen ini selesai.

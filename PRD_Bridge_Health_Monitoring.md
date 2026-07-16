# Product Requirements Document (PRD)
## Sistem Monitoring Kesehatan Jembatan (Bridge Structural Health Monitoring)

**Versi:** 2.0 (Draft)
**Tanggal:** 17 Juli 2026
**Status:** Fase 1 - Development & Testing (Laptop)

---

## 1. Latar Belakang & Masalah

Jembatan memerlukan pemantauan kondisi struktural secara berkala untuk mendeteksi anomali seperti getaran berlebih atau deformasi/kemiringan yang dapat mengindikasikan penurunan kualitas struktur. Sistem monitoring manual bersifat reaktif dan tidak real-time. Diperlukan sistem monitoring otomatis berbasis IoT yang dapat memantau kondisi struktural jembatan secara real-time dan memberikan peringatan dini saat terjadi anomali.

## 2. Tujuan (Goals)

- Memantau kondisi getaran dan kemiringan struktur jembatan secara real-time
- Menyediakan data historis untuk analisis tren kondisi jembatan dari waktu ke waktu
- Memberikan peringatan (alert) otomatis saat data sensor melewati ambang batas (threshold) yang ditentukan
- Memastikan tidak ada data yang hilang meskipun terjadi gangguan koneksi (melalui backup lokal)
- Membangun sistem yang dapat dikembangkan bertahap: mulai dari laptop (testing) hingga deployment penuh di mini PC

## 3. Non-Goals (Di Luar Cakupan)

- Sistem tidak melakukan analisis prediktif/predictive maintenance berbasis machine learning (di fase ini)
- Sistem tidak terintegrasi dengan notifikasi eksternal (Telegram/email/SMS) pada MVP — alert hanya tampil di dashboard
- Sistem tidak menangani lebih dari 2 node pada fase ini (namun desain harus scalable)
- **Yaw/twist tidak dijadikan parameter monitoring utama** — meskipun MPU9250 memiliki magnetometer, data magnetometer disimpan namun tidak diolah jadi fitur utama, karena rawan interferensi magnetik dari struktur besi/baja jembatan
- Perhitungan FFT tidak dilakukan di node (ESP32), melainkan di backend/mini PC

## 4. Arsitektur Sistem

### 4.1 Komponen

| Komponen | Deskripsi |
|---|---|
| **Node Sensor (x2)** | MPU9250 (accel + gyro + magnetometer), SD Card Module, RTC Module. Sampling 200Hz. Mengukur getaran & kemiringan, publish data via MQTT, backup ke SD card |
| **MQTT Broker** | Fase 1: berjalan di laptop (Mosquitto). Fase 2: berjalan di mini PC |
| **Backend Service** | Subscribe ke topic MQTT, parsing JSON, hitung FFT dari raw window data, simpan ke database, expose API untuk frontend |
| **Database** | Menyimpan data historis reading, hasil FFT, konfigurasi threshold, log alert |
| **Frontend Dashboard** | Menampilkan data real-time, grafik historis, status alert, panel konfigurasi (sampling rate & threshold) |

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
| gyro_x, gyro_y, gyro_z | MPU9250 gyroscope | °/s | Dipakai untuk fusion tilt |
| mag_x, mag_y, mag_z | MPU9250 magnetometer | µT | Disimpan saja, belum dipakai untuk fitur utama |

**Dihitung di node (hasil olahan):**

| Parameter | Cara Hitung | Frekuensi Kirim |
|---|---|---|
| rms_vibration | RMS dari magnitude accel (√(x²+y²+z²)) dalam window 1 detik (200 sampel) | Tiap 1 detik |
| pitch, roll | Complementary/Kalman filter dari accel + gyro | Tiap 1 detik |
| pitch_baseline, roll_baseline | Nilai pitch/roll saat kalibrasi awal, disimpan lokal sekali (SD card/EEPROM) | Sekali, saat setup |
| pitch_delta, roll_delta | pitch/roll saat ini − baseline | Tiap 1 detik |
| raw_window[] | Buffer 256 sampel accel mentah | Berkala (misal tiap 10-30 detik), dikirim sebagai batch untuk FFT di backend |

**Metadata tiap payload:**

| Parameter | Keterangan |
|---|---|
| node_id | ID unik tiap node (misal "node_01") |
| timestamp | Dari RTC |
| sampling_rate_hz | Default 200Hz, dapat diubah via MQTT config |
| connection_status | Status koneksi/heartbeat node |

### 5.2 Data Olahan di Backend

| Parameter | Cara Hitung | Sumber |
|---|---|---|
| dominant_frequency | FFT dari raw_window[] yang dikirim node | Dihitung di backend/mini PC (bukan di ESP32) |
| Trend dominant_frequency | Riwayat dominant_frequency dari waktu ke waktu | Disimpan di database |

### 5.3 Format Payload MQTT (JSON) — Processed Data (per 1 detik)

```json
{
  "node_id": "node_01",
  "timestamp": "2026-07-17T10:00:00Z",
  "sampling_rate_hz": 200,
  "vibration": {
    "rms": 0.00
  },
  "tilt": {
    "pitch": 0.00,
    "roll": 0.00,
    "pitch_delta": 0.00,
    "roll_delta": 0.00
  },
  "magnetometer": {
    "mag_x": 0.00,
    "mag_y": 0.00,
    "mag_z": 0.00
  },
  "connection_status": "online"
}
```

### 5.4 Format Payload MQTT (JSON) — Raw Window Data (berkala, untuk FFT)

```json
{
  "node_id": "node_01",
  "timestamp": "2026-07-17T10:00:00Z",
  "window_size": 256,
  "sampling_rate_hz": 200,
  "raw_accel": [0.00, 0.00, "... 256 sampel"]
}
```

### 5.5 Topic Structure MQTT

| Topic | Arah | Fungsi |
|---|---|---|
| `bridge/{node_id}/data` | Node → Broker | Payload processed (RMS, tilt) tiap 1 detik |
| `bridge/{node_id}/raw` | Node → Broker | Payload raw window berkala (untuk FFT) |
| `bridge/{node_id}/config` | Broker → Node | Perintah ubah sampling rate |
| `bridge/{node_id}/status` | Node → Broker | Status koneksi/heartbeat node |

## 6. Fitur MVP

| Fitur | Prioritas | Deskripsi |
|---|---|---|
| Real-time monitoring | Must Have | Dashboard menampilkan RMS getaran & tilt terkini dari kedua node |
| Data logging ke SD card | Must Have | Backup otomatis saat MQTT terputus + arsip permanen semua data (processed & raw) |
| Alert anomali (terpisah per parameter) | Must Have | Alert getaran & alert tilt masing-masing punya status sendiri; threshold dikonfigurasi manual, berlaku global untuk semua node |
| Dashboard historis | Must Have | Grafik/tabel data historis per node, dapat difilter berdasarkan rentang waktu |
| Perbandingan antar node | Must Have | Grafik getaran & tilt node 1 vs node 2 ditampilkan berdampingan |
| Analisis FFT (backend) | Must Have | Backend menghitung dominant frequency dari raw_window; dashboard menampilkan angka + tren dari waktu ke waktu |
| Konfigurasi sampling rate remote | Should Have | User dapat mengubah sampling rate node dari dashboard/mini PC |
| Export alert log | Should Have | Alert log dapat diunduh (CSV) |

## 7. Kebutuhan Fungsional

1. Sistem harus dapat menerima data dari minimal 2 node secara simultan
2. Node melakukan sampling accel/gyro/mag pada 200Hz
3. Node menghitung RMS getaran & tilt (pitch/roll + delta dari baseline) setiap 1 detik dan mempublikasikannya
4. Node mengirim batch raw window (256 sampel) secara berkala untuk dianalisis FFT di backend
5. Backend menghitung dominant frequency dari raw window data yang diterima
6. Sistem harus menyimpan setiap data masuk (processed & raw) beserta timestamp dari RTC
7. Sistem harus mendeteksi ketika node terputus dari MQTT dan menandainya di dashboard
8. Node harus menyimpan seluruh data (processed & raw) ke SD card secara lokal setiap saat, terlepas dari status koneksi MQTT
9. Saat koneksi MQTT kembali normal, data yang tersimpan di SD card selama offline harus dapat disinkronkan ke sistem pusat
10. User harus dapat mengatur nilai threshold alert (getaran & tilt) melalui dashboard — berlaku global untuk semua node
11. User harus dapat mengubah sampling rate node melalui dashboard/mini PC
12. Sistem harus menampilkan status alert getaran dan tilt secara terpisah dan jelas di dashboard
13. Dashboard harus menyediakan tampilan perbandingan data antar node
14. Alert log harus dapat diekspor/diunduh dalam format CSV

## 8. Kebutuhan Non-Fungsional

- **Reliabilitas:** Tidak boleh ada data hilang meski terjadi gangguan koneksi (dijamin oleh backup SD card + sinkronisasi)
- **Latency:** Data real-time harus tampil di dashboard dalam <2 detik dari saat node publish
- **Real-time performance node:** Loop pembacaan sensor pada 200Hz, kalkulasi RMS/tilt, penulisan SD card, dan publish MQTT harus berjalan stabil tanpa drop sampel signifikan
- **Portabilitas:** Seluruh stack (broker, backend, frontend) harus dapat dipindahkan dari laptop ke mini PC hanya dengan `git clone`/`git pull`, tanpa perubahan kode signifikan
- **Skalabilitas:** Arsitektur topic MQTT harus mendukung penambahan node di masa depan tanpa restrukturisasi besar

## 9. Dashboard — Struktur Tampilan

**A. Overview**
- Status node (online/offline, last update timestamp)
- Nilai real-time RMS getaran & tilt per node
- Indikator alert terpisah (getaran/tilt) per node

**B. Perbandingan Node**
- Grafik RMS getaran node 1 vs node 2 (real-time & historis)
- Grafik tilt node 1 vs node 2

**C. Detail per Node**
- Grafik real-time RMS getaran
- Grafik real-time tilt (absolute + delta dari baseline)
- Dominant frequency (angka + tren dari waktu ke waktu)
- Grafik historis RMS & tilt

**D. Konfigurasi**
- Threshold alert (global — getaran & tilt masing-masing satu nilai untuk semua node)
- Sampling rate per node (remote config, default 200Hz)
- Status sinkronisasi SD card

**E. Alert Log**
- Tabel (timestamp, node, jenis alert, nilai saat itu)
- Fitur export/download (CSV)

**Catatan:** Raw sensor value (accel/gyro/mag mentah) tidak ditampilkan di dashboard utama. Panel debug terpisah untuk raw value masih dalam pembahasan (belum diputuskan prioritasnya).

## 10. Rencana Deployment (Fase)

| Fase | Lingkungan | Status |
|---|---|---|
| Fase 1 | MQTT Broker + Backend + Frontend di **laptop**, node fisik belum aktif (pakai mock data publisher) | Sedang berjalan |
| Fase 2 | Node fisik aktif, tetap terhubung ke broker di laptop untuk validasi end-to-end | Belum dimulai |
| Fase 3 | Migrasi penuh seluruh stack ke **mini PC** via git clone/pull, laptop dilepas total | Belum dimulai |

## 11. Open Questions / Perlu Diputuskan Selanjutnya

- Granularitas data historis di dashboard (raw semua vs agregasi per menit/jam vs raw disimpan + query teragregasi)
- Perlu tidaknya panel debug raw sensor value (accel/gyro/mag mentah) — ditunda pembahasannya
- Nilai default threshold awal untuk getaran & tilt (sebelum user melakukan kalibrasi manual)
- Interval pengiriman raw_window (contoh: tiap 10 detik? 30 detik?) — perlu dipastikan tidak membebani bandwidth MQTT maupun proses backend
- Mekanisme sinkronisasi data SD card → database pusat saat node kembali online (protokol/format sync, penanganan duplikasi data)

## 12. Metrik Keberhasilan

- Dashboard dapat menampilkan data real-time dari mock publisher/node fisik dengan latency <2 detik
- Node mampu sampling stabil di 200Hz tanpa drop signifikan
- Tidak ada kehilangan data saat simulasi disconnect/reconnect MQTT
- Alert muncul secara akurat sesuai threshold yang dikonfigurasi, terpisah antara getaran & tilt
- FFT backend berhasil menghasilkan dominant frequency yang konsisten dari raw window data
- Sistem berhasil dipindahkan ke mini PC hanya dengan git clone/pull tanpa modifikasi kode

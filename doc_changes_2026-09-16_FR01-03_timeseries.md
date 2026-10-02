# Dokumen Perubahan — 16 September 2026 · Time-series FR-01/02/03

## Ringkasan

Implementasi **sisi logger (backend)** untuk kebutuhan P0 time-series
[`PRD_TARGET_1.md`](PRD_TARGET_1.md) FR-01 (akuisisi & penyimpanan percepatan penuh),
FR-02 (waktu, jitter, sinkronisasi), dan FR-03 (kelengkapan, packet loss, replay).

Sebelumnya logger hanya menyimpan agregat per detik (RMS/tilt) dan 1 angka frekuensi
dominan per raw window. Perubahan ini menambah jalur **batch mentah** (ax/ay/az semua
sampel, berurutan, dengan identitas boot + sequence) lengkap dengan validasi,
deduplikasi, deteksi gap, ACK aplikasi, serta tabel metadata kualitas akuisisi.

> Status: **logger (backend) selesai.** Node (firmware) belum mempublikasikan batch —
> lihat §6 "Status & gap".

---

## 1. Kontrak data baru — batch time-series

Topik MQTT: `bridge/<node_id>/batch`

```jsonc
{
  "schema_version": 1,
  "node_id": "node_01",
  "boot_id": 3,               // identitas boot, naik tiap restart
  "packet_seq": 42,           // nomor batch monotonik per (node, boot)
  "first_sample_seq": 8400,   // sequence sampel pertama batch ini
  "sample_count": 200,
  "t0_us": 1789588281673000,  // epoch µs (monotonic) sampel pertama
  "dt_us": 5000,              // number (konstan) ATAU array per sampel
  "sampling_rate_hz": 200,
  "ax": [ ... ], "ay": [ ... ], "az": [ ... ],  // percepatan (g)
  "is_replay": false          // true bila ini kiriman ulang dari SD
}
```

Kunci deduplikasi: `(node_id, boot_id, packet_seq)`.

ACK balasan ke node: topik `bridge/<node_id>/ack`

```jsonc
{ "boot_id": 3, "packet_seq": 42, "status": "ok" }
```

---

## 2. Perubahan file

### `src/types.ts`
- Tipe baru: `RawBatch` (payload), `RawBatchRow` (baris DB), `AcquisitionEvent`,
  `NodeBoot`, `QualitySummary`.

### `src/ingest.ts` (BARU)
- `validateBatch(b)` — validasi runtime: node_id, boot_id/packet_seq finite,
  sample_count ≥ 1, ax/ay/az array numerik, panjang ketiga sumbu == sample_count,
  t0_us finite. Kembalikan string alasan bila invalid, `null` bila lolos.
- `perSampleTimes(t0_us, dt_us, count, rate)` — rekonstruksi waktu tiap sampel (µs):
  `dt_us` array → kumulatif; number → konstan; kosong → nominal `1e6/rate`.
- `flattenRawBatch(row)` — ubah baris DB jadi array `{seq, t_us, ax, ay, az}`.
- Fungsi murni tanpa I/O (mudah diuji).

### `src/mqtt.ts`
- Subscribe `bridge/<id>/batch`.
- `handleRawBatch(raw)`:
  1. `validateBatch` → invalid → catat `acquisition_events('invalid')`, return.
  2. `registerBoot(node_id, boot_id)`.
  3. `saveRawBatch(...)` → `INSERT OR IGNORE`; `changes == 0` → duplikat,
     catat `acquisition_events('duplicate')`.
  4. Deteksi gap: `packet_seq > prev + 1` (dalam boot sama, bukan replay) →
     catat `acquisition_events('gap')` + log missing count.
  5. `ackBatch(...)` — ACK idempoten (dikirim untuk batch baru maupun duplikat).
- `lastPacketSeq` per `(node, boot)` untuk pelacakan urutan (FR-03).

### `src/db.ts`
- Tabel baru:
  - `raw_batches` — `UNIQUE(node_id, boot_id, packet_seq)`; ax/ay/az disimpan
    JSON text; `first_sample_seq`, `sample_count`, `t0_us`, `dt_us`,
    `sampling_rate_hz`, `is_replay`, `received_utc`.
  - `node_boots` — `UNIQUE(node_id, boot_id)`, `started_at`.
  - `acquisition_events` — `type ∈ {duplicate, gap, invalid, boot}` + `detail`.
- Fungsi baru: `saveRawBatch` (→ boolean baru/duplikat), `registerBoot`,
  `logAcquisitionEvent`, `getRawBatches`, `getRawBatchesByRange`,
  `getAcquisitionEvents`, `getNodeBoots`, `getQualitySummary`.

### `src/api.ts`
- `GET /api/batches/:nodeId` — daftar batch mentah (FR-01).
- `GET /api/samples/:nodeId` — sampel ter-flatten `{seq, t_us, ax, ay, az}`,
  resolusi penuh, opsional rentang `start`/`end` (t0_us).
- `GET /api/quality/:nodeId` — ringkasan kualitas akuisisi (FR-03).
- `GET /api/events/:nodeId` — log event akuisisi (duplikat/gap/invalid).
- `GET /api/boots/:nodeId` — daftar boot.

### Frontend
- `public/home.html` — mini-stat `SAMPLES` (total sampel time-series, FR-01).
- `public/assets/js/home.js` — `refreshQuality()` polling `/api/quality` tiap 5 dtk;
  tampil total sampel + tooltip duplikat/gap (FR-03).

---

## 3. Alur data batch

```
Node → bridge/<id>/batch → validate → registerBoot
      → saveRawBatch (INSERT OR IGNORE, dedup)
      → deteksi gap (lastPacketSeq)
      → ackBatch → bridge/<id>/ack
```

Invalid/duplikat/gap tidak menggagalkan pipeline; tercatat di `acquisition_events`
sebagai indikator kualitas, sesuai FR-03 ("kelengkapan dilaporkan, bukan ditutupi").

---

## 4. Ringkasan kualitas (getQualitySummary)

| Field | Sumber |
|---|---|
| `total_batches` / `total_samples` | SUM/COUNT `raw_batches` |
| `duplicates` | `acquisition_events.type='duplicate'` |
| `gaps` | `acquisition_events.type='gap'` |
| `invalid` | `acquisition_events.type='invalid'` |
| `last_boot_id` / `last_packet_seq` | batch terakhir |

---

## 5. Status verifikasi

- Backend: `npm run build` (`tsc`) **lolos**.
- Uji manual: 1 batch uji tersimpan di `raw_batches` (dari publish MQTT manual).

---

## 6. Status & gap (belum selesai)

- **Node (firmware) belum mempublikasikan `/batch`.** Jalur publish batch penuh
  (ax/ay/az semua sampel + boot_id + packet_seq + t0_us) belum ada di firmware;
  saat ini firmware masih mengirim snapshot `/data` (1 dtk) dan `/raw` (256 sampel Z).
  Backend sudah siap menerima begitu firmware mengirim.
- **Frontend** baru menampilkan ringkasan kualitas (FR-03); belum ada UI untuk
  `/api/batches`, `/api/samples`, `/api/events`, `/api/boots`.
- **FR-02 (latensi/jitter)** belum terukur end-to-end karena belum ada data batch
  nyata dari node; `t_send_us`/`t_commit_utc` dan `clock_mapping` belum diimplementasi.
- Belum ada `test_sessions`/`clock_mappings` (FR-06/FR-02) — keluar dari lingkup
  perubahan ini.

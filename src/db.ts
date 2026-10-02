import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import config from './config';
import type { SensorReading, FftResult, Alert, NodeConfig, RawWindowRow, FddResult, CalibrationInfo, RawBatchRow, AcquisitionEvent, NodeBoot, QualitySummary, TestSession } from './types';

const db: DatabaseType = new Database(config.db_path);
db.pragma('journal_mode = WAL');

// Auto-migrate
db.exec(`
  CREATE TABLE IF NOT EXISTS readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    rms REAL, pitch REAL, roll REAL,
    pitch_delta REAL, roll_delta REAL,
    pitch_baseline REAL DEFAULT 0, roll_baseline REAL DEFAULT 0,
    mag_x REAL, mag_y REAL, mag_z REAL,
    accel_x REAL, accel_y REAL, accel_z REAL,
    accel_x_cal REAL, accel_y_cal REAL, accel_z_cal REAL,
    calibration_id INTEGER,
    received_utc TEXT,
    connection_status TEXT DEFAULT 'online'
  );
  CREATE TABLE IF NOT EXISTS fft_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    dominant_freq REAL,
    window_size INTEGER,
    sampling_rate INTEGER,
    received_utc TEXT
  );
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    type TEXT NOT NULL,
    value REAL,
    threshold REAL,
    received_utc TEXT
  );
  CREATE TABLE IF NOT EXISTS thresholds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    param TEXT UNIQUE NOT NULL,
    value REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS node_config (
    node_id TEXT PRIMARY KEY,
    sampling_rate INTEGER DEFAULT 200,
    publish_interval INTEGER DEFAULT 500,
    raw_window_interval INTEGER DEFAULT 15000,
    sensitivity_gain INTEGER DEFAULT 1,
    applied_sampling_rate INTEGER DEFAULT 200,
    applied_publish_interval INTEGER DEFAULT 500,
    applied_raw_window_interval INTEGER DEFAULT 15000,
    applied_sensitivity_gain INTEGER DEFAULT 1,
    status_sampling_rate TEXT DEFAULT 'applied',
    status_publish_interval TEXT DEFAULT 'applied',
    status_raw_window_interval TEXT DEFAULT 'applied',
    status_sensitivity_gain TEXT DEFAULT 'applied',
    last_ack_at TEXT
  );
  INSERT OR IGNORE INTO thresholds (param, value) VALUES ('vibration', 0.5);
  INSERT OR IGNORE INTO thresholds (param, value) VALUES ('tilt', 2.0);
  CREATE TABLE IF NOT EXISTS export_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    start_time TEXT NOT NULL,
    end_time TEXT NOT NULL,
    filename TEXT NOT NULL,
    created_at TEXT DEFAULT (datetime('now'))
  );
  CREATE TABLE IF NOT EXISTS calibrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    version INTEGER NOT NULL,
    accel_offset_x REAL DEFAULT 0, accel_offset_y REAL DEFAULT 0, accel_offset_z REAL DEFAULT 0,
    accel_scale_x REAL DEFAULT 1, accel_scale_y REAL DEFAULT 1, accel_scale_z REAL DEFAULT 1,
    created_at TEXT DEFAULT (datetime('now')),
    UNIQUE(node_id, version)
  );
  CREATE TABLE IF NOT EXISTS raw_windows (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    window_start_ms INTEGER NOT NULL,
    window_end_ms INTEGER NOT NULL,
    window_size INTEGER,
    sampling_rate_hz INTEGER,
    raw_accel TEXT NOT NULL,
    received_utc TEXT
  );
  CREATE TABLE IF NOT EXISTS fdd_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id_a TEXT NOT NULL,
    node_id_b TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    window_start_ms INTEGER,
    dominant_freq REAL,
    peaks_json TEXT,
    spectrum_json TEXT,
    num_peaks INTEGER,
    window_size INTEGER,
    sampling_rate INTEGER,
    received_utc TEXT
  );
  CREATE TABLE IF NOT EXISTS raw_batches (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    boot_id INTEGER NOT NULL,
    packet_seq INTEGER NOT NULL,
    first_sample_seq INTEGER,
    sample_count INTEGER NOT NULL,
    t0_us INTEGER,
    dt_us REAL,
    sampling_rate_hz INTEGER,
    ax TEXT NOT NULL,
    ay TEXT NOT NULL,
    az TEXT NOT NULL,
    is_replay INTEGER DEFAULT 0,
    received_utc TEXT,
    UNIQUE(node_id, boot_id, packet_seq)
  );
  CREATE TABLE IF NOT EXISTS node_boots (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    boot_id INTEGER NOT NULL,
    started_at TEXT DEFAULT (datetime('now')),
    UNIQUE(node_id, boot_id)
  );
  CREATE TABLE IF NOT EXISTS acquisition_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    type TEXT NOT NULL,
    detail TEXT
  );
  CREATE TABLE IF NOT EXISTS test_sessions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_name TEXT,
    start_time TEXT NOT NULL,
    end_time TEXT,
    status TEXT NOT NULL DEFAULT 'active',
    notes TEXT,
    created_at TEXT DEFAULT (datetime('now'))
  );
`);

// Auto-migrate: tambah kolom baru kalau tabel readings sudah ada lebih dulu
// (backward-compatible, data lama tetap terbaca; kolom baru nullable).
const readingCols = db.prepare('PRAGMA table_info(readings)').all().map((c: any) => c.name);
const readingNewCols: Record<string, string> = {
  accel_x: 'REAL',
  accel_y: 'REAL',
  accel_z: 'REAL',
  accel_x_cal: 'REAL',
  accel_y_cal: 'REAL',
  accel_z_cal: 'REAL',
  calibration_id: 'INTEGER',
  received_utc: 'TEXT',
};
for (const [name, type] of Object.entries(readingNewCols)) {
  if (!readingCols.includes(name)) db.exec(`ALTER TABLE readings ADD COLUMN ${name} ${type}`);
}

const migrateTables: [string, string][] = [
  ['fft_results', 'received_utc TEXT'],
  ['raw_windows', 'received_utc TEXT'],
  ['fdd_results', 'received_utc TEXT'],
  ['fdd_results', 'spectrum_json TEXT'],
  ['alerts', 'received_utc TEXT'],
];
for (const [tbl, colDef] of migrateTables) {
  const cols = db.prepare(`PRAGMA table_info(${tbl})`).all().map((c: any) => c.name);
  const colName = colDef.split(' ')[0];
  if (!cols.includes(colName)) db.exec(`ALTER TABLE ${tbl} ADD COLUMN ${colDef}`);
}

const insertReading = db.prepare(`INSERT INTO readings 
  (node_id, timestamp, rms, pitch, roll, pitch_delta, roll_delta, mag_x, mag_y, mag_z,
   accel_x, accel_y, accel_z, accel_x_cal, accel_y_cal, accel_z_cal, calibration_id, received_utc, connection_status)
  VALUES (@node_id, @timestamp, @rms, @pitch, @roll, @pitch_delta, @roll_delta, @mag_x, @mag_y, @mag_z,
   @accel_x, @accel_y, @accel_z, @accel_x_cal, @accel_y_cal, @accel_z_cal, @calibration_id, @received_utc, @connection_status)`);

const insertFft = db.prepare(`INSERT INTO fft_results 
  (node_id, timestamp, dominant_freq, window_size, sampling_rate, received_utc)
  VALUES (@node_id, @timestamp, @dominant_freq, @window_size, @sampling_rate, @received_utc)`);

const insertAlert = db.prepare(`INSERT INTO alerts 
  (node_id, timestamp, type, value, threshold, received_utc)
  VALUES (@node_id, @timestamp, @type, @value, @threshold, @received_utc)`);

const insertRawWindow = db.prepare(`INSERT INTO raw_windows
  (node_id, timestamp, window_start_ms, window_end_ms, window_size, sampling_rate_hz, raw_accel, received_utc)
  VALUES (@node_id, @timestamp, @window_start_ms, @window_end_ms, @window_size, @sampling_rate_hz, @raw_accel, @received_utc)`);

const insertFdd = db.prepare(`INSERT INTO fdd_results
  (node_id_a, node_id_b, timestamp, window_start_ms, dominant_freq, peaks_json, spectrum_json, num_peaks, window_size, sampling_rate, received_utc)
  VALUES (@node_id_a, @node_id_b, @timestamp, @window_start_ms, @dominant_freq, @peaks_json, @spectrum_json, @num_peaks, @window_size, @sampling_rate, @received_utc)`);

export function saveReading(data: SensorReading) {
  return insertReading.run({
    node_id: data.node_id, timestamp: data.timestamp,
    rms: data.rms, pitch: data.pitch, roll: data.roll,
    pitch_delta: data.pitch_delta, roll_delta: data.roll_delta,
    mag_x: data.mag_x, mag_y: data.mag_y, mag_z: data.mag_z,
    accel_x: data.accel_x ?? null, accel_y: data.accel_y ?? null, accel_z: data.accel_z ?? null,
    accel_x_cal: data.accel_x_cal ?? null, accel_y_cal: data.accel_y_cal ?? null, accel_z_cal: data.accel_z_cal ?? null,
    calibration_id: data.calibration_id ?? null,
    received_utc: data.received_utc ?? new Date().toISOString(),
    connection_status: data.connection_status,
  });
}

export function saveFft(data: FftResult) {
  return insertFft.run({ ...data, received_utc: data.received_utc ?? new Date().toISOString() });
}

export function saveAlert(data: Alert) {
  return insertAlert.run({ ...data, received_utc: data.received_utc ?? new Date().toISOString() });
}

export function upsertCalibration(nodeId: string, cal: CalibrationInfo): number {
  const off = cal.accel_offset ?? [0, 0, 0];
  const scl = cal.accel_scale ?? [1, 1, 1];
  db.prepare(`INSERT OR REPLACE INTO calibrations
    (node_id, version, accel_offset_x, accel_offset_y, accel_offset_z, accel_scale_x, accel_scale_y, accel_scale_z)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)`)
    .run(nodeId, cal.version, off[0] ?? 0, off[1] ?? 0, off[2] ?? 0, scl[0] ?? 1, scl[1] ?? 1, scl[2] ?? 1);
  const row = db.prepare('SELECT id FROM calibrations WHERE node_id = ? AND version = ?').get(nodeId, cal.version) as { id: number } | undefined;
  return row?.id ?? 0;
}

export function saveRawWindow(row: RawWindowRow) {
  return insertRawWindow.run({ ...row, received_utc: row.received_utc ?? new Date().toISOString() });
}

// Cari window terdekat dari node lain dalam rentang start_ms +- tolerance.
export function getMatchingRawWindow(nodeId: string, startMs: number, toleranceMs: number): RawWindowRow | undefined {
  return db.prepare(
    'SELECT * FROM raw_windows WHERE node_id = ? AND window_start_ms BETWEEN ? AND ? ORDER BY ABS(window_start_ms - ?) ASC LIMIT 1'
  ).get(nodeId, startMs - toleranceMs, startMs + toleranceMs, startMs) as RawWindowRow | undefined;
}

let latestFddResult: FddResult | null = null;

export function setLatestFdd(data: FddResult) {
  latestFddResult = data;
}

export function saveFdd(data: FddResult) {
  latestFddResult = data;
  return insertFdd.run({
    ...data,
    spectrum_json: data.spectrum_json ?? null,
    received_utc: data.received_utc ?? new Date().toISOString()
  });
}

export function getFdd(limit = 50) {
  const rows = db.prepare('SELECT * FROM fdd_results ORDER BY timestamp DESC LIMIT ?').all(limit) as FddResult[];
  if (rows.length === 0 && latestFddResult) {
    return [latestFddResult];
  }
  return rows;
}

const insertRawBatch = db.prepare(`INSERT OR IGNORE INTO raw_batches
  (node_id, boot_id, packet_seq, first_sample_seq, sample_count, t0_us, dt_us, sampling_rate_hz, ax, ay, az, is_replay, received_utc)
  VALUES (@node_id, @boot_id, @packet_seq, @first_sample_seq, @sample_count, @t0_us, @dt_us, @sampling_rate_hz, @ax, @ay, @az, @is_replay, @received_utc)`);

// Kembalikan true bila baris baru masuk; false bila duplikat (dibuang OR IGNORE).
export function saveRawBatch(data: RawBatchRow): boolean {
  const info = insertRawBatch.run(data);
  return info.changes > 0;
}

export function registerBoot(nodeId: string, bootId: number) {
  db.prepare('INSERT OR IGNORE INTO node_boots (node_id, boot_id) VALUES (?, ?)').run(nodeId, bootId);
}

export function logAcquisitionEvent(nodeId: string, type: AcquisitionEvent['type'], detail: string) {
  db.prepare('INSERT INTO acquisition_events (node_id, timestamp, type, detail) VALUES (?, ?, ?, ?)')
    .run(nodeId, new Date().toISOString(), type, detail);
}

export function getRawBatches(nodeId: string, limit = 100) {
  return db.prepare('SELECT * FROM raw_batches WHERE node_id = ? ORDER BY boot_id DESC, packet_seq DESC LIMIT ?').all(nodeId, limit) as RawBatchRow[];
}

export function getRawBatchesByRange(nodeId: string, startUs: number, endUs: number) {
  return db.prepare('SELECT * FROM raw_batches WHERE node_id = ? AND t0_us >= ? AND t0_us <= ? ORDER BY t0_us ASC').all(nodeId, startUs, endUs) as RawBatchRow[];
}

export function getAcquisitionEvents(nodeId: string, limit = 100) {
  return db.prepare('SELECT * FROM acquisition_events WHERE node_id = ? ORDER BY id DESC LIMIT ?').all(nodeId, limit) as AcquisitionEvent[];
}

export function getNodeBoots(nodeId: string) {
  return db.prepare('SELECT * FROM node_boots WHERE node_id = ? ORDER BY boot_id DESC').all(nodeId) as NodeBoot[];
}

export function getQualitySummary(nodeId: string): QualitySummary {
  const b = db.prepare('SELECT COUNT(*) c, COALESCE(SUM(sample_count),0) s FROM raw_batches WHERE node_id = ?').get(nodeId) as { c: number; s: number };
  const dup = db.prepare("SELECT COUNT(*) c FROM acquisition_events WHERE node_id = ? AND type = 'duplicate'").get(nodeId) as { c: number };
  const gap = db.prepare("SELECT COUNT(*) c FROM acquisition_events WHERE node_id = ? AND type = 'gap'").get(nodeId) as { c: number };
  const inv = db.prepare("SELECT COUNT(*) c FROM acquisition_events WHERE node_id = ? AND type = 'invalid'").get(nodeId) as { c: number };
  const last = db.prepare('SELECT boot_id, packet_seq FROM raw_batches WHERE node_id = ? ORDER BY id DESC LIMIT 1').get(nodeId) as { boot_id: number; packet_seq: number } | undefined;
  return {
    node_id: nodeId,
    total_batches: b.c,
    total_samples: b.s,
    duplicates: dup.c,
    gaps: gap.c,
    invalid: inv.c,
    last_boot_id: last?.boot_id ?? null,
    last_packet_seq: last?.packet_seq ?? null,
  };
}

export function getReadings(nodeId: string, limit = 500) {
  return db.prepare('SELECT * FROM readings WHERE node_id = ? ORDER BY timestamp DESC LIMIT ?').all(nodeId, limit) as SensorReading[];
}

const latestFftMemory: Record<string, FftResult> = {};

export function setLatestFft(nodeId: string, result: FftResult) {
  latestFftMemory[nodeId] = result;
}

export function getFft(nodeId: string, limit = 5) {
  const rows = db.prepare('SELECT * FROM fft_results WHERE node_id = ? ORDER BY timestamp DESC LIMIT ?').all(nodeId, limit) as FftResult[];
  if (rows.length === 0 && latestFftMemory[nodeId]) {
    return [latestFftMemory[nodeId]];
  }
  return rows;
}

export function getThreshold(param: string): number {
  const row = db.prepare('SELECT value FROM thresholds WHERE param = ?').get(param) as { value: number } | undefined;
  return row?.value ?? 0;
}

export function setThreshold(param: string, value: number) {
  db.prepare('UPDATE thresholds SET value = ? WHERE param = ?').run(value, param);
}

export function getAlerts(limit = 200) {
  return db.prepare('SELECT * FROM alerts ORDER BY timestamp DESC LIMIT ?').all(limit) as Alert[];
}

// Auto-migrate: tambah kolom baru kalau tabel node_config sudah ada lebih dulu
const nodeCols = db.prepare('PRAGMA table_info(node_config)').all().map((c: any) => c.name);
const nodeNewCols: Record<string, string> = {
  publish_interval: 'INTEGER DEFAULT 500',
  raw_window_interval: 'INTEGER DEFAULT 15000',
  sensitivity_gain: 'INTEGER DEFAULT 1',
  applied_sampling_rate: 'INTEGER DEFAULT 200',
  applied_publish_interval: 'INTEGER DEFAULT 500',
  applied_raw_window_interval: 'INTEGER DEFAULT 15000',
  applied_sensitivity_gain: 'INTEGER DEFAULT 1',
  status_sampling_rate: "TEXT DEFAULT 'applied'",
  status_publish_interval: "TEXT DEFAULT 'applied'",
  status_raw_window_interval: "TEXT DEFAULT 'applied'",
  status_sensitivity_gain: "TEXT DEFAULT 'applied'",
  last_ack_at: 'TEXT',
};
for (const [name, def] of Object.entries(nodeNewCols)) {
  if (!nodeCols.includes(name)) db.exec(`ALTER TABLE node_config ADD COLUMN ${name} ${def}`);
}

export function getNodeConfig(nodeId: string): NodeConfig | undefined {
  return db.prepare('SELECT * FROM node_config WHERE node_id = ?').get(nodeId) as NodeConfig | undefined;
}

export function setNodeConfig(nodeId: string, cfg: Partial<NodeConfig>) {
  const cur = getNodeConfig(nodeId) || {
    node_id: nodeId, sampling_rate: 200,
    publish_interval: 500, raw_window_interval: 15000, sensitivity_gain: 1,
    applied_sampling_rate: 200, applied_publish_interval: 500,
    applied_raw_window_interval: 15000, applied_sensitivity_gain: 1,
    status_sampling_rate: 'applied', status_publish_interval: 'applied',
    status_raw_window_interval: 'applied', status_sensitivity_gain: 'applied',
    last_ack_at: null,
  };
  const merged = { ...cur, ...cfg, node_id: nodeId };
  db.prepare(`INSERT OR REPLACE INTO node_config
    (node_id, sampling_rate, publish_interval, raw_window_interval, sensitivity_gain,
     applied_sampling_rate, applied_publish_interval, applied_raw_window_interval, applied_sensitivity_gain,
     status_sampling_rate, status_publish_interval, status_raw_window_interval, status_sensitivity_gain,
     last_ack_at)
    VALUES (@node_id, @sampling_rate, @publish_interval, @raw_window_interval, @sensitivity_gain,
     @applied_sampling_rate, @applied_publish_interval, @applied_raw_window_interval, @applied_sensitivity_gain,
     @status_sampling_rate, @status_publish_interval, @status_raw_window_interval, @status_sensitivity_gain,
     @last_ack_at)`).run(merged);
}

export function updateConfigAck(nodeId: string, param: string, requested: number, applied: number, status: string) {
  const allowedParams = ['sampling_rate', 'publish_interval', 'raw_window_interval', 'sensitivity_gain'];
  const now = new Date().toISOString();

  // Pastikan row node_config ada
  if (!getNodeConfig(nodeId)) {
    setNodeConfig(nodeId, { node_id: nodeId });
  }

  try {
    if (allowedParams.includes(param)) {
      const colApplied = `applied_${param}`;
      const colStatus = `status_${param}`;
      db.prepare(`UPDATE node_config SET ${colApplied} = ?, ${colStatus} = ?, last_ack_at = ? WHERE node_id = ?`)
        .run(applied, status, now, nodeId);
    } else {
      db.prepare(`UPDATE node_config SET last_ack_at = ? WHERE node_id = ?`).run(now, nodeId);
    }
  } catch (err) {
    console.error(`[DB] Error updating config_ack for ${nodeId} ${param}:`, err);
  }
}

export function getReadingsByRange(nodeId: string, start: string, end: string) {
  return db.prepare('SELECT * FROM readings WHERE node_id = ? AND timestamp >= ? AND timestamp <= ? ORDER BY timestamp ASC').all(nodeId, start, end) as SensorReading[];
}

export function getReadingsByUtcRange(nodeId: string, startUtc: string, endUtc: string) {
  return db.prepare(`SELECT * FROM readings 
    WHERE node_id = ? 
      AND (
        (received_utc IS NOT NULL AND received_utc >= ? AND received_utc <= ?)
        OR (received_utc IS NULL AND timestamp >= ? AND timestamp <= ?)
      )
    ORDER BY COALESCE(received_utc, timestamp) ASC`).all(nodeId, startUtc, endUtc, startUtc, endUtc) as SensorReading[];
}

let currentActiveSession: TestSession | null = null;
try {
  currentActiveSession = (db.prepare("SELECT * FROM test_sessions WHERE status = 'active' ORDER BY id DESC LIMIT 1").get() as TestSession) ?? null;
} catch (_) {}

export function getActiveSession(): TestSession | null {
  return currentActiveSession;
}

export function isSessionActive(): boolean {
  return currentActiveSession !== null;
}

export function startSession(name?: string, notes?: string): TestSession {
  // Tutup sesi aktif sebelumnya jika ada yang belum ditutup
  const now = new Date().toISOString();
  db.prepare("UPDATE test_sessions SET status = 'completed', end_time = ? WHERE status = 'active'").run(now);

  const sessionName = name || `Session ${new Date().toLocaleDateString('id-ID')} ${new Date().toLocaleTimeString('id-ID')}`;
  const info = db.prepare(`INSERT INTO test_sessions (session_name, start_time, status, notes) VALUES (?, ?, 'active', ?)`).run(sessionName, now, notes ?? null);
  currentActiveSession = {
    id: Number(info.lastInsertRowid),
    session_name: sessionName,
    start_time: now,
    status: 'active',
    notes: notes ?? null,
  };
  return currentActiveSession;
}

export function stopSession(id?: number): TestSession | null {
  const now = new Date().toISOString();
  const targetId = id ?? currentActiveSession?.id;
  if (!targetId) return null;

  db.prepare("UPDATE test_sessions SET status = 'completed', end_time = ? WHERE id = ?").run(now, targetId);
  const session = (db.prepare("SELECT * FROM test_sessions WHERE id = ?").get(targetId) as TestSession) ?? null;
  currentActiveSession = null;
  return session;
}

export function saveExport(nodeId: string, start: string, end: string, filename: string) {
  db.prepare('INSERT INTO export_history (node_id, start_time, end_time, filename) VALUES (?, ?, ?, ?)').run(nodeId, start, end, filename);
}

export function getExports(limit = 50) {
  return db.prepare('SELECT * FROM export_history ORDER BY created_at DESC LIMIT ?').all(limit);
}

// Hapus data lebih tua dari retention_days hari (batasi ukuran DB).
// Semua kolom timestamp disimpan UTC ISO ("...Z"); raw_batches pakai received_utc.
// Data lama (tanpa "Z", lokal) tetap ikut terhapus via perbandingan string.
export function pruneOldData(retentionDays: number) {
  if (!(retentionDays > 0)) return 0;
  const cutoff = new Date(Date.now() - retentionDays * 86400000).toISOString();
  const tables: [string, string][] = [
    ['readings', 'received_utc'],
    ['fft_results', 'received_utc'],
    ['alerts', 'received_utc'],
    ['raw_windows', 'received_utc'],
    ['fdd_results', 'received_utc'],
    ['acquisition_events', 'timestamp'],
    ['raw_batches', 'received_utc'],
  ];
  let total = 0;
  for (const [t, col] of tables) {
    const info = db.prepare(`DELETE FROM ${t} WHERE ${col} IS NOT NULL AND ${col} < ?`).run(cutoff);
    total += info.changes;
  }
  if (total > 0) db.pragma('wal_checkpoint(TRUNCATE)');
  return total;
}

export default db;

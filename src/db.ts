import Database from 'better-sqlite3';
import type { Database as DatabaseType } from 'better-sqlite3';
import config from './config';
import type { SensorReading, FftResult, Alert } from './types';

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
    connection_status TEXT DEFAULT 'online'
  );
  CREATE TABLE IF NOT EXISTS fft_results (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    dominant_freq REAL,
    window_size INTEGER,
    sampling_rate INTEGER
  );
  CREATE TABLE IF NOT EXISTS alerts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    node_id TEXT NOT NULL,
    timestamp TEXT NOT NULL,
    type TEXT NOT NULL,
    value REAL,
    threshold REAL
  );
  CREATE TABLE IF NOT EXISTS thresholds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    param TEXT UNIQUE NOT NULL,
    value REAL NOT NULL
  );
  CREATE TABLE IF NOT EXISTS node_config (
    node_id TEXT PRIMARY KEY,
    sampling_rate INTEGER DEFAULT 200
  );
  INSERT OR IGNORE INTO thresholds (param, value) VALUES ('vibration', 0.5);
  INSERT OR IGNORE INTO thresholds (param, value) VALUES ('tilt', 2.0);
`);

const insertReading = db.prepare(`INSERT INTO readings 
  (node_id, timestamp, rms, pitch, roll, pitch_delta, roll_delta, mag_x, mag_y, mag_z, connection_status)
  VALUES (@node_id, @timestamp, @rms, @pitch, @roll, @pitch_delta, @roll_delta, @mag_x, @mag_y, @mag_z, @connection_status)`);

const insertFft = db.prepare(`INSERT INTO fft_results 
  (node_id, timestamp, dominant_freq, window_size, sampling_rate)
  VALUES (@node_id, @timestamp, @dominant_freq, @window_size, @sampling_rate)`);

const insertAlert = db.prepare(`INSERT INTO alerts 
  (node_id, timestamp, type, value, threshold)
  VALUES (@node_id, @timestamp, @type, @value, @threshold)`);

export function saveReading(data: SensorReading) {
  return insertReading.run(data);
}

export function saveFft(data: FftResult) {
  return insertFft.run(data);
}

export function saveAlert(data: Alert) {
  return insertAlert.run(data);
}

export function getReadings(nodeId: string, limit = 500) {
  return db.prepare('SELECT * FROM readings WHERE node_id = ? ORDER BY timestamp DESC LIMIT ?').all(nodeId, limit) as SensorReading[];
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

export function getNodeConfig(nodeId: string) {
  return db.prepare('SELECT * FROM node_config WHERE node_id = ?').get(nodeId) as { node_id: string; sampling_rate: number } | undefined;
}

export function setNodeSamplingRate(nodeId: string, rate: number) {
  db.prepare('INSERT OR REPLACE INTO node_config (node_id, sampling_rate) VALUES (?, ?)').run(nodeId, rate);
}

export default db;

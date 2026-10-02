// --- MQTT Payloads ---
export interface CalibrationInfo {
  version: number;
  accel_offset: number[];
  accel_scale: number[];
}

export interface ProcessedData {
  node_id: string;
  timestamp: string;
  sampling_rate_hz: number;
  vibration: { rms: number };
  tilt: { pitch: number; roll: number; pitch_delta: number; roll_delta: number };
  magnetometer: { mag_x: number; mag_y: number; mag_z: number };
  accelerometer?: { x: number; y: number; z: number };
  accelerometer_calibrated?: { x: number; y: number; z: number };
  gyroscope?: { x: number; y: number; z: number };
  calibration?: CalibrationInfo;
  connection_status: string;
  // Field raw time-series 200Hz (gabungan di payload /data)
  boot_id?: number;
  packet_seq?: number;
  first_sample_seq?: number;
  sample_count?: number;
  t0_us?: number;
  dt_us?: number | number[];
  ax?: number[];
  ay?: number[];
  az?: number[];
  schema_version?: number;
  is_replay?: boolean;
}

export interface RawWindow {
  node_id: string;
  timestamp: string;
  window_size: number;
  sampling_rate_hz: number;
  window_start_ms?: number;
  window_end_ms?: number;
  raw_accel: number[];
}

// Batch time-series penuh (FR-01/02/03) — topic bridge/<id>/batch.
export interface RawBatch {
  schema_version: number;
  node_id: string;
  boot_id: number;
  packet_seq: number;
  first_sample_seq: number;
  sample_count: number;
  t0_us: number;                 // epoch µs sampel pertama (monotonic node)
  dt_us?: number | number[];     // interval antar-sampel; default = 1e6/rate
  sampling_rate_hz: number;
  ax: number[];
  ay: number[];
  az: number[];
  is_replay?: boolean;
}

// --- Database Rows ---
export interface SensorReading {
  id?: number;
  node_id: string;
  timestamp: string;
  rms: number;
  pitch: number;
  roll: number;
  pitch_delta: number;
  roll_delta: number;
  pitch_baseline?: number;
  roll_baseline?: number;
  mag_x: number;
  mag_y: number;
  mag_z: number;
  accel_x?: number | null;
  accel_y?: number | null;
  accel_z?: number | null;
  accel_x_cal?: number | null;
  accel_y_cal?: number | null;
  accel_z_cal?: number | null;
  calibration_id?: number | null;
  received_utc?: string; // waktu terima di backend (NTP laptop), ISO UTC "Z"
  connection_status: string;
}

export interface RawWindowRow {
  id?: number;
  node_id: string;
  timestamp: string;
  window_start_ms: number;
  window_end_ms: number;
  window_size: number;
  sampling_rate_hz: number;
  raw_accel: string; // JSON array
  received_utc?: string;
}

export interface FftResult {
  id?: number;
  node_id: string;
  timestamp: string;
  dominant_freq: number;
  window_size: number;
  sampling_rate: number;
  received_utc?: string;
}

export interface FddResult {
  id?: number;
  node_id_a: string;
  node_id_b: string;
  timestamp: string;
  window_start_ms: number;
  dominant_freq: number;
  peaks_json: string; // JSON array of { freq, eigenvalue }
  spectrum_json?: string; // JSON object of { freqs: number[], eigenvalues: number[] }
  num_peaks: number;
  window_size: number;
  sampling_rate: number;
  received_utc?: string;
}

export interface Alert {
  id?: number;
  node_id: string;
  timestamp: string;
  type: 'vibration' | 'tilt';
  value: number;
  threshold: number;
  received_utc?: string;
}

export interface RawBatchRow {
  id?: number;
  node_id: string;
  boot_id: number;
  packet_seq: number;
  first_sample_seq: number;
  sample_count: number;
  t0_us: number;
  dt_us: number | null;
  sampling_rate_hz: number;
  ax: string;   // JSON array
  ay: string;
  az: string;
  is_replay: number;
  received_utc: string;
}

export interface AcquisitionEvent {
  id?: number;
  node_id: string;
  timestamp: string;
  type: 'duplicate' | 'gap' | 'invalid' | 'boot';
  detail: string;
}

export interface NodeBoot {
  id?: number;
  node_id: string;
  boot_id: number;
  started_at: string;
}

export interface QualitySummary {
  node_id: string;
  total_batches: number;
  total_samples: number;
  duplicates: number;
  gaps: number;
  invalid: number;
  last_boot_id: number | null;
  last_packet_seq: number | null;
}

export interface TestSession {
  id?: number;
  session_name?: string;
  start_time: string;
  end_time?: string | null;
  status: 'active' | 'completed';
  notes?: string | null;
  created_at?: string;
}

// --- Node Config (persisted, dikirim juga ke firmware) ---
export interface NodeConfig {
  node_id: string;
  sampling_rate: number;
  publish_interval: number;
  raw_window_interval: number;
  sensitivity_gain: number;
  applied_sampling_rate?: number;
  applied_publish_interval?: number;
  applied_raw_window_interval?: number;
  applied_sensitivity_gain?: number;
  status_sampling_rate?: 'pending' | 'applied' | 'rejected';
  status_publish_interval?: 'pending' | 'applied' | 'rejected';
  status_raw_window_interval?: 'pending' | 'applied' | 'rejected';
  status_sensitivity_gain?: 'pending' | 'applied' | 'rejected';
  last_ack_at?: string;
}

export interface ConfigAckPayload {
  node_id: string;
  param: string;
  requested: number;
  applied: number;
  status: 'applied' | 'rejected';
  timestamp_ms?: number;
}

// Timing & Jitter Statistics (FR-02)
export interface JitterStats {
  node_id: string;
  sample_count: number;
  nominal_rate_hz: number;
  actual_rate_hz: number;
  nominal_interval_us: number;
  median_delay_ms: number;
  p95_delay_ms: number;
  p99_delay_ms: number;
  max_delay_ms: number;
  min_delay_ms: number;
  status: 'passed' | 'warning' | 'failed';
}

// --- Config ---
export interface AppConfig {
  mqtt_broker: string;
  http_port: number;
  db_path: string;
  node_ids: string[];
  retention_days: number;
}

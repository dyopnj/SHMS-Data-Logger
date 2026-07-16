// --- MQTT Payloads ---
export interface ProcessedData {
  node_id: string;
  timestamp: string;
  sampling_rate_hz: number;
  vibration: { rms: number };
  tilt: { pitch: number; roll: number; pitch_delta: number; roll_delta: number };
  magnetometer: { mag_x: number; mag_y: number; mag_z: number };
  connection_status: string;
}

export interface RawWindow {
  node_id: string;
  timestamp: string;
  window_size: number;
  sampling_rate_hz: number;
  raw_accel: number[];
}

// --- Database Row ---
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
  connection_status: string;
}

export interface FftResult {
  id?: number;
  node_id: string;
  timestamp: string;
  dominant_freq: number;
  window_size: number;
  sampling_rate: number;
}

export interface Alert {
  id?: number;
  node_id: string;
  timestamp: string;
  type: 'vibration' | 'tilt';
  value: number;
  threshold: number;
}

// --- Config ---
export interface AppConfig {
  mqtt_broker: string;
  http_port: number;
  db_path: string;
  node_ids: string[];
}

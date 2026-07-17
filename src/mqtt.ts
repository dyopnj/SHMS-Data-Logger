import mqtt from 'mqtt';
import config from './config';
import { saveReading, saveFft, saveAlert, getThreshold } from './db';
import { dominantFrequency } from './fft';
import type { ProcessedData, RawWindow } from './types';

let client: mqtt.MqttClient;
let onData: ((data: ProcessedData) => void) | null = null;

export function connect(onDataCb: typeof onData) {
  onData = onDataCb;
  client = mqtt.connect(config.mqtt_broker);

  client.on('connect', () => {
    console.log(`[MQTT] Terhubung ke ${config.mqtt_broker}`);
    config.node_ids.forEach(id => {
      client.subscribe(`bridge/${id}/data`);
      client.subscribe(`bridge/${id}/raw`);
      console.log(`[MQTT] Subscribe: bridge/${id}/data, bridge/${id}/raw`);
    });
  });

  client.on('message', (topic, payload) => {
    try {
      const raw = JSON.parse(payload.toString());
      if (topic.endsWith('/data')) handleProcessedData(raw);
      else if (topic.endsWith('/raw')) handleRawWindow(raw);
    } catch (err) {
      console.error(`[MQTT] Parse error dari ${topic}:`, err);
    }
  });

  client.on('error', (err) => console.error('[MQTT] Error:', err));
  client.on('close', () => console.log('[MQTT] Koneksi terputus'));
}

export function publish(topic: string, data: unknown) {
  if (client?.connected) {
    client.publish(topic, JSON.stringify(data));
  }
}

function handleProcessedData(data: ProcessedData) {
  saveReading({
    node_id: data.node_id, timestamp: data.timestamp,
    rms: data.vibration.rms,
    pitch: data.tilt.pitch, roll: data.tilt.roll,
    pitch_delta: data.tilt.pitch_delta, roll_delta: data.tilt.roll_delta,
    pitch_baseline: 0, roll_baseline: 0,
    mag_x: data.magnetometer.mag_x, mag_y: data.magnetometer.mag_y, mag_z: data.magnetometer.mag_z,
    connection_status: data.connection_status,
  });
  onData?.(data);

  // Cek threshold alert
  const vibThreshold = getThreshold('vibration');
  const tiltThreshold = getThreshold('tilt');

  if (data.vibration.rms > vibThreshold) {
    saveAlert({
      node_id: data.node_id, timestamp: data.timestamp,
      type: 'vibration', value: data.vibration.rms, threshold: vibThreshold,
    });
  }
  if (Math.abs(data.tilt.pitch_delta) > tiltThreshold || Math.abs(data.tilt.roll_delta) > tiltThreshold) {
    saveAlert({
      node_id: data.node_id, timestamp: data.timestamp,
      type: 'tilt', value: Math.max(Math.abs(data.tilt.pitch_delta), Math.abs(data.tilt.roll_delta)),
      threshold: tiltThreshold,
    });
  }
}

function handleRawWindow(data: RawWindow) {
  const freq = dominantFrequency(data.raw_accel, data.sampling_rate_hz);
  const result = {
    node_id: data.node_id, timestamp: data.timestamp,
    dominant_freq: freq, window_size: data.window_size, sampling_rate: data.sampling_rate_hz,
  };
  saveFft(result);
}

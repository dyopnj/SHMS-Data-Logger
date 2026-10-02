import mqtt from 'mqtt';
import config from './config';
import { saveReading, saveFft, saveAlert, getThreshold, saveRawWindow, getMatchingRawWindow, saveFdd, upsertCalibration, saveRawBatch, registerBoot, logAcquisitionEvent, isSessionActive, setLatestFft, setLatestFdd, updateConfigAck } from './db';
import { dominantFrequency } from './fft';
import { runFdd } from './fdd';
import { validateBatch } from './ingest';
import type { ProcessedData, RawWindow, RawBatch } from './types';

let client: mqtt.MqttClient;
let onData: ((data: ProcessedData) => void) | null = null;

// Status terakhir tiap node (balasan request_status)
const nodeStatus: Record<string, unknown> = {};

const FDD_WINDOW_TOLERANCE_MS = 50;
const FDD_NUM_PEAKS = 3;

// Track packet_seq terakhir per (node, boot) untuk deteksi gap (FR-03).
const lastPacketSeq: Record<string, number> = {};

export function isConnected() {
  return client?.connected ?? false;
}

export function getNodeStatus(nodeId: string) {
  return nodeStatus[nodeId] || null;
}

function otherNodeId(nodeId: string): string | undefined {
  return config.node_ids.find(id => id !== nodeId);
}

export function connect(onDataCb: typeof onData) {
  onData = onDataCb;
  client = mqtt.connect(config.mqtt_broker);

  client.on('connect', () => {
    console.log(`[MQTT] Terhubung ke ${config.mqtt_broker}`);
    config.node_ids.forEach(id => {
      client.subscribe(`bridge/${id}/data`);
      client.subscribe(`bridge/${id}/raw`);
      client.subscribe(`bridge/${id}/status`);
      client.subscribe(`bridge/${id}/config_ack`);
      console.log(`[MQTT] Subscribe: bridge/${id}/data, /raw, /status, /config_ack`);
    });
  });

  client.on('message', (topic, payload) => {
    try {
      const raw = JSON.parse(payload.toString());
      const node = topic.split('/')[1];
      if (topic.endsWith('/data')) {
        console.log(`[MQTT] ✓ Data dari ${node}: RMS=${raw.vibration?.rms?.toFixed(3) ?? '-'}, pitch=${raw.tilt?.pitch?.toFixed(2) ?? '-'}°${raw.sample_count ? ` (${raw.sample_count} samples 200Hz)` : ''}`);
        handleProcessedData(raw);
        // Jika payload /data juga membawa 200 raw samples ax/ay/az, simpan ke raw_batches
        if (raw.ax && raw.sample_count) {
          handleRawBatch(raw as unknown as RawBatch);
        }
      } else if (topic.endsWith('/raw')) {
        console.log(`[MQTT] ✓ Raw FFT dari ${node}: ${raw.raw_accel?.length ?? 0} sample`);
        handleRawWindow(raw);
      } else if (topic.endsWith('/batch')) {
        handleRawBatch(raw);
      } else if (topic.endsWith('/status')) {
        nodeStatus[node] = raw;
        console.log(`[MQTT] ✓ Status dari ${node}: RSSI=${raw.wifi_rssi}dBm, sd=${raw.sd_ok}, drop=${raw.drop_rate_pct}%`);
      } else if (topic.endsWith('/config_ack')) {
        updateConfigAck(node, raw.param, raw.requested, raw.applied, raw.status);
        console.log(`[CONFIG_ACK] ✓ Node ${node}: ${raw.param} requested=${raw.requested} applied=${raw.applied} status=${raw.status}`);
      }
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

// Kirim command ke firmware node (topic: bridge/<id>/cmd/<cmd>)
export function sendCommand(nodeId: string, cmd: string, value: string | number = 1) {
  publish(`bridge/${nodeId}/cmd/${cmd}`, value);
}

function handleRawBatch(raw: RawBatch) {
  if (!isSessionActive()) {
    return; // Nol disk I/O saat IDLE (sesi tidak aktif)
  }

  const reason = validateBatch(raw);
  if (reason) {
    console.error(`[BATCH] Invalid dari ${raw?.node_id ?? '?'}: ${reason}`);
    if (raw?.node_id) logAcquisitionEvent(raw.node_id, 'invalid', reason);
    return;
  }

  registerBoot(raw.node_id, raw.boot_id);

  const inserted = saveRawBatch({
    node_id: raw.node_id,
    boot_id: raw.boot_id,
    packet_seq: raw.packet_seq,
    first_sample_seq: raw.first_sample_seq,
    sample_count: raw.sample_count,
    t0_us: raw.t0_us,
    dt_us: Array.isArray(raw.dt_us) ? null : (raw.dt_us ?? null),
    sampling_rate_hz: raw.sampling_rate_hz,
    ax: JSON.stringify(raw.ax),
    ay: JSON.stringify(raw.ay),
    az: JSON.stringify(raw.az),
    is_replay: raw.is_replay ? 1 : 0,
    received_utc: new Date().toISOString(),
  });

  const key = `${raw.node_id}:${raw.boot_id}`;
  const prev = lastPacketSeq[key];

  if (!inserted) {
    logAcquisitionEvent(raw.node_id, 'duplicate', `boot=${raw.boot_id} seq=${raw.packet_seq}`);
    console.log(`[BATCH] Duplikat ${raw.node_id} boot=${raw.boot_id} seq=${raw.packet_seq} — lewati`);
  } else {
    // Gap detection: loncatan packet_seq > 1 dari yang terakhir (dalam boot yang sama).
    if (prev != null && raw.packet_seq > prev + 1 && !raw.is_replay) {
      const missing = raw.packet_seq - prev - 1;
      logAcquisitionEvent(raw.node_id, 'gap', `boot=${raw.boot_id} seq=${prev + 1}..${raw.packet_seq - 1} (${missing} batch hilang)`);
      console.warn(`[BATCH] Gap ${raw.node_id} boot=${raw.boot_id}: ${missing} batch hilang antara ${prev} dan ${raw.packet_seq}`);
    }
    lastPacketSeq[key] = raw.packet_seq;
    console.log(`[BATCH] ✓ ${raw.node_id} boot=${raw.boot_id} seq=${raw.packet_seq}: ${raw.sample_count} sampel${raw.is_replay ? ' (replay)' : ''}`);
  }
}

function handleProcessedData(data: ProcessedData) {
  // Selalu kirim data ke WebSocket live dashboard tanpa delay
  onData?.(data);

  if (!isSessionActive()) {
    return; // Nol disk I/O saat IDLE (sesi tidak aktif)
  }

  let calibrationId: number | null = null;
  if (data.calibration) {
    calibrationId = upsertCalibration(data.node_id, data.calibration);
  }

  saveReading({
    node_id: data.node_id, timestamp: data.timestamp,
    rms: data.vibration.rms,
    pitch: data.tilt.pitch, roll: data.tilt.roll,
    pitch_delta: data.tilt.pitch_delta, roll_delta: data.tilt.roll_delta,
    pitch_baseline: 0, roll_baseline: 0,
    mag_x: data.magnetometer.mag_x, mag_y: data.magnetometer.mag_y, mag_z: data.magnetometer.mag_z,
    accel_x: data.accelerometer?.x ?? null,
    accel_y: data.accelerometer?.y ?? null,
    accel_z: data.accelerometer?.z ?? null,
    accel_x_cal: data.accelerometer_calibrated?.x ?? null,
    accel_y_cal: data.accelerometer_calibrated?.y ?? null,
    accel_z_cal: data.accelerometer_calibrated?.z ?? null,
    calibration_id: calibrationId,
    connection_status: data.connection_status,
  });

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

// Cache window raw terakhir per node untuk FDD live (in-memory)
const latestRawWindow: Record<string, { raw_accel: number[]; sampling_rate_hz: number; window_size: number; received_at_ms: number; timestamp: string }> = {};

function handleRawWindow(data: RawWindow) {
  const freq = dominantFrequency(data.raw_accel, data.sampling_rate_hz);
  const result = {
    node_id: data.node_id, timestamp: data.timestamp,
    dominant_freq: freq, window_size: data.window_size, sampling_rate: data.sampling_rate_hz,
    received_utc: new Date().toISOString(),
  };

  // Simpan di memory agar kartu frekuensi live tetap berfungsi walau di luar sesi
  setLatestFft(data.node_id, result);

  // Simpan raw window terkini ke memory cache server
  latestRawWindow[data.node_id] = {
    raw_accel: data.raw_accel,
    sampling_rate_hz: data.sampling_rate_hz,
    window_size: data.window_size,
    received_at_ms: Date.now(),
    timestamp: data.timestamp,
  };

  // FDD: jalankan dekomposisi modal bila kedua node mengirim raw window dalam jeda 30 detik
  const other = otherNodeId(data.node_id);
  const otherWin = other ? latestRawWindow[other] : null;
  if (other && otherWin && (Date.now() - otherWin.received_at_ms) < 30000) {
    try {
      const [a, b] = [data.node_id, other].sort();
      const useCurrentAsA = data.node_id === a;
      const fdd = runFdd(
        useCurrentAsA ? data.raw_accel : otherWin.raw_accel,
        useCurrentAsA ? otherWin.raw_accel : data.raw_accel,
        data.sampling_rate_hz,
        FDD_NUM_PEAKS,
      );
      const dominantFreq = fdd.peaks.length > 0 ? fdd.peaks[0].freq : 0;
      const spectrumJson = JSON.stringify({ freqs: fdd.freqs, eigenvalues: fdd.eigenvalues });
      const fddRecord = {
        node_id_a: a,
        node_id_b: b,
        timestamp: data.timestamp,
        window_start_ms: data.window_start_ms ?? Date.now(),
        dominant_freq: dominantFreq,
        peaks_json: JSON.stringify(fdd.peaks),
        spectrum_json: spectrumJson,
        num_peaks: fdd.peaks.length,
        window_size: data.window_size,
        sampling_rate: data.sampling_rate_hz,
        received_utc: new Date().toISOString(),
      };

      setLatestFdd(fddRecord);

      if (isSessionActive()) {
        saveFdd(fddRecord);
      }
      console.log(`[FDD] ✓ ${a} vs ${b}: ${fdd.peaks.length} peak, dominan=${dominantFreq.toFixed(2)}Hz`);
    } catch (err) {
      console.error('[FDD] Gagal hitung FDD:', err);
    }
  }

  // Jika sesi pengujian aktif, simpan juga rekaman FFT dan raw window ke SQLite
  if (isSessionActive()) {
    saveFft(result);

    if (data.window_start_ms != null && data.window_end_ms != null) {
      saveRawWindow({
        node_id: data.node_id,
        timestamp: data.timestamp,
        window_start_ms: data.window_start_ms,
        window_end_ms: data.window_end_ms,
        window_size: data.window_size,
        sampling_rate_hz: data.sampling_rate_hz,
        raw_accel: JSON.stringify(data.raw_accel),
      });
    }
  }
}

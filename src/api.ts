import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { getReadings, getReadingsByRange, getReadingsByUtcRange, getThreshold, setThreshold, getAlerts, getNodeConfig, setNodeConfig, saveExport, getExports, getFft, getFdd, getRawBatches, getRawBatchesByRange, getAcquisitionEvents, getNodeBoots, getQualitySummary, getActiveSession, startSession, stopSession } from './db';
import { isConnected, sendCommand, getNodeStatus } from './mqtt';
import { flattenRawBatch, flattenRawBatchWithTiming, calculateTimingStats } from './ingest';
import config from './config';
import type { ProcessedData } from './types';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

let wss: WebSocketServer;
let clients: WebSocket[] = [];

function formatLocalTimestamp(input?: Date | string | null): string {
  if (!input) return '';
  const d = typeof input === 'string' ? new Date(input) : input;
  if (isNaN(d.getTime())) return String(input);
  const pad = (n: number, w = 2) => String(n).padStart(w, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}.${pad(d.getMilliseconds(), 3)}`;
}

function getLocalFilenameTimestamp(d = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

export function createServer(port: number) {
  const server = http.createServer(app);
  wss = new WebSocketServer({ server });

  wss.on('connection', (ws) => {
    clients.push(ws);
    ws.on('close', () => { clients = clients.filter(c => c !== ws); });
  });

  // REST API
  app.get('/api/readings/:nodeId', (req, res) => {
    const { start, end } = req.query;
    if (start && end) {
      res.json(getReadingsByRange(req.params.nodeId, start as string, end as string));
    } else {
      res.json(getReadings(req.params.nodeId, Number(req.query.limit) || 500));
    }
  });

  app.get('/api/fft/:nodeId', (req, res) => {
    res.json(getFft(req.params.nodeId, Number(req.query.limit) || 5));
  });

  app.get('/api/fdd', (req, res) => {
    res.json(getFdd(Number(req.query.limit) || 50));
  });

  // Time-series penuh (FR-01): daftar batch mentah per node.
  app.get('/api/batches/:nodeId', (req, res) => {
    res.json(getRawBatches(req.params.nodeId, Number(req.query.limit) || 100));
  });

  // Sampel ter-flatten (seq, t_us, ax, ay, az) — resolusi penuh, opsional rentang t0_us.
  app.get('/api/samples/:nodeId', (req, res) => {
    const { start, end, limit } = req.query;
    let batches;
    if (start && end) {
      batches = getRawBatchesByRange(req.params.nodeId, Number(start), Number(end));
    } else {
      batches = getRawBatches(req.params.nodeId, Number(limit) || 20);
    }
    const samples = batches.flatMap(b => flattenRawBatch(b));
    res.json(samples);
  });

  // Ringkasan kualitas akuisisi per node (FR-03).
  app.get('/api/quality/:nodeId', (req, res) => {
    res.json(getQualitySummary(req.params.nodeId));
  });

  // Statistik Jitter & Timing error akuisisi (FR-02)
  app.get('/api/timing/:nodeId', (req, res) => {
    const batches = getRawBatches(req.params.nodeId, Number(req.query.limit) || 20);
    const samples = batches.flatMap(b => flattenRawBatch(b));
    const cfg = getNodeConfig(req.params.nodeId);
    const nominalRate = cfg?.sampling_rate || 200;
    const stats = calculateTimingStats(samples, nominalRate);
    res.json({
      node_id: req.params.nodeId,
      ...stats
    });
  });

  app.get('/api/events/:nodeId', (req, res) => {
    res.json(getAcquisitionEvents(req.params.nodeId, Number(req.query.limit) || 100));
  });

  app.get('/api/boots/:nodeId', (req, res) => {
    res.json(getNodeBoots(req.params.nodeId));
  });

  app.get('/api/alerts', (_req, res) => {
    res.json(getAlerts());
  });

  app.get('/api/threshold/:param', (req, res) => {
    res.json({ param: req.params.param, value: getThreshold(req.params.param) });
  });

  app.put('/api/threshold/:param', (req, res) => {
    setThreshold(req.params.param, req.body.value);
    res.json({ ok: true });
  });

  app.get('/api/node/:nodeId/config', (req, res) => {
    res.json(getNodeConfig(req.params.nodeId) || {
      node_id: req.params.nodeId, sampling_rate: 200,
      publish_interval: 500, raw_window_interval: 15000, sensitivity_gain: 1,
    });
  });

  // Simpan config + publish ke firmware node dengan status pending (FR-04)
  app.put('/api/node/:nodeId/config', (req, res) => {
    const nodeId = req.params.nodeId;
    const { sampling_rate, publish_interval, raw_window_interval, sensitivity_gain } = req.body;
    const updates: Record<string, any> = {};

    if (sampling_rate != null) {
      updates.sampling_rate = sampling_rate;
      updates.status_sampling_rate = 'pending';
      sendCommand(nodeId, 'sampling_rate', sampling_rate);
    }
    if (publish_interval != null) {
      updates.publish_interval = publish_interval;
      updates.status_publish_interval = 'pending';
      sendCommand(nodeId, 'publish_interval', publish_interval);
    }
    if (raw_window_interval != null) {
      updates.raw_window_interval = raw_window_interval;
      updates.status_raw_window_interval = 'pending';
      sendCommand(nodeId, 'raw_window_interval', raw_window_interval);
    }
    if (sensitivity_gain != null) {
      updates.sensitivity_gain = sensitivity_gain;
      updates.status_sensitivity_gain = 'pending';
      sendCommand(nodeId, 'sensitivity_gain', sensitivity_gain);
    }

    setNodeConfig(nodeId, updates);
    res.json({ ok: true, config: getNodeConfig(nodeId) });
  });

  // Action command ke firmware: recalibrate | calibrate_accel | restart | request_status
  app.post('/api/node/:nodeId/action', (req, res) => {
    const { action } = req.body || {};
    if (!['recalibrate', 'calibrate_accel', 'restart', 'request_status'].includes(action)) {
      return res.status(400).json({ error: 'action harus recalibrate | calibrate_accel | restart | request_status' });
    }
    sendCommand(req.params.nodeId, action);
    res.json({ ok: true });
  });

  // Status terakhir node (balasan request_status)
  app.get('/api/node/:nodeId/status', (req, res) => {
    res.json(getNodeStatus(req.params.nodeId) || { node_id: req.params.nodeId, status: 'no_data' });
  });

  app.get('/api/status/mqtt', (_req, res) => {
    res.json({ connected: isConnected() });
  });

  app.post('/api/reset', (_req, res) => {
    res.json({ ok: true, message: 'Display reset' });
  });

  app.get('/api/config', (_req, res) => {
    res.json({
      mqtt_broker: config.mqtt_broker,
      http_port: config.http_port,
      node_ids: config.node_ids,
    });
  });

  // --- Test Sessions (FR-06) ---
  app.get('/api/session/active', (_req, res) => {
    res.json({ session: getActiveSession() });
  });

  app.post('/api/session/start', (req, res) => {
    const session = startSession(req.body?.name, req.body?.notes);
    // Kirim instruksi ke semua node untuk mulai menulis file sesi di SD Card
    config.node_ids.forEach(id => sendCommand(id, 'session_start', session.id || 1));
    res.json({ ok: true, session });
  });

  app.post('/api/session/stop', (req, res) => {
    const session = stopSession();
    if (!session) {
      return res.status(400).json({ ok: false, error: 'Tidak ada sesi aktif' });
    }

    // Kirim instruksi ke semua node untuk tutup dan flush file sesi di SD Card
    config.node_ids.forEach(id => sendCommand(id, 'session_stop', session.id || 0));

    // Otomatis simpan CSV ke folder exports untuk semua node aktif
    const exportResults: Array<{ node_id: string; filename: string; rows: number; download_url: string }> = [];
    const ts = getLocalFilenameTimestamp();
    const exportsDir = path.join(__dirname, '../exports');
    fs.mkdirSync(exportsDir, { recursive: true });

    for (const nodeId of config.node_ids) {
      const rows = getReadingsByUtcRange(nodeId, session.start_time, session.end_time || new Date().toISOString());
      const filename = `session_${session.id}_${nodeId}_${ts}.csv`;
      const filepath = path.join(exportsDir, filename);
      const header = 'timestamp_node,received_time,node_id,rms,pitch,roll,pitch_delta,roll_delta,mag_x,mag_y,mag_z,accel_x,accel_y,accel_z,accel_x_cal,accel_y_cal,accel_z_cal,calibration_id,connection_status';
      const csv = [header, ...rows.map(r =>
        `${formatLocalTimestamp(r.timestamp)},${formatLocalTimestamp(r.received_utc)},${r.node_id},${r.rms},${r.pitch},${r.roll},${r.pitch_delta},${r.roll_delta},${r.mag_x},${r.mag_y},${r.mag_z},${r.accel_x ?? ''},${r.accel_y ?? ''},${r.accel_z ?? ''},${r.accel_x_cal ?? ''},${r.accel_y_cal ?? ''},${r.accel_z_cal ?? ''},${r.calibration_id ?? ''},${r.connection_status}`
      )].join('\n');
      fs.writeFileSync(filepath, csv);
      saveExport(nodeId, session.start_time, session.end_time || new Date().toISOString(), filename);
      exportResults.push({
        node_id: nodeId,
        filename,
        rows: rows.length,
        download_url: `/exports/${filename}`,
      });

      // FR-02: Ekspor raw time-series resolusi penuh 200Hz lengkap dengan kolom jitter
      const batches = getRawBatches(nodeId, 500);
      if (batches.length > 0) {
        const rawSamples = batches.flatMap(b => flattenRawBatchWithTiming(b));
        if (rawSamples.length > 0) {
          const rawFilename = `session_${session.id}_${nodeId}_raw_${ts}.csv`;
          const rawFilepath = path.join(exportsDir, rawFilename);
          const rawHeader = 'seq,t_us,dt_us,jitter_us,ax,ay,az';
          const rawCsv = [rawHeader, ...rawSamples.map(s =>
            `${s.seq},${s.t_us},${s.dt_us},${s.jitter_us},${s.ax},${s.ay},${s.az}`
          )].join('\n');
          fs.writeFileSync(rawFilepath, rawCsv);
          saveExport(nodeId, session.start_time, session.end_time || new Date().toISOString(), rawFilename);
          exportResults.push({
            node_id: nodeId,
            filename: rawFilename,
            rows: rawSamples.length,
            download_url: `/exports/${rawFilename}`,
          });
        }
      }
    }

    res.json({ ok: true, session, exports: exportResults });
  });

  app.post('/api/export', (req, res) => {
    const { node_id, start_time, end_time } = req.body;
    if (!node_id || !start_time || !end_time) {
      return res.status(400).json({ error: 'node_id, start_time, end_time required' });
    }
    const rows = getReadingsByRange(node_id, start_time, end_time);
    const ts = getLocalFilenameTimestamp();
    const filename = `shms_${node_id}_${ts}.csv`;
    const filepath = path.join(__dirname, '../exports', filename);

    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    const header = 'timestamp_node,received_time,node_id,rms,pitch,roll,pitch_delta,roll_delta,mag_x,mag_y,mag_z,accel_x,accel_y,accel_z,accel_x_cal,accel_y_cal,accel_z_cal,calibration_id,connection_status';
    const csv = [header, ...rows.map(r =>
      `${formatLocalTimestamp(r.timestamp)},${formatLocalTimestamp(r.received_utc)},${r.node_id},${r.rms},${r.pitch},${r.roll},${r.pitch_delta},${r.roll_delta},${r.mag_x},${r.mag_y},${r.mag_z},${r.accel_x ?? ''},${r.accel_y ?? ''},${r.accel_z ?? ''},${r.accel_x_cal ?? ''},${r.accel_y_cal ?? ''},${r.accel_z_cal ?? ''},${r.calibration_id ?? ''},${r.connection_status}`
    )].join('\n');
    fs.writeFileSync(filepath, csv);
    saveExport(node_id, start_time, end_time, filename);
    res.json({ filename, rows: rows.length, download_url: `/exports/${filename}` });
  });

  app.get('/api/exports', (_req, res) => {
    res.json(getExports());
  });

  app.use('/exports', express.static(path.join(__dirname, '../exports')));

  server.listen(port, () => console.log(`[API] Server at http://localhost:${port}`));
  return server;
}

export function broadcastProcessedData(data: ProcessedData) {
  const msg = JSON.stringify({ type: 'data', payload: data });
  clients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(msg); });
}

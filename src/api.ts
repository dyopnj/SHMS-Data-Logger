import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import fs from 'fs';
import { getReadings, getReadingsByRange, getThreshold, setThreshold, getAlerts, getNodeConfig, setNodeSamplingRate, saveExport, getExports } from './db';
import { isConnected } from './mqtt';
import config from './config';
import type { ProcessedData } from './types';

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

let wss: WebSocketServer;
let clients: WebSocket[] = [];

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
    res.json(getNodeConfig(req.params.nodeId) || { node_id: req.params.nodeId, sampling_rate: 200 });
  });

  app.put('/api/node/:nodeId/config', (req, res) => {
    setNodeSamplingRate(req.params.nodeId, req.body.sampling_rate);
    res.json({ ok: true });
  });

  app.get('/api/status/mqtt', (_req, res) => {
    res.json({ connected: isConnected() });
  });

  app.get('/api/config', (_req, res) => {
    res.json({
      mqtt_broker: config.mqtt_broker,
      http_port: config.http_port,
      node_ids: config.node_ids,
    });
  });

  app.post('/api/export', (req, res) => {
    const { node_id, start_time, end_time } = req.body;
    if (!node_id || !start_time || !end_time) {
      return res.status(400).json({ error: 'node_id, start_time, end_time required' });
    }
    const rows = getReadingsByRange(node_id, start_time, end_time);
    const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
    const filename = `shms_${node_id}_${ts}.csv`;
    const filepath = path.join(__dirname, '../exports', filename);

    fs.mkdirSync(path.dirname(filepath), { recursive: true });
    const header = 'timestamp,node_id,rms,pitch,roll,pitch_delta,roll_delta,mag_x,mag_y,mag_z,connection_status';
    const csv = [header, ...rows.map(r =>
      `${r.timestamp},${r.node_id},${r.rms},${r.pitch},${r.roll},${r.pitch_delta},${r.roll_delta},${r.mag_x},${r.mag_y},${r.mag_z},${r.connection_status}`
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

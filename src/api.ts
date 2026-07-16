import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { getReadings, getThreshold, setThreshold, getAlerts, getNodeConfig, setNodeSamplingRate } from './db';
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
    res.json(getReadings(req.params.nodeId, Number(req.query.limit) || 500));
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

  server.listen(port, () => console.log(`[API] Server at http://localhost:${port}`));
  return server;
}

export function broadcastProcessedData(data: ProcessedData) {
  const msg = JSON.stringify({ type: 'data', payload: data });
  clients.forEach(ws => { if (ws.readyState === WebSocket.OPEN) ws.send(msg); });
}

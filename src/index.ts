import config from './config';
import { connect } from './mqtt';
import { createServer, broadcastProcessedData } from './api';
import { pruneOldData } from './db';

console.log('[Gateway] Starting Bridge Monitoring Gateway...');
console.log(`[Gateway] Broker: ${config.mqtt_broker}, Port: ${config.http_port}`);
console.log(`[Gateway] Retensi data: ${config.retention_days} hari`);

createServer(config.http_port);
connect(broadcastProcessedData);

const pruned = pruneOldData(config.retention_days);
if (pruned > 0) console.log(`[DB] Prune ${pruned} baris lama (>${config.retention_days} hari)`);
setInterval(() => {
  const n = pruneOldData(config.retention_days);
  if (n > 0) console.log(`[DB] Prune ${n} baris lama`);
}, 6 * 60 * 60 * 1000);

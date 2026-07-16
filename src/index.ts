import config from './config';
import { connect } from './mqtt';
import { createServer, broadcastProcessedData } from './api';

console.log('[Gateway] Starting Bridge Monitoring Gateway...');
console.log(`[Gateway] Broker: ${config.mqtt_broker}, Port: ${config.http_port}`);

createServer(config.http_port);
connect(broadcastProcessedData);

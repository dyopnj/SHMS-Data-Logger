import type { AppConfig } from './types';

// + ceiling: ganti via env atau file config.json
const config: AppConfig = {
  mqtt_broker: process.env.MQTT_BROKER || 'mqtt://localhost:1883',
  http_port: parseInt(process.env.HTTP_PORT || '3000', 10),
  db_path: process.env.DB_PATH || './data.db',
  node_ids: (process.env.NODE_IDS || 'node_01,node_02').split(','),
};

export default config;

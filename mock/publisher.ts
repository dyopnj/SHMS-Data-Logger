import mqtt from 'mqtt';

// + ceiling: ganti sesuai konfigurasi
const BROKER = process.env.MQTT_BROKER || 'mqtt://localhost:1883';
const NODES = ['node_01', 'node_02'];
const SAMPLE_RATE = 200;
const RAW_INTERVAL = 30; // detik

const client = mqtt.connect(BROKER);
let counter = 0;
let rawCounter = 0;

function random(min: number, max: number) {
  return Math.random() * (max - min) + min;
}

function generateProcessedData(nodeId: string) {
  const t = Date.now() / 1000;
  const noise = Math.sin(t * 0.1) * 0.05; // simulasi getaran periodik
  const tiltDrift = Math.sin(t * 0.02) * 0.5;

  return {
    node_id: nodeId,
    timestamp: new Date().toISOString(),
    sampling_rate_hz: SAMPLE_RATE,
    vibration: { rms: Math.abs(random(0.01, 0.15) + noise) },
    tilt: {
      pitch: tiltDrift,
      roll: tiltDrift * 0.7,
      pitch_delta: tiltDrift,
      roll_delta: tiltDrift * 0.7,
    },
    magnetometer: {
      mag_x: random(-50, 50),
      mag_y: random(-50, 50),
      mag_z: random(-50, 50),
    },
    connection_status: 'online',
  };
}

function generateRawWindow(nodeId: string) {
  const freq = 5; // Hz — simulasi dominant frequency 5Hz
  const samples: number[] = [];
  for (let i = 0; i < 256; i++) {
    const noise = Math.random() * 0.02;
    const signal = Math.sin(2 * Math.PI * freq * i / SAMPLE_RATE) * 0.1;
    samples.push(9.81 + signal + noise); // gravity + vibration
  }
  return {
    node_id: nodeId,
    timestamp: new Date().toISOString(),
    window_size: 256,
    sampling_rate_hz: SAMPLE_RATE,
    raw_accel: samples,
  };
}

client.on('connect', () => {
  console.log(`[Mock] Connected to ${BROKER}`);
  setInterval(() => {
    NODES.forEach(nodeId => {
      client.publish(`bridge/${nodeId}/data`, JSON.stringify(generateProcessedData(nodeId)));
    });
    counter++;
    if (counter % 10 === 0) console.log(`[Mock] Published ${counter * NODES.length} messages`);

    // Raw window tiap RAW_INTERVAL detik
    if (counter % RAW_INTERVAL === 0) {
      NODES.forEach(nodeId => {
        client.publish(`bridge/${nodeId}/raw`, JSON.stringify(generateRawWindow(nodeId)));
      });
      rawCounter++;
      console.log(`[Mock] Published ${rawCounter} raw windows`);
    }
  }, 1000); // tiap 1 detik
});

client.on('error', (err) => console.error('[Mock] Error:', err));

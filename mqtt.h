#ifndef SHM_MQTT_CONFIG_H
#define SHM_MQTT_CONFIG_H

#include "config.h"

// ============================================================================
// mqtt_config.h — Broker credentials & topic map
//
// GANTI nilai-nilai di bawah sesuai environment deployment (broker lapangan,
// kredensial WiFi/MQTT). Disatukan di satu file supaya mudah di-maintain
// tanpa menyentuh source logic.
// ============================================================================

// ---------------------------------------------------------------------------
// WiFi credentials
// ---------------------------------------------------------------------------
#define WIFI_SSID       "SHM_NETWORK"
#define WIFI_PASSWORD   "changeme"

// ---------------------------------------------------------------------------
// MQTT broker — sinkron backend (src/config.ts): mqtt://localhost:1883
// ---------------------------------------------------------------------------
#define MQTT_BROKER_HOST   "localhost"
#define MQTT_BROKER_PORT   1883
#define MQTT_USERNAME       ""
#define MQTT_PASSWORD       ""
#define MQTT_CLIENT_ID       NODE_ID
#define MQTT_KEEPALIVE_S     30
#define MQTT_RECONNECT_BACKOFF_MS   5000UL

// ---------------------------------------------------------------------------
// Topics — PUBLISH (Node -> Backend)
// Payload fields — lihat payload_builder.cpp & backend src/types.ts
// ---------------------------------------------------------------------------
// { node_id, timestamp, sampling_rate_hz, connection_status,
//   vibration: {rms}, tilt: {pitch,roll,pitch_delta,roll_delta},
//   magnetometer: {mag_x,mag_y,mag_z} }
#define TOPIC_DATA_PERIODIC     "bridge/" NODE_ID "/data"        // periodik tiap 1s

// { node_id, timestamp, window_size, sampling_rate_hz, raw_accel:[...] }
#define TOPIC_FFT_BUFFER        "bridge/" NODE_ID "/raw"         // raw FFT window 10-30s

// { node_id, uptime_s, free_heap, wifi_rssi, sd_ok, mqtt_ok, drop_rate_pct }
#define TOPIC_STATUS             "bridge/" NODE_ID "/status"      // balasan request_status

#define TOPIC_LWT                "bridge/" NODE_ID "/lwt"         // last-will (offline notice)

// ---------------------------------------------------------------------------
// Topics — SUBSCRIBE (Backend -> Node, remote config/commands)
// ---------------------------------------------------------------------------
#define TOPIC_CMD_SAMPLING_RATE        "bridge/" NODE_ID "/cmd/sampling_rate"
#define TOPIC_CMD_PUBLISH_INTERVAL     "bridge/" NODE_ID "/cmd/publish_interval"
#define TOPIC_CMD_RAW_WINDOW_INTERVAL  "bridge/" NODE_ID "/cmd/raw_window_interval"
#define TOPIC_CMD_RECALIBRATE          "bridge/" NODE_ID "/cmd/recalibrate"
#define TOPIC_CMD_RESTART              "bridge/" NODE_ID "/cmd/restart"
#define TOPIC_CMD_REQUEST_STATUS       "bridge/" NODE_ID "/cmd/request_status"

// Wildcard subscribe tunggal untuk semua command node ini — lebih efisien
// daripada subscribe satu-satu, parsing sub-topic dilakukan di config_handler.
#define TOPIC_CMD_WILDCARD              "bridge/" NODE_ID "/cmd/#"

#endif // SHM_MQTT_CONFIG_H
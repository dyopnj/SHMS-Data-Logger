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
// MQTT broker
// ---------------------------------------------------------------------------
#define MQTT_BROKER_HOST   "broker.example.com"
#define MQTT_BROKER_PORT   1883
#define MQTT_USERNAME       "shm_node"
#define MQTT_PASSWORD       "changeme"
#define MQTT_CLIENT_ID       NODE_ID
#define MQTT_KEEPALIVE_S     30
#define MQTT_RECONNECT_BACKOFF_MS   5000UL

// ---------------------------------------------------------------------------
// Topics — PUBLISH (Node -> Backend)
// ---------------------------------------------------------------------------
#define TOPIC_DATA_PERIODIC     "shm/" NODE_ID "/data"        // pitch/roll/rms tiap 1s
#define TOPIC_FFT_BUFFER        "shm/" NODE_ID "/fft_raw"     // raw window tiap 10-30s
#define TOPIC_STATUS             "shm/" NODE_ID "/status"      // balasan request_status
#define TOPIC_LWT                "shm/" NODE_ID "/lwt"         // last-will (offline notice)

// ---------------------------------------------------------------------------
// Topics — SUBSCRIBE (Backend -> Node, remote config/commands)
// ---------------------------------------------------------------------------
#define TOPIC_CMD_SAMPLING_RATE        "shm/" NODE_ID "/cmd/sampling_rate"
#define TOPIC_CMD_PUBLISH_INTERVAL     "shm/" NODE_ID "/cmd/publish_interval"
#define TOPIC_CMD_RAW_WINDOW_INTERVAL  "shm/" NODE_ID "/cmd/raw_window_interval"
#define TOPIC_CMD_RECALIBRATE          "shm/" NODE_ID "/cmd/recalibrate"
#define TOPIC_CMD_RESTART              "shm/" NODE_ID "/cmd/restart"
#define TOPIC_CMD_REQUEST_STATUS       "shm/" NODE_ID "/cmd/request_status"

// Wildcard subscribe tunggal untuk semua command node ini — lebih efisien
// daripada subscribe satu-satu, parsing sub-topic dilakukan di config_handler.
#define TOPIC_CMD_WILDCARD              "shm/" NODE_ID "/cmd/#"

#endif // SHM_MQTT_CONFIG_H

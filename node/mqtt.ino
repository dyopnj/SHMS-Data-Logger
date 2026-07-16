#include "config.h"
#include <WiFi.h>
#include <PubSubClient.h>

WiFiClient wifiClient;
PubSubClient mqttClient(wifiClient);

static unsigned long lastReconnect = 0;
static unsigned long lastHeartbeat = 0;

void initWiFi() {
  WiFi.mode(WIFI_STA);
  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.printf("[WiFi] Connecting to %s", WIFI_SSID);
  for (int i = 0; i < 40 && WiFi.status() != WL_CONNECTED; i++) {
    delay(500);
    Serial.print(".");
  }
  Serial.println(WiFi.status() == WL_CONNECTED ? " OK" : " FAIL");
  Serial.printf("[WiFi] IP: %s\n", WiFi.localIP().toString().c_str());
}

void initMQTT() {
  mqttClient.setServer(MQTT_BROKER, MQTT_PORT);
  mqttClient.setCallback(mqttCallback);
}

bool mqttConnected() {
  return mqttClient.connected();
}

void mqttCallback(char* topic, byte* payload, unsigned int len) {
  String msg;
  for (unsigned int i = 0; i < len; i++) msg += (char)payload[i];
  Serial.printf("[MQTT] Incoming: %s → %s\n", topic, msg.c_str());

  // Config: bridge/{node_id}/config
  // Format: {"sampling_rate": 100}
  // + ceiling: tambah handler konfig lain kalo perlu
}

bool mqttReconnect() {
  if (mqttClient.connect(NODE_ID)) {
    Serial.println("[MQTT] Reconnected");
    mqttClient.subscribe(String("bridge/" + String(NODE_ID) + "/config").c_str());
    return true;
  }
  return false;
}

void mqttLoop() {
  if (!mqttClient.connected()) {
    unsigned long now = millis();
    if (now - lastReconnect > 5000) {
      lastReconnect = now;
      if (mqttReconnect()) lastReconnect = 0;
    }
    return;
  }
  mqttClient.loop();

  // Heartbeat tiap 30 detik
  if (millis() - lastHeartbeat > 30000) {
    lastHeartbeat = millis();
    mqttClient.publish(
      String("bridge/" + String(NODE_ID) + "/status").c_str(),
      "{\"node_id\":\"" + String(NODE_ID) + "\",\"connection_status\":\"online\"}",
      true
    );
  }
}

void publishProcessed(const ProcessedData &p, const SensorData &s) {
  char buf[512];
  snprintf(buf, sizeof(buf),
    "{\"node_id\":\"%s\",\"timestamp\":\"%s\",\"sampling_rate_hz\":%d,"
    "\"vibration\":{\"rms\":%.4f},"
    "\"tilt\":{\"pitch\":%.2f,\"roll\":%.2f,\"pitch_delta\":%.2f,\"roll_delta\":%.2f},"
    "\"magnetometer\":{\"mag_x\":%.2f,\"mag_y\":%.2f,\"mag_z\":%.2f},"
    "\"connection_status\":\"online\"}",
    NODE_ID, getTimestamp().c_str(), SAMPLE_RATE_HZ,
    p.rms,
    p.pitch, p.roll, p.pitch_delta, p.roll_delta,
    s.mx, s.my, s.mz
  );
  mqttClient.publish(String("bridge/" + String(NODE_ID) + "/data").c_str(), buf, false);
}

void publishRaw(const float raw[], int len) {
  String payload = "{\"node_id\":\"" + String(NODE_ID) + "\",";
  payload += "\"timestamp\":\"" + getTimestamp() + "\",";
  payload += "\"window_size\":" + String(len) + ",";
  payload += "\"sampling_rate_hz\":" + String(SAMPLE_RATE_HZ) + ",";
  payload += "\"raw_accel\":[";

  for (int i = 0; i < len; i++) {
    payload += String(raw[i], 4);
    if (i < len - 1) payload += ",";
  }
  payload += "]}";

  mqttClient.publish(String("bridge/" + String(NODE_ID) + "/raw").c_str(), payload.c_str(), false);
  Serial.printf("[MQTT] Published raw window (%d bytes)\n", payload.length());
}

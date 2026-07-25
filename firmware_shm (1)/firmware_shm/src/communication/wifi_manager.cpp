#include "wifi_manager.h"
#include <WiFi.h>
#include <WiFiManager.h>
#include <Preferences.h>
#include "../config/config.h"
#include "../config/mqtt_config.h"

namespace wifimgr {

EventGroupHandle_t netEventGroup = nullptr;

char mqttBroker[16] = "192.168.1.100";   // default, bisa diubah via portal
static unsigned long last_attempt_ms = 0;

static void saveConfig();

// Custom parameter WiFiManager untuk MQTT Broker IP
static WiFiManager wm;
static WiFiManagerParameter mqttParam("mqtt", "MQTT Broker IP", mqttBroker, 16);

static void saveConfigCallback() {
    strlcpy(mqttBroker, mqttParam.getValue(), sizeof(mqttBroker));
    Preferences prefs;
    prefs.begin("shm-node", false);
    prefs.putString("mqtt_broker", mqttBroker);
    prefs.end();
}

void init() {
    if (netEventGroup == nullptr) {
        netEventGroup = xEventGroupCreate();
    }

    // Load MQTT broker dari Preferences (NVS)
    {
        Preferences prefs;
        prefs.begin("shm-node", true);
        String saved = prefs.getString("mqtt_broker", "");
        prefs.end();
        if (saved.length() > 0) {
            strlcpy(mqttBroker, saved.c_str(), sizeof(mqttBroker));
            mqttParam.setValue(mqttBroker, 16);
        }
    }

    wm.setSaveParamsCallback(saveConfigCallback);
    wm.setTitle("SHM Node Config");
    wm.addParameter(&mqttParam);
    wm.setConfigPortalTimeout(180);   // AP mati setelah 3 menit

    bool ok = wm.autoConnect("SHM-Node");
    if (!ok) {
        Serial.println("[WiFi] Gagal connect! Restart...");
        ESP.restart();
    }

    Serial.printf("[WiFi] Connected, IP: %s\n", WiFi.localIP().toString().c_str());
    saveConfigCallback();

    last_attempt_ms = millis();
    xEventGroupSetBits(netEventGroup, WIFI_CONNECTED_BIT);
}

bool isConnected() {
    return WiFi.status() == WL_CONNECTED;
}

void checkAndReconnect() {
    if (isConnected()) {
        xEventGroupSetBits(netEventGroup, WIFI_CONNECTED_BIT);
        return;
    }

    xEventGroupClearBits(netEventGroup, WIFI_CONNECTED_BIT | MQTT_CONNECTED_BIT);

    unsigned long now = millis();
    if (now - last_attempt_ms < 5000) return;

    last_attempt_ms = now;
    WiFi.reconnect();
}

} // namespace wifimgr

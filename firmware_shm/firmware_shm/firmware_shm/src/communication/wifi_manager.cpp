#include "wifi_manager.h"
#include <WiFi.h>
#include "../config/config.h"
#include "../config/mqtt_config.h"

namespace wifimgr {

EventGroupHandle_t netEventGroup = nullptr;

static unsigned long last_attempt_ms = 0;

void init() {
    if (netEventGroup == nullptr) {
        netEventGroup = xEventGroupCreate();
    }
    WiFi.mode(WIFI_STA);
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    last_attempt_ms = millis();
}

bool isConnected() {
    return WiFi.status() == WL_CONNECTED;
}

void checkAndReconnect() {
    if (isConnected()) {
        xEventGroupSetBits(netEventGroup, WIFI_CONNECTED_BIT);
        return;
    }

    // WiFi terputus -> clear bit supaya publisher/sync task tahu untuk
    // tidak mencoba mengirim (mereka akan fallback ke logging SD saja).
    xEventGroupClearBits(netEventGroup, WIFI_CONNECTED_BIT | MQTT_CONNECTED_BIT);

    unsigned long now = millis();
    if (now - last_attempt_ms < WIFI_CONNECT_TIMEOUT_MS) {
        return;   // beri waktu attempt sebelumnya selesai dulu
    }

    WiFi.disconnect();
    WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
    last_attempt_ms = now;
}

} // namespace wifimgr

#ifndef SHM_WIFI_MANAGER_H
#define SHM_WIFI_MANAGER_H

#include <Arduino.h>
#include "freertos/FreeRTOS.h"
#include "freertos/event_groups.h"

// ============================================================================
// wifi_manager.h — Koneksi & auto-reconnect WiFi
//
// Status koneksi dipublikasikan lewat Event Group (WIFI_CONNECTED_BIT) supaya
// task lain (MQTT Publisher, Sync Manager) bisa menunggu/poll status tanpa
// polling langsung ke WiFi.status().
// ============================================================================

namespace wifimgr {

extern EventGroupHandle_t netEventGroup;

constexpr EventBits_t WIFI_CONNECTED_BIT      = BIT0;
constexpr EventBits_t MQTT_CONNECTED_BIT      = BIT1;
constexpr EventBits_t SD_READY_BIT            = BIT2;
constexpr EventBits_t BASELINE_READY_BIT      = BIT3;
constexpr EventBits_t SAMPLING_ACTIVE_BIT     = BIT4;

void init();
void checkAndReconnect();
bool isConnected();

}
#endif // SHM_WIFI_MANAGER_H

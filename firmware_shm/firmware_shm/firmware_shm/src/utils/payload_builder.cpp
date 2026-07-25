#include "payload_builder.h"
#include <ArduinoJson.h>
#include "../config/config.h"

namespace payload {

size_t buildPeriodicPayload(const ProcessedData& data, bool wifi_connected,
                             char* out, size_t out_size) {
    // Ukuran doc dihitung longgar (statis, di stack task, bukan heap) --
    // cukup untuk ~10 field flat, jauh di bawah 512 byte.
    StaticJsonDocument<384> doc;

    doc["node_id"] = NODE_ID;
    doc["timestamp"] = data.timestamp;
    doc["sampling_rate_hz"] = data.sampling_rate_hz;
    doc["connection_status"] = wifi_connected ? "online" : "offline";
    doc["pitch"] = serialized(String(data.pitch, 2));
    doc["roll"] = serialized(String(data.roll, 2));
    doc["pitch_delta"] = serialized(String(data.pitch_delta, 2));
    doc["roll_delta"] = serialized(String(data.roll_delta, 2));
    doc["rms_vibration"] = serialized(String(data.rms_vibration, 3));

    size_t len = serializeJson(doc, out, out_size);
    return len;
}

size_t buildFFTPayload(const float* window, uint16_t window_size,
                        uint32_t timestamp, char* out, size_t out_size) {
    // FFT buffer 256 float -> perkiraan ~8 char/angka + koma = ~2.3KB.
    // Dipakai StaticJsonDocument besar (stack) supaya tidak ada heap
    // fragmentation; task FFT Buffer Sender diberi stack 8192 words
    // (lihat freertos_config.h) untuk mengakomodasi ini.
    StaticJsonDocument<4096> doc;

    doc["node_id"] = NODE_ID;
    doc["timestamp"] = timestamp;
    doc["window_size"] = window_size;

    JsonArray arr = doc.createNestedArray("raw_window");
    for (uint16_t i = 0; i < window_size; i++) {
        arr.add(serialized(String(window[i], 4)));
    }

    size_t len = serializeJson(doc, out, out_size);
    return len;
}

size_t buildStatusPayload(uint32_t uptime_s, uint32_t free_heap,
                           int8_t wifi_rssi, bool sd_ok, bool mqtt_ok,
                           float drop_rate_pct, char* out, size_t out_size) {
    StaticJsonDocument<384> doc;

    doc["node_id"] = NODE_ID;
    doc["uptime_s"] = uptime_s;
    doc["free_heap"] = free_heap;
    doc["wifi_rssi"] = wifi_rssi;
    doc["sd_ok"] = sd_ok;
    doc["mqtt_ok"] = mqtt_ok;
    doc["drop_rate_pct"] = serialized(String(drop_rate_pct, 2));

    size_t len = serializeJson(doc, out, out_size);
    return len;
}

} // namespace payload

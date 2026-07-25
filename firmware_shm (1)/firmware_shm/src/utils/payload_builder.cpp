#include "payload_builder.h"
#include <ArduinoJson.h>
#include "../config/config.h"
#include "../sensors/rtc_ds3231.h"

namespace payload {

// Helper: isi timestamp string "HH:MM:SS.mmm" ke doc["timestamp"]
static void setTimestamp(StaticJsonDocument<512>& doc) {
    char ts[20];
    rtc::getTimestampString(ts, sizeof(ts));
    doc["timestamp"] = ts;
}

size_t buildPeriodicPayload(const ProcessedData& data, bool wifi_connected,
                             char* out, size_t out_size) {
    // Format: ProcessedData dari backend src/types.ts
    // { node_id, timestamp, sampling_rate_hz,
    //   vibration: {rms}, tilt: {pitch,roll,pitch_delta,roll_delta},
    //   magnetometer: {mag_x,mag_y,mag_z}, connection_status }
    StaticJsonDocument<512> doc;

    doc["node_id"] = NODE_ID;
    setTimestamp(doc);
    doc["sampling_rate_hz"] = data.sampling_rate_hz;
    doc["connection_status"] = wifi_connected ? "online" : "offline";

    JsonObject vib = doc.createNestedObject("vibration");
    vib["rms"] = serialized(String(data.rms_vibration, 4));

    JsonObject tilt = doc.createNestedObject("tilt");
    tilt["pitch"] = serialized(String(data.pitch, 2));
    tilt["roll"] = serialized(String(data.roll, 2));
    tilt["pitch_delta"] = serialized(String(data.pitch_delta, 2));
    tilt["roll_delta"] = serialized(String(data.roll_delta, 2));

    JsonObject mag = doc.createNestedObject("magnetometer");
    mag["mag_x"] = 0;
    mag["mag_y"] = 0;
    mag["mag_z"] = 0;

    size_t len = serializeJson(doc, out, out_size);
    return len;
}

size_t buildFFTPayload(const float* window, uint16_t window_size,
                        uint32_t timestamp, char* out, size_t out_size) {
    // Format: RawWindow dari backend src/types.ts
    // { node_id, timestamp, window_size, sampling_rate_hz, raw_accel:[...] }
    StaticJsonDocument<4096> doc;

    doc["node_id"] = NODE_ID;
    setTimestamp(doc);
    doc["window_size"] = window_size;
    doc["sampling_rate_hz"] = SAMPLE_RATE_DEFAULT_HZ;

    JsonArray arr = doc.createNestedArray("raw_accel");
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

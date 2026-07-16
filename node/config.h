#ifndef CONFIG_H
#define CONFIG_H

#include <Arduino.h>

// === WiFi ===
const char* WIFI_SSID = "SSID_ANDA";
const char* WIFI_PASS = "PASSWORD_ANDA";

// === MQTT ===
const char* MQTT_BROKER = "192.168.1.100"; // IP laptop / mini PC
const int MQTT_PORT = 1883;
const char* NODE_ID = "node_01";

// === Sensor ===
const float ACCEL_SCALE = 2.0;        // ±2g
const float GYRO_SCALE = 250.0;       // ±250 °/s
const float GRAVITY = 9.80665;        // m/s²
const float DEG_TO_RAD = PI / 180.0;

// === Timing ===
const int SAMPLE_RATE_HZ = 200;
const int SAMPLE_INTERVAL_US = 1000000 / SAMPLE_RATE_HZ; // 5000 µs
const int WINDOW_SIZE = SAMPLE_RATE_HZ;                   // 200 sampel = 1 detik
const int RAW_WINDOW_SIZE = 256;                          // 256 sampel untuk FFT
const int RAW_WINDOW_INTERVAL = 30;                       // kirim raw window tiap 30 detik

// === Pin ===
const int SD_CS = 5;      // GPIO5 = VSPI CS
const int RTC_SDA = 21;   // I2C
const int RTC_SCL = 22;   // I2C
const int BTN_CALIB = 0;  // GPIO0 (BOOT button)

// === SD Card ===
const char* BASELINE_FILE = "/baseline.txt";

// === Data Structures ===
struct SensorData {
  float ax, ay, az;     // m/s²
  float gx, gy, gz;     // °/s
  float mx, my, mz;     // µT
};

struct ProcessedData {
  float rms;
  float pitch, roll;
  float pitch_delta, roll_delta;
  float pitch_baseline, roll_baseline;
};

#endif

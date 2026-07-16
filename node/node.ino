#include "config.h"

// === State global ===
unsigned long lastSampleUs = 0;
unsigned long lastWindowSec = 0;
unsigned long lastRawWindowSec = 0;
unsigned long startTime = 0;
bool calibrated = false;

// Buffer 1 detik
float magBuffer[WINDOW_SIZE];
int magIdx = 0;

// Buffer raw untuk FFT (256 sampel)
float rawBuffer[RAW_WINDOW_SIZE];
int rawIdx = 0;
bool rawReady = false;

// State tilt
float pitch = 0, roll = 0;
float pitch_baseline = 0, roll_baseline = 0;

// === Function declarations (supaya tab .ino saling lihat) ===
void initSensor();
void readSensor(SensorData &d);
void initSD();
void initRTC();
String getTimestamp();
void logToSD(const SensorData &s, const ProcessedData &p);
void logRawToSD(const float raw[], int len, const String &ts);
void loadBaseline();
void saveBaseline(float p, float r);
void initWiFi();
void initMQTT();
void mqttLoop();
void publishProcessed(const ProcessedData &p, const SensorData &s);
void publishRaw(const float raw[], int len);
bool mqttConnected();

void setup() {
  Serial.begin(115200);
  delay(500);
  Serial.println("\n[Node] Starting...");

  initSensor();
  initSD();
  initRTC();
  loadBaseline();
  initWiFi();
  initMQTT();

  startTime = millis() / 1000;
  lastWindowSec = startTime;
  lastRawWindowSec = startTime;
  lastSampleUs = micros();

  Serial.println("[Node] Ready.");
}

void loop() {
  mqttLoop();

  unsigned long nowUs = micros();
  if (nowUs - lastSampleUs < SAMPLE_INTERVAL_US) return;
  lastSampleUs = nowUs;

  // 1. Baca sensor
  SensorData s;
  readSensor(s);

  // 2. Magnitude
  float mag = sqrt(s.ax * s.ax + s.ay * s.ay + s.az * s.az);
  magBuffer[magIdx++] = mag;

  // 3. Complementary filter (gyro integration)
  float dt = SAMPLE_INTERVAL_US / 1e6;
  float accel_pitch = atan2(-s.ax, sqrt(s.ay * s.ay + s.az * s.az)) * 180.0 / PI;
  float accel_roll = atan2(s.ay, s.az) * 180.0 / PI;
  pitch = 0.96f * (pitch + s.gx * dt) + 0.04f * accel_pitch;
  roll = 0.96f * (roll + s.gy * dt) + 0.04f * accel_roll;

  // 4. Buffer raw untuk FFT
  if (rawIdx < RAW_WINDOW_SIZE) {
    rawBuffer[rawIdx++] = mag;
    if (rawIdx >= RAW_WINDOW_SIZE) rawReady = true;
  }

  // === Akhir window 1 detik ===
  if (magIdx >= WINDOW_SIZE) {
    unsigned long nowSec = millis() / 1000;

    // Auto-calibrate setelah 10 detik
    if (!calibrated && nowSec - startTime > 10) {
      pitch_baseline = pitch;
      roll_baseline = roll;
      saveBaseline(pitch_baseline, roll_baseline);
      calibrated = true;
      Serial.printf("[Calib] Baseline pitch=%.2f roll=%.2f\n", pitch_baseline, roll_baseline);
    }

    // Hitung RMS
    float sumSq = 0;
    for (int i = 0; i < WINDOW_SIZE; i++) sumSq += magBuffer[i] * magBuffer[i];
    float rms = sqrt(sumSq / WINDOW_SIZE);

    ProcessedData p;
    p.rms = rms;
    p.pitch = pitch;
    p.roll = roll;
    p.pitch_baseline = pitch_baseline;
    p.roll_baseline = roll_baseline;
    p.pitch_delta = pitch - pitch_baseline;
    p.roll_delta = roll - roll_baseline;

    // Log ke SD
    logToSD(s, p);

    // Publish via MQTT
    if (mqttConnected()) publishProcessed(p, s);

    // Kirim raw window (tiap 30 detik)
    if (rawReady && (nowSec - lastRawWindowSec >= RAW_WINDOW_INTERVAL)) {
      publishRaw(rawBuffer, RAW_WINDOW_SIZE);
      lastRawWindowSec = nowSec;
      rawReady = false;
      rawIdx = 0;
    }

    magIdx = 0;
  }
}

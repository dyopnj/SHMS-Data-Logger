#include "config.h"
#include <SD.h>
#include <SPI.h>
#include <RTClib.h>

RTC_DS3231 rtc;
File logFile;

void initSD() {
  if (!SD.begin(SD_CS)) {
    Serial.println("[SD] Mount failed! Continuing without SD...");
    return;
  }
  Serial.println("[SD] OK");

  // Header CSV processed
  File hdr = SD.open("/data.csv", FILE_WRITE);
  if (hdr.size() == 0) {
    hdr.println("timestamp,node_id,ax,ay,az,gx,gy,gz,mx,my,mz,"
                "rms,pitch,roll,pitch_delta,roll_delta");
  }
  hdr.close();

  // Header raw window
  File rhdr = SD.open("/raw.csv", FILE_WRITE);
  if (rhdr.size() == 0) {
    rhdr.println("timestamp,node_id,window_size,sampling_rate,raw_accel");
  }
  rhdr.close();
}

void initRTC() {
  if (!rtc.begin()) {
    Serial.println("[RTC] Not found! Using millis() fallback.");
    return;
  }
  if (rtc.lostPower()) {
    Serial.println("[RTC] Lost power, setting compile time...");
    rtc.adjust(DateTime(F(__DATE__), F(__TIME__)));
  }
  Serial.println("[RTC] OK");
}

String getTimestamp() {
  if (rtc.isrunning()) {
    DateTime now = rtc.now();
    char buf[24];
    snprintf(buf, sizeof(buf), "%04d-%02d-%02dT%02d:%02d:%02dZ",
      now.year(), now.month(), now.day(),
      now.hour(), now.minute(), now.second());
    return String(buf);
  }
  // fallback: millis sejak start
  return String("1970-01-01T00:00:") + String(millis() / 1000) + "Z";
}

void logToSD(const SensorData &s, const ProcessedData &p) {
  File f = SD.open("/data.csv", FILE_APPEND);
  if (!f) return;
  f.printf("%s,%s,%.4f,%.4f,%.4f,%.2f,%.2f,%.2f,%.2f,%.2f,%.2f,"
           "%.4f,%.2f,%.2f,%.2f,%.2f\n",
    getTimestamp().c_str(), NODE_ID,
    s.ax, s.ay, s.az, s.gx, s.gy, s.gz, s.mx, s.my, s.mz,
    p.rms, p.pitch, p.roll, p.pitch_delta, p.roll_delta);
  f.close();
}

void logRawToSD(const float raw[], int len, const String &ts) {
  File f = SD.open("/raw.csv", FILE_APPEND);
  if (!f) return;
  f.printf("%s,%s,%d,%d,", ts.c_str(), NODE_ID, len, SAMPLE_RATE_HZ);
  for (int i = 0; i < len; i++) {
    f.print(raw[i], 4);
    if (i < len - 1) f.print(";");
  }
  f.println();
  f.close();
}

void loadBaseline() {
  File f = SD.open(BASELINE_FILE, FILE_READ);
  if (!f) {
    Serial.println("[Baseline] Not found, will auto-calibrate after 10s");
    return;
  }
  pitch_baseline = f.parseFloat();
  roll_baseline = f.parseFloat();
  f.close();
  Serial.printf("[Baseline] Loaded pitch=%.2f roll=%.2f\n", pitch_baseline, roll_baseline);
}

void saveBaseline(float p, float r) {
  File f = SD.open(BASELINE_FILE, FILE_WRITE);
  if (!f) return;
  f.printf("%.2f\n%.2f\n", p, r);
  f.close();
}

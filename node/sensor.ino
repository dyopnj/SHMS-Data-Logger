#include "config.h"
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>

Adafruit_MPU6050 mpu;

void initSensor() {
  if (!mpu.begin()) {
    Serial.println("[Sensor] MPU6050 not found! Halt.");
    while (1) delay(100);
  }
  mpu.setAccelerometerRange(MPU6050_RANGE_2_G);
  mpu.setGyroRange(MPU6050_RANGE_250_DEG);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);
  Serial.println("[Sensor] MPU6050 OK");
}

void readSensor(SensorData &d) {
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  d.ax = a.acceleration.x;
  d.ay = a.acceleration.y;
  d.az = a.acceleration.z;
  d.gx = g.gyro.x;
  d.gy = g.gyro.y;
  d.gz = g.gyro.z;

  // MPU6050 gak punya magnetometer, set 0 kalo pake MPU6050
  // + ceiling: ganti ke MPU9250 library kalo pake sensor yg ada mag
  d.mx = d.my = d.mz = 0;

  // Kalibrasi offset sederhana: sensor diam → gravitasi di sumbu Z ~9.81
  // + ceiling: tambah kalibrasi offset manual kalo perlu
}

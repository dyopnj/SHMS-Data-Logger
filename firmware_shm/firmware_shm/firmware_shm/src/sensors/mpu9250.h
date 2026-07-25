#ifndef SHM_MPU9250_H
#define SHM_MPU9250_H

#include <Arduino.h>
#include <SPI.h>
#include "freertos/FreeRTOS.h"
#include "freertos/semphr.h"

// ============================================================================
// mpu9250.h — Driver SPI register-level untuk MPU9250
//
// PERTAHANKAN: seluruh isi fungsi (readRegister/writeRegister/read16,
// initMPU9250, calibrateGyro, adaptive bias, deadband) IDENTIK secara logic
// dengan program referensi. Perubahan HANYA struktural:
//   - dibungkus dalam mutex (spiMutex) supaya aman diakses dari task
//     FreeRTOS (Sensor Sampling) tanpa race condition terhadap task lain
//     yang mungkin memakai bus SPI yang sama.
//   - dijadikan fungsi-fungsi modul (bukan global loop) supaya bisa dipanggil
//     dari task_sensor_sampling().
// ============================================================================

namespace mpu9250 {

// Mutex SPI - didefinisikan (extern) di task_manager.cpp, dipakai bersama
// jika ada modul lain yang perlu bus SPI yang sama di masa depan.
extern SemaphoreHandle_t spiMutex;

// Inisialisasi pin CS + bus SPI + register MPU9250. Return false jika
// WHO_AM_I tidak sesuai (sensor tidak terdeteksi / wiring salah).
bool init();

// Kalibrasi bias gyro (PERTAHANKAN: warm-up 5 detik + averaging N sample).
// Ini rutin blocking sekali-jalan yang dipanggil saat boot / command
// recalibrate — TIDAK dipanggil dari dalam loop sampling 200Hz.
void calibrateGyro(uint16_t samples);

// Baca satu sample accel+gyro (scaled, gyro sudah dikurangi bias +
// deadband + adaptive-bias update). PERTAHANKAN logic dari referensi.
void readAccelGyro(float& ax, float& ay, float& az,
                    float& gx, float& gy, float& gz);

// Baca magnetometer mentah (uT). BARU: stub siap-pakai untuk fusion yaw
// di masa depan. Saat ini AK8963 belum diinisialisasi via I2C-master
// pass-through MPU9250 (di luar scope "jangan ubah cara komunikasi
// MPU9250"), sehingga fungsi ini mengembalikan 0 dan flag `available=false`.
// Struktur pemanggilan SUDAH disiapkan di seluruh pipeline (lihat
// MPU9250Data.mag_x/y/z) supaya implementasi AK8963 nanti tinggal mengisi
// fungsi ini tanpa mengubah task/queue manapun.
bool readMagnetometer(float& mx, float& my, float& mz);

} // namespace mpu9250

#endif // SHM_MPU9250_H

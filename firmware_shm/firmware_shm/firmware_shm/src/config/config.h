#ifndef SHM_CONFIG_H
#define SHM_CONFIG_H

#include <Arduino.h>

// ============================================================================
// config.h — Pin definitions & konstanta umum untuk seluruh firmware
//
// PENTING: Definisi pin MPU9250 (SPI) dan RTC DS3231 (I2C) di bawah ini
// SAMA PERSIS dengan program referensi eksisting — TIDAK DIUBAH, hanya
// dipindahkan ke file config terpusat supaya mudah dipelihara.
// ============================================================================

// ---------------------------------------------------------------------------
// Identitas Node
// ---------------------------------------------------------------------------
// Unique ID per node — WAJIB diubah per unit saat deployment (bisa juga
// dibuat dari MAC address di runtime jika ingin otomatis, tapi default
// eksplisit lebih mudah ditelusuri saat maintenance lapangan).
#define NODE_ID "SHM_001"

// ---------------------------------------------------------------------------
// MPU9250 — SPI (PERTAHANKAN, sama dengan program referensi)
// ---------------------------------------------------------------------------
#define MPU_CS_PIN     5
#define MPU_SCK_PIN    18
#define MPU_MISO_PIN   23
#define MPU_MOSI_PIN   19
#define MPU_SPI_CLOCK_HZ  1000000UL   // 1 MHz, sama seperti referensi

// ---------------------------------------------------------------------------
// RTC DS3231 — I2C (PERTAHANKAN, sama dengan program referensi)
// ---------------------------------------------------------------------------
#define RTC_I2C_ADDR   0x68
#define RTC_SDA_PIN    21
#define RTC_SCL_PIN    22
#define RTC_SYNC_INTERVAL_MS 1000UL

// ---------------------------------------------------------------------------
// SD Card — SPI terpisah (VSPI dipakai MPU9250, HSPI dipakai SD Card,
// supaya tidak terjadi kontensi bus fisik yang mempersulit locking).
// Sesuaikan wiring aktual di lapangan bila berbeda.
// ---------------------------------------------------------------------------
#define SD_CS_PIN      25
#define SD_SCK_PIN     26
#define SD_MISO_PIN    14
#define SD_MOSI_PIN    27

// ---------------------------------------------------------------------------
// Sampling & filter (PERTAHANKAN nilai kalibrasi/kalman dari referensi;
// SAMPLE_RATE_DEFAULT_HZ di bawah menggantikan SAMPLE_INTERVAL_US 250Hz
// pada referensi, sesuai requirement Node SHM = default 200Hz).
// ---------------------------------------------------------------------------
#define GYRO_CALIBRATION_SAMPLES   500
#define WARMUP_DURATION_MS         5000
#define DT_MAX                     0.05f

#define KALMAN_Q_ANGLE   0.001f
#define KALMAN_Q_BIAS    0.003f
#define KALMAN_R_MEASURE 0.03f

#define GYRO_DEADBAND_DPS      0.6f
#define ACCEL_STATIONARY_TOL   0.03f
#define GYRO_STATIONARY_DPS    1.5f
#define ADAPTIVE_BIAS_ALPHA    0.0005f

// Sampling rate default & batas yang diizinkan lewat remote config
#define SAMPLE_RATE_DEFAULT_HZ   200
#define SAMPLE_RATE_MIN_HZ       50
#define SAMPLE_RATE_MAX_HZ       200

// ---------------------------------------------------------------------------
// Baseline
// ---------------------------------------------------------------------------
#define BASELINE_CALIBRATION_SAMPLES   100

// ---------------------------------------------------------------------------
// RMS vibration — window 1 detik @ 200Hz = 200 sample
// ---------------------------------------------------------------------------
#define RMS_WINDOW_SIZE   200

// ---------------------------------------------------------------------------
// Raw FFT buffer (dikirim mentah ke backend, FFT dilakukan di server)
// ---------------------------------------------------------------------------
#define FFT_BUFFER_SIZE          256
#define FFT_SEND_INTERVAL_DEFAULT_MS  15000UL   // 15 detik (range 10-30s)
#define FFT_SEND_INTERVAL_MIN_MS      10000UL
#define FFT_SEND_INTERVAL_MAX_MS      30000UL

// ---------------------------------------------------------------------------
// MQTT publish periodik (pitch/roll/rms)
// ---------------------------------------------------------------------------
#define MQTT_PUBLISH_INTERVAL_DEFAULT_MS  1000UL
#define MQTT_PUBLISH_INTERVAL_MIN_MS      500UL
#define MQTT_PUBLISH_INTERVAL_MAX_MS      10000UL

// ---------------------------------------------------------------------------
// SD Card logging
// ---------------------------------------------------------------------------
#define SD_WRITE_BATCH_SIZE     10       // flush setiap 10 sample terkumpul
#define SD_FLUSH_INTERVAL_MS    500UL    // atau setiap 500ms, mana lebih dulu
#define SD_FILE_ROTATE_INTERVAL_MS  (60UL * 60UL * 1000UL)  // 1 jam
#define SD_FILE_ROTATE_MAX_BYTES    (10UL * 1024UL * 1024UL) // 10MB
#define SD_LOG_DIR               "/shm_logs"
#define SD_CHECKPOINT_FILE       "/shm_logs/checkpoint.dat"

// ---------------------------------------------------------------------------
// WiFi reconnect
// ---------------------------------------------------------------------------
#define WIFI_CHECK_INTERVAL_MS   5000UL
#define WIFI_CONNECT_TIMEOUT_MS  15000UL

// ---------------------------------------------------------------------------
// Watchdog
// ---------------------------------------------------------------------------
#define TASK_WATCHDOG_TIMEOUT_S   10

#endif // SHM_CONFIG_H

#include "mpu9250.h"
#include "mpu9250_registers.h"
#include "../config/config.h"

namespace mpu9250 {

SemaphoreHandle_t spiMutex = nullptr;

// ---------------------------------------------------------------------------
// State internal modul (PERTAHANKAN nilai & satuan dari referensi:
// gyro_bias_* dalam dps, accel_scale/gyro_scale hasil pembagian range ADC).
// ---------------------------------------------------------------------------
static float gyro_bias_x = 0.0f, gyro_bias_y = 0.0f, gyro_bias_z = 0.0f;
static const float accel_scale = 16.0f / 32768.0f;
static const float gyro_scale  = 2000.0f / 32768.0f;
static bool calibrating = false;

// ==================== SPI LOW-LEVEL (PERTAHANKAN) ====================
static uint8_t readRegister(uint8_t reg) {
    SPI.beginTransaction(SPISettings(MPU_SPI_CLOCK_HZ, MSBFIRST, SPI_MODE0));
    digitalWrite(MPU_CS_PIN, LOW);
    SPI.transfer(reg | 0x80);
    uint8_t value = SPI.transfer(0x00);
    digitalWrite(MPU_CS_PIN, HIGH);
    SPI.endTransaction();
    return value;
}

static void writeRegister(uint8_t reg, uint8_t data) {
    SPI.beginTransaction(SPISettings(MPU_SPI_CLOCK_HZ, MSBFIRST, SPI_MODE0));
    digitalWrite(MPU_CS_PIN, LOW);
    SPI.transfer(reg & 0x7F);
    SPI.transfer(data);
    digitalWrite(MPU_CS_PIN, HIGH);
    SPI.endTransaction();
}

static int16_t read16(uint8_t regHigh) {
    SPI.beginTransaction(SPISettings(MPU_SPI_CLOCK_HZ, MSBFIRST, SPI_MODE0));
    digitalWrite(MPU_CS_PIN, LOW);
    SPI.transfer(regHigh | 0x80);
    uint8_t high = SPI.transfer(0x00);
    uint8_t low  = SPI.transfer(0x00);
    digitalWrite(MPU_CS_PIN, HIGH);
    SPI.endTransaction();
    return (int16_t)((high << 8) | low);
}

// ==================== INIT (PERTAHANKAN urutan register) ====================
bool init() {
    if (spiMutex == nullptr) {
        spiMutex = xSemaphoreCreateMutex();
    }

    pinMode(MPU_CS_PIN, OUTPUT);
    digitalWrite(MPU_CS_PIN, HIGH);
    SPI.begin(MPU_SCK_PIN, MPU_MISO_PIN, MPU_MOSI_PIN, MPU_CS_PIN);
    SPI.setFrequency(MPU_SPI_CLOCK_HZ);
    SPI.setDataMode(SPI_MODE0);

    uint8_t whoami = readRegister(REG_WHO_AM_I);
    if (whoami != 0x71) {
        return false;   // sensor tidak terdeteksi / wiring salah
    }

    writeRegister(REG_PWR_MGMT_1, 0x80); delay(100);   // reset
    writeRegister(REG_PWR_MGMT_1, 0x01); delay(10);    // clock source PLL
    writeRegister(REG_GYRO_CONFIG, 0x18); delay(10);   // ±2000 dps
    writeRegister(REG_ACCEL_CONFIG, 0x18); delay(10);  // ±16g
    writeRegister(REG_ACCEL_CONFIG2, 0x03); delay(10); // DLPF accel
    writeRegister(REG_CONFIG, 0x03); delay(10);        // DLPF gyro

    return true;
}

// ==================== GYRO CALIBRATION (PERTAHANKAN) ====================
void calibrateGyro(uint16_t samples) {
    calibrating = true;

    // Warm-up: baca sensor selama beberapa detik sebelum sampling bias,
    // supaya MEMS gyro sudah stabil secara termal (lihat rationale di
    // program referensi asli).
    unsigned long warmup_start = millis();
    while (millis() - warmup_start < WARMUP_DURATION_MS) {
        xSemaphoreTake(spiMutex, portMAX_DELAY);
        read16(REG_GYRO_XOUT_H);
        xSemaphoreGive(spiMutex);
        delay(10);
    }

    float sum_x = 0.0f, sum_y = 0.0f, sum_z = 0.0f;
    for (uint16_t i = 0; i < samples; i++) {
        xSemaphoreTake(spiMutex, portMAX_DELAY);
        sum_x += read16(REG_GYRO_XOUT_H)     * gyro_scale;
        sum_y += read16(REG_GYRO_XOUT_H + 2) * gyro_scale;
        sum_z += read16(REG_GYRO_XOUT_H + 4) * gyro_scale;
        xSemaphoreGive(spiMutex);
        delay(2);
    }

    gyro_bias_x = sum_x / samples;
    gyro_bias_y = sum_y / samples;
    gyro_bias_z = sum_z / samples;

    calibrating = false;
}

// ==================== READ ACCEL + GYRO (PERTAHANKAN) ====================
void readAccelGyro(float& ax, float& ay, float& az,
                    float& gx, float& gy, float& gz) {
    xSemaphoreTake(spiMutex, portMAX_DELAY);

    ax = read16(REG_ACCEL_XOUT_H)     * accel_scale;
    ay = read16(REG_ACCEL_XOUT_H + 2) * accel_scale;
    az = read16(REG_ACCEL_XOUT_H + 4) * accel_scale;

    float raw_gx = read16(REG_GYRO_XOUT_H)     * gyro_scale;
    float raw_gy = read16(REG_GYRO_XOUT_H + 2) * gyro_scale;
    float raw_gz = read16(REG_GYRO_XOUT_H + 4) * gyro_scale;

    xSemaphoreGive(spiMutex);

    // ---- Adaptive gyro bias (PERTAHANKAN) ----
    // Update bias sangat perlahan saat sensor terdeteksi diam, supaya bias
    // instability jangka panjang tetap terkompensasi tanpa mengganggu saat
    // sensor bergerak.
    float accel_mag = sqrtf(ax * ax + ay * ay + az * az);
    bool is_stationary = (fabsf(accel_mag - 1.0f) < ACCEL_STATIONARY_TOL) &&
                          (fabsf(raw_gx) < GYRO_STATIONARY_DPS) &&
                          (fabsf(raw_gy) < GYRO_STATIONARY_DPS) &&
                          (fabsf(raw_gz) < GYRO_STATIONARY_DPS);

    if (is_stationary && !calibrating) {
        gyro_bias_x += ADAPTIVE_BIAS_ALPHA * (raw_gx - gyro_bias_x);
        gyro_bias_y += ADAPTIVE_BIAS_ALPHA * (raw_gy - gyro_bias_y);
        gyro_bias_z += ADAPTIVE_BIAS_ALPHA * (raw_gz - gyro_bias_z);
    }

    gx = raw_gx - gyro_bias_x;
    gy = raw_gy - gyro_bias_y;
    gz = raw_gz - gyro_bias_z;

    // ---- Deadband (PERTAHANKAN) ----
    if (fabsf(gx) < GYRO_DEADBAND_DPS) gx = 0.0f;
    if (fabsf(gy) < GYRO_DEADBAND_DPS) gy = 0.0f;
    if (fabsf(gz) < GYRO_DEADBAND_DPS) gz = 0.0f;
}

// ==================== MAGNETOMETER (BARU — stub) ====================
bool readMagnetometer(float& mx, float& my, float& mz) {
    // Belum diimplementasikan (lihat penjelasan di mpu9250.h). Dikembalikan
    // 0 supaya struct MPU9250Data tetap konsisten & pipeline tidak perlu
    // percabangan khusus. `available=false` memberi sinyal ke caller bahwa
    // nilai ini belum valid untuk fusion yaw.
    mx = my = mz = 0.0f;
    return false;
}

} // namespace mpu9250

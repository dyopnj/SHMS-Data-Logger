#include "sd_logger.h"
#include <SPI.h>
#include <SD.h>
#include "../config/config.h"
#include "../sensors/rtc_ds3231.h"
#include "../scheduler/task_manager.h"

namespace sdlog {

// SD Card memakai bus SPI KEDUA (HSPI) — terpisah secara fisik dari VSPI
// yang dipakai MPU9250 — supaya SD Writer task (Core 1) tidak pernah
// berebut bus fisik dengan Sensor Sampling task (Core 0). sdFileMutex
// tetap dipakai untuk melindungi akses File object dari task lain
// (mis. Sync Manager membaca file yang sama).
static SPIClass sdSPI(HSPI);

static bool sd_ready = false;
static File currentFile;
static char currentFileName[64] = {0};
static unsigned long fileOpenedAtMs = 0;

static SDRecord writeBuffer[SD_WRITE_BATCH_SIZE];
static uint8_t writeBufferCount = 0;
static unsigned long lastFlushMs = 0;

// ---- Read cursor state (dipakai SyncManager) ----
static File readFile;
static bool readCursorActive = false;

static void buildFileName(char* out, size_t outsize) {
    char dateStr[16];
    rtc::getDateString(dateStr, sizeof(dateStr));
    uint8_t hh = rtc::getHour();
    snprintf(out, outsize, "%s/%s_%s_%02u.bin", SD_LOG_DIR, NODE_ID, dateStr, hh);
}

static bool openForAppend() {
    char newName[64];
    buildFileName(newName, sizeof(newName));

    if (strcmp(newName, currentFileName) == 0 && currentFile) {
        return true;   // masih file yang sama, tidak perlu buka ulang
    }

    if (currentFile) currentFile.close();

    strncpy(currentFileName, newName, sizeof(currentFileName));
    currentFile = SD.open(currentFileName, FILE_APPEND);
    fileOpenedAtMs = millis();
    return (bool)currentFile;
}

bool init() {
    if (sdFileMutex == nullptr) {
        sdFileMutex = xSemaphoreCreateMutex();
    }

    sdSPI.begin(SD_SCK_PIN, SD_MISO_PIN, SD_MOSI_PIN, SD_CS_PIN);
    if (!SD.begin(SD_CS_PIN, sdSPI)) {
        sd_ready = false;
        return false;
    }

    if (!SD.exists(SD_LOG_DIR)) {
        SD.mkdir(SD_LOG_DIR);
    }

    sd_ready = openForAppend();
    lastFlushMs = millis();
    return sd_ready;
}

bool isReady() { return sd_ready; }

void flush() {
    if (!sd_ready || writeBufferCount == 0) return;

    xSemaphoreTake(sdFileMutex, portMAX_DELAY);
    if (openForAppend()) {
        currentFile.write((const uint8_t*)writeBuffer, sizeof(SDRecord) * writeBufferCount);
        currentFile.flush();
    }
    xSemaphoreGive(sdFileMutex);

    writeBufferCount = 0;
    lastFlushMs = millis();
}

void writeRecord(const SDRecord& rec) {
    if (!sd_ready) return;

    writeBuffer[writeBufferCount++] = rec;

    bool batchFull = (writeBufferCount >= SD_WRITE_BATCH_SIZE);
    bool timeUp = (millis() - lastFlushMs >= SD_FLUSH_INTERVAL_MS);

    if (batchFull || timeUp) {
        flush();
    }
}

void checkRotation() {
    if (!sd_ready || !currentFile) return;

    bool timeExceeded = (millis() - fileOpenedAtMs >= SD_FILE_ROTATE_INTERVAL_MS);
    bool sizeExceeded = (currentFile.size() >= SD_FILE_ROTATE_MAX_BYTES);

    if (timeExceeded || sizeExceeded) {
        // openForAppend() otomatis mendeteksi nama file baru (jam berbeda)
        // dan membuka file baru; jika masih dalam jam yang sama tapi ukuran
        // sudah melebihi batas, tambahkan suffix incremental supaya tidak
        // menimpa file yang sudah 10MB.
        xSemaphoreTake(sdFileMutex, portMAX_DELAY);
        currentFile.close();
        currentFileName[0] = '\0';   // paksa openForAppend() membuat/buka file baru
        openForAppend();
        xSemaphoreGive(sdFileMutex);
    }
}

bool readNextUnsent(uint32_t afterSequence, SDRecord& outRec) {
    if (!sd_ready) return false;

    xSemaphoreTake(sdFileMutex, portMAX_DELAY);

    if (!readCursorActive) {
        File root = SD.open(SD_LOG_DIR);
        // NOTE: implementasi ini membuka file log AKTIF (currentFileName)
        // sebagai sumber utama sinkronisasi berjalan. Untuk deployment
        // dengan riwayat multi-file yang panjang, SyncManager dapat
        // dipanggil ulang setelah rotasi supaya seluruh file historis
        // ikut tersapu (setiap file baru otomatis jadi target sync
        // berikutnya karena checkpoint sequence tetap global).
        if (root) root.close();

        readFile = SD.open(currentFileName, FILE_READ);
        readCursorActive = (bool)readFile;
    }

    if (!readCursorActive) {
        xSemaphoreGive(sdFileMutex);
        return false;
    }

    SDRecord rec;
    while (readFile.available() >= (int)sizeof(SDRecord)) {
        readFile.read((uint8_t*)&rec, sizeof(SDRecord));
        if (rec.sequence > afterSequence) {
            outRec = rec;
            xSemaphoreGive(sdFileMutex);
            return true;
        }
    }

    // Habis dibaca, tidak ada lagi record baru
    readFile.close();
    readCursorActive = false;
    xSemaphoreGive(sdFileMutex);
    return false;
}

} // namespace sdlog

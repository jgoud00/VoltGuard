#include <WiFi.h>
#include <PubSubClient.h>
#include <OneWire.h>
#include <DallasTemperature.h>
#include <esp_system.h>
#include <esp_wifi.h>
#include "current_calibration.h"
#include "secrets.h"

// Confirmed hardware. USB power; ADC1 inputs stay available while Wi-Fi runs.
constexpr uint8_t VOLTAGE_PIN = 34, CURRENT_PIN = 35, TEMPERATURE_PIN = 4;
constexpr float VOLTAGE_RATIO = 5.0f, CURRENT_MV_PER_AMP = 92.5f;
const char* DEVICE_ID = "voltguard-01";
const char* TOPIC = "voltguard/device/voltguard-01/telemetry";
WiFiClient network;
PubSubClient mqtt(network);
OneWire oneWire(TEMPERATURE_PIN);
DallasTemperature temperatureSensor(&oneWire);
DeviceAddress temperatureAddress;
bool temperatureFound = false, temperaturePending = false;
float temperature = NAN;
const char* temperatureQuality = "disconnected";
uint32_t temperatureStarted = 0, lastTemperatureSearch = 0;
uint32_t lastWifiAttempt = 0, lastMqttAttempt = 0;
uint32_t wifiBackoff = 5000, mqttBackoff = 2000;
uint32_t lastSample = 0, lastPublish = 0;
uint64_t voltageSum = 0, currentSum = 0;
uint32_t sampleCount = 0;
bool calibrated = false, calibrating = false;
float currentZeroMv = NAN, minimumCurrentDeltaMv = NAN;
uint64_t calibrationSum = 0;
uint16_t calibrationCount = 0;
float calibrationMin = INFINITY, calibrationMax = 0;
// Diagnostic names for the original thresholds; acceptance is unchanged.
uint32_t calibrationStarted = 0, calibrationLastSample = 0;
uint32_t calibrationMaxGap = 0, calibrationElapsed = 0;
const char* calibrationResult = "NEVER_STARTED";
bool serialOverflow = false;
char serialCommand[96];
uint8_t serialLength = 0;
float calibrationRaw[CALIBRATION_SAMPLES];
uint32_t calibrationTimes[CALIBRATION_SAMPLES];
uint16_t dumpCalibrationIndex = CALIBRATION_SAMPLES;
bool adcCompare = false;
uint16_t compareCount = 0, dumpCompareIndex = CALIBRATION_SAMPLES;
uint16_t compareFirst[CALIBRATION_SAMPLES], compareDiscard[CALIBRATION_SAMPLES];
uint32_t compareTimes[CALIBRATION_SAMPLES];
bool calibrationAveraged = false;
constexpr uint16_t CURRENT_AVERAGE_SAMPLES = 32;
uint32_t calibrationBlockSum = 0;
uint16_t calibrationBlockCount = 0;
uint32_t calibrationUnderlyingCount = 0, calibrationRailCount = 0;
uint32_t calibrationUnderlyingMin = UINT32_MAX, calibrationUnderlyingMax = 0;
uint64_t calibrationUnderlyingSum = 0;
double calibrationUnderlyingSquareSum = 0;
double calibrationPointSum = 0;
bool wifiScanPending = false;
bool wifiScanStarted = false;
uint32_t wifiScanRequested = 0;

void connectConfiguredWifi() {
  if (!WIFI_USE_OWE) { WiFi.begin(WIFI_SSID, WIFI_PASSWORD); return; }
  WiFi.begin(WIFI_SSID, nullptr, 0, nullptr, false);
  wifi_config_t configuration = {};
  esp_err_t result = esp_wifi_get_config(WIFI_IF_STA, &configuration);
  if (result == ESP_OK) {
    configuration.sta.owe_enabled = true;
    configuration.sta.threshold.authmode = WIFI_AUTH_OWE;
    configuration.sta.pmf_cfg.capable = true;
    configuration.sta.pmf_cfg.required = true;
    result = esp_wifi_set_config(WIFI_IF_STA, &configuration);
  }
  if (result == ESP_OK) result = esp_wifi_connect();
  Serial.printf("[WIFI] OWE connection request: %s\n", esp_err_to_name(result));
}

void serviceWifiScan() {
  if (!wifiScanPending) return;
  if (!wifiScanStarted) {
    if (millis() - wifiScanRequested < 250) return;
    int started = WiFi.scanNetworks(true, true);
    if (started == WIFI_SCAN_FAILED) {
      wifiScanPending = false;
      Serial.println("[WIFI_SCAN] failed to start; no visibility conclusion possible.");
      return;
    }
    wifiScanStarted = true;
  }
  int count = WiFi.scanComplete();
  if (count == WIFI_SCAN_RUNNING) return;
  wifiScanPending = false;
  Serial.printf("[WIFI_SCAN] 2.4GHz networks=%d\n", count);
  for (int i = 0; i < count; ++i) Serial.printf("[WIFI_SCAN] ssid=%s channel=%ld auth=%d rssi=%ld\n",
    WiFi.SSID(i).c_str(), (long)WiFi.channel(i), int(WiFi.encryptionType(i)), (long)WiFi.RSSI(i));
  WiFi.scanDelete();
}

void serviceSampleDump() {
  // Dump only after capture; one line per loop, preserving MQTT servicing.
  if (Serial.availableForWrite() < 48) return;
  if (dumpCalibrationIndex < calibrationCount && !calibrating) {
    uint16_t i = dumpCalibrationIndex++;
    Serial.printf("[RAW_CAL] i=%u t_ms=%lu mv=%.5f\n", i, (unsigned long)calibrationTimes[i], calibrationRaw[i]);
    if (dumpCalibrationIndex == calibrationCount) Serial.println("[RAW_CAL] END");
  } else if (dumpCompareIndex < compareCount && !adcCompare) {
    uint16_t i = dumpCompareIndex++;
    Serial.printf("[RAW_COMPARE] i=%u t_ms=%lu first_mv=%u discard_mv=%u order=%s\n",
      i, (unsigned long)compareTimes[i], compareFirst[i], compareDiscard[i], i % 2 ? "BA" : "AB");
    if (dumpCompareIndex == compareCount) Serial.println("[RAW_COMPARE] END");
  }
}

void printCalibration(const char* event) {
  float mean = calibrationCount ? calibrationPointSum / calibrationCount : NAN;
  float span = calibrationCount ? float(calibrationMax - calibrationMin) : NAN;
  uint32_t elapsed = calibrating ? millis() - calibrationStarted : calibrationElapsed;
  Serial.printf("[CAL] event=%s result=%s active=%s calibrated=%s samples=%u/%u elapsed_ms=%lu max_sample_gap_ms=%lu uptime_ms=%lu\n",
    event, calibrationResult, calibrating ? "yes" : "no", calibrated ? "yes" : "no",
    calibrationCount, CALIBRATION_SAMPLES, (unsigned long)elapsed,
    (unsigned long)calibrationMaxGap, (unsigned long)millis());
  if (calibrationCount) {
    Serial.printf("[CAL] min_mV=%.3f max_mV=%.3f mean_mV=%.3f span_mV=%.3f\n",
      calibrationMin, calibrationMax, mean, span);
  } else Serial.println("[CAL] min_mV=null max_mV=null mean_mV=null span_mV=null");
  Serial.printf("[CAL] rejection_thresholds: reject mean<=%.3f mV; reject mean>=%.3f mV; reject span>%.3f mV; required_samples=%u\n",
    ZERO_MIN_MV, ZERO_MAX_MV, MAX_SPAN_MV, CALIBRATION_SAMPLES);
  Serial.printf("[CAL] acquisition=%s; acceptance_span_applies_to=%s\n", calibrationAveraged ? "nonoverlapping_32_sample_mean" : "original_single_conversion", calibrationAveraged ? "32_sample_means" : "raw_conversions");
  if (calibrationUnderlyingCount) {
    double rawMean = double(calibrationUnderlyingSum) / calibrationUnderlyingCount;
    double rawVariance = calibrationUnderlyingCount > 1 ?
      (calibrationUnderlyingSquareSum - double(calibrationUnderlyingSum) * rawMean) / (calibrationUnderlyingCount - 1) : 0;
    Serial.printf("[CAL] underlying_raw_count=%lu raw_min_mV=%lu raw_max_mV=%lu raw_mean_mV=%.3f raw_sd_mV=%.3f raw_span_mV=%lu rail_samples=%lu\n",
      (unsigned long)calibrationUnderlyingCount, (unsigned long)calibrationUnderlyingMin,
      (unsigned long)calibrationUnderlyingMax, rawMean, sqrt(max(0.0, rawVariance)),
      (unsigned long)(calibrationUnderlyingMax - calibrationUnderlyingMin), (unsigned long)calibrationRailCount);
  }
  if (strcmp(calibrationResult, "REJECTED") == 0) {
    Serial.println("[CAL] exact_rejection_reasons (all failed checks):");
    if (mean <= ZERO_MIN_MV) Serial.printf("[CAL] REJECT mean_mV=%.3f <= lower_exclusive_limit=%.3f\n", mean, ZERO_MIN_MV);
    if (mean >= ZERO_MAX_MV) Serial.printf("[CAL] REJECT mean_mV=%.3f >= upper_exclusive_limit=%.3f\n", mean, ZERO_MAX_MV);
    if (span > MAX_SPAN_MV) Serial.printf("[CAL] REJECT span_mV=%.3f > maximum_allowed_span=%.3f\n", span, MAX_SPAN_MV);
    if (calibrationAveraged && calibrationRailCount) Serial.printf("[CAL] REJECT %lu raw samples outside ADC diagnostic guard (<=100 or >=3100 mV)\n", (unsigned long)calibrationRailCount);
  }
  if (calibrated) Serial.printf("[CAL] session_zero_mV=%.3f minimum_current_delta_mV=%.3f (RAM only)\n", currentZeroMv, minimumCurrentDeltaMv);
}

void beginTemperature() {
  if (!temperatureFound) return;
  temperatureSensor.requestTemperaturesByAddress(temperatureAddress);
  temperatureStarted = millis();
  temperaturePending = true;
}

void serviceTemperature(uint32_t now) {
  if (temperaturePending && now - temperatureStarted >= 750) {
    float reading = temperatureSensor.getTempC(temperatureAddress);
    temperaturePending = false;
    if (reading == DEVICE_DISCONNECTED_C || !isfinite(reading) || reading < -40 || reading > 125) {
      temperature = NAN;
      temperatureQuality = reading == DEVICE_DISCONNECTED_C ? "disconnected" : "conversion_failed";
      temperatureFound = false;
      Serial.println("DS18B20 unavailable; publishing null temperature.");
    } else {
      temperature = reading;
      temperatureQuality = "measured";
    }
  }
  if (!temperatureFound && now - lastTemperatureSearch >= 5000) {
    lastTemperatureSearch = now;
    temperatureSensor.begin();
    temperatureSensor.setWaitForConversion(false);
    temperatureFound = temperatureSensor.getAddress(temperatureAddress, 0);
    if (temperatureFound) {
      temperatureSensor.setResolution(temperatureAddress, 12);
      beginTemperature();
    }
  }
  if (temperatureFound && !temperaturePending && now - temperatureStarted >= 1000) beginTemperature();
}

void command(const char* text) {
  if (strcmp(text, "WIFI_SCAN") == 0) {
    if (!wifiScanPending) {
      wifiScanPending = true;
      wifiScanStarted = false;
      wifiScanRequested = millis();
      WiFi.disconnect(); // The driver cannot scan while association is in progress.
      Serial.println("[WIFI_SCAN] paused association for asynchronous 2.4GHz scan.");
    }
  } else if (strcmp(text, "ADC_COMPARE DISCONNECTED") == 0) {
    if (calibrating || adcCompare) { Serial.println("[ADC] Busy; finish current capture first."); return; }
    adcCompare = true;
    compareCount = 0;
    dumpCompareIndex = CALIBRATION_SAMPLES;
    Serial.println("[ADC] Capturing 256 paired trials, alternating AB/BA. A=GPIO34 then first GPIO35; B=GPIO34 then discard first GPIO35 and keep second. Does NOT calibrate current.");
  } else if (strcmp(text, "DUMP_ADC_COMPARE") == 0) {
    if (adcCompare) Serial.println("[ADC] Capture still running.");
    else dumpCompareIndex = 0;
  } else if (strcmp(text, "DUMP_CALIBRATION_SAMPLES") == 0) {
    if (calibrating) Serial.println("[CAL] Capture still running.");
    else dumpCalibrationIndex = 0;
  } else if (strcmp(text, "CALIBRATE_CURRENT DISCONNECTED") == 0 || strcmp(text, "CALIBRATE_CURRENT_AVERAGED DISCONNECTED") == 0) {
    if (adcCompare) { Serial.println("[ADC] Comparison active; calibration command ignored."); return; }
    // This is an explicit operator assertion, not an automatic detector.
    // Run ONLY with battery/load current path physically disconnected.
    if (calibrating) {
      calibrationElapsed = millis() - calibrationStarted;
      calibrating = false;
      calibrationResult = "INTERRUPTED_BY_NEW_CALIBRATION_COMMAND";
      printCalibration("interrupted");
    }
    calibrated = false;
    calibrationAveraged = strcmp(text, "CALIBRATE_CURRENT_AVERAGED DISCONNECTED") == 0;
    calibrationBlockCount = calibrationBlockSum = 0;
    calibrationUnderlyingCount = calibrationRailCount = 0;
    calibrationUnderlyingMin = UINT32_MAX;
    calibrationUnderlyingMax = 0;
    calibrationUnderlyingSum = 0;
    calibrationUnderlyingSquareSum = calibrationPointSum = 0;
    calibrating = true;
    calibrationSum = 0;
    calibrationCount = 0;
    calibrationMin = INFINITY;
    calibrationMax = 0;
    calibrationStarted = millis();
    calibrationLastSample = calibrationStarted;
    calibrationMaxGap = calibrationElapsed = 0;
    calibrationResult = "SAMPLING";
    dumpCalibrationIndex = CALIBRATION_SAMPLES;
    Serial.println("Explicit disconnected-path calibration started (256 points). Keep sensor powered; current path MUST be disconnected.");
    printCalibration("started");
  } else if (strcmp(text, "CLEAR_CURRENT_CALIBRATION") == 0) {
    calibrationElapsed = calibrating ? millis() - calibrationStarted : calibrationElapsed;
    calibrationResult = calibrating ? "INTERRUPTED_BY_CLEAR_COMMAND" : "CLEARED_BY_COMMAND";
    calibrated = false;
    calibrating = false;
    currentZeroMv = NAN;
    Serial.println("Current calibration cleared; current is null.");
    printCalibration("cleared");
  } else if (strcmp(text, "CALIBRATION_STATUS") == 0) {
    printCalibration("status");
  } else {
    Serial.println("Commands: CALIBRATE_CURRENT DISCONNECTED (ONLY after disconnecting battery/load path), CLEAR_CURRENT_CALIBRATION, CALIBRATION_STATUS. Use newline. Calibration is RAM-only; reboot clears it.");
  }
}

void serviceSerial() {
  for (uint8_t i = 0; i < 32 && Serial.available(); ++i) {
    char c = Serial.read();
    if (c == '\r') continue;
    if (c == '\n') {
      serialCommand[serialLength] = '\0';
      if (!serialOverflow && serialLength) command(serialCommand);
      if (serialOverflow) Serial.println("[CAL] Serial command discarded: line exceeds buffer. Calibration state unchanged.");
      serialLength = 0;
      serialOverflow = false;
    } else if (serialLength < sizeof(serialCommand) - 1) {
      if (!serialOverflow) serialCommand[serialLength++] = c;
    } else {
      serialOverflow = true;
    }
  }
}

void serviceNetwork(uint32_t now) {
  serviceWifiScan();
  if (wifiScanPending) return;
  if (WiFi.status() != WL_CONNECTED) {
    if (mqtt.connected()) mqtt.disconnect();
    if (now - lastWifiAttempt >= wifiBackoff) {
      lastWifiAttempt = now;
      WiFi.disconnect();
      connectConfiguredWifi();
      wifiBackoff = min(wifiBackoff * 2, uint32_t(30000));
      Serial.println("Wi-Fi reconnect attempt.");
    }
    return;
  }
  wifiBackoff = 5000;
  if (!mqtt.connected() && now - lastMqttAttempt >= mqttBackoff) {
    lastMqttAttempt = now;
    String clientId = String(DEVICE_ID) + "-" + String(uint32_t(ESP.getEfuseMac()), HEX);
    if (mqtt.connect(clientId.c_str(), MQTT_USERNAME, MQTT_PASSWORD)) {
      mqttBackoff = 2000;
      Serial.print("MQTT connected. ESP32 IP: ");
      Serial.println(WiFi.localIP());
    } else {
      mqttBackoff = min(mqttBackoff * 2, uint32_t(30000));
      Serial.printf("MQTT connect failed, state=%d.\n", mqtt.state());
    }
  }
  mqtt.loop();
}

void sampleAdc(uint32_t now) {
  if (now - lastSample < 5) return;
  lastSample = now;
  uint32_t voltageMv = analogReadMilliVolts(VOLTAGE_PIN);
  uint32_t currentMv = analogReadMilliVolts(CURRENT_PIN);
  if (adcCompare) {
    // Separate matched trials, both explicitly switch from 34 to 35.
    // Alternate order to avoid assigning slow drift to one condition.
    uint32_t first, settled;
    if (compareCount % 2 == 0) {
      first = currentMv; // A: the unmodified production sampling sequence.
      analogReadMilliVolts(VOLTAGE_PIN);
      analogReadMilliVolts(CURRENT_PIN); // B: discarded first conversion.
      settled = analogReadMilliVolts(CURRENT_PIN);
    } else {
      settled = analogReadMilliVolts(CURRENT_PIN); // B: currentMv was discarded.
      analogReadMilliVolts(VOLTAGE_PIN);
      first = analogReadMilliVolts(CURRENT_PIN); // A.
    }
    compareFirst[compareCount] = first;
    compareDiscard[compareCount] = settled;
    compareTimes[compareCount] = now;
    if (++compareCount == CALIBRATION_SAMPLES) {
      adcCompare = false;
      dumpCompareIndex = 0;
      Serial.println("[ADC] Paired capture complete; dumping all 256 pairs. Thresholds and current calibration unchanged.");
    }
  }
  voltageSum += voltageMv;
  currentSum += currentMv;
  ++sampleCount;
  if (calibrating) {
    calibrationMaxGap = max(calibrationMaxGap, now - calibrationLastSample);
    calibrationLastSample = now;
    ++calibrationUnderlyingCount;
    calibrationUnderlyingSum += currentMv;
    calibrationUnderlyingSquareSum += double(currentMv) * currentMv;
    calibrationUnderlyingMin = min(calibrationUnderlyingMin, currentMv);
    calibrationUnderlyingMax = max(calibrationUnderlyingMax, currentMv);
    if (currentMv <= 100 || currentMv >= 3100) ++calibrationRailCount;
    float point = currentMv;
    if (calibrationAveraged) {
      calibrationBlockSum += currentMv;
      if (++calibrationBlockCount < CURRENT_AVERAGE_SAMPLES) return;
      point = float(calibrationBlockSum) / CURRENT_AVERAGE_SAMPLES;
      calibrationBlockSum = calibrationBlockCount = 0;
    }
    calibrationRaw[calibrationCount] = point;
    calibrationTimes[calibrationCount] = now;
    calibrationPointSum += point;
    calibrationMin = min(calibrationMin, point);
    calibrationMax = max(calibrationMax, point);
    ++calibrationCount;
    if (calibrationCount % 64 == 0 && calibrationCount < CALIBRATION_SAMPLES) printCalibration("progress");
    if (calibrationCount >= CALIBRATION_SAMPLES) {
      calibrating = false;
      calibrationElapsed = millis() - calibrationStarted;
      float zero = calibrationPointSum / calibrationCount;
      float span = calibrationMax - calibrationMin;
      // A drifting or saturated baseline cannot be used. No permanent baseline.
      if (calibrationAccepted(calibrationCount, zero, span, calibrationAveraged, calibrationRailCount)) {
        currentZeroMv = zero;
        // Filtering estimates a zero, never establishes small-current accuracy.
        // Keep the conservative floor tied to ALL raw noise, not filtered span.
        minimumCurrentDeltaMv = currentNoiseFloor(calibrationUnderlyingMin, calibrationUnderlyingMax);
        calibrated = true;
        calibrationResult = "ACCEPTED";
        Serial.printf("Session zero=%.2f mV, observed span=%.2f mV. Nominal sensitivity only; observed noise floor %.2f mV is informational; small current values are unverified. Reconnect load only AFTER calibration completes.\n", zero, span, minimumCurrentDeltaMv);
      } else {
        calibrationResult = "REJECTED";
        Serial.println("Calibration rejected: unstable or saturated ADC. Current remains null.");
      }
      printCalibration("completed");
      dumpCalibrationIndex = 0;
    }
  }
}

String jsonNumber(float value, unsigned digits = 3) {
  return isfinite(value) ? String(value, digits) : String("null");
}

void publishFresh(uint32_t now) {
  if (now - lastPublish < 1000) return;
  lastPublish = now;
  if (!sampleCount) return;
  float voltageMv = float(voltageSum) / sampleCount;
  float currentMv = float(currentSum) / sampleCount;
  voltageSum = currentSum = 0;
  sampleCount = 0;
  float voltage = voltageMv < 3100 ? voltageMv * VOLTAGE_RATIO / 1000.0f : NAN;
  float current = NAN;
  const char* currentQuality = "uncalibrated";
  if (calibrated) {
    float delta = currentMv - currentZeroMv;
    if (currentMv >= 3100 || currentMv <= 100) currentQuality = "unavailable";
    else {
      current = delta / CURRENT_MV_PER_AMP;
      currentQuality = "calibrated_limited";
    }
  }
  // No made-up battery estimates, no power/energy from nominal current.
  // No unsynchronized timestamp: backend supplies UTC receipt timestamp.
  String payload = String("{\"deviceId\":\"") + DEVICE_ID + "\",\"batteryProfile\":\"LI_ION_2S\",\"voltage\":" + jsonNumber(voltage) +
    ",\"current\":" + jsonNumber(current) + ",\"temperature\":" + jsonNumber(temperature, 2) +
    ",\"soc\":null,\"soh\":null,\"internalResistance\":null,\"power\":null,\"energy\":null,\"quality\":{\"voltage\":\"" +
    (isfinite(voltage) ? "averaged_unverified" : "unavailable") + "\",\"current\":\"" + currentQuality + "\",\"temperature\":\"" + temperatureQuality + "\"}}";
  bool sent = mqtt.connected() && mqtt.publish(TOPIC, payload.c_str(), false);
  Serial.printf("V=%s V, currentADC=%.2f mV, I=%s A (%s), T=%s C (%s), MQTT=%s, calibration=%s samples=%u/%u uptime_ms=%lu\n",
    jsonNumber(voltage).c_str(), currentMv, jsonNumber(current).c_str(), currentQuality,
    jsonNumber(temperature, 2).c_str(), temperatureQuality, sent ? "published" : "not sent",
    calibrationResult, calibrationCount, CALIBRATION_SAMPLES, (unsigned long)now);
}

void setup() {
  Serial.begin(115200);
  Serial.printf("[BOOT] calibration diagnostics v1 reset_reason=%d; RAM calibration state reset. A boot between CAL started/completed means calibration was interrupted.\n", int(esp_reset_reason()));
  analogReadResolution(12);
  analogSetPinAttenuation(VOLTAGE_PIN, ADC_11db);
  analogSetPinAttenuation(CURRENT_PIN, ADC_11db);
  network.setConnectionTimeout(750);
  mqtt.setServer(MQTT_HOST_ADDRESS, MQTT_PORT);
  mqtt.setSocketTimeout(1);
  mqtt.setKeepAlive(15);
  mqtt.setBufferSize(1024);
  temperatureSensor.begin();
  temperatureSensor.setWaitForConversion(false);
  temperatureFound = temperatureSensor.getAddress(temperatureAddress, 0);
  if (temperatureFound) {
    temperatureSensor.setResolution(temperatureAddress, 12);
    beginTemperature();
  }
  WiFi.mode(WIFI_STA);
  WiFi.onEvent([](WiFiEvent_t event, WiFiEventInfo_t info) {
    if (event == ARDUINO_EVENT_WIFI_STA_DISCONNECTED) Serial.printf("[WIFI] disconnected reason=%u\n", info.wifi_sta_disconnected.reason);
    if (event == ARDUINO_EVENT_WIFI_STA_GOT_IP) Serial.printf("[WIFI] connected IP=%s gateway=%s\n", WiFi.localIP().toString().c_str(), WiFi.gatewayIP().toString().c_str());
  });
  WiFi.setAutoReconnect(false); // Explicit bounded exponential retries below.
  connectConfiguredWifi();
  Serial.println("VoltGuard 2S hardware telemetry. Current uncalibrated; estimates/power/energy unknown.");
  Serial.println("To calibrate: disconnect battery/load path FIRST, then send CALIBRATE_CURRENT DISCONNECTED. Never auto-zero with a load connected.");
}

void loop() {
  serviceNetwork(millis());
  serviceSerial();
  sampleAdc(millis());
  serviceTemperature(millis());
  publishFresh(millis());
  serviceSampleDump();
  delay(1);
}

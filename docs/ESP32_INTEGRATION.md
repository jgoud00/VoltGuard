# ESP32 physical integration

## Confirmed setup

ESP32 Dev Module on COM5, USB powered. Voltage sensor S connects to GPIO34; the 30k/7.5k divider has ratio 5. ACS712 5A is powered from VIN with common ground; OUT connects through 10k to GPIO35, with a second 10k from that junction to ground. Nominal sensitivity at GPIO35 is 92.5 mV/A. DS18B20 uses 3.3V, common ground and GPIO4 DATA, with a 4.7k pull-up to 3.3V. The battery is two lithium-ion cells in series. The LED load has a 10k series resistor: its current is too small for reliable ACS712 measurement.

Firmware: `firmware/voltguard_esp32/voltguard_esp32.ino`. Topic: `voltguard/device/voltguard-01/telemetry`; authenticated broker: `192.168.1.5:1883`. Credentials are absent from committed firmware files.

## Measurement contract

Use `batteryProfile: "LI_ION_2S"`. Voltage, current and temperature are finite numbers or explicit `null`. Missing keys are rejected. Omit an unsynchronized timestamp; the backend supplies UTC. Voltage averages `analogReadMilliVolts(GPIO34)` multiplied by 5; divider and whole-system accuracy are still unverified. An ADC average at or above the upper measurement range yields `null`.

Current starts `null` with `uncalibrated` quality. Failed temperature reads yield `null` with `disconnected` or `conversion_failed` quality; discovery is retried every five seconds. Temperature conversion is asynchronous (750 ms). ADC samples accumulate at roughly five-millisecond intervals; fresh readings publish about once per second without retained messages or offline replay.

SoC, SoH, internal resistance, power and energy stay `null`, including after current zero calibration. The backend rejects non-null estimates/power/energy for this profile. Nominal sensitivity plus a session zero does not verify power or energy.

`quality` identifies voltage/current/temperature state. Missing primary measurements produce `partial` status; an otherwise complete nominally calibrated sample is still `limited`. The dashboard shows dashes, reasons such as calibration required/probe disconnected, and chart gaps. Null estimates cannot trigger false low-SoC/poor-health alerts; missing sensors cannot declare corresponding alerts recovered. Recovery requires an available reading. Hardware history is separated from earlier simulation profiles.

Configurable 2S voltage indicators default to 6.0/8.4 V (`VOLTAGE_LOW_LI_ION_2S`, `VOLTAGE_HIGH_LI_ION_2S`); these are software indicators, not cell balancing, protection, charging control or a SoC model. Automatic database pruning is disabled to preserve historical records during hardware logging.

## Secrets, compile and upload

The ignored `.env` supplies MQTT credentials. Generate ignored `secrets.h` from the existing local Wi-Fi sketch; the helper prints only the destination:

```powershell
node scripts/generate-firmware-secrets.js 'C:\Users\Jaswant\OneDrive\Documents\Arduino\sketch_aug26a\sketch_aug26a.ino'
```

Local `.env`: `SIMULATION_ENABLED=false`, `BATTERY_PROFILE=LI_ION_2S`, `MQTT_HOST=192.168.1.5`, `MQTT_URL=mqtt://192.168.1.5:1883`. Mosquitto occupies localhost:1883, so the embedded broker binds to the Wi-Fi IP. If DHCP changes that IP, update firmware and local configuration together. Wi-Fi/MQTT retries use exponential intervals bounded at 30 seconds; TCP connection timeout is 750 ms and MQTT socket timeout is one second.

Installed: ESP32 core 3.3.12, PubSubClient 2.8.0, OneWire and DallasTemperature 4.0.6.

```powershell
$cli = 'C:\Users\Jaswant\AppData\Local\Programs\Arduino IDE\resources\app\lib\backend\resources\arduino-cli.exe'
& $cli compile --fqbn esp32:esp32:esp32 --output-dir firmware/build firmware/voltguard_esp32
& $cli upload --fqbn esp32:esp32:esp32 --port COM5 --input-dir firmware/build firmware/voltguard_esp32
npm run dev:hardware
```

Compiled binaries contain device credentials and are ignored alongside `secrets.h`; do not publish them. Release only the identified serial-monitor process holding COM5 before upload.

## Explicit current calibration

**Physically disconnect the battery/load current path through ACS712 first. Keep the sensor powered.** In a 115200-baud serial monitor with newline line ending, send:

```text
CALIBRATE_CURRENT DISCONNECTED
```

This is an operator assertion, not automatic disconnection detection. Firmware averages 256 samples and rejects an unstable or saturated baseline. Reconnect the load only after completion. Calibration is RAM-only; reboot clears it. To clear manually, send `CLEAR_CURRENT_CALIBRATION`.

There is no hardcoded 1409.6 mV baseline, startup zeroing or saved old zero. After calibration, ADC deltas below the greater of 10 mV and twice the observed calibration span remain `null` with `below_resolution` quality. This conservative noise guard is not a measured accuracy specification. Larger deltas use nominal sensitivity and `calibrated_limited` quality. Current direction needs verification against conductor orientation; offset drift remains a limitation. The tiny LED load is unsuitable for accuracy verification. No physical current calibration was performed because disconnection was not confirmed.

### Calibration diagnostics

Full raw-sample captures, channel-switch comparisons, percentiles and tested averaging follow-up are in [Current ADC diagnosis](CURRENT_ADC_DIAGNOSIS.md). The opt-in `CALIBRATE_CURRENT_AVERAGED DISCONNECTED` command uses 256 nonoverlapping 32-conversion means over about 43 seconds; the original `CALIBRATE_CURRENT DISCONNECTED` remains a 256-raw-conversion diagnostic. Averaged mode explicitly applies the 30 mV point-span test to those means, rejects raw rail readings, and derives the current resolution guard from twice the **underlying raw span**, never the smoothed span. A live run accepted a stable averaged zero but correctly left current `null`/`below_resolution`. This is session offset estimation, not verified current accuracy. `ADC_COMPARE DISCONNECTED`, `DUMP_ADC_COMPARE`, and `DUMP_CALIBRATION_SAMPLES` provide buffered acquisition diagnostics; dumps occur after capture in bounded loop steps so MQTT servicing continues.

Diagnostic firmware prints `[CAL]` progress at 64/128/192 samples and completion at 256. It reports raw-sample minimum/maximum/mean/span, elapsed time, maximum sampling gap, current count, calibrated state and uptime. Original acceptance limits are unchanged: mean strictly greater than 100 mV and less than 3000 mV; raw span at most 30 mV. Every failed comparison is printed explicitly. The per-second `currentADC` telemetry is an average and does not reveal the raw-sample span used for calibration rejection.

Send `CALIBRATION_STATUS` to replay the most recent statistics/result without starting calibration. Repeated calibration and clear commands explicitly report interrupted runs. Boot reports the ESP32 reset reason and loss of RAM calibration; a boot between start and completion indicates interruption. Telemetry also reports calibration state and sample count. Reboot discards statistics as well as the baseline; retain serial output when diagnosing a reset.

The diagnostic version compiled (917,436 bytes flash, 47,464 bytes static RAM) and uploaded to COM5 with verified hashes. A read-only status query captured `NEVER_STARTED`, 0/256 samples and the unchanged thresholds after upload. Voltage and MQTT continued working; temperature was already intermittently disconnected and remained null during that capture. The requested disconnected-path calibration run is pending physical confirmation and the operator's serial command; no rejection cause has yet been measured.

Subsequent COM5 `CALIBRATION_STATUS` capture confirmed a completed, rejected run: 256/256 samples in 1402 ms; maximum sampling gap 35 ms; minimum 1296 mV, maximum 1342 mV, mean 1318.961 mV, span 46 mV. The sole failed check was `span_mV=46.000 > maximum_allowed_span=30.000`. The mean passed both exclusive limits (100 and 3000 mV). State was `active=no`, `calibrated=no`; this was completion with rejection, not a stalled run. Subsequent uptime continued increasing and voltage, temperature (~30.37–30.44 °C) and MQTT remained functional. No baseline was accepted or hardcoded and no threshold was changed. This capture establishes excessive raw-sample variation for the existing acceptance rule; it does not isolate whether ADC noise, sensor output, supply noise or wiring caused it. The operator's physical disconnection cannot be verified from serial data.

## Verified evidence — 6 October 2026

- Compile passed: 915,264 bytes flash (69%), 47,448 bytes static RAM (14%). COM5 upload passed with flash hashes verified; actual chip: ESP32-D0WD-V3 revision 3.1.
- Serial showed roughly 8.145–8.148 V, DS18B20 30.31–30.37 °C and `MQTT=published`. Current remained `null`/`uncalibrated`. The observed 1319–1320 mV current ADC was diagnostic only, never used as a baseline.
- Real telemetry reached backend, SQLite, REST and dashboard about once per second. Initial live Chrome verification showed `LIVE`, 8.15 V, 30.4 °C, unknown-field dashes and no browser errors. After the final backend restart, the ESP32 reconnected; recent intervals were 1000, 1000 and 1002 ms with no rejected packets. Voltage was around 8.14 V, and the DS18B20 had become disconnected again. Actual MQTT/REST data contained null temperature with `disconnected` quality, and the live dashboard showed a dash and probe-disconnected reason. Temperature is intermittently unavailable; the physical cause is unverified.
- All 5,473 historical telemetry rows were compared field-by-field and preserved exactly. All 36 historical alert records remain; an old undervoltage alert resolved after valid physical voltage arrived. Verified ignored backup: `backend/data/voltguard.sqlite.pre-nullable-backup.sqlite`.
- All 18 backend tests passed, including migration, nullable authenticated MQTT/WebSocket delivery and missing-temperature alert retention/recovery. Browser regression passed with mocked disconnected temperature, recovery and mobile layout. Frontend production build and lint passed.

Compilation, upload, live transport and rendering are confirmed. Calibrated accuracy, reliable small-current measurement, battery estimates and physical protection are not established. Deliberate physical sensor unplug/replug and current calibration were not performed. Failure handling was exercised with contract/API/browser test data and the device's actual disconnected-temperature messages.

Dashboard: `http://localhost:5173`; latest API: `http://localhost:3001/api/latest`.

References: [Arduino-ESP32 millivolt ADC API](https://docs.espressif.com/projects/arduino-esp32/en/latest/api/adc.html), [DallasTemperature asynchronous conversion example](https://github.com/milesburton/Arduino-Temperature-Control-Library/blob/master/examples/WaitForConversion/WaitForConversion.ino).

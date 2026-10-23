# Hardware integration

For the confirmed GPIO34/GPIO35/GPIO4 two-cell lithium-ion hardware, use the [physical ESP32 integration](ESP32_INTEGRATION.md) and nullable `LI_ION_2S` contract. The lead-acid example below is a separate legacy/simulator contract; its estimates do not apply to this pack.

Use the existing MQTT boundary. For physical ESP32 testing, stop the simulator, run `npm run dev:hardware`, set `SIMULATION_ENABLED=false`, and configure an authenticated LAN broker. Set `EMBEDDED_BROKER=false` and `MQTT_URL=mqtt://<LAN broker IP>:1883`; put optional credentials in the root environment. Configure the ESP32 for that same broker and credentials. The default loopback listener is inaccessible from an ESP32.

Publish QoS 1 at approximately one-second intervals to `voltguard/device/voltguard-01/telemetry` (also accepted: `voltguard/voltguard-01/telemetry`). IDs must match topic and payload. The dashboard defaults to `DEVICE_ID` on the server.

## Battery payload

```json
{
  "deviceId": "voltguard-01",
  "batteryProfile": "12V",
  "voltage": 12.48,
  "current": 1.35,
  "power": 16.848,
  "energy": 0.00421,
  "temperature": 31.2,
  "soc": 82.4,
  "soh": 91,
  "internalResistance": 0.041
}
```

Units: V, A, W (absolute V�I), kWh, �C, %, %, O. Positive battery current is discharge; negative is charging. Profiles are `6V` and `12V`. Battery estimates must be calibrated or explicitly labeled demonstration inputs; software cannot derive absolute health from a single reading.

## Electrical software payload

```json
{
  "deviceId": "voltguard-01",
  "batteryProfile": "AC230",
  "voltage": 229.8,
  "current": 1.35,
  "power": 310.23,
  "energy": 0.421,
  "temperature": 35.2
}
```

AC230 accepts 0�500 V, 0�100 A, and -40�125 �C. It is a software test profile, not authorization to connect the existing divider to mains. Actual AC monitoring requires safe isolated sensing and calibrated RMS measurements. Power currently assumes PF=1 and is not measured real power for arbitrary AC loads.

## Firmware behavior

- Omit timestamp until a reliable UTC clock is available; server adds it. With synchronized time, send ISO 8601 UTC. More than one minute ahead is rejected; older/equal timestamps than the latest stored reading are ignored. Do not publish uptime as UTC.
- Omit `source` for real devices. Server derives status; device-provided status and arbitrary fields are ignored. MQTT telemetry drives online state; no separate status/alert topics are required.
- Publish numeric JSON values, never numeric strings, NaN or Infinity. Do not substitute zero for sensor errors. Withhold invalid samples and report hardware faults through a separately designed future protocol.
- Reconnect Wi-Fi and MQTT with bounded retry/backoff, resubscribe as necessary, and resume fresh readings. Avoid replaying stale buffered telemetry after reconnection. Broker disconnects do not stop REST/dashboard availability.
- Supply accumulated energy for real history. Backend computes omitted power; omitted energy defaults to zero. Persist device energy if continuity across reboot is needed. Use elapsed hours � absolute watts / 1000.
- Validate current offset, divider ratio, temperature probe behavior, ADC saturation, sampling rate and battery profile on real hardware. OCV/Coulomb counting and controlled load-transition resistance estimation require calibration. Protection actuation and electrical safety are not implemented by this software.

The accepted contract is `shared/telemetry.js`; thresholds are centralized in `backend/src/config.js` and `.env.example`. Changing to physical telemetry requires broker/device configuration, not dashboard rewrites.

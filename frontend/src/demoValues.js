// Display-only examples. Never send these values to MQTT or persistence.
const demoStarted = Date.now() - 120000;

export function withDemoValues(sample, displayTime = Date.now()) {
  const seconds = displayTime / 1000;
  const elapsed = Math.max(0, (displayTime - demoStarted) / 1000);
  const voltage = Number.isFinite(sample?.voltage)
    ? sample.voltage
    : 8.14 + 0.025 * Math.sin(seconds / 15);
  const current = Number.isFinite(sample?.current)
    ? sample.current
    : 0.1 + 0.025 * Math.sin(seconds / 9) + 0.01 * Math.sin(seconds / 3);
  const examples = {
    voltage,
    current,
    power: voltage * current,
    temperature: 30 + 0.4 * Math.sin(seconds / 18),
    energy: 0.001 + (0.814 * elapsed) / 3600000,
    soc: Math.max(0, 90 - elapsed / 600),
    soh: 95 + 0.15 * Math.sin(seconds / 20),
  };
  const result = { ...sample, demoFields: [] };
  for (const [key, value] of Object.entries(examples)) {
    if (!Number.isFinite(sample?.[key])) {
      result[key] = value;
      result.demoFields.push(key);
    }
  }
  return result;
}

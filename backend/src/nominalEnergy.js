export function deriveNominalEnergy(sample, previous) {
  if (sample.batteryProfile !== 'LI_ION_2S') return;
  const available =
    Number.isFinite(sample.voltage) && Number.isFinite(sample.current);
  sample.power = available ? sample.voltage * sample.current : null;
  sample.energy =
    previous?.batteryProfile === 'LI_ION_2S' && Number.isFinite(previous.energy)
      ? previous.energy
      : available
        ? 0
        : null;
  const gap = previous
    ? Date.parse(sample.receivedAt) -
      Date.parse(previous.receivedAt || previous.timestamp)
    : 0;
  if (
    available &&
    previous?.batteryProfile === 'LI_ION_2S' &&
    Number.isFinite(previous.power) &&
    gap > 0 &&
    gap <= 5000
  ) {
    // Discharge-only estimate in kWh; gaps and charging are excluded.
    sample.energy +=
      (((Math.max(0, previous.power) + Math.max(0, sample.power)) / 2) * gap) /
      3600000000;
  }
  sample.quality.power = available ? 'nominal_noise_limited' : 'unavailable';
  sample.quality.energy =
    sample.energy === null ? 'unavailable' : 'nominal_discharge_partial';
}

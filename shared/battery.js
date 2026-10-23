// Illustrative lead-acid values. Calibrate per battery before physical use.
export const profiles = {
  '6V': {
    capacityAh: 7,
    rFresh: 0.015,
    rEol: 0.075,
    ocv: [
      [0, 5.85],
      [20, 6.0],
      [50, 6.18],
      [80, 6.3],
      [100, 6.39],
    ],
  },
  '12V': {
    capacityAh: 45,
    rFresh: 0.03,
    rEol: 0.15,
    ocv: [
      [0, 11.7],
      [20, 12.0],
      [50, 12.36],
      [80, 12.6],
      [100, 12.78],
    ],
  },
};
export const clamp = (value, min = 0, max = 100) =>
  Math.min(max, Math.max(min, value));
function interpolate(value, pairs) {
  if (value <= pairs[0][0]) return pairs[0][1];
  for (let i = 1; i < pairs.length; i++) {
    if (value <= pairs[i][0]) {
      const [x0, y0] = pairs[i - 1],
        [x1, y1] = pairs[i];
      return y0 + ((value - x0) / (x1 - x0)) * (y1 - y0);
    }
  }
  return pairs.at(-1)[1];
}
export const ocvFromSoc = (soc, profile) =>
  interpolate(clamp(soc), profiles[profile].ocv);

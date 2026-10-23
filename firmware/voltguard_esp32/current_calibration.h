#pragma once
#include <cmath>
#include <cstdint>

constexpr uint16_t CALIBRATION_SAMPLES = 256;
constexpr float ZERO_MIN_MV = 100, ZERO_MAX_MV = 3000, MAX_SPAN_MV = 30;

inline bool calibrationAccepted(uint16_t points, double mean, float pointSpan,
                                bool averaged, uint32_t rawRailSamples) {
  return points == CALIBRATION_SAMPLES && std::isfinite(mean) &&
    std::isfinite(pointSpan) && pointSpan >= 0 &&
    mean > ZERO_MIN_MV && mean < ZERO_MAX_MV && pointSpan <= MAX_SPAN_MV &&
    (!averaged || rawRailSamples == 0);
}

inline float currentNoiseFloor(uint32_t rawMinimum, uint32_t rawMaximum) {
  const float rawSpan = rawMaximum >= rawMinimum ? rawMaximum - rawMinimum : INFINITY;
  return rawSpan * 2.0f > 10.0f ? rawSpan * 2.0f : 10.0f;
}

#include <cassert>
#include <iostream>
#include "../voltguard_esp32/current_calibration.h"

int main() {
  assert(!calibrationAccepted(256, 1318.953, 64, false, 0)); // Actual raw result.
  assert(calibrationAccepted(256, 1319.092, 8.125, true, 0)); // Actual averaged result.
  assert(currentNoiseFloor(1287, 1351) == 128); // Raw noise survives averaging.
  assert(!calibrationAccepted(255, 1319, 8, true, 0)); // Interrupted capture.
  assert(!calibrationAccepted(256, 100, 8, true, 0));
  assert(!calibrationAccepted(256, 3000, 8, true, 0));
  assert(!calibrationAccepted(256, NAN, 8, true, 0));
  assert(!calibrationAccepted(256, 1319, NAN, true, 0));
  assert(!calibrationAccepted(256, 1319, 31, true, 0)); // Sustained shift remains rejected.
  assert(!calibrationAccepted(256, 1319, 8, true, 1)); // One rail sample cannot be hidden.
  assert(currentNoiseFloor(1351, 1287) == INFINITY);
  assert(currentNoiseFloor(1318, 1318) == 10);
  std::cout << "Calibration guard tests passed (raw rejection, averaged acceptance, raw noise floor, interruption, drift and rails).\n";
}

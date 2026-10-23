"""Create a reproducible report and scientific plots from captured data only."""
import csv
import json
from pathlib import Path
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt

root = Path('docs/evidence/adc')
reports = [json.loads(path.read_text()) for path in sorted(root.glob('*.json'))]
lines = ['# Current ADC diagnosis — 6 October 2026', '',
    'All values below are millivolts at GPIO35, with the battery/load current path confirmed disconnected and the ACS712 powered. Sample SD uses n−1; percentiles use linear interpolation. Each dataset contains 256 indexed points, and every point is supplied in its CSV. Raw calibration points are single conversions; averaged calibration points each summarize 32 nonoverlapping raw conversions.', '',
    '## Acquisition and code inspection', '',
    'The production sampler reads GPIO34 then GPIO35 every approximately 5 ms using analogReadMilliVolts. Calibration originally tested the min/max range of 256 individual current conversions. Telemetry instead reports the average accumulated during roughly one second. These are different statistics: a quiet reported average does not mean individual conversions are quiet. The installed ESP32 3.3.12 core calls the calibrated one-shot ADC result API once per millivolt reading. Both GPIO34/35 use ADC1 and 11 dB attenuation. Indexed sample counts and recomputed statistics match firmware diagnostics: no counter, accumulator, incomplete-run or replay bug was found.', '',
    '## Raw calibration runs', '',
    '| Run | Min | Max | Mean | SD | Span | Consecutive 32-sample mean span |',
    '|---|---:|---:|---:|---:|---:|---:|']
for report in reports:
    if 'calibration' in report and report.get('acquisition') == 'single raw conversion':
        s = report['calibration']
        lines.append(f"| {Path(report['file']).stem} | {s['min_mV']:.3f} | {s['max_mV']:.3f} | {s['mean_mV']:.3f} | {s['sample_sd_mV']:.3f} | {s['span_mV']:.3f} | {s['block_mean_span_mV']:.3f} |")
lines += ['', '## Channel-switch comparison', '',
    'For each matched trial, A reads GPIO34 then the first GPIO35 conversion. B reads GPIO34, discards the first GPIO35 conversion, then retains the next GPIO35 conversion. Order alternates AB/BA to reduce slow-drift bias. MQTT, temperature and voltage acquisition remain active. These comparisons test discarding the first conversion; they do not fully isolate all possible channel-settling or analog-circuit effects.', '',
    '| Run | First span / SD | Discard-first span / SD | Mean paired difference (B−A) |',
    '|---|---:|---:|---:|']
for report in reports:
    if 'first_conversion' in report:
        a,b = report['first_conversion'],report['discard_first_conversion']
        lines.append(f"| {Path(report['file']).stem} | {a['span_mV']:.3f} / {a['sample_sd_mV']:.3f} | {b['span_mV']:.3f} / {b['sample_sd_mV']:.3f} | {report['paired_difference_mV']['mean']:.3f} |")
lines += ['', 'Discarding the first conversion did not reliably improve the spread and was not applied as a production fix.', '',
    '## Evidence-based change and live test', '',
    'The data show broad sample noise with occasional extremes, not merely one isolated bad sample. Short consecutive block means remain stable; the original three run means differ by only about 0.15 mV. The evidence favors sample noise rather than sustained zero drift over the observed intervals. It does not identify the physical source as ADC, sensor, supply or wiring noise.', '',
    'An explicit opt-in CALIBRATE_CURRENT_AVERAGED DISCONNECTED command estimates the zero using 256 nonoverlapping 32-sample means (8192 underlying readings, about 43 seconds). Original raw calibration remains unchanged under CALIBRATE_CURRENT DISCONNECTED. The numeric 100/3000 mV mean limits and 30 mV point-span limit were not widened. In the new mode the 30 mV limit applies to block means, not raw conversions; this is an explicit change of estimator, not proof the raw ADC became quiet. Any raw reading at <=100 or >=3100 mV rejects the averaged run. Raw noise remains visible and sets the minimum current delta to max(10 mV, twice the full raw span), preserving conservative unavailability for small currents. Runtime current already uses one-second averages, so offset estimation now matches the averaged signal rather than rejecting a stable mean solely on individual conversion extremes.', '',
    'Espressif documents multisampling as an ADC noise mitigation: [ESP32 ADC noise guidance](https://docs.espressif.com/projects/esp-idf/en/v4.4.1/esp32/api-reference/peripherals/adc.html). Hardware filtering is a separate possible next experiment, not something tested here.', '',
    '| Averaged run | Min | Max | Mean | SD | Point span |',
    '|---|---:|---:|---:|---:|---:|']
for report in reports:
    if 'calibration' in report and '32-sample' in report.get('acquisition',''):
        s = report['calibration']
        lines.append(f"| {Path(report['file']).stem} | {s['min_mV']:.3f} | {s['max_mV']:.3f} | {s['mean_mV']:.3f} | {s['sample_sd_mV']:.3f} | {s['span_mV']:.3f} |")
lines += ['', 'The first live averaged run completed in 42720 ms, used 8192 raw readings, had raw SD 6.714 mV and raw span 64 mV, no rail readings, and retained a 128 mV current floor. It accepted a session-only averaged zero of 1319.092 mV; subsequent current stayed null/below_resolution. MQTT published during the capture, with voltage and temperature still working. This demonstrates stable averaged zero estimation, not accurate current or gain calibration. A requested repeat was initially blocked when COM5 disappeared; that is an external device-connection change, not a calibration rejection.', '',
    '## Percentiles and consecutive block averages', '']
for report in reports:
    for key in ['calibration','first_conversion','discard_first_conversion']:
        if key not in report: continue
        s = report[key]
        name = Path(report['file']).stem
        lines += [f'### {name}: {key}', '',
            '| Percentile | P1 | P5 | P25 | P50 | P75 | P95 | P99 |',
            '|---|---:|---:|---:|---:|---:|---:|---:|',
            '| mV | ' + ' | '.join(f"{s['percentiles_mV'][str(p)]:.3f}" for p in [1,5,25,50,75,95,99]) + ' |', '',
            'Consecutive means of points 0–31, 32–63, …, 224–255: ' + ', '.join(f'{v:.3f}' for v in s['consecutive_32_sample_means_mV']) + ' mV.', '',
            f"Captured {s['n']} points; point timestamp span {s['elapsed_ms']} ms; maximum point gap {s['maximum_gap_ms']} ms. Underlying raw gaps and block-point gaps are different for averaged captures.", '',
            f'[Complete CSV](evidence/adc/{name}.csv) · [Statistics JSON](evidence/adc/{name}.json) · [Serial log](evidence/adc/{name}.log)', '']
lines += ['## Limits', '', 'No accurate small-current measurement, gain/sensitivity verification, LED-current detection, power or energy measurement is claimed. Current floor is deliberately conservative and is a software noise guard, not a measured accuracy specification. Calibration is operator-triggered only with a disconnected path, held in RAM, and lost on reboot. No baseline is hardcoded. No deliberate hardware filtering, sensor rewiring, external reference voltage or known-current bench measurement was performed.', '', '![Captured ADC samples and means](evidence/adc/adc-comparison.png)', '']
Path('docs/CURRENT_ADC_DIAGNOSIS.md').write_text('\n'.join(lines), encoding='utf-8')

fig, axes = plt.subplots(3, 1, figsize=(11, 9), constrained_layout=True)
with (root/'calibration-1.csv').open() as source:
    rows = list(csv.DictReader(source))
values = [float(row['current_mV']) for row in rows]
axes[0].plot(range(256), values, '.', ms=3, alpha=.65, label='Raw conversions')
for i in range(8):
    axes[0].plot([i*32,i*32+31], [sum(values[i*32:i*32+32])/32]*2, color='black', lw=2, label='32-sample mean' if i==0 else None)
axes[0].set(title='Original 256-sample calibration: noise around a stable mean', xlabel='Sample index', ylabel='GPIO35 (mV)')
axes[0].legend()
for idx in range(1,4):
    with (root/f'compare-{idx}.csv').open() as source: rows = list(csv.DictReader(source))
    axes[1].boxplot([[float(row['first_mV']) for row in rows], [float(row['discard_first_mV']) for row in rows]], positions=[idx*3,idx*3+1], widths=.6)
axes[1].set_xticks([3,4,6,7,9,10],['1 first','1 discard','2 first','2 discard','3 first','3 discard'])
axes[1].set(title='Three paired comparison runs: discarding first conversion is not a reliable fix', ylabel='GPIO35 (mV)')
with (root/'averaged-1.csv').open() as source: rows=list(csv.DictReader(source))
times = [int(row['uptime_ms']) for row in rows]
axes[2].plot([(t-times[0])/1000 for t in times], [float(row['current_mV']) for row in rows], '.', ms=3)
axes[2].set(title='Live 32-sample averaging: 256 nonoverlapping means from 8192 raw conversions', xlabel='Elapsed capture time (seconds)', ylabel='GPIO35 mean (mV)')
for ax in axes: ax.grid(alpha=.2)
fig.savefig(root/'adc-comparison.png', dpi=160)
print('Created docs/CURRENT_ADC_DIAGNOSIS.md and ADC comparison plot from captured data.')

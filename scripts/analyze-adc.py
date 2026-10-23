"""Analyze buffered ESP32 captures without third-party dependencies or secret access."""
import csv
import json
import math
import re
import statistics
import sys
from pathlib import Path


def percentile(values, p):
    values = sorted(values)
    pos = (len(values) - 1) * p / 100
    lower = math.floor(pos)
    upper = math.ceil(pos)
    return values[lower] + (values[upper] - values[lower]) * (pos - lower)


def summarize(values, times):
    blocks = [values[i:i+32] for i in range(0, len(values), 32)]
    block_means = [statistics.mean(block) for block in blocks]
    return {
        'n': len(values), 'min_mV': min(values), 'max_mV': max(values),
        'mean_mV': statistics.mean(values), 'sample_sd_mV': statistics.stdev(values),
        'span_mV': max(values) - min(values),
        'percentiles_mV': {str(p): percentile(values, p) for p in [1, 5, 25, 50, 75, 95, 99]},
        'consecutive_32_sample_means_mV': block_means,
        'block_mean_span_mV': max(block_means) - min(block_means),
        'samples_more_than_15mV_from_median': sum(abs(v-statistics.median(values)) > 15 for v in values),
        'max_consecutive_step_mV': max(abs(b-a) for a,b in zip(values,values[1:])),
        'elapsed_ms': times[-1] - times[0],
        'maximum_gap_ms': max(b-a for a,b in zip(times,times[1:])),
        'specified_point_span_rule_passes': 100 < statistics.mean(values) < 3000 and max(values)-min(values) <= 30,
    }


def analyze(path):
    text = path.read_text(encoding='utf-8-sig')
    calibration = re.findall(r'\[RAW_CAL\] i=(\d+) t_ms=(\d+) mv=(\d+(?:\.\d+)?)', text)
    comparison = re.findall(r'\[RAW_COMPARE\] i=(\d+) t_ms=(\d+) first_mv=(\d+) discard_mv=(\d+) order=(AB|BA)', text)
    rows = comparison or calibration
    if len(rows) != 256 or [int(row[0]) for row in rows] != list(range(256)):
        raise ValueError(f'{path}: requires exactly 256 consecutive sample indices, got {len(rows)}')
    times = [int(row[1]) for row in rows]
    header = ['index','uptime_ms','first_mV','discard_first_mV','order'] if comparison else ['index','uptime_ms','current_mV']
    with path.with_suffix('.csv').open('w', newline='', encoding='utf-8') as output:
        writer = csv.writer(output)
        writer.writerow(header)
        writer.writerows(rows)
    result = {'file': str(path), 'mqtt_publish_lines': text.count('MQTT=published'),
              'boot_lines': text.count('[BOOT]')}
    if not comparison:
        result['acquisition'] = '32-sample means (8192 raw conversions)' if 'nonoverlapping_32_sample_mean' in text else 'single raw conversion'
    if comparison:
        first = [int(row[2]) for row in rows]
        discard = [int(row[3]) for row in rows]
        result['first_conversion'] = summarize(first,times)
        result['discard_first_conversion'] = summarize(discard,times)
        differences = [b-a for a,b in zip(first,discard)]
        result['paired_difference_mV'] = {'mean': statistics.mean(differences), 'sd': statistics.stdev(differences),
          'mean_AB_order': statistics.mean(d for d,r in zip(differences,rows) if r[4]=='AB'),
          'mean_BA_order': statistics.mean(d for d,r in zip(differences,rows) if r[4]=='BA')}
    else:
        result['calibration'] = summarize([float(row[2]) for row in rows],times)
    path.with_suffix('.json').write_text(json.dumps(result,indent=2),encoding='utf-8')
    return result


if __name__ == '__main__':
    print(json.dumps([analyze(Path(arg)) for arg in sys.argv[1:]],indent=2))

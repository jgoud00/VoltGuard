import { memo, useMemo } from 'react';
import { Line } from 'react-chartjs-2';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
} from 'chart.js';
import { fmt, time, measurementNote } from '../format.js';
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Filler,
);
export function Sparkline({ samples, metric, color = '#296653' }) {
  const points = samples.slice(-30).map((s) => s[metric]);
  const available = points.filter(Number.isFinite);
  if (available.length < 2)
    return (
      <svg className="sparkline" viewBox="0 0 100 28" aria-hidden="true">
        <path
          d="M0 14 H100"
          stroke="#dddeda"
          fill="none"
          strokeDasharray="3 3"
        />
      </svg>
    );
  const min = Math.min(...available),
    span = Math.max(...available) - min;
  const path = points
    .map((v, i) =>
      Number.isFinite(v)
        ? `${i && Number.isFinite(points[i - 1]) ? 'L' : 'M'}${((i / (points.length - 1)) * 100).toFixed(2)} ${(span ? 23 - ((v - min) / span) * 18 : 14).toFixed(2)}`
        : '',
    )
    .join(' ');
  return (
    <svg className="sparkline" viewBox="0 0 100 28" aria-hidden="true">
      <path
        d={path}
        stroke={color}
        fill="none"
        strokeWidth="1.5"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
export const SignalChart = memo(function SignalChart({
  spec,
  samples,
  primary = false,
  live = false,
}) {
  const data = useMemo(
    () => ({
      labels: samples.map((s) => time(s.timestamp)),
      datasets: [
        {
          data: samples.map((s) =>
            Number.isFinite(s[spec.key]) ? s[spec.key] : null,
          ),
          borderColor: spec.color,
          backgroundColor: (context) => {
            const { ctx, chartArea } = context.chart;
            if (!chartArea) return 'transparent';
            const gradient = ctx.createLinearGradient(
              0,
              chartArea.top,
              0,
              chartArea.bottom,
            );
            gradient.addColorStop(0, spec.color + '20');
            gradient.addColorStop(1, spec.color + '00');
            return gradient;
          },
          fill: true,
          pointRadius: 0,
          pointHitRadius: 15,
          pointHoverRadius: 4,
          pointHoverBackgroundColor: spec.color,
          pointHoverBorderColor: '#fff',
          pointHoverBorderWidth: 2,
          borderWidth: primary ? 2 : 1.8,
          tension: 0.18,
        },
      ],
    }),
    [samples, spec, primary],
  );
  const options = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      normalized: true,
      interaction: { mode: 'index', intersect: false },
      layout: { padding: { top: 8, right: 8 } },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: '#1e3029',
          titleColor: '#ccd7cf',
          bodyColor: '#fff',
          displayColors: false,
          padding: 12,
          cornerRadius: 4,
          titleFont: { family: 'Inter', size: 10, weight: 'normal' },
          bodyFont: { family: 'IBM Plex Mono', size: 12 },
          callbacks: {
            label: (ctx) => `${fmt(ctx.parsed.y, spec.digits)} ${spec.unit}`,
          },
        },
      },
      scales: {
        x: {
          border: { display: false },
          grid: { display: false },
          ticks: {
            color: '#8b8e86',
            maxTicksLimit: primary ? 7 : 4,
            maxRotation: 0,
            font: { family: 'IBM Plex Mono', size: 10 },
            padding: 10,
          },
        },
        y: {
          border: { display: false },
          grid: { color: '#eceee8', tickLength: 0 },
          ticks: {
            color: '#8b8e86',
            maxTicksLimit: 5,
            font: { family: 'IBM Plex Mono', size: 10 },
            padding: 12,
          },
        },
      },
    }),
    [spec, primary],
  );
  const points = samples.map((s) => s[spec.key]).filter(Number.isFinite);
  const mean = points.length
    ? points.reduce((a, b) => a + b, 0) / points.length
    : undefined;
  return (
    <section
      className={`panel chart ${primary ? 'primary-chart' : ''}`}
      aria-label={`${spec.title} chart`}
    >
      <div className="chart-heading">
        <div>
          <span className="overline">
            {primary ? 'SIGNAL MONITOR' : spec.note}
          </span>
          <h3>
            {spec.title}
            <span className="chart-unit"> / {spec.unit}</span>
          </h3>
        </div>
        <div className="chart-reading">
          <strong>{fmt(samples.at(-1)?.[spec.key], spec.digits)}</strong>
          <span>{spec.unit}</span>
        </div>
      </div>
      {primary && (
        <div className="chart-subline">
          <span>
            <i className={`signal-dot ${live ? 'is-live' : ''}`} />
            {live ? 'Receiving telemetry' : 'No live signal'}
          </span>
          <span>
            Window average{' '}
            <b>
              {fmt(mean, spec.digits)} {spec.unit}
            </b>
          </span>
        </div>
      )}
      <div className="plot">
        <Line
          data={data}
          options={options}
          role="img"
          aria-label={`${spec.title} measurements over time`}
        />
        {!points.length && (
          <div className="chart-empty">
            {samples.at(-1)?.batteryProfile === 'LI_ION_2S'
              ? measurementNote(samples.at(-1), spec.key)
              : 'Waiting for the first reading'}
            <span>
              {samples.at(-1)?.batteryProfile === 'LI_ION_2S'
                ? 'Missing measurements are shown as gaps, never zero.'
                : 'The signal will appear when the device transmits.'}
            </span>
          </div>
        )}
      </div>
      {primary && (
        <div className="chart-footer">
          <span>
            MIN{' '}
            <b>
              {fmt(
                points.length ? Math.min(...points) : undefined,
                spec.digits,
              )}{' '}
              {spec.unit}
            </b>
          </span>
          <span>
            MAX{' '}
            <b>
              {fmt(
                points.length ? Math.max(...points) : undefined,
                spec.digits,
              )}{' '}
              {spec.unit}
            </b>
          </span>
          <span>{samples.length} samples in view</span>
        </div>
      )}
    </section>
  );
});

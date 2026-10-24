import { useMemo, useRef, useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import * as Tooltip from '@radix-ui/react-tooltip';
import {
  Activity,
  ArrowDownToLine,
  ArrowUpRight,
  BatteryMedium,
  Check,
  ChevronRight,
  CircleHelp,
  Cpu,
  FlaskConical,
  Gauge,
  LayoutGrid,
  Menu,
  ShieldCheck,
  SlidersHorizontal,
  Thermometer,
  TriangleAlert,
  Waves,
  X,
  Zap,
} from 'lucide-react';
import { useTelemetry } from './hooks/useTelemetry.js';
import { withDemoValues } from './format.js';
import { SignalChart, Sparkline } from './components/SignalChart.jsx';
import { SelectField, SimulationPanel } from './components/Controls.jsx';
import {
  fmt,
  profiles,
  scenarios,
  signals,
  time,
  measurementNote,
} from './format.js';

const metricSpecs = [
  signals[0],
  signals[1],
  signals[2],
  signals[3],
  {
    key: 'energy',
    title: 'Energy',
    unit: 'kWh',
    digits: 8,
    color: '#687360',
    note: 'Accumulated consumption',
  },
  signals[4],
  signals[5],
];
const metricIcons = {
  voltage: Zap,
  current: Waves,
  power: Gauge,
  temperature: Thermometer,
  energy: Activity,
  soc: BatteryMedium,
  soh: ShieldCheck,
};
const navItems = [
  { id: 'overview', label: 'Overview', icon: LayoutGrid },
  { id: 'telemetry', label: 'Telemetry', icon: Activity },
  { id: 'events', label: 'Events', icon: TriangleAlert },
  { id: 'device', label: 'Device', icon: Cpu },
];

function Help({ text }) {
  return (
    <Tooltip.Root>
      <Tooltip.Trigger asChild>
        <button className="help-button" aria-label={text}>
          <CircleHelp size={13} />
        </button>
      </Tooltip.Trigger>
      <Tooltip.Portal>
        <Tooltip.Content className="tooltip-content" sideOffset={7}>
          {text}
          <Tooltip.Arrow />
        </Tooltip.Content>
      </Tooltip.Portal>
    </Tooltip.Root>
  );
}
function Brand() {
  return (
    <a className="brand" href="#overview" aria-label="VoltGuard overview">
      <span className="brandmark">
        <Zap size={20} strokeWidth={1.8} />
      </span>
      <span>
        VoltGuard<span className="brand-subtitle">Energy intelligence</span>
      </span>
    </a>
  );
}
function Nav({ active, onNavigate, activeCount }) {
  return (
    <nav className="navigation" aria-label="Workspace navigation">
      {navItems.map(({ id, label, icon: Icon }) => (
        <a
          key={id}
          href={`#${id}`}
          className={`nav-item ${active === id ? 'selected' : ''}`}
          aria-current={active === id ? 'location' : undefined}
          onClick={() => onNavigate(id)}
        >
          <Icon size={17} strokeWidth={1.7} />
          <span>{label}</span>
          {id === 'events' && activeCount > 0 ? (
            <span className="nav-count">{activeCount}</span>
          ) : active === id ? (
            <span className="nav-dot" />
          ) : null}
        </a>
      ))}
    </nav>
  );
}
function exportTelemetry(samples, deviceId) {
  const keys = [
    'deviceId',
    'timestamp',
    'batteryProfile',
    'voltage',
    'current',
    'power',
    'energy',
    'temperature',
    'soc',
    'soh',
    'status',
    'source',
  ];
  const escape = (value) => `"${String(value ?? '').replaceAll('"', '""')}"`;
  const csv = [
    keys.join(','),
    ...samples.map((sample) =>
      keys.map((key) => escape(sample[key])).join(','),
    ),
  ].join('\r\n');
  const url = URL.createObjectURL(
    new Blob([csv], { type: 'text/csv;charset=utf-8;' }),
  );
  const link = document.createElement('a');
  link.href = url;
  link.download = `voltguard-${deviceId}-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
function Metric({ spec, samples, latest, active, live, onSelect, selected }) {
  const Icon = metricIcons[spec.key];
  const abnormal = active.some(
    (a) =>
      a.code ===
        (spec.key === 'current'
          ? 'OVERCURRENT'
          : spec.key === 'temperature'
            ? 'HIGH_TEMPERATURE'
            : '') ||
      (spec.key === 'voltage' &&
        ['OVERVOLTAGE', 'UNDERVOLTAGE'].includes(a.code)),
  );
  const content = (
    <>
      <div className="metric-label">
        <span>
          <Icon size={14} strokeWidth={1.8} />
          {spec.title}
        </span>
        {abnormal && <TriangleAlert size={13} className="metric-warning" />}
      </div>
      <div className="metric-value">
        <strong>{fmt(latest?.[spec.key], spec.digits)}</strong>
        <span>{spec.unit}</span>
      </div>
      <div className="metric-bottom">
        <span
          className={
            latest?.demoFields?.includes(spec.key) ? 'metric-demo' : undefined
          }
        >
          {latest?.demoFields?.includes(spec.key) ||
          latest?.batteryProfile === 'LI_ION_2S'
            ? measurementNote(latest, spec.key)
            : !latest
              ? 'Awaiting data'
              : !live
                ? 'Last received'
                : abnormal
                  ? 'Outside limit'
                  : spec.key === 'power'
                    ? 'PF = 1 assumption'
                    : spec.key === 'energy'
                      ? 'Accumulated energy'
                      : 'Latest reading'}
        </span>
        <Sparkline
          samples={samples}
          metric={spec.key}
          color={abnormal ? '#B23737' : '#126B70'}
        />
      </div>
    </>
  );
  return spec.key === 'energy' ? (
    <div className={`metric ${!live ? 'stale' : ''}`} data-metric={spec.key}>
      {content}
    </div>
  ) : (
    <button
      className={`metric ${selected ? 'is-selected' : ''} ${abnormal ? 'is-abnormal' : ''} ${!live ? 'stale' : ''}`}
      data-metric={spec.key}
      aria-label={`Inspect ${spec.title.toLowerCase()} signal`}
      aria-pressed={selected}
      onClick={onSelect}
    >
      {content}
    </button>
  );
}
function BatteryDetails({ latest }) {
  return (
    <section className="battery-details" aria-label="Battery estimates">
      <div>
        <BatteryMedium size={17} />
        <span>
          {latest?.batteryProfile === 'LI_ION_2S'
            ? 'Battery estimates'
            : 'Battery estimates'}
        </span>
        <Help text="State of charge and battery health require a validated battery model or capacity measurements. They remain unavailable for the physical pack. Simulator estimates are illustrative." />
      </div>
      <div className="battery-estimate">
        <span>
          State of charge
          {latest?.demoFields?.includes('soc') ? ' · Demo value' : ''}
        </span>
        <strong>
          {fmt(latest?.soc, 1)}
          <small>%</small>
        </strong>
        <div className="estimate-track">
          <span style={{ width: `${latest?.soc || 0}%` }} />
        </div>
      </div>
      <div className="battery-estimate">
        <span>
          Battery health (SOH)
          {latest?.demoFields?.includes('soh') ? ' · Demo value' : ''}
        </span>
        <strong>
          {fmt(latest?.soh, 1)}
          <small>%</small>
        </strong>
        <div className="estimate-track">
          <span style={{ width: `${latest?.soh || 0}%` }} />
        </div>
      </div>
    </section>
  );
}
function EventLog({ alerts, active }) {
  const [filter, setFilter] = useState('active');
  const visible = filter === 'active' ? active : alerts.slice(0, 30);
  return (
    <section className="panel alerts" id="events">
      <div className="panel-heading">
        <div>
          <span className="overline">Conditions and recovery</span>
          <h2>Event log</h2>
        </div>
        <span className={`event-count ${active.length ? 'has-events' : ''}`}>
          {active.length} active
        </span>
      </div>
      <Tabs.Root
        value={filter}
        onValueChange={setFilter}
        className="event-tabs"
      >
        <Tabs.List aria-label="Event filter">
          <Tabs.Trigger value="active">
            Active conditions<span>{active.length}</span>
          </Tabs.Trigger>
          <Tabs.Trigger value="recent">
            Recent history<span>{alerts.length}</span>
          </Tabs.Trigger>
        </Tabs.List>
        <Tabs.Content value={filter}>
          <div className="event-table-heading">
            <span>Condition</span>
            <span>State</span>
            <span>Time</span>
          </div>
          {visible.length ? (
            visible.map((a) => (
              <div className={`alert ${a.active ? '' : 'resolved'}`} key={a.id}>
                <span
                  className={`event-symbol ${a.active ? 'warning' : 'resolved'}`}
                >
                  {a.active ? <TriangleAlert size={15} /> : <Check size={15} />}
                </span>
                <div className="event-description">
                  <strong>{a.code.replaceAll('_', ' ')}</strong>
                  <small>{a.message}</small>
                </div>
                <span
                  className={`event-state ${a.active ? 'critical' : 'recovered'}`}
                >
                  {a.active ? a.severity : 'Recovered'}
                </span>
                <time dateTime={a.resolvedAt || a.timestamp}>
                  {time(a.resolvedAt || a.timestamp)}
                </time>
              </div>
            ))
          ) : (
            <div className="empty">
              <span className="empty-icon">
                <ShieldCheck size={22} strokeWidth={1.5} />
              </span>
              <div>
                <strong>
                  {filter === 'active'
                    ? 'No active conditions'
                    : 'No events recorded'}
                </strong>
                <p>
                  {filter === 'active'
                    ? 'Every incoming reading is checked against your configured limits.'
                    : 'Detected conditions and their recovery will appear here.'}
                </p>
              </div>
            </div>
          )}
        </Tabs.Content>
      </Tabs.Root>
      <div className="event-log-footer">
        <span>
          <ShieldCheck size={13} />
          Limits evaluated on every reading
        </span>
        <span>Up to 30 recent events</span>
      </div>
    </section>
  );
}
export default function App() {
  const telemetry = useTelemetry();
  const {
    samples: measuredSamples,
    alerts,
    active,
    connected,
    config,
    device,
    health,
    busy,
    error,
    now,
    latest: measuredLatest,
    live,
    connection,
    status,
    update,
  } = telemetry;
  const samples = useMemo(() => {
    const lastStamp = Date.parse(
      measuredSamples.at(-1)?.receivedAt || measuredSamples.at(-1)?.timestamp,
    );
    return measuredSamples.map((sample) => {
      const stamp = Date.parse(sample.receivedAt || sample.timestamp);
      return withDemoValues(
        sample,
        Number.isFinite(stamp) && Number.isFinite(lastStamp)
          ? now - (lastStamp - stamp)
          : now,
      );
    });
  }, [measuredSamples, now]);
  const latest = withDemoValues(
    measuredLatest || {
      batteryProfile: config.profile,
      deviceId: device.deviceId || 'voltguard-01',
    },
    now,
  );
  const [nav, setNav] = useState('overview');
  const [mobileNav, setMobileNav] = useState(false);
  const navigationTarget = useRef(null);
  const [selectedSignal, setSelectedSignal] = useState('voltage');
  const [windowSize, setWindowSize] = useState('100');
  const profile = latest?.batteryProfile || config.profile,
    battery = profile !== 'AC230';
  const deviceId = latest?.deviceId || device.deviceId || 'voltguard-01';
  const profileSamples = useMemo(
    () =>
      samples
        .filter((s) => s.batteryProfile === profile)
        .slice(-Number(windowSize)),
    [samples, profile, windowSize],
  );
  const chartSignals = useMemo(
    () =>
      signals.map((signal) =>
        profileSamples.some((sample) => sample.demoFields.includes(signal.key))
          ? { ...signal, note: 'Includes demo values · not measured' }
          : signal.key === 'current' && !battery
            ? { ...signal, note: 'Load current' }
            : signal,
      ),
    [battery, profileSamples],
  );
  const selectedSpec =
    chartSignals.find((s) => s.key === selectedSignal) || chartSignals[0];
  const age = measuredLatest
    ? Math.max(
        0,
        Math.floor(
          (now -
            Date.parse(measuredLatest.receivedAt || measuredLatest.timestamp)) /
            1000,
        ),
      )
    : null;
  const receipt = time(latest?.receivedAt || latest?.timestamp);
  const simulation = latest?.source === 'simulation';
  return (
    <Tooltip.Provider delayDuration={250}>
      <div className="app">
        <a className="skip-link" href="#main">
          Skip to monitoring
        </a>
        <div className="workspace">
          <header className="topbar">
            <div className="topbar-left">
              <Brand />
              <Dialog.Root open={mobileNav} onOpenChange={setMobileNav}>
                <Dialog.Trigger asChild>
                  <button
                    className="icon-button mobile-menu"
                    aria-label="Open navigation"
                  >
                    <Menu size={20} />
                  </button>
                </Dialog.Trigger>
                <Dialog.Portal>
                  <Dialog.Overlay className="dialog-overlay" />
                  <Dialog.Content
                    className="mobile-nav-content"
                    onCloseAutoFocus={(event) => {
                      if (navigationTarget.current) {
                        event.preventDefault();
                        const id = navigationTarget.current;
                        navigationTarget.current = null;
                        requestAnimationFrame(() => {
                          const target = document.getElementById(id);
                          target?.scrollIntoView({ block: 'start' });
                          const heading = target?.querySelector('h1,h2');
                          heading?.setAttribute('tabindex', '-1');
                          heading?.focus({ preventScroll: true });
                        });
                      }
                    }}
                  >
                    <Dialog.Title className="sr-only">
                      Workspace navigation
                    </Dialog.Title>
                    <Dialog.Description className="sr-only">
                      Navigate to monitoring sections.
                    </Dialog.Description>
                    <div className="mobile-nav-heading">
                      <Brand />
                      <Dialog.Close asChild>
                        <button
                          className="icon-button"
                          aria-label="Close navigation"
                        >
                          <X size={20} />
                        </button>
                      </Dialog.Close>
                    </div>
                    <Nav
                      active={nav}
                      activeCount={active.length}
                      onNavigate={(id) => {
                        setNav(id);
                        navigationTarget.current = id;
                        setMobileNav(false);
                      }}
                    />
                  </Dialog.Content>
                </Dialog.Portal>
              </Dialog.Root>
              <div className="breadcrumbs">
                <span>Workspace</span>
                <ChevronRight size={13} />
                <strong>{navItems.find((n) => n.id === nav)?.label}</strong>
              </div>
            </div>
            <div className="desktop-navigation">
              <Nav
                active={nav}
                onNavigate={setNav}
                activeCount={active.length}
              />
            </div>
            <div className="topbar-actions">
              <div
                role="status"
                aria-live="polite"
                className={`connection ${live ? 'live' : 'offline'}`}
              >
                <i />
                {connection}
              </div>
              <div className="topbar-divider" />
              <SimulationPanel
                config={config}
                busy={busy}
                enabled={device.simulationEnabled !== false}
                error={error}
                onChange={update}
              />
            </div>
          </header>
          <main id="main">
            <section
              className="overview"
              id="overview"
              aria-labelledby="overview-title"
            >
              <div className="page-heading">
                <div>
                  <h1 id="overview-title">Energy overview</h1>
                  <p>
                    A clear view of every signal. A closer look at your system.
                  </p>
                </div>
                <button
                  className="button secondary export-button"
                  disabled={!samples.length}
                  onClick={() => exportTelemetry(measuredSamples, deviceId)}
                >
                  <ArrowDownToLine size={15} />
                  Export readings
                </button>
              </div>
              {error && (
                <div role="alert" className="error-notice">
                  <TriangleAlert size={17} />
                  <span>{error}</span>
                </div>
              )}
              <div className="context-strip">
                <div className="context-device">
                  <Cpu size={14} />
                  <strong>{deviceId}</strong>
                  <span className="context-separator">/</span>
                  <span>{profiles[profile]}</span>
                </div>
                <div className="context-source">
                  <span
                    className={`source-label ${simulation ? 'simulated' : ''}`}
                  >
                    {!measuredLatest
                      ? 'Awaiting source'
                      : simulation
                        ? 'Simulated data'
                        : 'Device data'}
                  </span>
                  <span
                    className={`overview-connection ${live ? 'is-live' : ''}`}
                  >
                    <i className={`signal-dot ${live ? 'is-live' : ''}`} />
                    {connection}
                  </span>
                </div>
              </div>
              <div className="overview-summary">
                <a
                  className={`condition-link ${active.length ? 'has-conditions' : ''}`}
                  href="#events"
                  onClick={() => setNav('events')}
                >
                  {active.length ? (
                    <TriangleAlert size={16} />
                  ) : (
                    <ShieldCheck size={16} />
                  )}
                  {active.length} active conditions
                  <ChevronRight size={14} />
                </a>
                <span className="receipt-label">
                  Last received <time>{receipt}</time>
                  <span>
                    {age === null ? 'Awaiting telemetry' : `${age}s ago`}
                  </span>
                </span>
              </div>
              {latest.demoFields.length > 0 && (
                <p className="demo-disclosure">
                  <FlaskConical size={16} />
                  <span>
                    <strong>Demo values:</strong>{' '}
                    {latest.demoFields
                      .map(
                        (key) =>
                          metricSpecs.find((spec) => spec.key === key)?.title,
                      )
                      .join(', ')}
                    . These are presentation examples, not measured readings.
                  </span>
                </p>
              )}
              <section
                className="metrics"
                aria-label="Current electrical readings"
              >
                {[metricSpecs.slice(0, 4), metricSpecs.slice(4)].map(
                  (group, index) => (
                    <div
                      key={index}
                      className={`metric-group ${index ? 'supporting-readings' : 'electrical-readings'}`}
                    >
                      {group.map((spec) => (
                        <Metric
                          key={spec.key}
                          spec={spec}
                          latest={latest}
                          samples={profileSamples}
                          active={active}
                          live={live}
                          selected={selectedSignal === spec.key}
                          onSelect={() => setSelectedSignal(spec.key)}
                        />
                      ))}
                    </div>
                  ),
                )}
              </section>
            </section>
            <section className="telemetry-section" id="telemetry">
              <div className="section-title">
                <div>
                  <h2>Signal analysis</h2>
                  <p>
                    Latest {samples.length} samples · retained across refreshes
                  </p>
                </div>
                <div className="analysis-actions">
                  <SelectField
                    label="Chart sample window"
                    value={windowSize}
                    options={{
                      30: 'Last 30 samples',
                      60: 'Last 60 samples',
                      100: 'Last 100 samples',
                    }}
                    onChange={setWindowSize}
                  />
                </div>
              </div>
              <div className="analysis-layout">
                <div className="signal-main">
                  <Tabs.Root
                    value={selectedSignal}
                    onValueChange={setSelectedSignal}
                    className="signal-tabs"
                  >
                    <Tabs.List aria-label="Primary signal">
                      {signals.slice(0, 4).map((spec) => (
                        <Tabs.Trigger key={spec.key} value={spec.key}>
                          {spec.title}
                        </Tabs.Trigger>
                      ))}
                    </Tabs.List>
                    <Tabs.Content value={selectedSignal}>
                      <SignalChart
                        spec={selectedSpec}
                        samples={profileSamples}
                        primary
                        live={live}
                      />
                    </Tabs.Content>
                  </Tabs.Root>
                </div>
                <aside className="panel device-panel" id="device">
                  <div className="inspector-heading">
                    <span className="overline">Device inspector</span>
                    <Cpu size={16} />
                  </div>
                  <div className="device-identity">
                    <span className="device-avatar">
                      <Cpu size={26} strokeWidth={1.4} />
                      <i className={live ? 'online' : ''} />
                    </span>
                    <div>
                      <h2>{deviceId}</h2>
                      <span>{profiles[profile]} monitor</span>
                    </div>
                  </div>
                  <div
                    className={`status ${status === 'CRITICAL' ? 'critical' : status === 'OFFLINE' ? 'offline' : status === 'WARNING' ? 'warning' : ''}`}
                  >
                    {status === 'HEALTHY' ? (
                      <ShieldCheck size={13} />
                    ) : status === 'CRITICAL' ? (
                      <TriangleAlert size={13} />
                    ) : (
                      <Activity size={13} />
                    )}
                    <span>{status}</span>
                  </div>
                  <dl className="device-facts">
                    <div>
                      <dt>Data source</dt>
                      <dd>
                        {!measuredLatest
                          ? 'Waiting'
                          : simulation
                            ? 'Simulator'
                            : 'Device'}
                      </dd>
                    </div>
                    <div>
                      <dt>Last received</dt>
                      <dd>{receipt}</dd>
                    </div>
                    <div>
                      <dt>Signal age</dt>
                      <dd>{age === null ? '—' : `${age}s ago`}</dd>
                    </div>
                    <div>
                      <dt>Active conditions</dt>
                      <dd className={active.length ? 'fact-abnormal' : ''}>
                        {active.length}
                      </dd>
                    </div>
                  </dl>
                  <div className="transport-heading">
                    Connection diagnostics
                  </div>
                  <div className="transport-row">
                    <span>MQTT broker</span>
                    <span
                      className={`transport-status ${health?.mqttConnected ? 'ready' : ''}`}
                    >
                      <i />
                      {health
                        ? health.mqttConnected
                          ? 'Connected'
                          : 'Disconnected'
                        : 'Unavailable'}
                    </span>
                  </div>
                  <div className="transport-row">
                    <span>Live connection</span>
                    <span
                      className={`transport-status ${connected ? 'ready' : ''}`}
                    >
                      <i />
                      {connected ? 'Connected' : 'Reconnecting'}
                    </span>
                  </div>
                  <div className="inspector-footer">
                    <SlidersHorizontal size={13} />
                    <span>
                      {simulation
                        ? scenarios[config.mode]
                        : 'Monitoring active'}
                    </span>
                  </div>
                </aside>
              </div>
              <div className="secondary-charts">
                {chartSignals
                  .slice(0, 4)
                  .filter((spec) => spec.key !== selectedSignal)
                  .map((spec) => (
                    <SignalChart
                      key={spec.key}
                      spec={spec}
                      samples={profileSamples}
                    />
                  ))}
              </div>
              {battery && (
                <>
                  <BatteryDetails latest={latest} />
                  <div className="battery-charts">
                    {chartSignals.slice(4).map((spec) => (
                      <SignalChart
                        key={spec.key}
                        spec={spec}
                        samples={profileSamples}
                      />
                    ))}
                  </div>
                </>
              )}
            </section>
            <EventLog alerts={alerts} active={active} />
            <footer className="page-footer">
              <span>
                <span className="footer-mark">
                  <Zap size={12} />
                </span>
                VoltGuard<span className="footer-separator">/</span>Device
                monitoring
              </span>
              <span>
                {simulation
                  ? 'Software demonstration · hardware calibration pending'
                  : 'Physical measurements require sensor calibration'}
                <ArrowUpRight size={12} />
              </span>
            </footer>
          </main>
        </div>
      </div>
    </Tooltip.Provider>
  );
}

import { useEffect, useMemo, useState } from 'react';
import { validateTelemetry } from '../../../shared/telemetry.js';

export const API = (
  import.meta.env.VITE_API_URL || 'http://localhost:3001'
).replace(/\/$/, '');
const WS = API.replace(/^http/, 'ws') + '/ws';
const merge = (previous, incoming) =>
  [...new Map([...previous, ...incoming].map((s) => [s.id, s])).values()]
    .sort((a, b) => a.id - b.id)
    .slice(-100);

export function useTelemetry() {
  const [samples, setSamples] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [connected, setConnected] = useState(false);
  const [config, setConfig] = useState({ mode: 'NORMAL', profile: '12V' });
  const [device, setDevice] = useState({ offlineMs: 5000 });
  const [health, setHealth] = useState(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    let alive = true,
      socket,
      retry,
      deviceId;
    const controller = new AbortController();
    const request = async (path) => {
      const response = await fetch(API + path, {
        signal: AbortSignal.any([controller.signal, AbortSignal.timeout(5000)]),
      });
      if (!response.ok) throw new Error('Backend unavailable');
      return response.json();
    };
    const readHealth = async () => {
      try {
        const next = await request('/api/health');
        if (alive) setHealth(next);
      } catch {
        if (alive) setHealth(null);
      }
    };
    const load = async () => {
      try {
        const next = await request('/api/device');
        if (!alive) return;
        deviceId = next.deviceId;
        const query = `deviceId=${encodeURIComponent(deviceId)}`;
        const [history, events] = await Promise.all([
          request(`/api/history?limit=100&${query}`),
          request(`/api/alerts?${query}`),
        ]);
        if (!alive) return;
        setSamples((current) => merge(history, current));
        setAlerts((current) => {
          const merged = new Map([...events, ...current].map((a) => [a.id, a]));
          // Recovery is final for an event ID, including during a REST/socket race.
          for (const event of events)
            if (!event.active) merged.set(event.id, event);
          return [...merged.values()].sort((a, b) => b.id - a.id).slice(0, 30);
        });
        setDevice(next);
        setConfig({ mode: next.mode, profile: next.profile });
        setError('');
      } catch {
        if (alive)
          setError(
            'Backend unavailable. The dashboard will reconnect automatically.',
          );
      }
    };
    const connect = () => {
      socket = new WebSocket(WS);
      socket.onopen = () => {
        if (alive) {
          setConnected(true);
          load();
          readHealth();
        }
      };
      socket.onmessage = (event) => {
        if (!alive) return;
        try {
          const packet = JSON.parse(event.data);
          if (
            ['telemetry', 'alert'].includes(packet.type) &&
            (!deviceId || packet.data?.deviceId !== deviceId)
          )
            return;
          if (packet.type === 'telemetry') {
            validateTelemetry(packet.data);
            setSamples((current) => merge(current, [packet.data]));
          }
          if (packet.type === 'alert' && packet.data?.id)
            setAlerts((current) =>
              [
                packet.data,
                ...current.filter((a) => a.id !== packet.data.id),
              ].slice(0, 30),
            );
          if (packet.type === 'simulation') setConfig(packet.data);
        } catch {
          /* Invalid messages never reach the visual components. */
        }
      };
      socket.onclose = () => {
        if (alive) {
          setConnected(false);
          retry = setTimeout(connect, 1500);
        }
      };
      socket.onerror = () => socket.close();
    };
    load();
    readHealth();
    connect();
    const healthTimer = setInterval(readHealth, 5000);
    return () => {
      alive = false;
      controller.abort();
      clearTimeout(retry);
      clearInterval(healthTimer);
      socket?.close();
    };
  }, []);

  const latest = samples.at(-1);
  const active = useMemo(() => alerts.filter((a) => a.active), [alerts]);
  const live = Boolean(
    connected &&
    latest &&
    now - Date.parse(latest.receivedAt || latest.timestamp) < device.offlineMs,
  );
  const connection = live
    ? 'LIVE'
    : connected
      ? latest
        ? 'OFFLINE'
        : 'AWAITING TELEMETRY'
      : 'RECONNECTING';
  const status = !latest
    ? 'AWAITING DATA'
    : !live
      ? 'OFFLINE'
      : latest.status.toUpperCase();

  async function update(next) {
    setBusy(true);
    setError('');
    try {
      const response = await fetch(API + '/api/simulator/mode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...config, ...next }),
        signal: AbortSignal.timeout(5000),
      });
      if (!response.ok)
        throw new Error(
          'Simulation settings could not be changed. Check server access.',
        );
      setConfig(await response.json());
      return true;
    } catch (e) {
      setError(e.message);
      return false;
    } finally {
      setBusy(false);
    }
  }

  return {
    samples,
    alerts,
    active,
    connected,
    config,
    device,
    health,
    busy,
    error,
    now,
    latest,
    live,
    connection,
    status,
    update,
  };
}

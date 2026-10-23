import { WebSocketServer } from 'ws';
import { config } from './config.js';

export function createWebSocketServer(server) {
  const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 16384 });

  const broadcast = (packet) => {
    const data = JSON.stringify(packet);
    for (const c of wss.clients)
      if (c.readyState === 1) { // WebSocket.OPEN
        if (c.bufferedAmount > 1024 * 1024) c.terminate();
        else c.send(data);
      }
  };

  wss.on('connection', (socket, req) => {
    if (req.headers.origin && !config.origins.includes(req.headers.origin)) {
      socket.close(1008, 'Origin denied');
      return;
    }
    socket.alive = true;
    socket.on('pong', () => (socket.alive = true));
    socket.on('error', () => socket.terminate());
    console.log('[WS] Client connected');
    socket.on('close', () => console.log('[WS] Client disconnected'));
  });

  const heartbeat = setInterval(() => {
    for (const c of wss.clients) {
      if (!c.alive) c.terminate();
      else {
        c.alive = false;
        c.ping();
      }
    }
  }, 15000);

  return { wss, broadcast, heartbeat };
}
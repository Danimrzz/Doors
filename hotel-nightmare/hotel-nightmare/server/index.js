// Servidor HTTP estático + WebSocket del juego. Uso: node server/index.js  (PORT opcional)
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import { RoomManager, cleanName } from './rooms.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = +process.env.PORT || 3000;
const MIME = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.svg': 'image/svg+xml', '.png': 'image/png', '.txt': 'text/plain; charset=utf-8', '.ico': 'image/x-icon' };

const server = http.createServer((req, res) => {
  let url = decodeURIComponent((req.url || '/').split('?')[0]);
  if (url === '/healthz') { res.writeHead(200); return res.end('ok'); }
  if (url === '/') url = '/index.html';
  let file;
  if (url.startsWith('/shared/')) file = path.join(ROOT, url);
  else file = path.join(ROOT, 'client', url);
  file = path.normalize(file);
  const allowed = [path.join(ROOT, 'client') + path.sep, path.join(ROOT, 'shared') + path.sep];
  if (!allowed.some((a) => file.startsWith(a))) { res.writeHead(403); return res.end('Prohibido'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('No encontrado'); }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(data);
  });
});

const wss = new WebSocketServer({ server, path: '/ws', maxPayload: 4096 });
const manager = new RoomManager();
let nextId = 1;

wss.on('connection', (ws) => {
  const conn = {
    id: 'p' + nextId++, ws, name: 'Jugador', room: null, alive: true, joinedAt: Date.now(),
    sendRaw(s) { if (ws.readyState === 1) ws.send(s); },
    send(o) { this.sendRaw(JSON.stringify(o)); },
  };
  ws.on('pong', () => { conn.alive = true; });
  ws.on('message', (data) => {
    let m;
    try { m = JSON.parse(data.toString()); } catch { return; }
    if (!m || typeof m.t !== 'string') return;
    handle(conn, m);
  });
  const cleanup = () => { if (conn.room) conn.room.leave(conn); };
  ws.on('close', cleanup);
  ws.on('error', cleanup);
  conn.send({ t: 'hello', id: conn.id });
});

function handle(conn, m) {
  switch (m.t) {
    case 'ping': return conn.send({ t: 'pong', c: m.c });
    case 'create': {
      conn.name = cleanName(m.name);
      const room = manager.create(conn);
      return room.sendLobby();
    }
    case 'join': {
      conn.name = cleanName(m.name);
      const r = manager.join(conn, m.code);
      if (r.err) return conn.send({ t: 'err', m: r.err });
      r.room.broadcast({ t: 'joined', id: conn.id, name: conn.name });
      r.room.sendLobby();
      // unirse a una partida en curso
      if (r.room.state === 'playing' && r.room.game) r.room.game.addPlayer(conn);
      return;
    }
    case 'leave': return conn.room && conn.room.leave(conn);
    case 'name': { conn.name = cleanName(m.name); if (conn.room) conn.room.sendLobby(); return; }
    case 'settings': return conn.room && conn.room.setSettings(conn, m);
    case 'start': return conn.room && conn.room.start(conn);
    default:
      if (conn.room && conn.room.game) conn.room.game.onMessage(conn, m);
  }
}

setInterval(() => {
  for (const ws of wss.clients) {
    if (ws.isAlive === false) { ws.terminate(); continue; }
    ws.isAlive = false; ws.ping();
  }
}, 15000);
wss.on('connection', (ws) => { ws.isAlive = true; ws.on('pong', () => { ws.isAlive = true; }); });

server.listen(PORT, '0.0.0.0', () => console.log(`HOTEL NIGHTMARE escuchando en http://localhost:${PORT}`));
export { server, wss, manager };

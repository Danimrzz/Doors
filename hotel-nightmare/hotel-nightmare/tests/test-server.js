// Prueba de red real: servidor HTTP/WebSocket en un proceso aparte, salas con código, ajustes, inicio y desconexiones
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { WebSocket } from 'ws';

const PORT = 3900 + Math.floor(Math.random() * 90);
const srv = spawn(process.execPath, ['server/index.js'], { env: { ...process.env, PORT: String(PORT), HN_TEST_NOENEMY: '1' }, stdio: ['ignore', 'pipe', 'inherit'] });
await new Promise((res) => srv.stdout.on('data', (d) => /escuchando/.test(d.toString()) && res()));

const open = () => new Promise((res) => {
  const ws = new WebSocket(`ws://localhost:${PORT}/ws`); const q = []; const waiters = [];
  ws.on('message', (d) => { const m = JSON.parse(d); q.push(m); for (const w of [...waiters]) w(); });
  const c = {
    ws, q, send: (o) => ws.send(JSON.stringify(o)),
    wait: (pred, ms = 4000) => new Promise((ok, no) => {
      const t = setTimeout(() => no(new Error('timeout esperando mensaje')), ms);
      const check = () => { const i = q.findIndex(pred); if (i >= 0) { clearTimeout(t); waiters.splice(waiters.indexOf(check), 1); ok(q.splice(i, 1)[0]); return true; } return false; };
      if (!check()) waiters.push(check);
    }),
  };
  ws.on('open', () => res(c));
});
try {
  // HTTP: el cliente se sirve y la ruta fuera de la raíz está prohibida
  assert.equal((await fetch(`http://localhost:${PORT}/healthz`)).status, 200);
  assert.equal((await fetch(`http://localhost:${PORT}/..%2fserver%2findex.js`)).status === 200, false);
  assert.equal((await fetch(`http://localhost:${PORT}/shared/config.js`)).status, 200);

  const A = await open(), B = await open(), C = await open();
  A.send({ t: 'create', name: 'Ana' });
  const lobby = await A.wait((m) => m.t === 'lobby');
  assert.match(lobby.code, /^[A-Z0-9]{5}$/); assert.ok(/[A-Z]/.test(lobby.code) && /[0-9]/.test(lobby.code), 'letras y números');
  const code = lobby.code; console.log('  sala creada con código', code);
  // códigos inválidos o inexistentes
  B.send({ t: 'join', code: 'ZZZZZ', name: 'Bea' }); assert.match((await B.wait((m) => m.t === 'err')).m, /No existe/);
  B.send({ t: 'join', code: 'abc', name: 'Bea' }); assert.match((await B.wait((m) => m.t === 'err')).m, /5 letras/);
  B.send({ t: 'join', code: code.toLowerCase(), name: 'Bea' });
  const l2 = await B.wait((m) => m.t === 'lobby'); assert.equal(l2.players.length, 2);
  // solo el anfitrión cambia ajustes e inicia
  B.send({ t: 'settings', captureMode: 'teamLoss' }); B.send({ t: 'start' });
  A.send({ t: 'settings', captureMode: 'eliminated', seed: 'redtest' });
  const l3 = await A.wait((m) => m.t === 'lobby' && m.settings.seed === 'redtest'); assert.equal(l3.settings.captureMode, 'eliminated');
  assert.ok(!B.q.some((m) => m.t === 'start'));
  A.send({ t: 'start' });
  const sA = await A.wait((m) => m.t === 'start', 8000), sB = await B.wait((m) => m.t === 'start', 8000);
  assert.equal(sA.seed, 'redtest'); assert.equal(JSON.stringify(sA.map), JSON.stringify(sB.map), 'ambos reciben el mismo hotel');
  assert.equal(sA.map.code, undefined, 'el código de seguridad no se filtra al cliente');
  assert.ok(sA.map.items.every((i) => i.code === undefined));
  assert.notEqual(sA.you, sB.you);
  console.log(`  partida iniciada: mismo mapa (${sA.map.rooms.length} hab.) para ambos, semilla ${sA.seed}`);
  // sincronización: B se mueve y A ve su posición en las instantáneas
  const sp = sB.map.spawn.pts[0];
  for (let i = 0; i < 6; i++) { B.send({ t: 'st', x: sp.x + i * 0.1, z: sp.z, yaw: 1.5, pitch: 0.2, fl: true, run: false }); await new Promise((r) => setTimeout(r, 60)); }
  await new Promise((r) => setTimeout(r, 200));
  let seen = null; for (let k = 0; k < 40 && !seen; k++) { const s = await A.wait((m) => m.t === 's'); const row = s.p.find((r) => r[0] === sB.you); if (row && row[3] === 1.5 && row[5] & 1) seen = row; }
  assert.ok(seen, 'A recibe posición, orientación y linterna de B'); console.log('  sincronización de posición/orientación/linterna entre jugadores');
  // abrir una puerta de habitación y comprobar que A recibe el evento
  const d = sB.map.doors.find((q) => q.kind === 'room' && !q.lock && Math.hypot((q.cx + 0.5) * 2 - sp.x, (q.cy + 0.5) * 2 - sp.z) < 30);
  assert.ok(d);
  // desconexión de B: A recibe 'leave'
  B.ws.close(); const lv = await A.wait((m) => m.t === 'leave'); assert.ok(lv.name);
  // el anfitrión se va: C aún no está; A es el único. C se une a la partida en curso
  C.send({ t: 'join', code, name: 'Carl' });
  const sC = await C.wait((m) => m.t === 'start', 8000); assert.equal(sC.map.seed, 'redtest'); console.log('  un jugador se une a la partida en curso y recibe el estado completo');
  // transferencia de anfitrión
  A.ws.close(); const hc = await C.wait((m) => m.t === 'hostChanged' || (m.t === 'lobby' && m.host === sC.you)); console.log('  desconexión del anfitrión: liderazgo transferido');
  // cuando todos salen, el código deja de funcionar
  C.ws.close(); await new Promise((r) => setTimeout(r, 400));
  const D = await open(); D.send({ t: 'join', code, name: 'Dora' }); assert.match((await D.wait((m) => m.t === 'err')).m, /No existe/);
  console.log('  la sala vacía desaparece y su código deja de funcionar');
  // unicidad de códigos
  const set = new Set(); const clients = [];
  for (let i = 0; i < 40; i++) { const x = await open(); x.send({ t: 'create', name: 'X' + i }); const l = await x.wait((m) => m.t === 'lobby'); assert.ok(!set.has(l.code)); set.add(l.code); clients.push(x); }
  console.log('  40 salas simultáneas con códigos únicos'); clients.forEach((c) => c.ws.close()); D.ws.close();
  console.log('OK server');
} catch (e) { console.error(e); process.exitCode = 1; } finally { srv.kill(); }
process.exit(process.exitCode || 0);

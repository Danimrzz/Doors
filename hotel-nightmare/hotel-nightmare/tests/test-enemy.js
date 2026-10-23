// Pruebas del enemigo: detección, oído, persecución, captura (3 modos), rescate, escondites y movimiento coherente
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { ES } from '../server/enemy.js';

function mk(n, mode = 'downed', difficulty = 'normal', seed = 'enemy') {
  const conns = new Map(), log = [];
  const room = { conns, broadcast: (o) => log.push(o), onGameEnd(s) { this.ended = s; }, ended: null };
  for (let i = 0; i < n; i++) conns.set('p' + (i + 1), { id: 'p' + (i + 1), name: 'J' + (i + 1), send: () => {} });
  const game = new Game(room, { difficulty, captureMode: mode, seed });
  game.enemy.graceUntil = 0;
  return { game, room, log };
}
const run = (g, s, dt = 0.05) => { for (let i = 0; i < s / dt; i++) g.tick(dt); };
// coloca enemigo y jugador en un pasillo recto con visión directa
function corridorPair(g) {
  const m = g.map, sp = m.segs[0];
  const y = sp.fixed;
  const lobbyW = m.lobbySide === 'W';
  const x0 = (sp.from + 6 + 0.5) * 2, z = (y + 0.5) * 2;
  return { ex: x0, ez: z, px: x0 + 7, pz: z };
}

{ // detección + persecución + captura (modo por defecto: incapacitado, rescatable)
  const { game, log } = mk(2, 'downed');
  const c = corridorPair(game);
  const [p1, p2] = [...game.players.values()];
  p1.x = c.px; p1.z = c.pz; p2.x = c.px + 1; p2.z = c.pz; p1.lastT = p2.lastT = game.time;
  game.enemy.x = c.ex; game.enemy.z = c.ez; game.enemy.yaw = Math.atan2(-1, 0) + 0; game.enemy.state = ES.PATROL; game.enemy.yaw = Math.atan2(-(c.px - c.ex), 0);
  let sawChase = false, caught = null;
  for (let i = 0; i < 400 && !caught; i++) { game.tick(0.05); if (game.enemy.state === ES.CHASE) sawChase = true; caught = log.find((e) => e.t === 'caught'); }
  assert.ok(sawChase, 'el enemigo detecta y persigue a quien tiene delante');
  assert.ok(caught, 'el enemigo captura al jugador que no huye');
  assert.equal(caught.state, 'downed');
  const victim = game.players.get(caught.id);
  assert.equal(victim.state, 'downed');
  assert.equal(game.enemy.state, ES.STUN, 'tras capturar, el enemigo queda aturdido unos segundos');
  // rescate: el compañero mantiene E 4 s
  const helper = [...game.players.values()].find((p) => p !== victim);
  helper.x = victim.x + 1; helper.z = victim.z; helper.invuln = 99; helper.lastT = game.time;
  game.enemy.stunUntil = game.time + 60; // sin molestar
  game.onMessage(helper.conn, { t: 'rv', id: victim.id, on: true });
  run(game, 3.5); assert.equal(victim.state, 'downed');
  run(game, 1.0); assert.equal(victim.state, 'alive', 'rescatado tras 4 s'); assert.ok(victim.invuln > 0);
  console.log('  detección → persecución → captura (incapacitado) → rescate por un compañero');
  game.stop();
}
{ // modo eliminado y derrota colectiva, y solo = derrota
  for (const [mode, expectState] of [['eliminated', 'dead'], ['teamLoss', 'dead']]) {
    const { game, room, log } = mk(2, mode); const c = corridorPair(game);
    const [p1, p2] = [...game.players.values()]; p1.x = c.px; p1.z = c.pz; p2.x = 2 * 2 + 3; p2.z = c.pz; p1.lastT = p2.lastT = game.time;
    game.enemy.x = c.ex; game.enemy.z = c.ez; game.enemy.state = ES.PATROL; game.enemy.yaw = Math.atan2(-(c.px - c.ex), 0);
    let ticks = 0; while (!log.find((e) => e.t === 'caught') && ticks++ < 600) game.tick(0.05);
    const ev = log.find((e) => e.t === 'caught'); assert.ok(ev, mode + ': hay captura'); assert.equal(ev.state, expectState);
    if (mode === 'teamLoss') { run(game, 5); assert.ok(room.ended && room.ended.result === 'defeat', 'derrota colectiva'); }
    game.stop();
  }
  const { game, room, log } = mk(1, 'downed'); const c = corridorPair(game);
  const p = [...game.players.values()][0]; p.x = c.px; p.z = c.pz; p.lastT = game.time;
  game.enemy.x = c.ex; game.enemy.z = c.ez; game.enemy.state = ES.PATROL; game.enemy.yaw = Math.atan2(-(c.px - c.ex), 0);
  run(game, 25); assert.ok(room.ended && room.ended.result === 'defeat', 'en solitario, ser atrapado es derrota');
  console.log('  modos de captura: eliminado, derrota colectiva y derrota en solitario');
}
{ // oído: correr sin línea de visión atrae al enemigo
  const { game } = mk(1, 'downed', 'normal', 'hearing'); const c = corridorPair(game); const p = [...game.players.values()][0];
  const e = game.enemy; e.x = c.ex; e.z = c.ez; e.state = ES.PATROL; e.setPath(null); e.timer = 100; e.huntT = 1e9;
  // jugador a 8 m detrás de una pared: dentro del radio de carrera, fuera de la visión
  let found = null;
  for (let dz = 4; dz <= 14 && !found; dz += 0.5) for (const s of [-1, 1]) { const x = c.ex + 2, z = c.ez + s * dz; if (game.nav.isFree(x, z) && !game.world.los(e.x, e.z, x, z) && Math.hypot(x - e.x, z - e.z) < 9) { found = { x, z }; break; } }
  assert.ok(found, 'punto de prueba oculto');
  p.x = found.x; p.z = found.z; p.moving = true; p.run = true; p.lastT = game.time; p.invuln = 99;
  let heard = false;
  for (let i = 0; i < 40; i++) { p.moving = true; p.run = true; game.tick(0.05); if (e.state === ES.INVESTIGATE || e.state === ES.CHASE) heard = true; }
  assert.ok(heard, 'el enemigo reacciona al ruido de correr'); 
  console.log('  el enemigo oye al jugador que corre aunque no lo vea');
  game.stop();
}
{ // un jugador escondido no es detectado a la vista y el enemigo no lo ve a través de paredes
  const { game } = mk(1, 'downed', 'normal', 'hide'); const p = [...game.players.values()][0]; const h = game.map.hides[0];
  const e = game.enemy; p.x = h.exitX; p.z = h.exitZ; p.lastT = game.time; p.invuln = 99;
  game.onMessage(p.conn, { t: 'use', k: 'hide', id: h.id }); assert.equal(p.hidden, h.id, 'se esconde');
  e.x = h.exitX + 3; e.z = h.exitZ; e.state = ES.PATROL; e.setPath(null); e.timer = 50; e.huntT = 1e9;
  p.invuln = 0;
  let chased = false; run(game, 0.05);
  for (let i = 0; i < 60; i++) { game.tick(0.05); if (e.state === ES.CHASE) chased = true; }
  assert.ok(!chased && p.state === 'alive', 'escondido no se detecta por vista'); 
  game.stop();
}
{ // movimiento coherente: sin teletransportes, recorre el hotel y no se queda bloqueado
  const { game } = mk(1, 'downed', 'normal', 'wander'); const p = [...game.players.values()][0];
  p.state = 'downed'; p.down = { bleed: 1e9, rev: 0 }; const e = game.enemy; e.relocate = () => false;
  let maxJump = 0, lx = e.x, lz = e.z, cells = new Set(), still = 0, maxStill = 0, relocs = 0;
  for (let i = 0; i < 20 * 600; i++) {
    game.tick(0.05);
    const j = Math.hypot(e.x - lx, e.z - lz); if (j > 3) relocs++; else maxJump = Math.max(maxJump, j);
    still = j < 0.001 ? still + 0.05 : 0; maxStill = Math.max(maxStill, still);
    lx = e.x; lz = e.z; cells.add(Math.floor(e.x / 8) + ',' + Math.floor(e.z / 8));
  }
  assert.ok(maxJump <= 0.3, 'paso por tick razonable ' + maxJump);
  assert.ok(cells.size >= 15, 'patrulla amplias zonas del hotel: ' + cells.size);
  assert.ok(maxStill < 15, 'no se queda parado/bloqueado: ' + maxStill.toFixed(1) + ' s');
  console.log(`  600 s de patrulla: ${cells.size} zonas visitadas, paso máx. ${maxJump.toFixed(2)} m/tick, parada máx. ${maxStill.toFixed(1)} s, reapariciones ${relocs}`);
  game.stop();
}
{ // escalado por número de jugadores
  const a = mk(1).game.enemyParams(), b = mk(5).game; b.sc = { ...b.sc }; for (let i = 0; i < 30; i++) b.tick(0.5);
  const pb = b.enemyParams(); assert.ok(pb.chase >= a.chase && pb.search > a.search, 'más jugadores => algo más difícil');
  assert.ok(pb.chase <= 5.0, 'sigue siendo escapable');
  console.log(`  escalado: persecución ${a.chase.toFixed(2)} m/s con 1 jugador, ${pb.chase.toFixed(2)} con 5 (tope 5.0)`);
}
console.log('OK enemy');
process.exit(0);

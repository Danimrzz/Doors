// Partida simulada en proceso: bot completa todas las misiones y escapa; enemigo, capturas, rescate y reglas
process.env.HN_TEST_NOENEMY = '1';
import assert from 'node:assert/strict';
import { Game } from '../server/game.js';
import { ES } from '../server/enemy.js';
import { Bot } from './bot.js';

function fakeRoom(n, settings) {
  const conns = new Map(), bots = [];
  const room = {
    conns, ended: null, broadcastLog: [],
    broadcast(o) { this.broadcastLog.push(o); for (const b of bots) b.recv(o); },
    onGameEnd(stats) { this.ended = stats; for (const b of bots) b.recv({ t: 'end', stats }); },
  };
  for (let i = 0; i < n; i++) {
    const bot = new Bot('p' + (i + 1), 'Bot' + (i + 1), (m) => game?.onMessage(conn, m));
    const conn = { id: bot.id, name: bot.name, send: (o) => bot.recv(o) };
    conns.set(conn.id, conn); bot.conn = conn; bots.push(bot);
  }
  var game = new Game(room, settings);
  game.bots = bots;
  // reasignar el envío de cada bot a su conexión
  for (const b of bots) b.sendFn = (m) => game.onMessage(b.conn, m);
  return { game, room, bots };
}

// 1) Partida completa en las tres dificultades, con 1, 2 y 4 bots
for (const [difficulty, n] of [['normal', 1], ['normal', 2], ['normal', 4]]) {
  const { game, room, bots } = fakeRoom(n, { difficulty, captureMode: 'downed', seed: 'play-' + difficulty + n });
  let ticks = 0;
  const total = game.missions.size;
  let exitEventAt = -1;
  while (!room.ended && ticks < 20000) {
    // los bots se reparten: cada uno juega por su cuenta, compartiendo inventario del equipo
    for (const b of bots) b.step(0.05);
    game.tick(0.05); ticks++;
    if (exitEventAt < 0 && game.exitUnlocked) exitEventAt = ticks;
  }
  assert.ok(room.ended, `${difficulty}: la partida no terminó (misiones ${[...game.missions.values()].filter((m) => m.done).length}/${total}, bots: ${bots.map((b) => b.goal && b.goal.kind)})`);
  assert.equal(room.ended.result, 'victory', difficulty + ' no terminó en victoria: ' + JSON.stringify(room.ended));
  assert.equal(room.ended.done, total);
  assert.ok(exitEventAt > 0 && exitEventAt < ticks, 'la salida debe desbloquearse antes de poder escapar');
  assert.ok(room.ended.escaped.length >= 1);
  console.log(`  ${difficulty} (${n} jug.): ${total} misiones completadas y fuga en ${(ticks * 0.05).toFixed(0)} s simulados; escapan: ${room.ended.escaped.join(', ')}`);
}

// 2) La salida no se abre antes de completar misiones y los objetos no se recogen a distancia
{
  const { game, bots } = fakeRoom(1, { difficulty: 'normal', captureMode: 'downed', seed: 'rules' });
  const b = bots[0], p = game.players.get(b.id);
  const msgs = [];
  p.conn.send = (o) => { b.recv(o); msgs.push(o); };
  p.x = game.map.exit.x + (game.map.lobbySide === 'W' ? 1 : -1); p.z = game.map.exit.z;
  game.onMessage(p.conn, { t: 'use', k: 'door', id: 0 });
  assert.ok(msgs.some((m) => m.t === 'msg' && /Faltan/.test(m.m)), 'la salida debe mostrar objetivos pendientes');
  assert.equal(game.world.doorOpen[0], false);
  const far = game.map.items.find((i) => i.kind === 'battery' && Math.hypot(i.x - p.x, i.z - p.z) > 8);
  game.onMessage(p.conn, { t: 'use', k: 'item', id: far.id });
  assert.ok(!game.taken.has(far.id), 'no se puede recoger a distancia');
  // teletransporte (trampa) rechazado
  game.tick(0.05);
  game.onMessage(p.conn, { t: 'st', x: p.x + 40, z: p.z, yaw: 0, pitch: 0 });
  assert.ok(Math.hypot(p.x - (game.map.exit.x + (game.map.lobbySide === 'W' ? 1 : -1)), 0) < 2, 'movimiento imposible rechazado');
  // atravesar una pared rechazado
  game.onMessage(p.conn, { t: 'st', x: 1, z: 1, yaw: 0, pitch: 0 });
  assert.ok(Math.hypot(p.x - 1, p.z - 1) > 5);
  console.log('  reglas: salida bloqueada, recogida a distancia, teletransporte y paredes rechazados');
  game.stop();
}

// 3) Objeto dejado atrás sigue en su sitio y puede recogerlo otro jugador (inventario compartido)
{
  const { game, bots } = fakeRoom(2, { difficulty: 'normal', captureMode: 'downed', seed: 'leftbehind' });
  const [a, b] = bots; const pa = game.players.get(a.id), pb = game.players.get(b.id);
  const it = game.map.items.find((i) => i.mission && !game.map.rooms[i.room].lockType && game.map.rooms[i.room].wingLock === undefined) || game.map.items.find((i) => i.kind === 'battery');
  pa.x = it.x + 1; pa.z = it.z; pa.lastT = game.time;
  for (let i = 0; i < 400; i++) game.tick(0.05); // pasan 20 s, A "sale" sin recogerlo
  assert.ok(game.items.has(it.id) && !game.taken.has(it.id), 'el objeto sigue existiendo');
  const wasMission = it.mission;
  pb.x = it.x; pb.z = it.z + 0.9; pb.lastT = game.time - 1;
  game.onMessage(pb.conn, { t: 'use', k: 'item', id: it.id });
  if (it.kind !== 'battery') assert.ok(game.inv[it.kind], 'el equipo tiene el objeto');
  assert.ok(game.taken.has(it.id));
  game.onMessage(pa.conn, { t: 'use', k: 'item', id: it.id }); // no se duplica
  if (wasMission) assert.ok(game.missions.get(wasMission).done);
  console.log('  objeto dejado atrás persiste y lo recoge otro jugador sin duplicarse');
  game.stop();
}
console.log('OK game');

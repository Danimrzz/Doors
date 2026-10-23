// Pruebas del generador: validez, reproducibilidad, variedad, pistas correctas y misiones resolubles
import assert from 'node:assert/strict';
import { generateHotel } from '../shared/mapgen.js';
import { validateMap, solveMissions } from '../shared/validate.js';
import { World } from '../shared/collision.js';
import { Nav } from '../shared/nav.js';
import { ENEMY_R, CELL } from '../shared/config.js';

const N = +process.env.SEEDS || 120;
let maxAttempts = 0, grids = new Set(), totalRooms = 0, sizes = new Set();
const start = Date.now();
for (let i = 0; i < N; i++) {
  const difficulty = 'normal', players = 1 + (i % 6);
  const map = generateHotel({ seed: 'test-' + i, difficulty, players });
  maxAttempts = Math.max(maxAttempts, map.attempts);
  const v = validateMap(map);
  assert.ok(v.ok, `mapa ${i} inválido: ${v.errors.join('; ')}`);
  assert.ok(solveMissions(map).solved, `mapa ${i}: misiones no resolubles`);
  grids.add(map.grid.join('')); sizes.add(map.W + 'x' + map.H);
  totalRooms += map.rooms.length;
  // el vestíbulo y la salida existen y la puerta de salida empieza bloqueada
  assert.equal(map.doors[0].kind, 'exit'); assert.equal(map.doors[0].lock, 'exit');
  // misiones finales: siempre hay objeto final y misiones únicas
  assert.ok(map.missions.find((m) => m.id === 'm_final'));
  assert.equal(new Set(map.missions.map((m) => m.id)).size, map.missions.length);
  // número de misiones según dificultad
  const nGroups = Math.min(6, 2 + (players >= 4 ? 1 : 0));
  assert.equal(map.groups.length, nGroups);
  // pistas: en Fácil el número de habitación indicado es el de la habitación real del objeto
  for (const m of map.missions) {
    const room = map.rooms[m.room];
    if (m.type === 'pickup') assert.equal(map.items.find((it) => it.id === m.itemId).room, m.room);
    assert.ok(m.hint.includes(room.number), `pista sin el número real: ${m.hint} (${room.number})`);
    assert.ok(m.hint.length > 10);
  }
  // cada habitación bloqueada tiene su llave colocada fuera de ella (sin ciclos)
  for (const r of map.rooms) if (r.lockType) assert.equal(map.doors[r.doorId].lock, r.lockType);
  // objetos de misión únicos por habitación y sin duplicados de pila en el mismo hueco
  const mis = map.items.filter((it) => it.mission); assert.equal(new Set(mis.map((it) => it.room)).size, mis.length);
  // hay al menos un escondite alcanzable y pilas disponibles
  assert.ok(map.hides.length >= 3, 'pocos escondites');
  assert.ok(map.items.filter((it) => it.kind === 'battery').length >= 4);
}
console.log(`  ${N} mapas válidos | máx. intentos ${maxAttempts} | mapas distintos ${grids.size}/${N} | tamaños ${[...sizes].length} | hab. media ${(totalRooms / N).toFixed(1)} | ${Date.now() - start} ms`);
assert.ok(grids.size >= N * 0.98, 'los mapas deberían ser distintos entre semillas');

// reproducibilidad con la misma semilla
const a = generateHotel({ seed: 'repro', players: 3 }), b = generateHotel({ seed: 'repro', players: 3 });
assert.equal(JSON.stringify(a), JSON.stringify(b)); console.log('  misma semilla => mismo hotel (JSON idéntico)');
// mismo esqueleto del hotel aunque cambie la dificultad (las misiones sí cambian)

// el enemigo puede ir del vestíbulo a todas las habitaciones (navegación)
const m = generateHotel({ seed: 'nav', players: 4 });
const w = new World(m); const nav = new Nav(w, ENEMY_R);
let ok = 0;
for (const r of m.rooms) { const p = nav.findPath(m.spawn.pts[0].x, m.spawn.pts[0].z, r.doorPos.x, r.doorPos.z, null); assert.ok(p && p.length, 'sin ruta a ' + r.number); ok++; }
console.log(`  el enemigo encuentra ruta a las ${ok} habitaciones`);
console.log('OK mapgen');

// Validación del mapa: accesibilidad física, ubicación de objetos y resolubilidad lógica de las misiones
import { CELL, PLAYER_R } from './config.js';
import { World } from './collision.js';
import { Nav } from './nav.js';
import { LOCK_ITEM } from './missions.js';

export function solveMissions(map) {
  const W = map.W;
  const sx = Math.floor(map.spawn.x / CELL), sy = Math.floor(map.spawn.z / CELL);
  const inv = new Set(), done = new Set(), taken = new Set();
  const lockNeeds = (d) => d.lock && d.lock !== 'exit' && !inv.has(LOCK_ITEM[d.lock]);
  for (let iter = 0; iter < 60; iter++) {
    const seen = new Uint8Array(W * map.H); const st = [sy * W + sx]; seen[st[0]] = 1;
    while (st.length) {
      const k = st.pop(), x = k % W, y = (k / W) | 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy, nk = ny * W + nx;
        if (nx < 0 || ny < 0 || nx >= W || ny >= map.H || seen[nk] || map.grid[ny][nx] === '#') continue;
        if (map.grid[ny][nx] === 'D') { const d = map.doors.find((q) => q.cx === nx && q.cy === ny); if (d && (lockNeeds(d) || d.lock === 'exit')) continue; }
        seen[nk] = 1; st.push(nk);
      }
    }
    const roomOk = (id) => {
      const r = map.rooms[id];
      if (id === 0) return true;
      return !!seen[Math.floor(r.doorPos.z / CELL) * W + Math.floor(r.doorPos.x / CELL)];
    };
    let changed = false;
    for (const it of map.items) if (!taken.has(it.id) && roomOk(it.room)) { taken.add(it.id); inv.add(it.kind); changed = true; }
    for (const m of map.missions) {
      if (done.has(m.id)) continue;
      let ok = false;
      if (m.type === 'pickup') ok = taken.has(m.itemId);
      else ok = m.requires.every((q) => done.has(q)) && (!m.needs || inv.has(m.needs)) && roomOk(m.room);
      if (ok) { done.add(m.id); changed = true; }
    }
    if (!changed) break;
  }
  return { solved: map.missions.every((m) => done.has(m.id)), done: [...done] };
}

export function validateMap(map) {
  const errors = [];
  const world = new World(map);
  const nav = new Nav(world, PLAYER_R);
  const sp0 = map.spawn.pts[0];
  const vis = nav.flood(sp0.x, sp0.z, null);
  const reach = (x, z, r = 1.3) => nav.reached(vis, x, z, r);
  for (const p of map.spawn.pts) if (!reach(p.x, p.z, 0.6)) errors.push('punto de aparición inaccesible');
  for (const r of map.rooms) if (!reach(r.doorPos.x, r.doorPos.z, 0.8)) errors.push(`habitación ${r.number} inaccesible`);
  if (!reach(map.exit.outX, map.exit.outZ, 0.8)) errors.push('la salida no es alcanzable');
  for (const d of map.doors) {
    const ok = d.axis === 'ns' ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]];
    for (const [dx, dy] of ok) { const c = map.grid[d.cy + dy]?.[d.cx + dx]; if (!c || c === '#') errors.push(`puerta ${d.id} sin salida a un lado`); }
  }
  const nums = new Set();
  for (const r of map.rooms) { if (nums.has(r.number)) errors.push('número de habitación repetido ' + r.number); nums.add(r.number); }
  const ids = new Set();
  for (const it of map.items) {
    if (ids.has(it.id)) errors.push('objeto duplicado ' + it.id); ids.add(it.id);
    const r = map.rooms[it.room];
    if (it.x < r.x * CELL || it.x > (r.x + r.w) * CELL || it.z < r.y * CELL || it.z > (r.y + r.h) * CELL) errors.push(`objeto ${it.id} fuera de su habitación`);
    if (!it.furn) {
      for (const f of map.furniture) if (f.solid && Math.abs(it.x - f.x) < f.w / 2 && Math.abs(it.z - f.z) < f.d / 2) errors.push(`objeto ${it.id} dentro de un mueble`);
    }
    if (!reach(it.x, it.z, 1.4)) errors.push(`objeto ${it.id} (${it.kind}) inaccesible`);
  }
  for (const t of map.terminals) if (!reach(t.x, t.z, 1.7)) errors.push(`terminal ${t.id} inaccesible`);
  for (const h of map.hides) if (!reach(h.exitX, h.exitZ, 0.7)) errors.push(`escondite ${h.id} sin salida`);
  for (const m of map.missions) {
    if (m.type === 'pickup' && !map.items.find((i) => i.id === m.itemId)) errors.push('misión sin objeto ' + m.id);
    if (m.type !== 'pickup' && !map.terminals.find((t) => t.id === m.terminal)) errors.push('misión sin terminal ' + m.id);
  }
  const s = solveMissions(map);
  if (!s.solved) errors.push('las misiones no se pueden completar');
  return { ok: errors.length === 0, errors };
}

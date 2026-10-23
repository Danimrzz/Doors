// Generador procedural del hotel: mismo esqueleto (vestíbulo + pasillos + habitaciones) con distribución distinta
import { RNG } from './rng.js';
import { CELL } from './config.js';
import { T, World } from './collision.js';
import { Furnisher, furnishRoom, furnishLobby, furnishCorridors, roomBounds } from './furniture.js';
import { planMissions } from './missions.js';
import { Nav } from './nav.js';
import { PLAYER_R } from './config.js';
import { validateMap } from './validate.js';

const CHARS = ['#', '.', 'r', 'L', 'D', 'o'];
export const TYPE_NAMES = {
  lobby: 'Vestíbulo', bedroom: 'Habitación', luxury: 'Suite', storage: 'Almacén', maintenance: 'Cuarto de mantenimiento',
  laundry: 'Lavandería', abandoned: 'Habitación abandonada', office: 'Oficina', empty: 'Habitación vacía',
};

function buildLayout(rng) {
  const W = 47 + 2 * rng.int(0, 3), H = 35 + 2 * rng.int(0, 2);
  const g = new Uint8Array(W * H);
  const get = (x, y) => (x < 0 || y < 0 || x >= W || y >= H) ? -1 : g[y * W + x];
  const set = (x, y, v) => { g[y * W + x] = v; };
  const rooms = [], doors = [], segs = [];
  const lobbySide = rng.chance(0.5) ? 'W' : 'E';
  const r0 = (H >> 1) + rng.int(-3, 3);
  const LW = 9, LH = 7;
  const lx0 = lobbySide === 'W' ? 3 : W - 3 - LW, ly0 = r0 - 3;
  for (let y = ly0; y < ly0 + LH; y++) for (let x = lx0; x < lx0 + LW; x++) set(x, y, T.LOBBY);
  const exCx = lobbySide === 'W' ? 2 : W - 3, outCx = lobbySide === 'W' ? 1 : W - 2;
  set(exCx, r0, T.DOOR); set(outCx, r0, T.OUT);
  doors.push({ id: 0, cx: exCx, cy: r0, axis: 'ew', kind: 'exit', room: 0, lock: 'exit' });
  const openCx = lobbySide === 'W' ? lx0 + LW : lx0 - 1;
  const lobby = {
    id: 0, type: 'lobby', x: lx0, y: ly0, w: LW, h: LH, seg: -1, side: 0, doorId: 0,
    doorSide: lobbySide, doorPos: { x: (exCx + 0.5) * CELL, z: (r0 + 0.5) * CELL },
    extraDoors: [{ side: lobbySide === 'W' ? 'E' : 'W', pos: { x: (openCx + 0.5) * CELL, z: (r0 + 0.5) * CELL } }],
  };
  rooms.push(lobby);
  // pasillo principal
  const sFrom = lobbySide === 'W' ? openCx : 4, sTo = lobbySide === 'W' ? W - 5 : openCx;
  for (let x = sFrom; x <= sTo; x++) set(x, r0, T.CORR);
  segs.push({ id: 0, axis: 'h', fixed: r0, from: sFrom, to: sTo, name: 'principal' });
  // ramales
  const lo = sFrom + 6, hi = sTo - 6, xs = [];
  const nb = rng.int(2, 4);
  for (let a = 0; a < 80 && xs.length < nb; a++) {
    const x = rng.int(lo, hi);
    if (xs.every((q) => Math.abs(q - x) >= 12)) xs.push(x);
  }
  xs.sort((a, b) => a - b);
  const br = xs.map((x) => {
    let n = rng.chance(0.8), s = rng.chance(0.8);
    if (!n && !s) n = true;
    return { x, top: n ? rng.int(4, r0 - 10) : null, bot: s ? rng.int(r0 + 10, H - 5) : null };
  });
  let ring = null;
  if (br.length >= 2 && rng.chance(0.7)) {
    const i = rng.int(0, br.length - 2), north = rng.chance(0.5);
    const y = north ? rng.int(4, r0 - 11) : rng.int(r0 + 11, H - 5);
    if (north) { br[i].top = y; br[i + 1].top = y; } else { br[i].bot = y; br[i + 1].bot = y; }
    ring = { y, x0: br[i].x, x1: br[i + 1].x };
  }
  for (const b of br) {
    if (b.top !== null) { for (let y = b.top; y < r0; y++) set(b.x, y, T.CORR); segs.push({ id: segs.length, axis: 'v', fixed: b.x, from: b.top, to: r0 - 1, name: 'norte', branch: true }); }
    if (b.bot !== null) { for (let y = r0 + 1; y <= b.bot; y++) set(b.x, y, T.CORR); segs.push({ id: segs.length, axis: 'v', fixed: b.x, from: r0 + 1, to: b.bot, name: 'sur', branch: true }); }
  }
  if (ring) { for (let x = ring.x0; x <= ring.x1; x++) set(x, ring.y, T.CORR); segs.push({ id: segs.length, axis: 'h', fixed: ring.y, from: ring.x0 + 1, to: ring.x1 - 1, name: 'anillo' }); }

  const rectFree = (r) => {
    for (let y = r.y - 1; y <= r.y + r.h; y++) for (let x = r.x - 1; x <= r.x + r.w; x++) {
      if (x < 1 || y < 1 || x > W - 2 || y > H - 2 || get(x, y) !== T.SOLID) return false;
    }
    return true;
  };
  const order = {};
  for (const seg of segs) {
    for (const side of [-1, 1]) {
      let t = seg.from + 1;
      while (t <= seg.to - 2) {
        const w0 = rng.int(3, 5), d0 = rng.int(3, 5);
        let placed = false;
        for (const [w, d] of [[w0, d0], [w0, 3], [3, 3]]) {
          if (t + w - 1 > seg.to - 1) continue;
          let rect;
          if (seg.axis === 'h') rect = side < 0 ? { x: t, y: seg.fixed - 1 - d, w, h: d } : { x: t, y: seg.fixed + 2, w, h: d };
          else rect = side < 0 ? { x: seg.fixed - 1 - d, y: t, w: d, h: w } : { x: seg.fixed + 2, y: t, w: d, h: w };
          if (!rectFree(rect)) continue;
          for (let y = rect.y; y < rect.y + rect.h; y++) for (let x = rect.x; x < rect.x + rect.w; x++) set(x, y, T.ROOM);
          const along = rng.int(t + 1, t + w - 2);
          const dcx = seg.axis === 'h' ? along : seg.fixed + side, dcy = seg.axis === 'h' ? seg.fixed + side : along;
          set(dcx, dcy, T.DOOR);
          const doorId = doors.length;
          doors.push({ id: doorId, cx: dcx, cy: dcy, axis: seg.axis === 'h' ? 'ns' : 'ew', kind: 'room', room: rooms.length, lock: null });
          const room = {
            id: rooms.length, ...rect, seg: seg.id, side, pos: t, doorId,
            doorSide: seg.axis === 'h' ? (side < 0 ? 'S' : 'N') : (side < 0 ? 'E' : 'W'),
            doorPos: { x: (dcx + 0.5) * CELL, z: (dcy + 0.5) * CELL },
          };
          rooms.push(room);
          (order[seg.id + ':' + side] ||= []).push(room);
          t += w + 1; placed = true; break;
        }
        if (!placed) t++; else if (rng.chance(0.1)) t++;
      }
    }
  }
  return { W, H, g, rooms, doors, segs, order, r0, lobbySide, ring };
}

function assignTypes(L, rng) {
  const rooms = L.rooms.filter((r) => r.id !== 0);
  const area = (r) => r.w * r.h;
  const free = new Set(rooms);
  const take = (n, filter, sortBy) => {
    let c = rooms.filter((r) => free.has(r) && filter(r));
    c = sortBy ? c.sort(sortBy) : rng.shuffle(c);
    return c.slice(0, n);
  };
  const assign = (list, type) => list.forEach((r) => { r.type = type; free.delete(r); });
  assign(take(rooms.length >= 34 ? 2 : 1, (r) => area(r) >= 12 && area(r) <= 20), 'maintenance');
  assign(take(rooms.length >= 30 ? 2 : 1, (r) => area(r) >= 9), 'office');
  assign(take(3, (r) => area(r) >= 16, (a, b) => area(b) - area(a) || rng.next() - 0.5), 'luxury');
  assign(take(rng.int(1, 2), (r) => area(r) >= 12), 'laundry');
  assign(take(rng.int(2, 3), () => true), 'storage');
  const rest = rng.shuffle([...free]);
  const nAb = Math.round(rest.length * 0.14), nEm = Math.round(rest.length * 0.1);
  rest.forEach((r, i) => { r.type = i < nAb ? 'abandoned' : i < nAb + nEm ? 'empty' : 'bedroom'; });
  const counts = {};
  for (const r of rooms) counts[r.type] = (counts[r.type] || 0) + 1;
  return counts.maintenance >= 1 && counts.office >= 1;
}

function numberRooms(L) {
  for (const key of Object.keys(L.order)) {
    const [segId, side] = key.split(':').map(Number);
    L.order[key].forEach((r, i) => {
      const n = (segId + 1) * 100 + (side < 0 ? 1 + 2 * i : 2 + 2 * i);
      r.number = String(n);
    });
  }
  for (const r of L.rooms) {
    if (r.id === 0) { r.number = 'Recepción'; r.name = 'Vestíbulo'; continue; }
    r.name = `${TYPE_NAMES[r.type]} ${r.number}`;
  }
}

function zonesAndEras(map, L) {
  const lobbyC = { x: L.rooms[0].x + L.rooms[0].w / 2, y: L.rooms[0].y + L.rooms[0].h / 2 };
  let maxD = 1;
  for (const r of L.rooms) { r.cx = r.x + r.w / 2; r.cy = r.y + r.h / 2; r.dist = Math.hypot(r.cx - lobbyC.x, r.cy - lobbyC.y); maxD = Math.max(maxD, r.dist); }
  for (const r of L.rooms) {
    const dx = (r.cx - map.W / 2) / (map.W / 2), dy = (r.cy - map.H / 2) / (map.H / 2);
    if (Math.abs(dx) < 0.25 && Math.abs(dy) < 0.3) r.zone = 'central';
    else if (Math.abs(dx) >= Math.abs(dy) * 0.9) r.zone = dx < 0 ? 'oeste' : 'este';
    else r.zone = dy < 0 ? 'norte' : 'sur';
    const f = r.dist / maxD;
    r.era = r.id === 0 ? 'principal' : f > 0.62 ? 'antigua' : f < 0.33 ? 'nueva' : 'principal';
  }
}

function makeLights(map, L, rng) {
  const lights = [];
  let n = 0;
  const add = (x, z, room, kind) => lights.push({ id: n++, x: +x.toFixed(2), z: +z.toFixed(2), y: 2.85, room, kind });
  for (const s of L.segs) {
    for (let t = s.from + 1; t <= s.to; t += 4) {
      if (s.axis === 'h') add((t + 0.5) * CELL, (s.fixed + 0.5) * CELL, -1, 'corr');
      else add((s.fixed + 0.5) * CELL, (t + 0.5) * CELL, -1, 'corr');
    }
  }
  for (const r of L.rooms) {
    const b = roomBounds(r), cx = (b.X0 + b.X1) / 2, cz = (b.Z0 + b.Z1) / 2;
    if (r.id === 0) { add(cx, cz, 0, 'lobby'); add(cx - 4, cz, 0, 'lobby'); add(cx + 4, cz, 0, 'lobby'); continue; }
    if (r.w * r.h >= 16) {
      if (r.w >= r.h) { add(cx - 1.6, cz, r.id, 'room'); add(cx + 1.6, cz, r.id, 'room'); } else { add(cx, cz - 1.6, r.id, 'room'); add(cx, cz + 1.6, r.id, 'room'); }
    } else add(cx, cz, r.id, 'room');
  }
  return lights;
}

export const genStats = { reasons: {} };
const fail = (r) => { const k = String(r).replace(/\d+/g, 'N'); genStats.reasons[k] = (genStats.reasons[k] || 0) + 1; return null; };

function tryGenerate(seed, difficulty, players) {
  const rng = new RNG(seed + '|layout');
  const L = buildLayout(rng);
  if (L.rooms.length < 24) return fail('pocas habitaciones');
  if (!assignTypes(L, rng)) return fail('sin tipos especiales');
  numberRooms(L);
  const grid = [];
  for (let y = 0; y < L.H; y++) { let row = ''; for (let x = 0; x < L.W; x++) row += CHARS[L.g[y * L.W + x]]; grid.push(row); }
  const map = {
    seed, W: L.W, H: L.H, cell: CELL, grid, rooms: L.rooms, doors: L.doors, segs: L.segs,
    lobbySide: L.lobbySide, furniture: [], deco: [], lights: [], items: [], terminals: [], hides: [],
  };
  zonesAndEras(map, L);
  const F = new Furnisher(new RNG(seed + '|furniture'));
  for (const r of L.rooms) { if (r.id === 0) furnishLobby(r, F); else furnishRoom(r, F); }
  furnishCorridors(map, F);
  map.furniture = F.furniture; map.deco = F.deco;
  map.lights = makeLights(map, L, rng);
  // puntos de aparición de jugadores (vestíbulo)
  const lb = roomBounds(L.rooms[0]);
  map.spawn = { x: (lb.X0 + lb.X1) / 2, z: (lb.Z0 + lb.Z1) / 2, yaw: L.lobbySide === 'W' ? -Math.PI / 2 : Math.PI / 2, pts: [] };
  const ctxRng = new RNG(seed + '|spawn');
  for (let i = 0; i < 12; i++) {
    const p = F.floorSpot(L.rooms[0], 0.5);
    if (p) map.spawn.pts.push(p);
  }
  if (map.spawn.pts.length < 6) return fail('spawn');
  map.exit = { doorId: 0, x: (L.doors[0].cx + 0.5) * CELL, z: (L.doors[0].cy + 0.5) * CELL, outX: ((L.lobbySide === 'W' ? 1 : L.W - 2) + 0.5) * CELL, outZ: (L.doors[0].cy + 0.5) * CELL };
  const world = new World(map);
  const nav = new Nav(world, PLAYER_R);
  const vis = nav.flood(map.spawn.pts[0].x, map.spawn.pts[0].z, null);
  const reach = (x, z, r) => nav.reached(vis, x, z, r);
  const ok = planMissions(map, F, new RNG(seed + '|plan|' + difficulty + '|' + players), difficulty, players, reach);
  if (!ok) return fail('plan');
  const res = validateMap(map);
  if (!res.ok) return fail(res.errors[0]);
  return map;
}

export function generateHotel({ seed, difficulty = 'normal', players = 1 }) {
  seed = String(seed);
  let lastReason = '';
  for (let attempt = 0; attempt < 250; attempt++) {
    const s = attempt === 0 ? seed : `${seed}~${attempt}`;
    const map = tryGenerate(s, difficulty, players);
    if (map) { map.seed = seed; map.layoutSeed = s; map.attempts = attempt + 1; map.difficulty = difficulty; return map; }
  }
  throw new Error('No se pudo generar un mapa válido para la semilla ' + seed + ' ' + lastReason);
}

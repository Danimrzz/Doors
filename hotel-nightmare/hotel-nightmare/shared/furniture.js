// Catálogo de mobiliario y plantillas de distribución interior por tipo de habitación
import { CELL } from './config.js';

// lw = ancho del frente, ld = fondo (desde la pared), h = altura
export const FURN = {
  bed:        { lw: 1.6, ld: 2.1, h: 0.6, solid: true, hide: 'bed' },
  bedDouble:  { lw: 2.0, ld: 2.2, h: 0.65, solid: true, hide: 'bed' },
  nightstand: { lw: 0.5, ld: 0.45, h: 0.55, solid: true, slotY: 0.57 },
  wardrobe:   { lw: 1.2, ld: 0.6, h: 2.1, solid: true, hide: 'wardrobe' },
  desk:       { lw: 1.4, ld: 0.7, h: 0.75, solid: true, slotY: 0.77 },
  chair:      { lw: 0.5, ld: 0.5, h: 0.9, solid: true },
  sofa:       { lw: 1.9, ld: 0.9, h: 0.8, solid: true },
  armchair:   { lw: 0.9, ld: 0.9, h: 0.85, solid: true },
  table:      { lw: 1.2, ld: 1.2, h: 0.75, solid: true, slotY: 0.77 },
  shelf:      { lw: 1.2, ld: 0.4, h: 1.9, solid: true, slotY: 1.12 },
  crate:      { lw: 0.8, ld: 0.8, h: 0.8, solid: true, slotY: 0.82 },
  crateStack: { lw: 0.8, ld: 0.8, h: 1.5, solid: true },
  washer:     { lw: 0.8, ld: 0.8, h: 1.0, solid: true, slotY: 1.02 },
  lamp:       { lw: 0.35, ld: 0.35, h: 1.6, solid: true },
  reception:  { lw: 4.0, ld: 1.0, h: 1.1, solid: true },
  boiler:     { lw: 1.2, ld: 1.2, h: 1.9, solid: true },
  locker:     { lw: 0.5, ld: 0.5, h: 1.9, solid: true },
  cabinet:    { lw: 0.5, ld: 0.6, h: 1.3, solid: true, slotY: 1.32 },
  sink:       { lw: 0.6, ld: 0.5, h: 0.9, solid: true },
  bench:      { lw: 1.4, ld: 0.45, h: 0.5, solid: true },
  cart:       { lw: 1.0, ld: 0.6, h: 1.0, solid: true },
  plant:      { lw: 0.5, ld: 0.5, h: 1.1, solid: true },
  workbench:  { lw: 1.6, ld: 0.7, h: 0.9, solid: true, slotY: 0.92 },
  basket:     { lw: 0.5, ld: 0.5, h: 0.5, solid: true },
  debris:     { lw: 0.9, ld: 0.9, h: 0.4, solid: true },
  mattress:   { lw: 1.4, ld: 1.9, h: 0.25, solid: false },
  rug:        { lw: 2.2, ld: 1.6, h: 0.02, solid: false },
  elevator:   { lw: 2.2, ld: 0.3, h: 2.4, solid: true },
};

const rotFor = { N: 0, S: Math.PI, W: Math.PI / 2, E: -Math.PI / 2 };

export function roomBounds(room) {
  return { X0: room.x * CELL, X1: (room.x + room.w) * CELL, Z0: room.y * CELL, Z1: (room.y + room.h) * CELL };
}
const boxOf = (x, z, w, d) => ({ minX: x - w / 2, maxX: x + w / 2, minZ: z - d / 2, maxZ: z + d / 2 });
const overlap = (a, b, m = 0) => a.minX < b.maxX + m && a.maxX > b.minX - m && a.minZ < b.maxZ + m && a.maxZ > b.minZ - m;

export function keepoutZones(room) {
  const b = roomBounds(room), A = 1.5, D = 2.2, zones = [];
  const add = (side, p) => {
    if (side === 'S') zones.push({ minX: p.x - A, maxX: p.x + A, minZ: b.Z1 - D, maxZ: b.Z1 });
    if (side === 'N') zones.push({ minX: p.x - A, maxX: p.x + A, minZ: b.Z0, maxZ: b.Z0 + D });
    if (side === 'E') zones.push({ minX: b.X1 - D, maxX: b.X1, minZ: p.z - A, maxZ: p.z + A });
    if (side === 'W') zones.push({ minX: b.X0, maxX: b.X0 + D, minZ: p.z - A, maxZ: p.z + A });
  };
  add(room.doorSide, room.doorPos);
  for (const e of room.extraDoors || []) add(e.side, e.pos);
  return zones;
}

export class Furnisher {
  constructor(rng) {
    this.rng = rng; this.furniture = []; this.deco = []; this.byRoom = new Map(); this.n = 0;
  }
  list(roomId) { return this.byRoom.get(roomId) || []; }
  push(room, type, x, z, w, d, rot, extra = {}) {
    const spec = FURN[type];
    const f = { id: 'f' + this.n++, type, x: +x.toFixed(3), z: +z.toFixed(3), w: +w.toFixed(3), d: +d.toFixed(3), h: spec.h, rot, room: room ? room.id : -1, solid: spec.solid, ...extra };
    if (spec.slotY) f.slotY = spec.slotY;
    if (spec.hide) f.hide = spec.hide;
    this.furniture.push(f);
    if (room) { if (!this.byRoom.has(room.id)) this.byRoom.set(room.id, []); this.byRoom.get(room.id).push(f); }
    return f;
  }
  fits(room, box, solid, margin = 0.05) {
    const b = roomBounds(room);
    if (box.minX < b.X0 + 0.02 || box.maxX > b.X1 - 0.02 || box.minZ < b.Z0 + 0.02 || box.maxZ > b.Z1 - 0.02) return false;
    for (const z of keepoutZones(room)) if (overlap(box, z)) return false;
    for (const f of this.list(room.id)) {
      if (!f.solid || !solid) continue;
      if (overlap(box, boxOf(f.x, f.z, f.w, f.d), margin)) return false;
    }
    return true;
  }
  // Coloca un mueble pegado a una pared (o en el centro con opt.center)
  put(room, type, opt = {}) {
    const spec = FURN[type], rng = this.rng, b = roomBounds(room);
    const walls = opt.wall ? [opt.wall] : rng.shuffle(['N', 'S', 'E', 'W']);
    const tries = opt.tries || 16;
    for (let t = 0; t < tries; t++) {
      const wall = walls[t % walls.length];
      let x, z, rot, w, d;
      if (opt.center) {
        rot = rng.pick([0, Math.PI / 2, Math.PI, -Math.PI / 2]);
        const sw = Math.abs(Math.sin(rot)) > 0.5;
        w = sw ? spec.ld : spec.lw; d = sw ? spec.lw : spec.ld;
        x = (b.X0 + b.X1) / 2 + rng.range(-0.5, 0.5); z = (b.Z0 + b.Z1) / 2 + rng.range(-0.5, 0.5);
      } else if (wall === 'N' || wall === 'S') {
        rot = rotFor[wall]; w = spec.lw; d = spec.ld;
        x = opt.along !== undefined ? opt.along : rng.range(b.X0 + w / 2 + 0.05, b.X1 - w / 2 - 0.05);
        z = wall === 'N' ? b.Z0 + d / 2 + 0.04 : b.Z1 - d / 2 - 0.04;
      } else {
        rot = rotFor[wall]; w = spec.ld; d = spec.lw;
        z = opt.along !== undefined ? opt.along : rng.range(b.Z0 + d / 2 + 0.05, b.Z1 - d / 2 - 0.05);
        x = wall === 'W' ? b.X0 + w / 2 + 0.04 : b.X1 - w / 2 - 0.04;
      }
      if (opt.rotJitter) rot += rng.range(-opt.rotJitter, opt.rotJitter);
      const box = boxOf(x, z, w, d);
      if (!this.fits(room, box, spec.solid, opt.margin ?? 0.05)) continue;
      return this.push(room, type, x, z, w, d, rot, { wall: opt.center ? null : wall });
    }
    return null;
  }
  beside(room, type, ref, sideSign = 1) {
    if (!ref || !ref.wall) return null;
    const spec = FURN[type], refSpec = FURN[ref.type];
    const along0 = (ref.wall === 'N' || ref.wall === 'S') ? ref.x : ref.z;
    const along = along0 + sideSign * (refSpec.lw / 2 + spec.lw / 2 + 0.04);
    return this.put(room, type, { wall: ref.wall, along, tries: 1, margin: 0.01 });
  }
  // Cuadro / espejo colgado de la pared (decoración)
  hang(room, kind) {
    const rng = this.rng, b = roomBounds(room);
    for (let t = 0; t < 10; t++) {
      const wall = rng.pick(['N', 'S', 'E', 'W']);
      const horiz = wall === 'N' || wall === 'S';
      const along = horiz ? rng.range(b.X0 + 0.8, b.X1 - 0.8) : rng.range(b.Z0 + 0.8, b.Z1 - 0.8);
      const x = horiz ? along : (wall === 'W' ? b.X0 + 0.04 : b.X1 - 0.04);
      const z = horiz ? (wall === 'N' ? b.Z0 + 0.04 : b.Z1 - 0.04) : along;
      const probe = horiz ? boxOf(x, z + (wall === 'N' ? 0.2 : -0.2), 1.0, 0.5) : boxOf(x + (wall === 'W' ? 0.2 : -0.2), z, 0.5, 1.0);
      let bad = false;
      for (const zn of keepoutZones(room)) if (overlap(probe, zn)) bad = true;
      for (const f of this.list(room.id)) if (f.h > 1.3 && overlap(probe, boxOf(f.x, f.z, f.w, f.d))) bad = true;
      if (bad) continue;
      this.deco.push({ type: kind, x: +x.toFixed(3), y: kind === 'mirror' ? 1.5 : 1.75, z: +z.toFixed(3), rot: rotFor[wall], room: room.id, tilt: 0 });
      return true;
    }
    return false;
  }
  // Hueco libre en la pared para un panel (caja de fusibles, teclado...). Devuelve {x,z,rot,wall}
  wallSpot(room, width = 1.2) {
    const rng = this.rng, b = roomBounds(room);
    for (let t = 0; t < 30; t++) {
      const wall = rng.pick(['N', 'S', 'E', 'W']);
      const horiz = wall === 'N' || wall === 'S';
      const along = horiz ? rng.range(b.X0 + 0.9, b.X1 - 0.9) : rng.range(b.Z0 + 0.9, b.Z1 - 0.9);
      const x = horiz ? along : (wall === 'W' ? b.X0 + 0.06 : b.X1 - 0.06);
      const z = horiz ? (wall === 'N' ? b.Z0 + 0.06 : b.Z1 - 0.06) : along;
      const probe = horiz ? boxOf(x, z + (wall === 'N' ? 0.6 : -0.6), width, 1.2) : boxOf(x + (wall === 'W' ? 0.6 : -0.6), z, 1.2, width);
      let bad = false;
      for (const zn of keepoutZones(room)) if (overlap(probe, zn)) bad = true;
      for (const f of this.list(room.id)) if (f.solid && overlap(probe, boxOf(f.x, f.z, f.w, f.d))) bad = true;
      for (const d of this.deco) if (d.room === room.id && d.type === 'panel' && Math.hypot(d.x - x, d.z - z) < 1.5) bad = true;
      if (bad) continue;
      return { x: +x.toFixed(3), z: +z.toFixed(3), rot: rotFor[wall], wall };
    }
    return null;
  }
  // Hueco libre en el suelo
  floorSpot(room, margin = 0.7) {
    const rng = this.rng, b = roomBounds(room);
    for (let t = 0; t < 40; t++) {
      const x = rng.range(b.X0 + 0.8, b.X1 - 0.8), z = rng.range(b.Z0 + 0.8, b.Z1 - 0.8);
      const box = boxOf(x, z, margin * 2, margin * 2);
      let bad = false;
      for (const zn of keepoutZones(room)) if (overlap(box, zn)) bad = true;
      for (const f of this.list(room.id)) if (f.solid && overlap(box, boxOf(f.x, f.z, f.w, f.d))) bad = true;
      if (!bad) return { x: +x.toFixed(2), z: +z.toFixed(2) };
    }
    return null;
  }
}

// ---------- Plantillas por tipo ----------
export function furnishRoom(room, F) {
  const rng = F.rng;
  const bigW = Math.min(room.w, room.h) >= 4;
  const type = room.type;
  const art = (n) => { for (let i = 0; i < n; i++) F.hang(room, rng.chance(0.2) ? 'mirror' : 'painting'); };
  switch (type) {
    case 'bedroom': {
      const bed = F.put(room, 'bed');
      if (bed) { F.beside(room, 'nightstand', bed, 1); if (rng.chance(0.6)) F.beside(room, 'nightstand', bed, -1); }
      F.put(room, 'wardrobe');
      if (rng.chance(0.55)) { const d = F.put(room, 'desk'); if (d) F.put(room, 'chair', { wall: d.wall, along: (d.wall === 'N' || d.wall === 'S') ? d.x : d.z, tries: 1 }) || F.put(room, 'chair'); }
      if (rng.chance(0.4)) F.put(room, 'sink');
      if (rng.chance(0.4)) F.put(room, 'lamp');
      if (rng.chance(0.5) && bigW) F.put(room, 'rug', { center: true });
      art(rng.int(1, 2));
      break;
    }
    case 'luxury': {
      const bed = F.put(room, 'bedDouble');
      if (bed) { F.beside(room, 'nightstand', bed, 1); F.beside(room, 'nightstand', bed, -1); }
      F.put(room, 'wardrobe'); F.put(room, 'wardrobe');
      F.put(room, 'sofa'); F.put(room, 'desk'); F.put(room, 'lamp'); F.put(room, 'lamp');
      F.put(room, 'rug', { center: true });
      if (bigW) { F.put(room, 'table', { center: true }); F.put(room, 'armchair'); }
      art(3);
      break;
    }
    case 'storage': {
      const n = rng.int(5, 9);
      for (let i = 0; i < n; i++) F.put(room, rng.chance(0.3) ? 'crateStack' : 'crate');
      F.put(room, 'shelf'); F.put(room, 'shelf'); F.put(room, 'cart');
      if (rng.chance(0.5)) F.put(room, 'shelf');
      break;
    }
    case 'maintenance': {
      F.put(room, 'boiler', { tries: 30 });
      for (let i = 0; i < 3; i++) F.put(room, 'locker');
      F.put(room, 'workbench'); F.put(room, 'shelf');
      F.put(room, 'crate'); F.put(room, 'crate');
      break;
    }
    case 'laundry': {
      const n = rng.int(3, 5);
      for (let i = 0; i < n; i++) F.put(room, 'washer', { wall: i % 2 ? undefined : undefined });
      F.put(room, 'table', { center: bigW }) || F.put(room, 'workbench');
      F.put(room, 'basket'); F.put(room, 'basket'); F.put(room, 'shelf');
      break;
    }
    case 'abandoned': {
      F.put(room, 'mattress', { center: true, rotJitter: 0.6 });
      F.put(room, 'debris'); F.put(room, 'debris');
      if (rng.chance(0.6)) F.put(room, 'wardrobe', { rotJitter: 0.25 });
      F.put(room, 'chair', { rotJitter: 1.2 }); F.put(room, 'chair', { rotJitter: 1.2 });
      if (rng.chance(0.5)) F.put(room, 'shelf');
      art(1);
      break;
    }
    case 'office': {
      const d = F.put(room, 'desk');
      if (d) F.put(room, 'chair', { wall: d.wall, along: (d.wall === 'N' || d.wall === 'S') ? d.x : d.z, tries: 1 }) || F.put(room, 'chair');
      if (bigW) F.put(room, 'desk');
      F.put(room, 'cabinet'); F.put(room, 'cabinet'); F.put(room, 'cabinet');
      F.put(room, 'shelf'); F.put(room, 'shelf');
      F.put(room, 'plant');
      art(1);
      break;
    }
    case 'empty': {
      if (rng.chance(0.6)) F.put(room, 'chair', { rotJitter: 1 });
      if (rng.chance(0.5)) F.put(room, 'lamp');
      if (rng.chance(0.4)) F.put(room, 'mattress', { center: true, rotJitter: 1.2 });
      break;
    }
    default: break;
  }
}

export function furnishLobby(room, F) {
  const rng = F.rng, b = roomBounds(room);
  // mostrador de recepción contra la pared más alejada de las puertas
  const wall = (room.doorSide === 'W' || room.doorSide === 'E') ? 'N' : 'N';
  F.put(room, 'elevator', { wall: 'S', along: (b.X0 + b.X1) / 2 + rng.range(-2, 2), tries: 1 }) || F.put(room, 'elevator', { wall: 'N' });
  F.put(room, 'reception', { wall, along: (b.X0 + b.X1) / 2 + rng.range(-1, 1), tries: 1 }) || F.put(room, 'reception', { wall: 'S' });
  F.put(room, 'sofa', { wall: 'S' }); F.put(room, 'sofa', { wall: 'S' });
  F.put(room, 'armchair', { wall: 'N' }); F.put(room, 'plant'); F.put(room, 'plant'); F.put(room, 'plant'); F.put(room, 'lamp');
  F.put(room, 'table', { center: false });
  F.put(room, 'rug', { center: true });
  F.hang(room, 'painting'); F.hang(room, 'painting'); F.hang(room, 'mirror');
}

export function furnishCorridors(map, F, world) {
  const rng = F.rng, W = map.W;
  const get = (x, y) => (x < 0 || y < 0 || x >= map.W || y >= map.H) ? '#' : map.grid[y][x];
  let n = 0;
  const placed = [];
  for (let y = 0; y < map.H; y++) for (let x = 0; x < W; x++) {
    if (get(x, y) !== '.') continue;
    if (placed.some(([px, py]) => Math.abs(px - x) + Math.abs(py - y) < 4)) continue;
    const N = get(x, y - 1), S = get(x, y + 1), E = get(x + 1, y), Wc = get(x - 1, y);
    const straightH = (N === '#') && (S === '#') && E !== '#' && Wc !== '#';
    const straightV = (E === '#') && (Wc === '#') && N !== '#' && S !== '#';
    if (!(straightH || straightV)) continue;
    // sin puertas contiguas
    const nb = [get(x - 1, y), get(x + 1, y), get(x, y - 1), get(x, y + 1)];
    if (nb.includes('D')) continue;
    if (!rng.chance(0.16)) continue;
    const kind = rng.pick(['bench', 'plant', 'cart', 'plant', 'bench']);
    const spec = FURN[kind];
    const cx = x * CELL, cz = y * CELL;
    const side = rng.pick([-1, 1]);
    let px, pz, rot, w, d;
    if (straightH) { w = spec.lw; d = spec.ld; px = cx + CELL / 2 + rng.range(-0.3, 0.3); pz = side < 0 ? cz + d / 2 + 0.03 : cz + CELL - d / 2 - 0.03; rot = side < 0 ? 0 : Math.PI; }
    else { w = spec.ld; d = spec.lw; pz = cz + CELL / 2 + rng.range(-0.3, 0.3); px = side < 0 ? cx + w / 2 + 0.03 : cx + CELL - w / 2 - 0.03; rot = side < 0 ? Math.PI / 2 : -Math.PI / 2; }
    if (kind === 'cart') { rot += rng.range(-0.3, 0.3); }
    F.push(null, kind, px, pz, w, d, rot, { room: -1 });
    placed.push([x, y]);
    n++;
  }
  // cuadros y carteles en paredes de pasillo
  for (let y = 0; y < map.H; y++) for (let x = 0; x < W; x++) {
    if (get(x, y) !== '#') continue;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      if (get(x + dx, y + dy) !== '.' || !rng.chance(0.045)) continue;
      const px = dy !== 0 ? (x + 0.5) * CELL : (dx < 0 ? x * CELL : (x + 1) * CELL) + dx * 0.04;
      const pz = dx !== 0 ? (y + 0.5) * CELL : (dy < 0 ? y * CELL : (y + 1) * CELL) + dy * 0.04;
      F.deco.push({ type: rng.chance(0.2) ? 'sign' : 'painting', x: +px.toFixed(3), y: 1.75, z: +pz.toFixed(3), rot: Math.atan2(dx, dy), room: -1 });
    }
  }
  return n;
}

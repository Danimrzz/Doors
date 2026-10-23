// Planificación de misiones: bloqueos, colocación lógica de objetos, terminales, notas y pistas por dificultad
import { DIFFICULTIES, playerScaling, CELL } from './config.js';
import { FURN } from './furniture.js';

export const LOCK_ITEM = { key: 'masterKey', card: 'keycard', board: 'crowbar' };
export const ITEM_NAMES = {
  masterKey: 'la llave maestra', keycard: 'la tarjeta de acceso', crowbar: 'la palanca', fuse: 'el fusible',
  codeNote: 'la nota con el código', finalKey: 'la llave de la puerta de emergencia', battery: 'una pila',
};
export const ITEM_SHORT = {
  masterKey: 'Llave maestra', keycard: 'Tarjeta de acceso', crowbar: 'Palanca', fuse: 'Fusible',
  codeNote: 'Nota con código', finalKey: 'Llave de emergencia', battery: 'Pila',
};
const ARTICLE = { bedroom: 'la', luxury: 'la', storage: 'el', maintenance: 'el', laundry: 'la', abandoned: 'la', office: 'la', empty: 'la', lobby: 'el' };

const LORE = [
  'Libro de registro: «Noche 1.312. El botones no ha vuelto de la planta de servicio. Nadie quiere ir a buscarlo.»',
  'Nota del gerente: «Si oyen pasos en el pasillo después de medianoche, no abran. Repito: NO abran.»',
  'Postal sin enviar: «Querida Marta, llevamos tres días aquí y el sol no ha salido ni una vez. El personal dice que es normal.»',
  'Parte de mantenimiento: «La caldera suena como si alguien respirase dentro. Sellada la puerta de la sala. Otra vez.»',
  'Hoja de turnos: la última línea, escrita con letra temblorosa: «El botones sigue haciendo su ronda. Sigue haciéndola.»',
  'Aviso a huéspedes: «Por su seguridad, mantengan la luz encendida. Al hotel no le gusta la oscuridad completa.»',
  'Diario de un huésped: «La habitación no era la misma cuando volví. Las sillas estaban giradas hacia la puerta.»',
  'Nota rasgada: «No corras. Corre solo si ya te ha visto. Escóndete si puedes contener la respiración.»',
  'Carta de despido: «Se prescinde de sus servicios como botones. Entregue el uniforme y la llave maestra al salir.»',
  'Cartel: «Salida de emergencia: solo con la llave del gerente y la energía restablecida. Nadie ha salido desde entonces.»',
];
const FLAVOR = {
  bedroom: 'Bajo la mirada de un huésped que nunca pagó su cuenta.',
  luxury: 'En la suite donde la fiesta terminó mal.',
  storage: 'Entre cosas que el hotel prefirió olvidar.',
  maintenance: 'Junto a tuberías que todavía gimen por la noche.',
  laundry: 'Entre sábanas que nadie volvió a recoger.',
  abandoned: 'Donde el polvo ya no recuerda quién vivió allí.',
  office: 'Entre libros de cuentas y secretos con tinta.',
  empty: 'En una habitación que juraría que estaba vacía.',
};
const TYPE_FEATURE = {
  bedroom: 'Es un dormitorio corriente.', luxury: 'Es una suite de lujo.', storage: 'Es un almacén.',
  maintenance: 'Huele a aceite y a metal.', laundry: 'Es una lavandería.', abandoned: 'Parece abandonada desde hace años.',
  office: 'Tiene escritorios y archivadores.', empty: 'Casi no tiene muebles.',
};
const LOCK_FEATURE = { key: 'Su puerta está cerrada con llave.', card: 'Hace falta una tarjeta para entrar.', board: 'Su puerta está atrancada con tablones.' };

export function nameWithArticle(room) { const n = room.name; return `${ARTICLE[room.type] || 'la'} ${n.charAt(0).toLowerCase() + n.slice(1)}`; }

export function buildHint(map, rng, m, room, level) {
  const kind = m.itemKind || m.target;
  if (level === 2) {
    const tail = m.type === 'pickup' ? 'Está en' : 'Se encuentra en';
    return `${tail} ${nameWithArticle(room)}.`;
  }
  if (level === 1) {
    const zone = room.zone === 'central' ? 'zona central' : `zona ${room.zone}`;
    let feat;
    if (room.wingLock) feat = 'Hay que cruzar una reja de servicio para llegar.';
    else if (room.lockType) feat = LOCK_FEATURE[room.lockType];
    else feat = rng.chance(0.65) ? TYPE_FEATURE[room.type] : `El número de la habitación es ${parseInt(room.number, 10) % 2 === 0 ? 'par' : 'impar'}.`;
    return `Busca en la ${zone} del hotel. ${feat}`;
  }
  const era = room.era === 'principal' ? 'zona principal' : `ala ${room.era}`;
  const fl = FLAVOR[room.type] || '';
  const door = room.lockType || room.wingLock ? ' Tras una puerta que no quiere abrirse.' : '';
  const T = {
    masterKey: `La última persona que utilizó la llave nunca llegó a abandonar el ${era}. ${fl}${door}`,
    keycard: `Un recepcionista la escondió donde nadie buscaría, en el ${era}. ${fl}${door}`,
    crowbar: `Quien la dejó atrás tenía prisa por huir del ${era}. ${fl}${door}`,
    fuse: `Cuando se fue la luz, alguien lo guardó en el ${era}. ${fl}${door}`,
    codeNote: `El jefe de seguridad apuntó el código y lo olvidó en el ${era}. ${fl}${door}`,
    finalKey: `El gerente selló su último secreto en el ${era}. ${fl}${door}`,
    fusebox: `Los plomos viven donde el hotel aún respira, en el ${era}. ${fl}`,
    boiler: `La caldera sigue tosiendo en el ${era}. ${fl}`,
    keypad: `El panel de seguridad vigila en silencio desde el ${era}. ${fl}`,
  };
  return T[kind] || `Busca en el ${era}.`;
}

function cellFlood(map, blockedFn) {
  const W = map.W, seen = new Uint8Array(W * map.H);
  const sx = Math.floor(map.spawn.x / CELL), sy = Math.floor(map.spawn.z / CELL);
  const st = [sy * W + sx]; seen[st[0]] = 1;
  while (st.length) {
    const k = st.pop(), x = k % W, y = (k / W) | 0;
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= map.H) continue;
      const nk = ny * W + nx;
      if (seen[nk] || map.grid[ny][nx] === '#') continue;
      if (map.grid[ny][nx] === 'D') {
        const d = map.doors.find((q) => q.cx === nx && q.cy === ny);
        if (d && blockedFn(d)) continue;
      }
      seen[nk] = 1; st.push(nk);
    }
  }
  return seen;
}

export function planMissions(map, F, rng, diffKey, players, reach) {
  const diff = DIFFICULTIES[diffKey];
  const scale = playerScaling(players);
  const rooms = map.rooms, W = map.W;
  const normal = rooms.filter((r) => r.id !== 0);
  const specialM = normal.filter((r) => r.type === 'maintenance'), specialO = normal.filter((r) => r.type === 'office');
  if (!specialM.length || !specialO.length) return false;

  // ---- grupos de misión ----
  const pool = ['key', 'card', 'crowbar', 'power', 'code', 'lever'];
  const nGroups = Math.min(6, diff.missionGroups + scale.extraGroup);
  const groups = rng.shuffle(pool).slice(0, nGroups);
  const has = (g) => groups.includes(g);
  const gates = rng.shuffle(groups.filter((g) => g === 'key' || g === 'card' || g === 'crowbar'));
  const gateIdx = {}; gates.forEach((g, i) => (gateIdx[g] = i));
  const lockOf = (g) => (g === 'crowbar' ? 'board' : g);

  // ---- reja de ala de servicio (acceso a una zona nueva) ----
  const wingRooms = new Set();
  let wingLock = null, gateDoor = null;
  const wingTypes = gates.filter((g) => g === 'key' || g === 'card');
  if (wingTypes.length && rng.chance(0.65)) {
    const cands = rng.shuffle(map.segs.filter((s) => s.branch));
    for (const seg of cands) {
      const spineRow = map.segs[0].fixed;
      const dir = seg.name === 'norte' ? -1 : 1;
      // celdas del ramal ordenadas desde el pasillo principal hacia el extremo
      const cells = [];
      for (let t = 0; t < seg.to - seg.from + 1; t++) cells.push(dir < 0 ? seg.to - t : seg.from + t);
      for (let i = 3; i < cells.length - 3; i++) {
        const y = cells[i], x = seg.fixed;
        const g = map.grid;
        const side = [g[y][x - 1], g[y][x + 1], g[y - 1][x], g[y + 1][x]];
        if (g[y][x] !== '.' || g[y][x - 1] !== '#' || g[y][x + 1] !== '#' || side.includes('D')) continue;
        if (g[y - 1][x] !== '.' || g[y + 1][x] !== '.') continue;
        // probar
        const type = rng.pick(wingTypes);
        const row = g[y]; g[y] = row.slice(0, x) + 'D' + row.slice(x + 1);
        const door = { id: map.doors.length, cx: x, cy: y, axis: 'ns', kind: 'gate', room: -1, lock: lockOf(type) };
        map.doors.push(door);
        const reach = cellFlood(map, (d) => d.id === door.id);
        const inWing = normal.filter((r) => !reach[Math.floor(r.doorPos.z / CELL) * W + Math.floor(r.doorPos.x / CELL)]);
        const hasSpecial = inWing.some((r) => r.type === 'maintenance' || r.type === 'office');
        if (inWing.length >= 3 && !hasSpecial) { gateDoor = door; wingLock = type; inWing.forEach((r) => { wingRooms.add(r); r.wingLock = lockOf(type); }); break; }
        map.doors.pop(); g[y] = row;
      }
      if (gateDoor) break;
    }
  }
  const needOf = (r) => {
    const s = new Set();
    if (r.lockType) s.add(r.lockType === 'board' ? 'crowbar' : r.lockType);
    if (wingRooms.has(r)) s.add(wingLock);
    return s;
  };
  // ---- habitaciones bloqueadas: una por cada llave ----
  const lockable = () => normal.filter((r) => !r.lockType && r.type !== 'maintenance' && r.type !== 'office');
  for (const g of gates) {
    const c = rng.shuffle(lockable());
    if (!c.length) return false;
    // preferir habitaciones del ala de servicio para llaves tardías no hace falta: cualquiera
    const room = c[0];
    room.lockType = lockOf(g);
    map.doors[room.doorId].lock = lockOf(g);
  }
  const stageOf = (r) => { let st = 0; for (const t of needOf(r)) st = Math.max(st, gateIdx[t] + 1); return st; };

  // ---- ranuras de objetos ----
  const usedSlots = new Set(), usedRooms = new Set();
  const slotIn = (room) => {
    const furn = F.list(room.id).filter((f) => f.slotY && !usedSlots.has(f.id) && reach(f.x, f.z, 1.1));
    if (furn.length && rng.chance(0.85)) {
      const f = rng.pick(furn); usedSlots.add(f.id);
      return { x: f.x + rng.range(-0.1, 0.1) * (f.w > 0.7 ? 1 : 0), z: f.z, y: f.slotY + 0.04, furn: f.id };
    }
    for (let t = 0; t < 8; t++) {
      const p = F.floorSpot(room, 0.6);
      if (p && reach(p.x, p.z, 0.5)) return { x: p.x, z: p.z, y: 0.1, furn: null };
    }
    return null;
  };
  const wallSpotReach = (room) => {
    for (let t = 0; t < 12; t++) {
      const sp = F.wallSpot(room, 1.0);
      if (sp && reach(sp.x + Math.sin(sp.rot) * 0.8, sp.z + Math.cos(sp.rot) * 0.8, 0.4)) return sp;
    }
    return null;
  };
  const items = [];
  const place = (kind, maxStage, preferLocked, missionId) => {
    let c = normal.filter((r) => !usedRooms.has(r.id) && stageOf(r) <= maxStage);
    if (preferLocked) { const l = c.filter((r) => stageOf(r) > 0 || r.lockType); if (l.length && rng.chance(0.75)) c = l; }
    c = rng.shuffle(c);
    for (const room of c) {
      const s = slotIn(room);
      if (!s) continue;
      usedRooms.add(room.id);
      const it = { id: 'i' + items.length, kind, x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2), room: room.id, mission: missionId || null, furn: s.furn };
      items.push(it); return it;
    }
    return null;
  };

  const missions = [];
  const mk = (m) => { missions.push({ requires: [], done: false, ...m }); return m; };
  const itemOf = {};
  // llaves por orden de dependencia
  for (const g of gates) {
    const kind = LOCK_ITEM[lockOf(g)];
    const it = place(kind, gateIdx[g], true, 'm_' + g);
    if (!it) return false;
    itemOf[g] = it;
  }
  const titles = {
    key: 'Encontrar la llave maestra', card: 'Recuperar la tarjeta de acceso', crowbar: 'Conseguir una palanca para las puertas atrancadas',
  };
  for (const g of gates) mk({ id: 'm_' + g, type: 'pickup', itemKind: LOCK_ITEM[lockOf(g)], itemId: itemOf[g].id, room: itemOf[g].room, title: titles[g] });

  const maint = rng.pick(specialM), office = rng.pick(specialO);
  const terminals = [];
  if (has('power')) {
    const fuse = place('fuse', gates.length, false, 'm_fuse'); if (!fuse) return false;
    mk({ id: 'm_fuse', type: 'pickup', itemKind: 'fuse', itemId: fuse.id, room: fuse.room, title: 'Encontrar un fusible' });
    const spot = wallSpotReach(maint); if (!spot) return false;
    terminals.push({ id: 't_fusebox', kind: 'fusebox', x: spot.x, y: 1.5, z: spot.z, rot: spot.rot, room: maint.id });
    F.deco.push({ type: 'panel', x: spot.x, y: 1.5, z: spot.z, rot: spot.rot, room: maint.id, kind: 'fusebox' });
    mk({ id: 'm_power', type: 'use', target: 'fusebox', terminal: 't_fusebox', needs: 'fuse', requires: ['m_fuse'], room: maint.id, title: 'Restaurar la electricidad (instalar el fusible)' });
  }
  let code = null;
  if (has('code')) {
    code = String(rng.int(1000, 9999));
    const note = place('codeNote', gates.length, false, 'm_note'); if (!note) return false;
    note.code = code;
    mk({ id: 'm_note', type: 'pickup', itemKind: 'codeNote', itemId: note.id, room: note.room, title: 'Encontrar el código de seguridad' });
    const spot = wallSpotReach(office); if (!spot) return false;
    terminals.push({ id: 't_keypad', kind: 'keypad', x: spot.x, y: 1.4, z: spot.z, rot: spot.rot, room: office.id });
    F.deco.push({ type: 'panel', x: spot.x, y: 1.4, z: spot.z, rot: spot.rot, room: office.id, kind: 'keypad' });
    mk({ id: 'm_code', type: 'keypad', target: 'keypad', terminal: 't_keypad', needs: 'codeNote', requires: ['m_note'], room: office.id, title: 'Introducir el código en el panel de seguridad' });
  }
  if (has('lever')) {
    const boiler = F.list(maint.id).find((f) => f.type === 'boiler');
    if (!boiler) return false;
    const fx = Math.sin(boiler.rot), fz = Math.cos(boiler.rot);
    terminals.push({ id: 't_lever', kind: 'lever', x: +(boiler.x + fx * (FURN.boiler.ld / 2 + 0.15)).toFixed(3), y: 1.1, z: +(boiler.z + fz * (FURN.boiler.ld / 2 + 0.15)).toFixed(3), rot: boiler.rot, room: maint.id, furn: boiler.id });
    mk({ id: 'm_lever', type: 'use', target: 'boiler', terminal: 't_lever', requires: [], room: maint.id, title: 'Activar la caldera del hotel' });
  }
  const fin = place('finalKey', gates.length, true, 'm_final'); if (!fin) return false;
  mk({ id: 'm_final', type: 'pickup', itemKind: 'finalKey', itemId: fin.id, room: fin.room, title: 'Encontrar la llave de la puerta de emergencia' });

  // ascensor decorativo (fuera de servicio)
  const el = map.furniture.find((f) => f.type === 'elevator');
  if (el) terminals.push({ id: 't_elevator', kind: 'elevator', x: el.x + Math.sin(el.rot) * 0.4, y: 1.2, z: el.z + Math.cos(el.rot) * 0.4, rot: el.rot, room: 0 });

  // notas de ambientación
  const loreRooms = rng.shuffle(normal.filter((r) => !r.lockType && !wingRooms.has(r))).slice(0, 8);
  const lore = rng.shuffle(LORE);
  loreRooms.forEach((r, i) => {
    const s = slotIn(r); if (!s) return;
    r.lore = true;
    terminals.push({ id: 't_note' + i, kind: 'note', x: s.x, y: s.y + 0.02, z: s.z, rot: rng.range(0, 6.28), room: r.id, text: lore[i % lore.length] });
  });

  // pilas (recurso limitado según dificultad y jugadores)
  const nBat = Math.max(4, Math.round(diff.batteries * scale.batteryMul));
  const batRooms = rng.shuffle([rooms[0], ...normal.filter((r) => stageOf(r) === 0 && !r.lockType)]);
  for (let i = 0; i < nBat; i++) {
    const r = i === 0 ? rooms[0] : batRooms[(i % (batRooms.length - 1)) + 1];
    const s = slotIn(r); if (!s) continue;
    items.push({ id: 'i' + items.length, kind: 'battery', x: +s.x.toFixed(2), y: +s.y.toFixed(2), z: +s.z.toFixed(2), room: r.id, mission: null, furn: s.furn });
  }

  // escondites
  const hides = [];
  for (const f of map.furniture) {
    if (!f.hide) continue;
    const spec = FURN[f.type], fx = Math.sin(f.rot), fz = Math.cos(f.rot);
    const out = spec.ld / 2 + 0.55;
    if (!reach(f.x + fx * out, f.z + fz * out, 0.35)) continue;
    hides.push({ id: 'h' + hides.length, furn: f.id, kind: f.hide, x: f.x, z: f.z, exitX: +(f.x + fx * out).toFixed(2), exitZ: +(f.z + fz * out).toFixed(2), yaw: f.rot + Math.PI, camY: f.hide === 'bed' ? 0.38 : 1.5, room: f.room });
  }

  // luces: estado y dependencia de la electricidad
  for (const l of map.lights) {
    const r = rng.next();
    if (l.kind === 'lobby') { l.mode = l.id % 3 === 1 ? 'flicker' : 'ok'; l.tier = 0; continue; }
    l.mode = r < diff.broken ? 'broken' : r < diff.broken + 0.18 ? 'flicker' : 'ok';
    l.tier = has('power') && rng.chance(0.4) ? 1 : 0;
  }

  // pistas
  for (const m of missions) {
    const room = rooms[m.room];
    m.hint = buildHint(map, rng, m, room, diff.hint);
    m.roomNumber = room.number;
  }
  const order = gates.map((g) => lockOf(g));
  Object.assign(map, { items, terminals, hides, missions, code, groups, lockOrder: order, wingLock, gateDoor: gateDoor ? gateDoor.id : null, power: has('power') });
  return true;
}

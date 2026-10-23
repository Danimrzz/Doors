// Jugador automático para pruebas: usa solo la información pública que recibe el cliente
import { World } from '../shared/collision.js';
import { Nav } from '../shared/nav.js';
import { PLAYER_R, WALK_SPEED, CELL } from '../shared/config.js';
import { LOCK_ITEM } from '../shared/missions.js';

export class Bot {
  constructor(id, name, sendFn) {
    this.id = id; this.name = name; this.sendFn = sendFn; this.map = null; this.inv = {}; this.done = new Set(); this.taken = new Set();
    this.x = 0; this.z = 0; this.path = null; this.goal = null; this.msgs = []; this.events = []; this.state = 'alive'; this.escaped = false; this.ended = null;
    this.speed = WALK_SPEED; this.log = [];
  }
  recv(m) {
    this.events.push(m);
    switch (m.t) {
      case 'start': {
        this.map = m.map; this.world = new World(m.map); this.nav = new Nav(this.world, PLAYER_R);
        const sp = m.map.spawn.pts[0]; this.x = sp.x; this.z = sp.z; this.you = m.you;
        this.apply(m.state); break;
      }
      case 'door': this.world.doorOpen[m.id] = m.open; if (m.open) this.world.doorLocked[m.id] = false; break;
      case 'unlock': this.world.doorLocked[m.id] = false; break;
      case 'exit': this.world.doorLocked[0] = false; break;
      case 'item': this.taken.add(m.id); break;
      case 'inv': this.inv = m.inv; break;
      case 'mission': this.done.add(m.id); break;
      case 'corr': this.x = m.x; this.z = m.z; this.path = null; break;
      case 'escaped': if (m.id === this.you) this.escaped = true; break;
      case 'end': this.ended = m.stats; break;
      case 'msg': this.msgs.push(m.m); break;
      case 'caught': if (m.id === this.you) this.state = m.state; break;
      default: break;
    }
  }
  apply(st) {
    for (const [id, open, locked] of st.doors) { this.world.doorOpen[id] = !!open; this.world.doorLocked[id] = !!locked; }
    this.taken = new Set(st.taken); this.done = new Set(st.done); this.inv = st.inv;
  }
  blocked() { return (k) => { const d = this.map.doors[k]; return this.world.doorLocked[k] && !(d.lock !== 'exit' && this.inv[LOCK_ITEM[d.lock]]) && true; }; }
  has(k) { return !!this.inv[k]; }
  chooseGoal() {
    const m = this.map;
    const blocked = this.blocked();
    const reachable = (x, z) => this.nav.findPath(this.x, this.z, x, z, blocked);
    for (const mis of m.missions) {
      if (this.done.has(mis.id)) continue;
      if (mis.type === 'pickup') {
        const it = m.items.find((i) => i.id === mis.itemId);
        if (this.taken.has(it.id)) continue;
        const p = reachable(it.x, it.z); if (p) return { kind: 'item', id: it.id, x: it.x, z: it.z };
      } else {
        if (!mis.requires.every((q) => this.done.has(q))) continue;
        if (mis.needs && !this.has(mis.needs)) continue;
        const t = m.terminals.find((q) => q.id === mis.terminal);
        const p = reachable(t.x, t.z); if (p) return { kind: mis.type === 'keypad' ? 'keypad' : 'term', id: t.id, x: t.x, z: t.z };
      }
    }
    if ([...this.done].length === m.missions.length) return { kind: 'exit', x: m.exit.outX, z: m.exit.outZ };
    // sin objetivo alcanzable: abrir una habitación bloqueada con la llave que tengamos
    for (const d of m.doors) {
      if (d.kind === 'exit' || !this.world.doorLocked[d.id]) continue;
      if (!this.inv[LOCK_ITEM[d.lock]]) continue;
      const x = (d.cx + 0.5) * CELL, z = (d.cy + 0.5) * CELL;
      if (reachable(x, z) || this.nav.findPath(this.x, this.z, x, z, null)) return { kind: 'door', id: d.id, x, z };
    }
    return null;
  }
  step(dt) {
    if (!this.map || this.ended || this.state !== 'alive' || this.escaped) return;
    if (!this.goal) { this.goal = this.chooseGoal(); this.path = null; if (!this.goal) return; }
    const blocked = this.blocked();
    const g = this.goal;
    const dist = Math.hypot(g.x - this.x, g.z - this.z);
    const reach = g.kind === 'exit' ? 0.6 : 1.4;
    if (dist < reach && g.kind !== 'exit') {
      if (g.kind === 'item') this.send({ t: 'use', k: 'item', id: g.id });
      else if (g.kind === 'term') this.send({ t: 'use', k: 'term', id: g.id });
      else if (g.kind === 'keypad') this.send({ t: 'code', value: String(this.inv.codeNote) });
      else if (g.kind === 'door') this.send({ t: 'use', k: 'door', id: g.id });
      this.goal = null; this.pause = 3; return;
    }
    if (this.pause > 0) { this.pause--; return; }
    if (!this.path || !this.path.length) {
      this.path = this.nav.findPath(this.x, this.z, g.x, g.z, blocked);
      if (!this.path) { this.goal = null; return; }
    }
    // mover
    let rem = this.speed * dt;
    while (rem > 0 && this.path.length) {
      const w = this.path[0], dx = w.x - this.x, dz = w.z - this.z, d = Math.hypot(dx, dz);
      if (d < 0.05) { this.path.shift(); continue; }
      const s = Math.min(d, rem), nx = this.x + dx / d * s, nz = this.z + dz / d * s;
      const door = this.world.doorAtPoint(nx, nz);
      if (door && !this.world.doorOpen[door.id]) {
        // abrir la puerta (si está bloqueada y tenemos llave, también)
        this.send({ t: 'use', k: 'door', id: door.id }); this.pause = 2; return;
      }
      this.x = nx; this.z = nz; rem -= s; if (s >= d - 1e-6) this.path.shift();
    }
    this.send({ t: 'st', x: this.x, z: this.z, yaw: 0, pitch: 0, fl: true, run: false });
  }
  send(m) { this.sendFn(m); }
}

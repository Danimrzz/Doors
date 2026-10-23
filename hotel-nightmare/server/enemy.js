// IA del enemigo "El Botones": patrulla, investiga ruidos, detecta, persigue, busca y revisa escondites
import { CELL } from '../shared/config.js';

export const ES = { SPAWN: 0, PATROL: 1, INVESTIGATE: 2, CHASE: 3, SEARCH: 4, STUN: 5 };
const TWO_PI = Math.PI * 2;
const angDiff = (a, b) => { let d = (a - b) % TWO_PI; if (d > Math.PI) d -= TWO_PI; if (d < -Math.PI) d += TWO_PI; return Math.abs(d); };
const turnToward = (cur, tgt, maxStep) => {
  let d = (tgt - cur) % TWO_PI; if (d > Math.PI) d -= TWO_PI; if (d < -Math.PI) d += TWO_PI;
  return Math.abs(d) <= maxStep ? tgt : cur + Math.sign(d) * maxStep;
};

export class Enemy {
  constructor(game) {
    this.g = game; this.map = game.map; this.world = game.world; this.nav = game.nav;
    this.x = 0; this.z = 0; this.yaw = 0; this.state = ES.SPAWN; this.speed = 0;
    this.path = []; this.pi = 0; this.target = null; this.last = null;
    this.aw = new Map(); this.timer = 0; this.repathT = 0; this.stall = 0; this.stunUntil = 0;
    this.silentUntil = 0; this.recent = []; this.searchQ = []; this.searchLeft = 0; this.waitT = 0;
    this.lostT = 0; this.chaseRamp = 0; this.huntT = 30; this.stuckT = 0; this.lastX = 0; this.lastZ = 0; this.stuckCheck = 0;
    this.checkT = 0; this.checkedUntil = new Map(); this.farT = 0; this.graceUntil = 0; this.noiseSeen = 0;
    this.pois = [];
    for (const r of this.map.rooms) {
      if (r.id === 0) continue;
      this.pois.push({ x: r.doorPos.x, z: r.doorPos.z, room: r.id });
      this.pois.push({ x: (r.x + r.w / 2) * CELL, z: (r.y + r.h / 2) * CELL, room: r.id });
    }
    for (let y = 0; y < this.map.H; y += 3) for (let x = 0; x < this.map.W; x += 3) if (this.map.grid[y][x] === '.') this.pois.push({ x: (x + 0.5) * CELL, z: (y + 0.5) * CELL, room: -1 });
    this.blocked = (k) => this.world.doorLocked[k];
  }
  setPath(path) { this.path = path || []; this.pi = 0; this.stuckT = 0; }
  faceTo(dx, dz, dt, rate = 7) { this.yaw = turnToward(this.yaw, Math.atan2(-dx, -dz), rate * dt); }

  // Aparece lejos y fuera de la vista de los jugadores
  relocate(minDist = 35) {
    const players = this.g.alivePlayers();
    for (let t = 0; t < 120; t++) {
      const p = this.pois[Math.floor(Math.random() * this.pois.length)];
      if (!this.nav.isFree(p.x, p.z, this.blocked)) continue;
      let ok = true;
      for (const pl of players) {
        const d = Math.hypot(pl.x - p.x, pl.z - p.z);
        if (d < minDist || (d < 70 && this.world.los(p.x, p.z, pl.x, pl.z))) { ok = false; break; }
      }
      if (!ok) continue;
      this.x = p.x; this.z = p.z; this.yaw = Math.random() * TWO_PI;
      this.state = ES.PATROL; this.setPath(null); this.target = null; this.timer = 1 + Math.random() * 2;
      return true;
    }
    const p = this.pois[0]; this.x = p.x; this.z = p.z; this.state = ES.PATROL; return false;
  }

  pickPatrol(P) {
    const g = this.g, alive = g.alivePlayers();
    for (let t = 0; t < 14; t++) {
      let poi;
      if (g.finalPhase && alive.length && Math.random() < 0.4) {
        const pl = alive[Math.floor(Math.random() * alive.length)];
        const near = this.pois.filter((q) => Math.hypot(q.x - pl.x, q.z - pl.z) < 16 && Math.hypot(q.x - this.x, q.z - this.z) > 6);
        if (!near.length) continue;
        poi = near[Math.floor(Math.random() * near.length)];
      } else poi = this.pois[Math.floor(Math.random() * this.pois.length)];
      const d = Math.hypot(poi.x - this.x, poi.z - this.z);
      if (d < 6) continue;
      if (this.recent.some((r) => Math.hypot(r.x - poi.x, r.z - poi.z) < 8)) continue;
      const path = this.nav.findPath(this.x, this.z, poi.x, poi.z, this.blocked);
      if (!path) continue;
      this.setPath(path); this.recent.push(poi); if (this.recent.length > 7) this.recent.shift();
      return true;
    }
    this.recent.length = 0;
    return false;
  }
  goTo(x, z) {
    const path = this.nav.findPath(this.x, this.z, x, z, this.blocked);
    if (path) { this.setPath(path); return true; }
    return false;
  }

  // Avanza por el camino; abre puertas cerradas del recorrido
  follow(dt, speed) {
    if (this.stall > 0) { this.stall -= dt; this.speed = 0; return false; }
    if (this.pi >= this.path.length) { this.speed = 0; return true; }
    let remaining = speed * dt; this.speed = speed;
    while (remaining > 0 && this.pi < this.path.length) {
      const w = this.path[this.pi], dx = w.x - this.x, dz = w.z - this.z, d = Math.hypot(dx, dz);
      if (d < 0.05) { this.pi++; continue; }
      const step = Math.min(d, remaining);
      const nx = this.x + (dx / d) * step, nz = this.z + (dz / d) * step;
      const door = this.world.doorAtPoint(nx, nz);
      if (door && !this.world.doorOpen[door.id]) {
        if (this.world.doorLocked[door.id]) { this.setPath(null); this.state = this.state === ES.CHASE ? ES.SEARCH : ES.PATROL; return false; }
        this.g.setDoor(door.id, true, 'enemy');
        this.stall = 0.45;
        this.speed = 0; return false;
      }
      this.x = nx; this.z = nz; remaining -= step;
      this.faceTo(dx, dz, dt);
      if (step >= d - 1e-6) this.pi++;
    }
    return this.pi >= this.path.length;
  }

  senseAll(dt, P) {
    const g = this.g;
    let seen = null, seenD = 1e9;
    for (const p of g.alivePlayers()) {
      if (p.hidden) { this.aw.set(p.id, 0); continue; }
      const d = Math.hypot(p.x - this.x, p.z - this.z);
      const range = P.sight * (p.fl ? 1.35 : 1);
      let sees = false;
      if (d < range && this.world.los(this.x, this.z, p.x, p.z)) {
        const fovOk = d < 2.5 || angDiff(Math.atan2(-(p.x - this.x), -(p.z - this.z)), this.yaw) < (P.fov * Math.PI / 180) / 2 || this.state === ES.CHASE;
        sees = fovOk;
      }
      let aw = this.aw.get(p.id) || 0;
      if (sees) {
        aw += (dt / P.detect) * (1 + (1 - d / range) * 1.5) * (p.run ? 1.3 : 1) * (d < 3 ? 3 : 1);
      } else aw = Math.max(0, aw - dt * 0.5);
      this.aw.set(p.id, Math.min(aw, 1.5));
      p.seenByEnemy = sees;
      if (aw >= 1 && d < seenD) { seen = p; seenD = d; }
    }
    return seen;
  }
  hearPlayers(P) {
    let best = null, bestScore = 0;
    for (const p of this.g.alivePlayers()) {
      if (p.hidden) continue;
      const R = p.noiseR * P.hearScale;
      if (R <= 0.5) continue;
      const d = Math.hypot(p.x - this.x, p.z - this.z);
      const eff = d * (this.world.los(this.x, this.z, p.x, p.z) ? 1 : 1.7);
      if (eff <= R) { const score = R - eff; if (score > bestScore) { bestScore = score; best = { p, eff, R }; } }
    }
    return best;
  }

  update(dt, P) {
    const g = this.g, now = g.time;
    if (this.state === ES.SPAWN) { this.relocate(35); return; }
    if (now < this.stunUntil) { this.speed = 0; this.state = ES.STUN; return; }
    if (this.state === ES.STUN) { this.state = ES.PATROL; this.setPath(null); this.timer = 1.5; }
    this.invCool = Math.max(0, (this.invCool || 0) - dt);
    const graceOn = now < this.graceUntil;
    const seen = graceOn ? null : this.senseAll(dt, P);
    const heard = graceOn ? null : this.hearPlayers(P);
    // ruidos puntuales (puertas, objetos, máquinas)
    for (const n of g.noises) {
      if (n.id <= this.noiseSeen) continue;
      this.noiseSeen = n.id;
      if (graceOn || this.state === ES.CHASE) continue;
      const eff = Math.hypot(n.x - this.x, n.z - this.z) * (this.world.los(this.x, this.z, n.x, n.z) ? 1 : 1.5);
      if (eff <= n.r * P.hearScale) this.investigate(n.x + (Math.random() - 0.5) * 2, n.z + (Math.random() - 0.5) * 2, P);
    }
    if (this.state !== ES.CHASE) {
      if (seen) this.startChase(seen);
      else if (heard) {
        if (heard.eff <= heard.R * 0.38) this.startChase(heard.p);
        else this.investigate(heard.p.x + (Math.random() - 0.5) * 2.4, heard.p.z + (Math.random() - 0.5) * 2.4, P);
      }
    }
    // intuición periódica (sin posición exacta)
    this.huntT -= dt;
    if (this.huntT <= 0 && !graceOn) {
      this.huntT = Math.max(30, (85 - 50 * g.tension) * 0.9) * (0.8 + Math.random() * 0.4);
      if (this.state === ES.PATROL) {
        const al = g.alivePlayers().filter((p) => !p.hidden);
        if (al.length) { const p = al[Math.floor(Math.random() * al.length)]; this.investigate(p.x + (Math.random() - 0.5) * 12, p.z + (Math.random() - 0.5) * 12, P); }
      }
    }

    switch (this.state) {
      case ES.PATROL: {
        if (this.pi >= this.path.length) {
          this.speed = 0; this.timer -= dt;
          if (this.timer <= 0) { this.pickPatrol(P); this.timer = 1.5 + Math.random() * 3.5; }
        } else this.follow(dt, P.patrol);
        break;
      }
      case ES.INVESTIGATE: {
        const arrived = this.follow(dt, P.investigate);
        if (arrived) { this.timer -= dt; this.speed = 0; this.yaw += dt * 1.2; if (this.timer <= 0) this.beginSearch(P, 0.45); }
        break;
      }
      case ES.CHASE: this.updateChase(dt, P, seen); break;
      case ES.SEARCH: this.updateSearch(dt, P); break;
      default: break;
    }
    this.checkHidden(dt, P);
    // distancia a jugadores: si lleva mucho lejos, reaparece sin ser visto
    const alive = g.alivePlayers();
    let minD = 1e9; for (const p of alive) minD = Math.min(minD, Math.hypot(p.x - this.x, p.z - this.z));
    this.farT = minD > 55 ? this.farT + dt : 0;
    if (this.farT > 75 && this.state === ES.PATROL) { this.farT = 0; this.relocate(28); }
  }
  investigate(x, z, P) {
    if (this.state === ES.CHASE || this.invCool > 0) return;
    this.invCool = 0.7;
    const p = this.nav.nearestFree(x, z, 4, this.blocked); if (!p) return;
    if (this.goTo(p.x, p.z)) { this.state = ES.INVESTIGATE; this.timer = 2 + Math.random() * 2; this.last = { x: p.x, z: p.z }; }
  }
  startChase(p) {
    if (this.state !== ES.CHASE) this.g.ev({ t: 'en', k: 'alert' });
    this.state = ES.CHASE; this.target = p.id; this.lostT = 0; this.repathT = 0; this.chaseRamp = 0.7; this.last = { x: p.x, z: p.z };
  }
  updateChase(dt, P, seen) {
    const g = this.g, p = g.players.get(this.target);
    if (!p || p.state !== 'alive' || p.hidden === undefined) { this.beginSearch(P, 1); return; }
    if (p.hidden) { // se ha escondido a la vista: va a su última posición conocida
      this.beginSearch(P, 1); return;
    }
    const d = Math.hypot(p.x - this.x, p.z - this.z);
    const visible = d < P.sight * 1.25 && this.world.los(this.x, this.z, p.x, p.z);
    if (visible) { this.lostT = 0; this.last = { x: p.x, z: p.z }; } else this.lostT += dt;
    // si otro jugador está claramente más cerca y visible, cambia de objetivo
    if (seen && seen.id !== this.target) { const ds = Math.hypot(seen.x - this.x, seen.z - this.z); if (ds < d * 0.6) this.target = seen.id; }
    if (this.lostT > P.loseSight) { this.beginSearch(P, 1); return; }
    this.repathT -= dt;
    if (this.repathT <= 0) { this.repathT = visible ? 0.35 : 0.8; this.goTo(this.last.x, this.last.z); }
    this.chaseRamp = Math.min(1, this.chaseRamp + dt * 0.5);
    this.follow(dt, P.chase * this.chaseRamp);
    if (this.pi >= this.path.length && !visible) this.lostT += dt * 2;
  }
  beginSearch(P, factor) {
    this.state = ES.SEARCH; this.searchLeft = P.search * factor; this.waitT = 0;
    const base = this.last || { x: this.x, z: this.z };
    const q = [base];
    const near = this.pois.filter((s) => Math.hypot(s.x - base.x, s.z - base.z) < 18);
    for (let i = 0; i < 3 && near.length; i++) q.push(near.splice(Math.floor(Math.random() * near.length), 1)[0]);
    // escondites cercanos
    for (const h of this.map.hides) {
      if (Math.hypot(h.x - base.x, h.z - base.z) < 10 && Math.random() < 0.6) q.splice(1, 0, { x: h.exitX, z: h.exitZ, hide: h.id });
    }
    this.searchQ = q; this.target = null; this.setPath(null); this.cur = null;
  }
  updateSearch(dt, P) {
    this.searchLeft -= dt;
    if (this.searchLeft <= 0) { this.state = ES.PATROL; this.setPath(null); this.timer = 1; return; }
    if (this.waitT > 0) { this.waitT -= dt; this.speed = 0; this.yaw += dt * 1.6 * Math.sin(this.g.time * 1.3); return; }
    if (!this.cur || this.pi >= this.path.length) {
      if (this.cur) { this.waitT = 1.2 + Math.random() * 1.8; this.cur = null; return; }
      const nxt = this.searchQ.shift();
      if (!nxt) { this.state = ES.PATROL; this.setPath(null); return; }
      this.cur = nxt;
      if (!this.goTo(nxt.x, nxt.z)) this.cur = null;
      return;
    }
    this.follow(dt, P.investigate);
  }
  // Revisa escondites ocupados cuando está buscando
  checkHidden(dt, P) {
    if (this.state !== ES.SEARCH && this.state !== ES.INVESTIGATE && this.state !== ES.CHASE) { this.checkT = 0; return; }
    const g = this.g;
    for (const p of g.alivePlayers()) {
      if (!p.hidden) continue;
      const h = this.map.hides.find((q) => q.id === p.hidden); if (!h) continue;
      const d = Math.hypot(h.x - this.x, h.z - this.z);
      if (d < 1.6 && (this.checkedUntil.get(h.id) || 0) < g.time) {
        this.checkT += dt; this.speed = 0; this.stall = Math.max(this.stall, 0.1);
        if (this.checkT > 2.4) {
          this.checkT = 0; this.checkedUntil.set(h.id, g.time + 18);
          if (Math.random() < P.find) { g.capture(p, 'found'); } else g.ev({ t: 'en', k: 'sniff', x: this.x, z: this.z });
        }
        return;
      }
    }
    this.checkT = 0;
  }
  code() { return this.state; }
}

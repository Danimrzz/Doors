// Partida cooperativa: el servidor es la autoridad sobre mapa, objetos, puertas, misiones, enemigo y capturas
import { generateHotel } from '../shared/mapgen.js';
import { World } from '../shared/collision.js';
import { Nav } from '../shared/nav.js';
import {
  CELL, ENEMY_R, DIFFICULTIES, DIFFICULTY_ID, playerScaling, INTERACT_DIST, RUN_SPEED, TICK_HZ, PLAYER_R,
} from '../shared/config.js';
import { LOCK_ITEM, ITEM_NAMES } from '../shared/missions.js';
import { Enemy, ES } from './enemy.js';

const REVIVE_TIME = 4, BLEED_TIME = 80, HIDE_MAX = 30;
const EVENT_TYPES = ['lightOut', 'lightOn', 'farDoor', 'silhouette', 'thump', 'creak', 'elevator', 'silence', 'roomChange', 'whisper'];

export class Game {
  constructor(room, settings) {
    this.room = room; this.settings = settings;
    this.diff = DIFFICULTIES[DIFFICULTY_ID];
    this.players = new Map();
    const n = Math.max(1, room.conns.size);
    const seed = settings.seed || Math.random().toString(36).slice(2, 8).toUpperCase();
    this.seed = seed;
    this.map = generateHotel({ seed, difficulty: DIFFICULTY_ID, players: n });
    this.world = new World(this.map);
    this.nav = new Nav(this.world, ENEMY_R);
    this.missions = new Map(this.map.missions.map((m) => [m.id, { ...m, done: false }]));
    this.items = new Map(this.map.items.map((i) => [i.id, i]));
    this.taken = new Set(); this.inv = {};
    this.power = !this.map.power; this.exitUnlocked = false; this.finalPhase = false;
    this.tension = 0; this.time = 0; this.tickN = 0; this.ended = false;
    this.noises = []; this.noiseId = 0;
    this.sc = playerScaling(n); this.scT = 0;
    this.spawnIdx = 0; this.captures = 0; this.codeFails = 0; this.codeLockUntil = 0;
    this.nextEv = 25 + Math.random() * 15; this.lastEv = []; this.evCount = 0;
    this.endAt = null; this.endResult = null;
    this.visited = new Set();
    // JSON público del mapa: sin el código ni datos de generación internos
    const pub = JSON.parse(JSON.stringify(this.map));
    delete pub.code; delete pub.groups; delete pub.lockOrder; delete pub.wingLock;
    for (const it of pub.items) delete it.code;
    this.publicMap = pub;
    this.enemy = new Enemy(this);
    this.enemy.graceUntil = process.env.HN_TEST_NOENEMY ? Infinity : this.diff.enemy.grace; // (variable solo para pruebas automáticas)
    for (const conn of room.conns.values()) this.addPlayer(conn);
    this.enemy.relocate(35);
    this.enemy.huntT = 45;
    this.interval = setInterval(() => this.tick(1 / TICK_HZ), 1000 / TICK_HZ);
    this.lastTickAt = Date.now();
  }

  // ---------- utilidades ----------
  alivePlayers() { const a = []; for (const p of this.players.values()) if (p.state === 'alive') a.push(p); return a; }
  send(p, obj) { if (p.conn) p.conn.send(obj); }
  ev(obj) { this.room.broadcast(obj); }
  msg(p, m, k = 'info') { this.send(p, { t: 'msg', m, k }); }
  noise(x, z, r) { this.noises.push({ id: ++this.noiseId, x, z, r, t: this.time }); if (this.noises.length > 20) this.noises.shift(); }
  setDoor(id, open, by) {
    this.world.doorOpen[id] = open;
    const d = this.map.doors[id];
    this.ev({ t: 'door', id, open, by: by === 'enemy' ? 'enemy' : by });
    if (by !== 'enemy') this.noise((d.cx + 0.5) * CELL, (d.cy + 0.5) * CELL, 6);
  }
  fullState() {
    return {
      doors: this.map.doors.map((d) => [d.id, this.world.doorOpen[d.id] ? 1 : 0, this.world.doorLocked[d.id] ? 1 : 0]),
      taken: [...this.taken], done: [...this.missions.values()].filter((m) => m.done).map((m) => m.id),
      inv: this.inv, power: this.power, exit: this.exitUnlocked, final: this.finalPhase, elapsed: this.time,
    };
  }
  playerList() { return [...this.players.values()].map((p) => ({ id: p.id, name: p.name, state: p.state })); }

  addPlayer(conn) {
    const pts = this.map.spawn.pts;
    const sp = pts[this.spawnIdx++ % pts.length];
    const p = {
      id: conn.id, name: conn.name, conn, x: sp.x, z: sp.z, yaw: this.map.spawn.yaw, pitch: 0, fl: false, run: false, moving: false,
      state: 'alive', hidden: null, hideT: 0, bat: 1, noiseR: 0, burstR: 0, burstT: 0, invuln: this.time > 1 ? 6 : 0, down: null,
      reviving: null, lastT: this.time, lastX: sp.x, lastZ: sp.z, bucket: 80, seenByEnemy: false, escaped: false, room: 0,
    };
    this.players.set(p.id, p);
    this.send(p, {
      t: 'start', you: p.id, map: this.publicMap, diff: this.diff.id, mode: this.settings.captureMode, seed: this.seed,
      players: this.playerList(), state: this.fullState(), bat: p.bat, pos: { x: p.x, z: p.z, yaw: p.yaw },
    });
    if (this.time > 1) this.ev({ t: 'join', id: p.id, name: p.name });
    this.ev({ t: 'players', players: this.playerList() });
    return p;
  }
  removePlayer(id) {
    const p = this.players.get(id); if (!p) return;
    this.players.delete(id);
    this.ev({ t: 'leave', id, name: p.name });
    this.ev({ t: 'players', players: this.playerList() });
    if (this.enemy.target === id) { this.enemy.beginSearch(this.enemyParams(), 1); }
    if (!this.players.size) { this.stop(); return; }
    this.checkEnd();
  }
  stop() { clearInterval(this.interval); this.interval = null; this.ended = true; }

  // ---------- entrada de jugadores ----------
  onMessage(conn, m) {
    const p = this.players.get(conn.id); if (!p || this.ended) return;
    switch (m.t) {
      case 'st': return this.onState(p, m);
      case 'use': return this.onUse(p, m);
      case 'code': return this.onCode(p, m);
      case 'rv': p.reviving = m.on ? String(m.id) : null; return;
      default: return;
    }
  }
  onState(p, m) {
    if (p.bucket < 1) return;
    p.bucket -= 1;
    const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : null);
    const x = num(m.x), z = num(m.z), yaw = num(m.yaw), pitch = num(m.pitch);
    if (yaw !== null) p.yaw = yaw; if (pitch !== null) p.pitch = Math.max(-1.5, Math.min(1.5, pitch));
    if (p.state === 'dead' || p.state === 'escaped') return;
    p.fl = !!m.fl;
    if (p.state === 'downed' || p.hidden) { p.moving = false; p.run = false; return; }
    if (x === null || z === null) return;
    const dt = Math.max(0.02, this.time - p.lastT);
    const maxD = RUN_SPEED * 1.6 * dt + 0.6;
    const d = Math.hypot(x - p.x, z - p.z);
    if (d > maxD || this.world.circleBlocked(x, z, PLAYER_R * 0.6)) {
      this.send(p, { t: 'corr', x: p.x, z: p.z });
      return;
    }
    p.moving = d / dt > 0.5 && d > 0.02;
    p.run = !!m.run && p.moving;
    p.x = x; p.z = z; p.lastT = this.time;
    p.room = this.world.roomAt(x, z);
    // salida: cruzar la puerta de emergencia con la salida desbloqueada
    if (this.exitUnlocked && this.world.typeAt(x, z) === 5) this.escape(p);
  }
  near(p, x, z, extra = 0.6) { return Math.hypot(p.x - x, p.z - z) <= INTERACT_DIST + extra; }
  onUse(p, m) {
    if (p.state !== 'alive') return;
    if (m.k === 'item') return this.pickItem(p, String(m.id));
    if (m.k === 'door') return this.useDoor(p, Number(m.id));
    if (m.k === 'term') return this.useTerminal(p, String(m.id));
    if (m.k === 'hide') return this.hide(p, String(m.id));
    if (m.k === 'unhide') return this.unhide(p);
  }
  pickItem(p, id) {
    if (p.hidden) return;
    const it = this.items.get(id);
    if (!it || this.taken.has(id)) return;
    if (!this.near(p, it.x, it.z) || !this.world.los(p.x, p.z, it.x, it.z)) return;
    this.taken.add(id);
    if (it.kind === 'battery') { this.send(p, { t: 'bat', add: 1 }); }
    else { this.inv[it.kind] = it.kind === 'codeNote' ? this.map.code : 1; this.ev({ t: 'inv', inv: this.inv }); }
    this.ev({ t: 'item', id, by: p.id, kind: it.kind });
    this.noise(it.x, it.z, 3.5);
    if (it.mission) this.completeMission(it.mission);
  }
  useDoor(p, id) {
    const d = this.map.doors[id]; if (!d || p.hidden) return;
    const cx = (d.cx + 0.5) * CELL, cz = (d.cy + 0.5) * CELL;
    if (!this.near(p, cx, cz) || !this.world.los(p.x, p.z, cx, cz, id)) return;
    const w = this.world;
    if (w.doorLocked[id]) {
      if (d.lock === 'exit') {
        const miss = [...this.missions.values()].filter((m) => !m.done).map((m) => m.title);
        return this.msg(p, 'La puerta de emergencia está bloqueada. Faltan: ' + miss.join('; ') + '.', 'warn');
      }
      const need = LOCK_ITEM[d.lock];
      if (this.inv[need]) {
        w.doorLocked[id] = false;
        this.setDoor(id, true, p.id);
        this.ev({ t: 'unlock', id, by: p.id, lock: d.lock });
        return;
      }
      const hints = { key: 'Está cerrada con llave. Necesitas la llave maestra.', card: 'El lector parpadea en rojo. Necesitas una tarjeta de acceso.', board: 'Está atrancada con tablones. Necesitas una palanca.' };
      this.noise(cx, cz, 3);
      return this.ev({ t: 'locked', id, by: p.id, msg: hints[d.lock] || 'Está cerrada.' });
    }
    if (w.doorOpen[id]) {
      // no cerrar con alguien en el hueco
      if (Math.hypot(this.enemy.x - cx, this.enemy.z - cz) < 1.3) return this.msg(p, 'Algo te impide cerrar la puerta…', 'warn');
      for (const q of this.players.values()) if (q.id !== p.id && Math.hypot(q.x - cx, q.z - cz) < 0.9) return;
      this.setDoor(id, false, p.id);
    } else this.setDoor(id, true, p.id);
  }
  useTerminal(p, id) {
    const t = this.map.terminals.find((q) => q.id === id); if (!t || p.hidden) return;
    if (!this.near(p, t.x, t.z)) return;
    if (t.kind === 'fusebox') {
      const m = this.missions.get('m_power'); if (!m || m.done) return;
      if (!this.inv.fuse) return this.msg(p, 'La caja de fusibles está vacía. Falta un fusible.', 'warn');
      this.power = true; this.noise(t.x, t.z, 8);
      this.ev({ t: 'power', on: true, by: p.id });
      this.completeMission('m_power');
    } else if (t.kind === 'lever') {
      const m = this.missions.get('m_lever'); if (!m || m.done) return;
      this.noise(t.x, t.z, 16);
      this.ev({ t: 'machine', x: t.x, z: t.z });
      this.completeMission('m_lever');
    } else if (t.kind === 'elevator') this.msg(p, 'El ascensor está fuera de servicio… pero algo suena dentro.', 'info');
  }
  onCode(p, m) {
    if (p.state !== 'alive' || p.hidden) return;
    const t = this.map.terminals.find((q) => q.kind === 'keypad'); const mis = this.missions.get('m_code');
    if (!t || !mis || mis.done || !this.near(p, t.x, t.z)) return;
    if (this.time < this.codeLockUntil) return this.msg(p, 'El panel está bloqueado temporalmente.', 'warn');
    if (String(m.value) === this.map.code) { this.noise(t.x, t.z, 6); this.ev({ t: 'keypad', ok: true, by: p.id }); this.completeMission('m_code'); }
    else {
      this.codeFails++; this.noise(t.x, t.z, 10);
      this.ev({ t: 'keypad', ok: false, by: p.id });
      if (this.codeFails % 3 === 0) { this.codeLockUntil = this.time + 12; this.msg(p, 'Alarma del panel. Alguien ha podido oírla.', 'warn'); }
    }
  }
  hide(p, id) {
    if (p.hidden) return;
    const h = this.map.hides.find((q) => q.id === id); if (!h) return;
    if (!this.near(p, h.x, h.z)) return;
    for (const q of this.players.values()) if (q.hidden === id) return this.msg(p, 'Ya hay alguien escondido ahí.', 'warn');
    const e = this.enemy;
    if (e.state === ES.CHASE && Math.hypot(e.x - p.x, e.z - p.z) < 14 && this.world.los(e.x, e.z, p.x, p.z)) return this.msg(p, 'Te está viendo. No puedes esconderte ahora.', 'warn');
    p.hidden = id; p.hideT = 0; p.x = h.x; p.z = h.z; p.moving = false; p.run = false;
    this.send(p, { t: 'corr', x: h.x, z: h.z });
    this.send(p, { t: 'hid', spot: id });
    this.noise(h.x, h.z, 2);
  }
  unhide(p, forced = false) {
    if (!p.hidden) return;
    const h = this.map.hides.find((q) => q.id === p.hidden);
    p.hidden = null;
    this.send(p, { t: 'unh' });
    if (h) { p.x = h.exitX; p.z = h.exitZ; p.lastT = this.time; this.send(p, { t: 'corr', x: h.exitX, z: h.exitZ }); }
    if (forced) { this.noise(p.x, p.z, 9); this.msg(p, 'Te falta el aire. Sales jadeando.', 'warn'); }
  }
  escape(p) {
    if (p.state !== 'alive') return;
    p.state = 'escaped'; p.escaped = true;
    this.ev({ t: 'escaped', id: p.id, name: p.name });
    this.checkEnd();
  }

  // ---------- misiones ----------
  completeMission(id) {
    const m = this.missions.get(id); if (!m || m.done) return;
    m.done = true;
    const all = [...this.missions.values()], done = all.filter((q) => q.done).length;
    this.tension = done / all.length;
    this.ev({ t: 'mission', id, done, total: all.length });
    if (done === all.length) this.unlockExit();
  }
  unlockExit() {
    this.exitUnlocked = true; this.finalPhase = true; this.world.doorLocked[0] = false;
    this.ev({ t: 'exit', unlocked: true });
    this.enemy.huntT = 3; if (!process.env.HN_TEST_NOENEMY) this.enemy.graceUntil = 0;
  }

  // ---------- enemigo y captura ----------
  enemyParams() {
    const d = this.diff.enemy, s = this.sc, fin = this.finalPhase;
    const mult = s.speed * (1 + 0.1 * this.tension + (fin ? 0.1 : 0));
    return {
      patrol: d.patrol * mult, investigate: d.investigate * mult, chase: Math.min(5.0, d.chase * mult),
      sight: d.sight * (fin ? 1.15 : 1), fov: d.fov, detect: (d.detect * s.detect) / (fin ? 1.25 : 1),
      hearScale: s.hearing * (fin ? 1.2 : 1), hearWalk: d.hearWalk, hearRun: d.hearRun,
      loseSight: d.loseSight, search: d.search * s.search * (fin ? 1.3 : 1), find: d.find,
    };
  }
  capture(p, how = 'caught') {
    if (p.state !== 'alive' || this.ended) return;
    const mode = this.settings.captureMode;
    const others = this.alivePlayers().filter((q) => q.id !== p.id);
    p.hidden = null; p.reviving = null; this.captures++;
    if (mode === 'eliminated') p.state = 'dead';
    else if (mode === 'teamLoss') { p.state = 'dead'; this.endAt = this.time + 3.4; this.endResult = 'defeat'; }
    else if (others.length) { p.state = 'downed'; p.down = { bleed: BLEED_TIME, rev: 0 }; }
    else p.state = 'dead';
    this.ev({ t: 'caught', id: p.id, name: p.name, state: p.state, how, ex: this.enemy.x, ez: this.enemy.z });
    this.enemy.stunUntil = this.time + 3.8; this.enemy.state = ES.STUN; this.enemy.setPath(null); this.enemy.speed = 0;
    this.enemy.aw.clear();
    this.noise(p.x, p.z, 14);
    this.checkEnd();
  }
  checkEnd() {
    if (this.ended || this.endAt !== null) return;
    const alive = this.alivePlayers().length;
    if (alive > 0) return;
    const escaped = [...this.players.values()].filter((p) => p.escaped).length;
    this.endAt = this.time + (escaped ? 1.2 : 3.4);
    this.endResult = escaped ? 'victory' : 'defeat';
  }
  finish() {
    if (this.ended) return;
    const stats = {
      result: this.endResult || 'defeat', time: Math.round(this.time), seed: this.seed,
      done: [...this.missions.values()].filter((m) => m.done).length, total: this.missions.size,
      escaped: [...this.players.values()].filter((p) => p.escaped).map((p) => p.name),
      players: [...this.players.values()].map((p) => ({ name: p.name, state: p.state })), captures: this.captures,
      missions: [...this.missions.values()].map((m) => ({ title: m.title, done: m.done })),
    };
    this.stop();
    this.room.onGameEnd(stats);
  }

  // ---------- director de terror ----------
  pointNear(p, minD, maxD, needLOS) {
    for (let t = 0; t < 40; t++) {
      const a = Math.random() * Math.PI * 2, d = minD + Math.random() * (maxD - minD);
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      if (!this.nav.isFree(x, z)) continue;
      if (needLOS && !this.world.los(p.x, p.z, x, z)) continue;
      return { x, z };
    }
    return null;
  }
  director(dt) {
    if (this.time < this.nextEv) return;
    const al = this.alivePlayers(); if (!al.length) return;
    const chasing = this.enemy.state === ES.CHASE;
    const interval = (18 + Math.random() * 24) / (this.diff.events * this.sc.events) * (1 - 0.35 * this.tension);
    this.nextEv = this.time + interval * (chasing ? 1.6 : 1);
    const p = al[Math.floor(Math.random() * al.length)];
    const e = this.enemy, ed = Math.hypot(e.x - p.x, e.z - p.z);
    const opts = EVENT_TYPES.filter((k) => !this.lastEv.slice(-2).includes(k) && !(k === 'silhouette' && this.time < 90) && !(k === 'silence' && (ed < 14 || chasing)) && !(k === 'roomChange' && this.visited.size < 4));
    const k = opts[Math.floor(Math.random() * opts.length)];
    this.lastEv.push(k); this.evCount++;
    const map = this.map;
    switch (k) {
      case 'lightOut': {
        const c = map.lights.filter((l) => l.mode !== 'broken' && Math.hypot(l.x - p.x, l.z - p.z) < 14 && Math.hypot(l.x - p.x, l.z - p.z) > 3);
        if (c.length) this.ev({ t: 'hz', k, l: c[Math.floor(Math.random() * c.length)].id, dur: 6 + Math.random() * 12 });
        break;
      }
      case 'lightOn': {
        const c = map.lights.filter((l) => l.mode === 'broken' && Math.hypot(l.x - p.x, l.z - p.z) < 30 && !al.some((q) => this.world.roomAt(q.x, q.z) === l.room));
        if (c.length) this.ev({ t: 'hz', k, l: c[Math.floor(Math.random() * c.length)].id, dur: 5 + Math.random() * 10 });
        break;
      }
      case 'silhouette': {
        const pt = this.pointNear(p, 10, 18, true);
        if (pt && Math.hypot(pt.x - e.x, pt.z - e.z) > 6) this.ev({ t: 'hz', k, pid: p.id, x: pt.x, z: pt.z, dur: 0.5 + Math.random() * 0.5 });
        break;
      }
      case 'thump': {
        // a veces avisa de un peligro real (cerca del enemigo), a veces es puro ambiente
        const real = ed < 32 && Math.random() < 0.5;
        const pt = real ? { x: e.x, z: e.z } : this.pointNear(p, 5, 14, false);
        if (pt) this.ev({ t: 'hz', k, x: pt.x, z: pt.z, real: real ? 1 : 0 });
        break;
      }
      case 'creak': case 'whisper': { const pt = this.pointNear(p, 4, 12, false); if (pt) this.ev({ t: 'hz', k, x: pt.x, z: pt.z }); break; }
      case 'elevator': { const t = map.terminals.find((q) => q.kind === 'elevator'); if (t) this.ev({ t: 'hz', k, x: t.x, z: t.z }); break; }
      case 'silence': this.enemy.silentUntil = this.time + 8; this.ev({ t: 'hz', k, dur: 8 }); break;
      case 'roomChange': {
        const c = [...this.visited].filter((r) => r > 0 && !al.some((q) => this.world.roomAt(q.x, q.z) === r));
        if (c.length) this.ev({ t: 'hz', k, room: c[Math.floor(Math.random() * c.length)] });
        break;
      }
      case 'farDoor': this.ev({ t: 'hz', k }); break;
      default: break;
    }
  }

  // ---------- bucle principal ----------
  tick(dt) {
    if (this.ended) return;
    this.time += dt; this.tickN++;
    const P = this.enemyParams();
    // escalado dinámico controlado por el nº de jugadores conectados
    this.scT += dt;
    if (this.scT >= 2) {
      this.scT = 0;
      const target = playerScaling(this.players.size), a = 0.35;
      for (const k of Object.keys(target)) this.sc[k] = this.sc[k] + (target[k] - this.sc[k]) * a;
    }
    for (const p of this.players.values()) {
      p.bucket = Math.min(80, p.bucket + 60 * dt);
      p.invuln = Math.max(0, p.invuln - dt);
      let R = 0;
      if (p.state === 'alive') {
        if (p.hidden) { R = 0.3; p.hideT += dt; if (p.hideT > HIDE_MAX) this.unhide(p, true); }
        else R = p.run ? P.hearRun : p.moving ? P.hearWalk : 1.0;
      }
      p.noiseR = R;
      if (p.state === 'alive' && p.room > 0) this.visited.add(p.room);
      if (p.state === 'downed') {
        p.down.bleed -= dt;
        const helper = [...this.players.values()].find((q) => q.state === 'alive' && q.reviving === p.id && Math.hypot(q.x - p.x, q.z - p.z) < 2.8 && !q.hidden);
        if (helper) { p.down.rev += dt; if (p.down.rev === dt) this.noise(p.x, p.z, 3); } else p.down.rev = Math.max(0, p.down.rev - dt * 0.5);
        if (p.down.rev >= REVIVE_TIME) {
          p.state = 'alive'; p.invuln = 6; p.down = null; p.lastT = this.time;
          this.ev({ t: 'revived', id: p.id, name: p.name });
        } else if (p.down.bleed <= 0) {
          p.state = 'dead'; p.down = null; this.ev({ t: 'dead', id: p.id, name: p.name }); this.checkEnd();
        }
      }
    }
    // el enemigo
    this.enemy.update(dt, P);
    const e = this.enemy;
    if (e.state !== ES.STUN && this.time >= e.stunUntil && this.time >= e.graceUntil) {
      for (const p of this.alivePlayers()) {
        if (p.invuln > 0 || p.hidden) continue;
        if (Math.hypot(p.x - e.x, p.z - e.z) < 0.95 && this.world.los(e.x, e.z, p.x, p.z)) { this.capture(p); break; }
      }
    }
    this.director(dt);
    if (this.endAt !== null && this.time >= this.endAt) return this.finish();
    this.snapshot();
  }
  snapshot() {
    const e = this.enemy;
    const plist = [];
    for (const p of this.players.values()) {
      const flags = (p.fl ? 1 : 0) | (p.run ? 2 : 0) | (p.moving ? 4 : 0) | (p.hidden ? 8 : 0);
      const st = { alive: 0, downed: 1, dead: 2, escaped: 3 }[p.state];
      plist.push([p.id, +p.x.toFixed(2), +p.z.toFixed(2), +p.yaw.toFixed(2), +p.pitch.toFixed(2), flags, st, p.down ? +(p.down.rev / REVIVE_TIME).toFixed(2) : 0, p.down ? Math.max(0, Math.round(p.down.bleed)) : 0]);
    }
    const base = { t: 's', tm: +this.time.toFixed(1), tn: +this.tension.toFixed(2), fp: this.finalPhase ? 1 : 0 };
    for (const p of this.players.values()) {
      const d = Math.hypot(e.x - p.x, e.z - p.z);
      const view = d < 48 ? { x: +e.x.toFixed(2), z: +e.z.toFixed(2), yaw: +e.yaw.toFixed(2), st: e.state, sp: +e.speed.toFixed(1), sil: this.time < e.silentUntil ? 1 : 0, tg: e.state === ES.CHASE && e.target === p.id ? 1 : 0 } : null;
      this.send(p, { ...base, p: plist, e: view });
    }
  }
}

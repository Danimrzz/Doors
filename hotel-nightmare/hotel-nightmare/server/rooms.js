// Salas privadas con códigos de 5 caracteres alfanuméricos, anfitrión, ajustes y ciclo de vida
import { Game } from './game.js';
import { ROOM_CODE_ALPHABET, ROOM_CODE_RE, MAX_PLAYERS, CAPTURE_MODES, DEFAULT_CAPTURE_MODE } from '../shared/config.js';

const IDLE_MS = 30 * 60 * 1000;
export const cleanName = (s) => String(s ?? '').replace(/[\u0000-\u001f<>&"'`\\]/g, '').trim().slice(0, 16) || 'Jugador';

export class Room {
  constructor(code, host, manager) {
    this.code = code; this.manager = manager; this.conns = new Map(); this.hostId = null; this.state = 'lobby'; this.game = null;
    this.settings = { captureMode: DEFAULT_CAPTURE_MODE, seed: '' };
    this.touch(); this.add(host);
  }
  touch() { this.lastActive = Date.now(); }
  add(conn) {
    this.conns.set(conn.id, conn); conn.room = this;
    if (!this.hostId) this.hostId = conn.id;
    this.touch();
  }
  broadcast(obj) { const s = JSON.stringify(obj); for (const c of this.conns.values()) c.sendRaw(s); }
  lobbyInfo() {
    return {
      t: 'lobby', code: this.code, host: this.hostId, state: this.state, settings: this.settings,
      players: [...this.conns.values()].map((c) => ({ id: c.id, name: c.name })), max: MAX_PLAYERS,
    };
  }
  sendLobby() { this.broadcast(this.lobbyInfo()); }
  setSettings(conn, s) {
    if (conn.id !== this.hostId || this.state !== 'lobby') return;
    if (CAPTURE_MODES[s.captureMode]) this.settings.captureMode = s.captureMode;
    if (typeof s.seed === 'string') this.settings.seed = s.seed.replace(/[^\w\- ]/g, '').slice(0, 24);
    this.touch(); this.sendLobby();
  }
  start(conn) {
    if (conn.id !== this.hostId || this.state !== 'lobby' || !this.conns.size) return;
    this.state = 'playing'; this.touch();
    try { this.game = new Game(this, { ...this.settings }); }
    catch (e) { console.error('Error al iniciar partida', e); this.state = 'lobby'; this.game = null; conn.send({ t: 'err', m: 'No se pudo generar el hotel. Inténtalo de nuevo.' }); return; }
    this.sendLobby();
  }
  onGameEnd(stats) {
    this.broadcast({ t: 'end', stats });
    this.game = null; this.state = 'lobby'; this.touch();
    this.sendLobby();
  }
  leave(conn) {
    if (!this.conns.has(conn.id)) return;
    this.conns.delete(conn.id); conn.room = null;
    if (this.game) this.game.removePlayer(conn.id);
    if (!this.conns.size) { this.manager.destroy(this); return; }
    if (this.hostId === conn.id) { this.hostId = this.conns.keys().next().value; this.broadcast({ t: 'hostChanged', host: this.hostId, name: this.conns.get(this.hostId).name }); }
    this.sendLobby();
  }
  destroy() { if (this.game) { this.game.stop(); this.game = null; } for (const c of this.conns.values()) c.room = null; this.conns.clear(); }
}

export class RoomManager {
  constructor() { this.rooms = new Map(); this.timer = setInterval(() => this.sweep(), 60_000); this.timer.unref?.(); }
  genCode() {
    for (let i = 0; i < 1000; i++) {
      let c = '';
      for (let k = 0; k < 5; k++) c += ROOM_CODE_ALPHABET[Math.floor(Math.random() * ROOM_CODE_ALPHABET.length)];
      if (!/[A-Z]/.test(c) || !/[0-9]/.test(c)) continue; // letras y números
      if (!this.rooms.has(c)) return c;
    }
    throw new Error('sin códigos libres');
  }
  create(conn) {
    if (conn.room) conn.room.leave(conn);
    const room = new Room(this.genCode(), conn, this);
    this.rooms.set(room.code, room);
    return room;
  }
  join(conn, code) {
    code = String(code || '').toUpperCase().trim();
    if (!ROOM_CODE_RE.test(code)) return { err: 'El código debe tener 5 letras o números.' };
    const room = this.rooms.get(code);
    if (!room) return { err: 'No existe ninguna sala con ese código (o ha expirado).' };
    if (room.conns.size >= MAX_PLAYERS) return { err: `La sala está llena (máximo ${MAX_PLAYERS}).` };
    if (conn.room) conn.room.leave(conn);
    room.add(conn);
    return { room };
  }
  destroy(room) { room.destroy(); this.rooms.delete(room.code); }
  sweep() {
    const now = Date.now();
    for (const room of [...this.rooms.values()]) {
      if (!room.conns.size || (room.state === 'lobby' && now - room.lastActive > IDLE_MS)) this.destroy(room);
    }
  }
}

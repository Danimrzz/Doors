// Núcleo del cliente: escena, bucle de juego, sincronización con el servidor, enemigo, efectos y HUD
import * as THREE from 'three';
import { EYE_H, DIFFICULTIES, DIFFICULTY_ID, INTERACT_DIST, CELL } from '/shared/config.js';
import { World } from '/shared/collision.js';
import { ITEM_NAMES } from '/shared/missions.js';
import { WorldView } from './world.js';
import { buildEnemy, animateEnemy, buildAvatar, buildSilhouette } from './models.js';
import { Player } from './player.js';
import * as UI from './ui.js';
import { nameTexture, radialTexture } from './textures.js';
import { Anomalies } from './anomalies.js';
import { buildDetails } from './details.js';
import { buildDetails2 } from './details2.js';
import { buildDetails3 } from './details3.js';
import { buildDetails4 } from './details4.js';
import { buildDetails5 } from './details5.js';

const $ = UI.$;
const QUALITY = {
  low: { pr: 0.7, shadow: 0, pool: 3, fog: 0.06, power: 13 },
  medium: { pr: 1, shadow: 512, pool: 4, fog: 0.052, power: 13 },
  high: { pr: 1.25, shadow: 1024, pool: 6, fog: 0.046, power: 12 },
};
const AVATAR_COLORS = [0x3f6fa8, 0x4a8a56, 0xa8743f, 0x8a4aa8, 0xa84a5a, 0x4aa8a0];
const angLerp = (a, b, k) => { let d = (b - a) % (Math.PI * 2); if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2; return a + d * k; };

export class Game {
  constructor(canvas, net, audio) {
    this.canvas = canvas; this.net = net; this.audio = audio; this.running = false;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.2;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.applyQuality();
    addEventListener('resize', () => this.resize());
    document.addEventListener('pointerlockchange', () => this.onLockChange());
    addEventListener('keydown', (e) => this.onKey(e));
    this.grain = $('grain').getContext('2d'); this.grainT = 0;
    this.onExit = null;
  }
  applyQuality() {
    const q = QUALITY[UI.settings.quality] || QUALITY.medium; this.q = q;
    this.pr = Math.min(devicePixelRatio || 1, q.pr); this.renderer.setPixelRatio(this.pr); this.resize();
    if (this.flash) { this.flash.castShadow = q.shadow > 0; if (q.shadow) { this.flash.shadow.mapSize.set(q.shadow, q.shadow); if (this.flash.shadow.map) { this.flash.shadow.map.dispose(); this.flash.shadow.map = null; } } }
    if (this.scene && this.scene.fog) this.scene.fog.density = q.fog * (this.view && this.view.emergency ? 1.2 : 1);
  }
  resize() { this.renderer.setSize(innerWidth, innerHeight, false); if (this.camera) { this.camera.aspect = innerWidth / innerHeight; this.camera.updateProjectionMatrix(); } }

  // ================= INICIO / FIN DE PARTIDA =================
  start(msg) {
    this.stop();
    this.me = msg.you; this.map = msg.map; this.diff = DIFFICULTIES[DIFFICULTY_ID]; this.mode = msg.mode; this.seed = msg.seed;
    this.names = {}; this.states = {}; for (const p of msg.players) { this.names[p.id] = p.name; this.states[p.id] = p.state; }
    this.playersList = msg.players;
    this.world = new World(this.map);
    const st = msg.state;
    for (const [id, open, locked] of st.doors) { this.world.doorOpen[id] = !!open; this.world.doorLocked[id] = !!locked; }
    this.world.taken = new Set(st.taken);
    this.done = new Set(st.done); this.inv = { ...st.inv }; this.final = st.final; this.exitUnlocked = st.exit; this.power = st.power;
    this.missions = this.map.missions;
    this.scene = new THREE.Scene(); this.scene.background = new THREE.Color(0x030406);
    this.scene.fog = new THREE.FogExp2(0x040507, this.q.fog);
    this.scene.add(new THREE.HemisphereLight(0x5a4c38, 0x1a1208, 1.0 * this.diff.ambient));
    this.scene.add(new THREE.AmbientLight(0x2a2418, 1.0 * this.diff.ambient));
    this.view = new WorldView(this.scene, this.world, { glow: this.diff.glow, lightPool: this.q.pool, lightPower: this.q.power });
    this.anom = new Anomalies(this.view, this.map, this.world, this.seed); this.anomSeen = new Set(); this.lastRoom = -1;
    try { buildDetails(this.view, this.map, this.world, this.seed); } catch (e) { console.warn('detalles', e); }
    try { buildDetails2(this.view, this.map, this.world, this.seed); } catch (e) { console.warn('detalles2', e); }
    try { buildDetails3(this.view, this.map, this.world, this.seed); } catch (e) { console.warn('detalles3', e); }
    try { buildDetails4(this.view, this.map, this.world); } catch (e) { console.warn('detalles4', e); }
    try { buildDetails5(this.view, this.map, this.world); } catch (e) { console.warn('detalles5', e); }
    this.buildDust();
    if (this.power && this.map.power) this.view.setPower(true);
    if (this.exitUnlocked) { this.view.setDoor(0, !!this.world.doorOpen[0], false, true); this.view.setEmergency(true); }
    this.camera = new THREE.PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 120); this.camera.rotation.order = 'YXZ';
    this.scene.add(this.camera);
    // linterna
    this.flash = new THREE.SpotLight(0xfff0d6, 60, 24, this.diff.flAngle, 0.55, 1.6);
    this.flash.castShadow = this.q.shadow > 0; if (this.q.shadow) { this.flash.shadow.mapSize.set(this.q.shadow, this.q.shadow); this.flash.shadow.bias = -0.0006; this.flash.shadow.camera.near = 0.15; this.flash.shadow.camera.far = 32; }
    this.scene.add(this.flash); this.scene.add(this.flash.target); this.flQuat = new THREE.Quaternion();
    // jugador
    this.player = new Player(this.world, this.diff, UI.settings); this.player.attach(this.canvas);
    this.player.x = msg.pos.x; this.player.z = msg.pos.z; this.player.yaw = msg.pos.yaw; this.player.bat = msg.bat || 0;
    this.player.onStep = (run) => { this.audio.step(run); this.sendNow = true; };
    this.player.onBattery = () => { UI.toast('Has cambiado las pilas de la linterna.'); this.audio.click(); this.updateBatteryHud(); };
    this.player.onFlash = (on, dead) => { this.audio.click(); if (dead) UI.toast('La linterna se ha quedado sin pilas.', 'warn'); };
    this.hiddenSpot = null; this.myState = 'alive'; this.downInfo = null; this.spectateId = null;
    // enemigo
    this.enemy = { obj: buildEnemy(), tgt: null, vis: false, light: new THREE.PointLight(0xff4a3a, 0, 9, 2), stepAcc: 0, growlT: 3, prevX: 0, prevZ: 0, st: 0, near: 99 };
    this.enemy.obj.visible = false; this.scene.add(this.enemy.obj); this.scene.add(this.enemy.light);
    this.remotes = new Map(); this.sil = null; this.jump = null; this.keypad = null; this.noteOpen = false;
    this.lastSend = 0; this.sendNow = false; this.time = 0; this.ambT = 8; this.hbT = 0; this.warnedAlert = 0; this.hudT = 0; this.scanTarget = null; this.revHold = null;
    this.danger = 0; this.tension = 0; this.fovKick = 0; this.shake = 0; this.elapsed = st.elapsed || 0;
    // HUD
    UI.show('menu', false); UI.show('hud', true); UI.show('loading', false); UI.show('result', false); UI.show('pause', false);
    UI.renderObjectives(this.missions, this.done); UI.pulseObjectives(); UI.renderInventory(this.inv, this.player.bat);
    UI.setExitState(this.exitUnlocked, this.done.size, this.missions.length); this.refreshMates();
    $('downedOverlay').classList.add('hidden'); $('spectate').classList.add('hidden'); $('warn').textContent = '';
    document.body.classList.remove('glitch');
    this.running = true; this.paused = !document.pointerLockElement; this.last = performance.now();
    UI.show('clickPlay', !document.pointerLockElement);
    this.audio.init(); this.audio.setTension(0);
    UI.toast('Los objetivos indican la habitación exacta. Escóndete en los armarios si algo te persigue.');
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }
  stop() {
    this.running = false; cancelAnimationFrame(this.raf);
    if (this.player) this.player.detach();
    if (this.scene) { this.scene.traverse((o) => { if (o.geometry) o.geometry.dispose(); if (o.material) { const ms = Array.isArray(o.material) ? o.material : [o.material]; ms.forEach((m) => { if (m.map) m.map.dispose(); m.dispose(); }); } }); if (this.flash && this.flash.shadow.map) this.flash.shadow.map.dispose(); }
    this.scene = null; this.view = null; this.player = null;
    if (document.pointerLockElement) document.exitPointerLock();
    this.audio.setChase(0); this.audio.duck(false);
    UI.show('hud', false); UI.show('clickPlay', false); UI.show('pause', false); UI.show('keypad', false); UI.show('noteView', false); UI.show('jump', false);
    document.body.classList.remove('glitch'); $('fxDanger').style.opacity = 0;
  }
  refreshMates() { UI.renderMates(this.playersList, this.me, this.states); }
  updateBatteryHud() { UI.renderInventory(this.inv, this.player.bat); }

  // ================= PUNTERO / TECLAS =================
  requestLock() { try { const r = this.canvas.requestPointerLock(); if (r && r.catch) r.catch(() => {}); } catch { /* sin pointer lock */ } }
  onLockChange() {
    if (!this.running) return;
    const locked = document.pointerLockElement === this.canvas; this.player.locked = locked;
    if (locked) { UI.show('clickPlay', false); UI.show('pause', false); this.paused = false; }
    else if (!this.keypad && !this.resultShown) { this.paused = true; UI.show('pause', true); }
  }
  onKey(e) {
    if (!this.running) return;
    if (this.keypad) {
      if (/^Digit[0-9]$/.test(e.code) || /^Numpad[0-9]$/.test(e.code)) { if (this.keypad.buf.length < 4) { this.keypad.buf += e.code.slice(-1); this.audio.keypad(null); } this.drawKeypad(); e.preventDefault(); }
      else if (e.code === 'Backspace') { this.keypad.buf = this.keypad.buf.slice(0, -1); this.drawKeypad(); e.preventDefault(); }
      else if (e.code === 'Enter' || e.code === 'NumpadEnter') { if (this.keypad.buf.length === 4) { this.net.send({ t: 'code', value: this.keypad.buf }); } e.preventDefault(); }
      else if (e.code === 'Escape' || e.code === 'KeyE') this.closeKeypad();
    }
  }
  openKeypad() { this.keypad = { buf: '' }; this.player.frozen = true; UI.show('keypad', true); this.drawKeypad(); $('kpMsg').textContent = this.inv.codeNote ? 'Tienes una nota con el código en tu inventario.' : ''; }
  closeKeypad() { this.keypad = null; this.player.frozen = false; UI.show('keypad', false); }
  drawKeypad() { $('kpDisp').textContent = (this.keypad.buf + '----').slice(0, 4); }
  openNote(text) { this.noteOpen = true; this.player.frozen = true; $('noteText').textContent = text; UI.show('noteView', true); }
  closeNote() { this.noteOpen = false; this.player.frozen = false; UI.show('noteView', false); }

  // ================= MENSAJES DEL SERVIDOR =================
  onMessage(m) {
    if (!this.running) return;
    switch (m.t) {
      case 's': return this.onSnapshot(m);
      case 'door': {
        this.world.doorOpen[m.id] = m.open; this.view.setDoor(m.id, m.open, !!this.world.doorLocked[m.id]);
        const d = this.map.doors[m.id], pos = { x: (d.cx + 0.5) * CELL, y: 1.2, z: (d.cy + 0.5) * CELL };
        m.open ? this.audio.doorOpen(pos) : this.audio.doorClose(pos); break;
      }
      case 'unlock': {
        this.world.doorLocked[m.id] = false; this.view.setDoor(m.id, !!this.world.doorOpen[m.id], false);
        const d = this.map.doors[m.id]; this.audio.unlock({ x: (d.cx + 0.5) * CELL, y: 1.2, z: (d.cy + 0.5) * CELL });
        if (m.by === this.me) UI.toast(m.lock === 'board' ? 'Rompes los tablones con la palanca.' : m.lock === 'card' ? 'La tarjeta abre el cerrojo.' : 'La llave maestra gira en la cerradura.'); break;
      }
      case 'locked': { const d = this.map.doors[m.id]; this.audio.locked({ x: (d.cx + 0.5) * CELL, y: 1.2, z: (d.cy + 0.5) * CELL }); if (m.by === this.me) UI.toast(m.msg, 'warn'); break; }
      case 'item': {
        this.world.taken.add(m.id); this.view.removeItem(m.id);
        const nm = ITEM_NAMES[m.kind] || 'un objeto';
        if (m.by === this.me) { this.audio.pickup(); UI.toast(m.kind === 'battery' ? 'Has encontrado una pila.' : `Has recogido ${nm}.`); } else if (m.kind !== 'battery') UI.toast(`${this.names[m.by] || 'Un compañero'} ha recogido ${nm}.`);
        break;
      }
      case 'bat': this.player.bat += m.add; this.updateBatteryHud(); break;
      case 'inv': this.inv = m.inv; this.updateBatteryHud(); break;
      case 'mission': {
        this.done.add(m.id); const mm = this.missions.find((q) => q.id === m.id);
        UI.renderObjectives(this.missions, this.done); UI.pulseObjectives(); UI.setExitState(this.exitUnlocked, m.done, m.total);
        UI.toast('Objetivo completado: ' + (mm ? mm.title : ''), ''); break;
      }
      case 'exit': {
        this.exitUnlocked = true; this.final = true; this.world.doorLocked[0] = false; this.view.setDoor(0, !!this.world.doorOpen[0], false); this.view.setEmergency(true);
        UI.setExitState(true, this.missions.length, this.missions.length); UI.toast('Todos los objetivos completados. La salida está desbloqueada.', 'big'); UI.pulseObjectives();
        this.audio.alarm(); this.scene.fog.density = this.q.fog * 1.25; this.shake = 0.5; break;
      }
      case 'power': this.view.setPower(true); UI.toast('Se restablece parte de la electricidad del hotel.'); this.audio.buzzPop({ x: this.player.x, y: 2, z: this.player.z }); break;
      case 'machine': this.audio.machine({ x: m.x, y: 1.2, z: m.z }); this.view.pullLever(); for (const l of this.view.lights) { if (Math.random() < 0.5) this.view.forceLight(l.id, 'off', 2 + Math.random() * 3); } UI.toast('La caldera ruge en las entrañas del hotel. Todo el edificio lo ha oído.', 'warn'); break;
      case 'keypad': {
        this.audio.keypad(m.ok);
        if (m.by === this.me && this.keypad) { if (m.ok) { UI.toast('El panel emite un pitido de aceptación.'); this.closeKeypad(); } else { $('kpMsg').textContent = 'Código incorrecto.'; this.keypad.buf = ''; this.drawKeypad(); } }
        break;
      }
      case 'msg': UI.toast(m.m, m.k === 'warn' ? 'warn' : ''); break;
      case 'corr': this.player.x = m.x; this.player.z = m.z; this.player.vx = this.player.vz = 0; break;
      case 'hid': { const h = this.map.hides.find((q) => q.id === m.spot); this.hiddenSpot = h; this.player.frozen = true; this.player.vx = this.player.vz = 0; this.hideYaw0 = h.yaw; this.player.yaw = h.yaw; this.player.pitch = 0; UI.toast('Te escondes. Contén la respiración… (E para salir)'); break; }
      case 'unh': this.hiddenSpot = null; this.player.frozen = false; break;
      case 'caught': return this.onCaught(m);
      case 'revived': this.states[m.id] = 'alive'; this.refreshMates(); if (m.id === this.me) { this.myState = 'alive'; this.downInfo = null; this.player.frozen = false; $('downedOverlay').classList.add('hidden'); UI.toast('Tus compañeros te han puesto en pie.', 'big'); } else UI.toast(`${m.name} ha sido rescatado.`); break;
      case 'dead': this.states[m.id] = 'dead'; this.refreshMates(); UI.toast(`${m.name} no ha sobrevivido.`, 'warn'); if (m.id === this.me) this.becomeSpectator('dead'); break;
      case 'escaped': this.states[m.id] = 'escaped'; this.refreshMates(); if (m.id === this.me) { this.audio.win(); UI.toast('¡Has escapado del hotel!', 'big'); this.becomeSpectator('escaped'); } else UI.toast(`${m.name} ha escapado.`, 'big'); break;
      case 'players': this.playersList = m.players; for (const p of m.players) { this.names[p.id] = p.name; this.states[p.id] = p.state; const r = this.remotes.get(p.id); if (r && r.nm !== p.name) { r.nm = p.name; r.obj.userData.spr.material.map = nameTexture(p.name); r.obj.userData.spr.material.needsUpdate = true; } } this.refreshMates(); break;
      case 'join': UI.toast(`${m.name} se ha unido a la partida.`); break;
      case 'leave': UI.toast(`${m.name} ha abandonado la partida.`, 'warn'); this.dropRemote(m.id); break;
      case 'hz': return this.onHazard(m);
      case 'en': this.onEnemyEvent(m); break;
      case 'end': return this.onEnd(m.stats);
      default: break;
    }
  }
  onEnemyEvent(m) {
    if (m.k === 'alert') { const e = this.enemy.tgt; this.audio.roar(e ? { x: e.x, y: 1.5, z: e.z } : null); if (this.time - this.warnedAlert > 8) { this.warnedAlert = this.time; $('warn').textContent = 'ALGO TE HA VISTO'; setTimeout(() => ($('warn').textContent = ''), 2500); } }
    else if (m.k === 'sniff') this.audio.growl({ x: m.x, y: 1.5, z: m.z });
  }
  onSnapshot(m) {
    this.elapsed = m.tm; this.tension = m.tn;
    const seen = new Set();
    for (const r of m.p) {
      const [id, x, z, yaw, pitch, flags, st, rev, bleed] = r; seen.add(id);
      const sname = ['alive', 'downed', 'dead', 'escaped'][st];
      if (this.states[id] !== sname && id !== this.me) { this.states[id] = sname; this.refreshMates(); }
      if (id === this.me) { if (sname === 'downed') this.downInfo = { rev, bleed }; continue; }
      let rp = this.remotes.get(id);
      if (!rp) { const obj = buildAvatar(this.names[id] || 'Jugador', AVATAR_COLORS[this.remotes.size % AVATAR_COLORS.length]); obj.position.set(x, 0, z); this.scene.add(obj); rp = { obj, x, z, yaw, tx: x, tz: z, tyaw: yaw, pitch, flags, st, phase: 0 }; this.remotes.set(id, rp); }
      rp.tx = x; rp.tz = z; rp.tyaw = yaw; rp.pitch = pitch; rp.flags = flags; rp.st = st;
    }
    for (const id of [...this.remotes.keys()]) if (!seen.has(id)) this.dropRemote(id);
    this.enemy.tgt = m.e;
    this.audio.setTension(Math.min(1, this.tension * 0.7 + (m.fp ? 0.3 : 0)));
  }
  dropRemote(id) { const r = this.remotes.get(id); if (r) { this.scene.remove(r.obj); this.remotes.delete(id); } }

  onHazard(m) {
    const p = this.player; const pos = m.x !== undefined ? { x: m.x, y: 1.3, z: m.z } : null;
    switch (m.k) {
      case 'lightOut': { this.view.forceLight(m.l, 'off', m.dur); const l = this.view.lights[m.l]; if (l) this.audio.buzzPop({ x: l.x, y: 2.8, z: l.z }); break; }
      case 'lightOn': { this.view.forceLight(m.l, 'on', m.dur); const l = this.view.lights[m.l]; if (l) this.audio.buzzPop({ x: l.x, y: 2.8, z: l.z }); break; }
      case 'silhouette': if (m.pid === this.me && !this.sil && this.myState === 'alive') this.spawnSilhouette(m.x, m.z, m.dur); break;
      case 'thump': this.audio.thump(pos); break;
      case 'creak': this.audio.creak(pos); break;
      case 'whisper': this.audio.whisper(pos); break;
      case 'elevator': this.audio.ding(pos); break;
      case 'farDoor': this.audio.farSlam(); break;
      case 'silence': this.audio.duck(true); setTimeout(() => this.audio && this.audio.duck(false), m.dur * 1000); break;
      case 'roomChange': this.view.alterRoom(m.room); break;
      default: void p;
    }
  }
  spawnSilhouette(x, z, dur) {
    const obj = buildSilhouette(); obj.position.set(x, 0, z); obj.rotation.y = Math.atan2(this.player.x - x, this.player.z - z); this.scene.add(obj);
    this.sil = { obj, t: 0, dur, look: 0 }; this.audio.stinger();
  }

  // ================= CAPTURA / JUMPSCARE =================
  onCaught(m) {
    this.states[m.id] = m.state; this.refreshMates();
    if (m.id !== this.me) { UI.toast(`${m.name} ha sido atrapado.`, 'warn'); this.audio.scream({ x: this.remotes.get(m.id)?.x ?? m.ex, y: 1.5, z: this.remotes.get(m.id)?.z ?? m.ez }); return; }
    this.myState = m.state; this.jump = { t: 0, ex: m.ex, ez: m.ez, next: m.state }; this.player.frozen = true; this.hiddenSpot = null;
    this.audio.jumpscare(); UI.show('jump', true); this.audio.setChase(0); if (this.keypad) this.closeKeypad(); if (this.noteOpen) this.closeNote();
  }
  updateJumpscare(dt) {
    const j = this.jump; j.t += dt; const p = this.player, e = this.enemy;
    const want = Math.atan2(-(j.ex - p.x), -(j.ez - p.z));
    p.yaw = angLerp(p.yaw, want, Math.min(1, dt * 18)); p.pitch += (-0.05 - p.pitch) * Math.min(1, dt * 10);
    const k = Math.min(1, Math.max(0, (j.t - 0.05) / 0.5)), dist = 1.5 - 1.2 * k;
    e.obj.visible = true; e.obj.position.set(p.x - Math.sin(p.yaw) * dist, 0.05, p.z - Math.cos(p.yaw) * dist); e.obj.rotation.y = p.yaw + Math.PI;
    e.obj.scale.set(1.08 + k * 0.5, 1.3 + k * 0.5, 1.08 + k * 0.5); animateEnemy(e.obj, dt, 6, 3, this.time);
    this.fovKick = 38 * k; this.shake = 0.1 + k * 0.28;
    $('fxFlash').style.opacity = (Math.floor(j.t * 22) % 3 === 0) ? 0.55 : 0; document.body.classList.toggle('glitch', j.t > 0.15 && j.t < 2.1);
    const c = $('jumpCanvas'); c.width = innerWidth / 3; c.height = innerHeight / 3; const g = c.getContext('2d');
    if (j.t < 2.1) { g.clearRect(0, 0, c.width, c.height); if (Math.floor(j.t * 16) % 3 !== 2 && j.t > 0.12) this.drawScareFace(g, c.width, c.height, j.t); else { g.fillStyle = 'rgba(0,0,0,0)'; } $('jump').style.background = 'transparent'; }
    if (j.t > 2.1) { g.fillStyle = `rgba(0,0,0,${Math.min(1, (j.t - 2.1) / 0.4)})`; g.fillRect(0, 0, c.width, c.height); $('jump').style.background = `rgba(0,0,0,${Math.min(1, (j.t - 2.1) / 0.4)})`; }
    if (j.t > 2.6) this.endJumpscare();
  }
  drawScareFace(g, w, h, t) {
    const near = Math.min(1, t / 0.5), s = h * (0.8 + near * 0.55 + Math.random() * 0.08);
    const cx = w / 2 + (Math.random() - 0.5) * 22, cy = h * 0.5 + (Math.random() - 0.5) * 22;
    // fondo rojo sangre pulsante
    g.fillStyle = `rgba(${60 + Math.random() * 60 | 0},0,0,0.85)`; g.fillRect(0, 0, w, h);
    // cráneo pálido, deformado
    const grd = g.createRadialGradient(cx, cy - s * 0.1, s * 0.05, cx, cy, s * 0.62); grd.addColorStop(0, '#d9d4c2'); grd.addColorStop(1, '#4a463c');
    g.fillStyle = grd; g.beginPath(); g.ellipse(cx, cy, s * 0.4, s * 0.62, 0.05, 0, 6.28); g.fill();
    // cuencas negras y ojos blancos brillantes
    for (const sx of [-1, 1]) {
      g.fillStyle = '#000'; g.beginPath(); g.ellipse(cx + sx * s * 0.17, cy - s * 0.12, s * 0.11, s * 0.19, sx * 0.3, 0, 6.28); g.fill();
      g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = s * 0.1; g.beginPath(); g.ellipse(cx + sx * s * 0.17 + (Math.random() - 0.5) * 3, cy - s * 0.1, s * 0.035, s * 0.06, 0, 0, 6.28); g.fill(); g.shadowBlur = 0;
    }
    // boca enorme con dientes
    const mw = s * 0.3, mh = s * (0.2 + Math.random() * 0.1), my = cy + s * 0.3;
    g.fillStyle = '#080000'; g.beginPath(); g.ellipse(cx, my, mw, mh, 0, 0, 6.28); g.fill();
    g.fillStyle = '#e8e2cf';
    for (let i = -6; i <= 6; i++) { const x = cx + i * mw / 6.8, ty = Math.sqrt(Math.max(0, 1 - (i / 6.8) ** 2)) * mh; g.beginPath(); g.moveTo(x - mw * 0.05, my - ty); g.lineTo(x, my - ty + mh * 0.4); g.lineTo(x + mw * 0.05, my - ty); g.fill(); g.beginPath(); g.moveTo(x - mw * 0.05, my + ty); g.lineTo(x, my + ty - mh * 0.4); g.lineTo(x + mw * 0.05, my + ty); g.fill(); }
    g.fillStyle = 'rgba(0,0,0,.35)'; for (let i = 0; i < 8; i++) g.fillRect(0, Math.random() * h, w, 1 + Math.random() * 3);
  }
  endJumpscare() {
    const next = this.jump.next; this.jump = null; UI.show('jump', false); $('jump').style.background = '#000'; document.body.classList.remove('glitch'); $('fxFlash').style.opacity = 0;
    this.enemy.obj.scale.set(1.08, 1.3, 1.08); this.fovKick = 0; this.shake = 0;
    if (next === 'downed') { this.player.frozen = true; $('downedOverlay').classList.remove('hidden'); this.player.pitch = -0.2; }
    else if (next === 'dead') this.becomeSpectator('dead');
  }
  becomeSpectator(why) {
    this.myState = why; this.player.frozen = true; $('downedOverlay').classList.add('hidden');
    $('spectate').classList.remove('hidden'); $('spectate').textContent = why === 'escaped' ? 'Has escapado. Observas a tus compañeros… (E: cambiar)' : 'Has sido eliminado. Observas a tus compañeros… (E: cambiar)';
  }
  onEnd(stats) {
    this.resultShown = true; if (document.pointerLockElement) document.exitPointerLock();
    this.audio.setChase(0); stats.result === 'victory' ? this.audio.win() : this.audio.lose();
    UI.show('pause', false); UI.show('clickPlay', false); UI.show('keypad', false); UI.show('noteView', false);
    UI.showResult(stats, '', () => { this.resultShown = false; this.stop(); if (this.onExit) this.onExit(); });
      // ================= INTERACCIÓN =================
  scan() {
    const p = this.player, fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), w = this.world;
    if (this.hiddenSpot) return { kind: 'unhide', text: 'Pulsa E para salir del escondite', act: true };
    let best = null, bs = 1e9;
    const consider = (kind, id, x, z, maxD, minCos, text, act, extra = {}, ignoreDoor = -1) => {
      const dx = x - p.x, dz = z - p.z, d = Math.hypot(dx, dz); if (d > maxD) return;
      const cos = d < 0.7 ? 1 : (dx * fx + dz * fz) / d; if (cos < minCos) return;
      if (!w.los(p.x, p.z, x, z, ignoreDoor)) return;
      const s = d * (2.2 - cos); if (s < bs) { bs = s; best = { kind, id, text, act, ...extra }; }
    };
    for (const v of this.view.items.values()) { const it = v.it; consider('item', it.id, it.x, it.z, INTERACT_DIST, 0.55, `Pulsa E para recoger ${it.kind === 'battery' ? 'una pila' : ITEM_NAMES[it.kind]}`, true); }
    for (const d of this.map.doors) {
      const x = (d.cx + 0.5) * CELL, z = (d.cy + 0.5) * CELL; const open = this.world.doorOpen[d.id], locked = this.world.doorLocked[d.id];
      let text, act = true;
      if (d.kind === 'exit') {
        if (locked) { const miss = this.missions.filter((q) => !this.done.has(q.id)).length; text = `La puerta de emergencia está bloqueada (faltan ${miss} objetivos)`; }
        else text = open ? 'Pulsa E para cerrar la puerta de emergencia' : 'Pulsa E para abrir la puerta de emergencia';
      } else if (locked) {
        const need = { key: 'masterKey', card: 'keycard', board: 'crowbar' }[d.lock];
        if (this.inv[need]) text = d.lock === 'board' ? 'Pulsa E para romper los tablones con la palanca' : d.lock === 'card' ? 'Pulsa E para usar la tarjeta de acceso' : 'Pulsa E para usar la llave maestra';
        else text = d.lock === 'board' ? 'Puerta atrancada con tablones. Necesitas una palanca' : d.lock === 'card' ? 'Cerradura electrónica. Necesitas una tarjeta de acceso' : 'Cerrada con llave. Necesitas la llave maestra';
        act = !!this.inv[need];
      } else text = open ? 'Pulsa E para cerrar la puerta' : 'Pulsa E para abrir la puerta';
      consider('door', d.id, x, z, INTERACT_DIST, 0.45, text, true, {}, d.id);
      if (best && best.kind === 'door' && best.id === d.id) best.act = true;
    }
    for (const t of this.map.terminals) {
      let text = null;
      if (t.kind === 'note') text = 'Pulsa E para leer la nota';
      else if (t.kind === 'fusebox') { const m = this.done.has('m_power'); text = m ? 'La caja de fusibles funciona' : this.inv.fuse ? 'Pulsa E para instalar el fusible' : 'Caja de fusibles vacía. Falta un fusible'; }
      else if (t.kind === 'keypad') text = this.done.has('m_code') ? 'Panel de seguridad: acceso concedido' : 'Pulsa E para usar el panel de seguridad';
      else if (t.kind === 'lever') text = this.done.has('m_lever') ? 'La caldera ya está en marcha' : 'Pulsa E para accionar la palanca de la caldera';
      else if (t.kind === 'elevator') text = 'El ascensor está fuera de servicio';
      if (text) consider('term', t.id, t.x, t.z, INTERACT_DIST, 0.45, text, true, { tk: t.kind, t });
    }
    for (const h of this.map.hides) consider('hide', h.id, h.x, h.z, 2.0, 0.55, h.kind === 'bed' ? 'Pulsa E para esconderte bajo la cama' : 'Pulsa E para esconderte en el armario', true);
    for (const [id, r] of this.remotes) if (r.st === 1) consider('revive', id, r.x, r.z, 2.6, 0.2, `Mantén E para ayudar a ${this.names[id] || 'tu compañero'}`, true);
    return best;
  }
  interact(tg) {
    const p = this.player;
    if (!tg) return;
    switch (tg.kind) {
      case 'item': this.net.send({ t: 'use', k: 'item', id: tg.id }); break;
      case 'door': this.net.send({ t: 'use', k: 'door', id: tg.id }); break;
      case 'hide': this.net.send({ t: 'use', k: 'hide', id: tg.id }); break;
      case 'unhide': this.net.send({ t: 'use', k: 'unhide' }); break;
      case 'term':
        if (tg.tk === 'note') this.openNote(tg.t.text);
        else if (tg.tk === 'keypad') { if (!this.done.has('m_code')) this.openKeypad(); }
        else this.net.send({ t: 'use', k: 'term', id: tg.id });
        break;
      default: void p;
    }
  }

  // ================= BUCLE =================
  loop(now) {
    if (!this.running) return;
    const dt = Math.min(0.05, (now - this.last) / 1000); this.last = now; this.time += dt;
    this.adapt(dt);
    try { this.update(dt); this.renderer.render(this.scene, this.camera); } catch (e) { console.error(e); }
    this.raf = requestAnimationFrame((t) => this.loop(t));
  }
  // resolución dinámica: si el equipo va justo, baja la resolución de render (y las sombras en último caso); si sobra, la sube
  adapt(dt) {
    this.ema = this.ema ? this.ema + (dt - this.ema) * 0.05 : dt; this.adT = (this.adT || 0) + dt; if (this.adT < 1.5) return; this.adT = 0;
    const base = Math.min(devicePixelRatio || 1, this.q.pr);
    if (this.ema > 0.027) {
      if (this.pr > 0.55) { this.pr = Math.max(0.55, this.pr - 0.12); this.renderer.setPixelRatio(this.pr); this.resize(); }
      else if (this.flash && this.flash.castShadow) { this.flash.castShadow = false; UI.toast('Rendimiento bajo: sombras de la linterna desactivadas.'); }
    } else if (this.ema < 0.017 && this.pr < base) { this.pr = Math.min(base, this.pr + 0.06); this.renderer.setPixelRatio(this.pr); this.resize(); }
  }
  update(dt) {
    const p = this.player, cam = this.camera;
    // entrada de una sola pulsación
    if (p.wasPressed('KeyF') && this.myState === 'alive' && !this.keypad) p.toggleFlashlight();
    const tabDown = p.has('Tab'); $('objectives').classList.toggle('show', tabDown || $('objectives').classList.contains('pulse'));
    if (tabDown) $('objectives').classList.add('show');
    if (this.jump) this.updateJumpscare(dt);
    else {
      if (this.myState === 'alive') {
        if (this.hiddenSpot) { const d = ((p.yaw - this.hideYaw0 + Math.PI * 3) % (Math.PI * 2)) - Math.PI; p.yaw = this.hideYaw0 + Math.max(-1.2, Math.min(1.2, d)); p.pitch = Math.max(-0.7, Math.min(0.7, p.pitch)); }
        p.update(dt);
      } else { p.pitch = Math.max(-1.2, Math.min(1.0, p.pitch)); p.update(dt); }
    }
    // interacción
    this.scanT = (this.scanT || 0) - dt;
    if (this.scanT <= 0 && !this.jump && this.myState === 'alive' && !this.keypad && !this.noteOpen) { this.scanT = 0.06; this.scanTarget = this.scan(); }
    if (this.myState !== 'alive' || this.jump || this.keypad || this.noteOpen) this.scanTarget = null;
    $('prompt').textContent = this.scanTarget && !this.paused ? this.scanTarget.text : '';
    const ePressed = p.wasPressed('KeyE');
    if (ePressed && this.paused === false) {
      if (this.noteOpen) this.closeNote();
      else if (this.myState !== 'alive' && this.myState !== 'downed') this.cycleSpectate();
      else if (this.myState === 'alive' && this.scanTarget) { if (this.scanTarget.kind === 'revive') { this.revHold = this.scanTarget.id; this.net.send({ t: 'rv', id: this.revHold, on: true }); } else this.interact(this.scanTarget); }
    }
    if (this.revHold && (p.wasReleased('KeyE') || !p.has('KeyE') || !this.scanTarget || this.scanTarget.kind !== 'revive')) { this.net.send({ t: 'rv', id: this.revHold, on: false }); this.revHold = null; }
    p.released.clear();
    // enviar estado ~15 Hz
    this.lastSend += dt;
    if (this.lastSend > 0.066 && this.myState !== 'dead' && this.myState !== 'escaped' && !this.resultShown) {
      this.lastSend = 0;
      this.net.send({ t: 'st', x: +p.x.toFixed(3), z: +p.z.toFixed(3), yaw: +p.yaw.toFixed(3), pitch: +p.pitch.toFixed(3), fl: p.fl, run: p.running });
    }
    this.updateCamera(dt);
    this.updateFlashlight(dt);
    this.view.update(dt, cam.position);
    this.updateRemotes(dt);
    this.updateEnemy(dt); this.updateAnomalies(dt); this.updateDust(dt);
    this.updateSilhouette(dt);
    this.updateEffects(dt);
    this.audio.setListener(cam.position.x, cam.position.y, cam.position.z, -Math.sin(p.yaw), -Math.cos(p.yaw));
    // ambiente aleatorio sutil
    this.ambT -= dt; if (this.ambT <= 0) { this.ambT = 7 + Math.random() * 12; this.audio.ambientRandom({ x: p.x, z: p.z }); }
    // HUD
    this.hudT -= dt;
    if (this.hudT <= 0) {
      this.hudT = 0.1;
      $('stamina').style.width = p.stamina + '%'; $('stamina').style.background = p.exhausted ? '#b3261e' : '#d8cba5'; $('statusBars').style.opacity = p.stamina >= 99.5 ? 0.25 : 1;
      $('battFill').style.width = (p.fl || p.battery < 100 ? p.battery : p.battery) + '%'; $('battFill').style.background = p.battery < 20 ? '#b3261e' : '#d8cba5';
      $('flashHud').style.opacity = p.fl ? 1 : 0.55;
      UI.setConn(this.net.rtt, this.net.stale());
      if (this.myState === 'downed' && this.downInfo) $('downedOverlay').textContent = `Estás incapacitado. Un compañero puede rescatarte${this.downInfo.rev > 0 ? ` (${Math.round(this.downInfo.rev * 100)}%)` : ''} · ${this.downInfo.bleed}s`;
    }
  }
  cycleSpectate() {
    const alive = [...this.remotes.entries()].filter(([id, r]) => r.st === 0).map(([id]) => id); if (!alive.length) return;
    const i = alive.indexOf(this.spectateId); this.spectateId = alive[(i + 1) % alive.length];
  }
  updateCamera(dt) {
    const p = this.player, cam = this.camera;
    let x = p.x, z = p.z, y = EYE_H, yaw = p.yaw, pitch = p.pitch, roll = 0;
    if (this.hiddenSpot) { x = this.hiddenSpot.x; z = this.hiddenSpot.z; y = this.hiddenSpot.camY; }
    else if (this.myState === 'downed') { y = 0.35; roll = 0.35; }
    else if (this.myState === 'dead' || this.myState === 'escaped') {
      let r = this.remotes.get(this.spectateId); if (!r || r.st !== 0) { this.cycleSpectate(); r = this.remotes.get(this.spectateId); }
      if (r) { x = r.x; z = r.z; yaw = r.yaw; pitch = r.pitch; y = 1.6; }
    } else {
      const sway = p.moving ? (p.running ? 0.05 : 0.03) : 0.006;
      y += Math.sin(p.bob * 2) * sway; x += Math.cos(p.bob) * sway * 0.4 * Math.cos(p.yaw); z -= Math.cos(p.bob) * sway * 0.4 * Math.sin(p.yaw);
      roll = Math.sin(p.bob) * 0.008;
    }
    const sh = this.shake; if (sh > 0) { x += (Math.random() - 0.5) * sh; y += (Math.random() - 0.5) * sh; z += (Math.random() - 0.5) * sh; this.shake = Math.max(0, this.shake - dt * 0.8); }
    cam.position.set(x, y, z); cam.rotation.set(pitch, yaw, roll);
    const fov = 75 + (p.running ? 5 : 0) + this.fovKick; cam.fov += (fov - cam.fov) * Math.min(1, dt * 8); cam.updateProjectionMatrix();
  }
  updateFlashlight(dt) {
    const p = this.player, cam = this.camera, f = this.flash;
    const on = p.fl && this.myState !== 'dead' && this.myState !== 'escaped' && !this.jump;
    let bf = p.battery > 25 ? 1 : 0.4 + (p.battery / 25) * 0.6;
    if (p.battery < 15 && Math.random() < 0.08) bf *= 0.1;
    const target = on ? 60 * this.diff.flIntensity * bf : 0;
    f.intensity += (target - f.intensity) * Math.min(1, dt * 30);
    this.flQuat.slerp(cam.quaternion, Math.min(1, dt * 11));
    const fwd = new THREE.Vector3(0, 0, -1).applyQuaternion(this.flQuat), right = new THREE.Vector3(1, 0, 0).applyQuaternion(cam.quaternion);
    f.position.copy(cam.position).addScaledVector(right, 0.16).addScaledVector(new THREE.Vector3(0, -1, 0), 0.1);
    f.target.position.copy(f.position).addScaledVector(fwd, 8); f.target.updateMatrixWorld();
  }
  updateRemotes(dt) {
    const k = 1 - Math.exp(-dt * 12);
    for (const r of this.remotes.values()) {
      const ox = r.x, oz = r.z; r.x += (r.tx - r.x) * k; r.z += (r.tz - r.z) * k; r.yaw = angLerp(r.yaw, r.tyaw, k);
      const moved = Math.hypot(r.x - ox, r.z - oz), u = r.obj.userData;
      r.obj.position.set(r.x, 0, r.z); r.obj.rotation.y = r.yaw;
      r.phase += moved * 4.2; const sw = Math.sin(r.phase) * Math.min(1, moved / dt / 2.5) * 0.7;
      u.legs[0].rotation.x = sw; u.legs[1].rotation.x = -sw; u.arms[0].rotation.x = -sw * 0.8; u.arms[1].rotation.x = sw * 0.8;
      r.obj.visible = r.st < 2 && !(r.flags & 8);
      r.obj.rotation.x = r.st === 1 ? -Math.PI / 2 : 0; r.obj.position.y = r.st === 1 ? 0.2 : 0;
      u.cone.visible = !!(r.flags & 1) && r.st === 0; u.spr.visible = r.st === 0;
      if (moved / dt > 0.5 && !(r.flags & 8)) { r.stepAcc = (r.stepAcc || 0) + moved; if (r.stepAcc > (r.flags & 2 ? 1.5 : 1.9)) { r.stepAcc = 0; this.audio.tone({ f0: 90, f1: 50, dur: 0.1, gain: 0.12, pos: { x: r.x, y: 0.1, z: r.z } }); } }
    }
  }
  updateEnemy(dt) {
    const e = this.enemy, t = e.tgt, p = this.player;
    if (this.jump) return;
    if (!t) { this.view.enemyPos = null; e.obj.visible = false; e.light.intensity = 0; e.near = 99; this.audio.breathUpdate && this.audio.breath && this.audio.breathUpdate({ x: p.x, y: 1, z: p.z }, 0); return; }
    if (!e.vis) { e.obj.position.set(t.x, 0, t.z); e.prevX = t.x; e.prevZ = t.z; e.vis = true; }
    const k = 1 - Math.exp(-dt * 13); const ox = e.obj.position.x, oz = e.obj.position.z;
    e.obj.position.x += (t.x - ox) * k; e.obj.position.z += (t.z - oz) * k;
    const yaw = angLerp(e.yawv ?? t.yaw, t.yaw, k); e.yawv = yaw; e.obj.rotation.y = yaw + Math.PI; e.obj.visible = true;
    const moved = Math.hypot(e.obj.position.x - ox, e.obj.position.z - oz), sp = moved / Math.max(dt, 1e-4);
    animateEnemy(e.obj, dt, Math.min(sp, 6), t.st, this.time);
    const dist = Math.hypot(e.obj.position.x - p.x, e.obj.position.z - p.z); e.near = dist;
    const pos = { x: e.obj.position.x, y: 0.2, z: e.obj.position.z };
    this.view.enemyPos = t.sil ? null : { x: pos.x, z: pos.z };
    // al verlo de frente por primera vez: golpe de sonido y sacudida
    { const dx = pos.x - p.x, dz = pos.z - p.z, dd = Math.hypot(dx, dz) || 1, fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw), dot = (dx * fx + dz * fz) / dd;
      const seen = !t.sil && dot > 0.8 && dd < 16 && this.world.los(p.x, p.z, pos.x, pos.z);
      if (seen && !e.gaze && this.myState === 'alive' && this.time - (e.lastGaze ?? -99) > 12) { e.gaze = true; e.lastGaze = this.time; this.audio.stinger(); this.audio.heartbeat(1); this.shake = Math.max(this.shake, 0.22); this.fovKick = Math.max(this.fovKick, 9); }
      if (!seen && e.gaze && this.time - e.lastGaze > 3) e.gaze = false; }
    // inicio de persecución dirigida a mí: luces parpadeando, chillido y sacudida (estilo "Rush")
    const chasingMe = t.st === 3 && t.tg && !t.sil;
    if (chasingMe && !e.wasChase && this.myState === 'alive' && this.time - (e.lastOnset ?? -99) > 10) { e.lastOnset = this.time; this.chaseOnset(); }
    e.wasChase = chasingMe;
    if (chasingMe && this.myState === 'alive') { e.screechT = (e.screechT ?? 3.5) - dt; if (e.screechT <= 0) { e.screechT = 3.5 + Math.random() * 3; this.audio.chaseScream({ x: pos.x, y: 1.6, z: pos.z }, 0.75); this.shake = Math.max(this.shake, 0.14); this.flickT = Math.max(this.flickT || 0, 0.5); } }
    // pasos: la intensidad depende de la distancia (panner + volumen)
    if (!t.sil) { e.stepAcc += moved; const stride = t.st === 3 ? 1.55 : 1.15; if (e.stepAcc > stride) { e.stepAcc = 0; this.audio.enemyStep(pos, t.st === 3 ? 1.25 : 0.9); } }
    // respiración y gruñidos
    const bv = t.sil ? 0 : Math.max(0, 1 - dist / 15) ** 1.5 * (t.st === 3 ? 0.8 : 0.5);
    this.audio.breathUpdate({ x: pos.x, y: 1.6, z: pos.z }, bv);
    e.growlT -= dt; if (e.growlT <= 0 && !t.sil && dist < 24 && (t.st === 3 || t.st === 4 || dist < 10)) { e.growlT = 3.5 + Math.random() * 5; this.audio.growl({ x: pos.x, y: 1.5, z: pos.z }); }
    e.light.position.set(pos.x, 1.5, pos.z); e.light.intensity = dist < 14 ? 1.6 * (1 - dist / 14) : 0;
    this.audio.chaseTarget = t.tg;
  }
  // polvo flotando en el aire (se ve a contraluz de la linterna y las lámparas)
  buildDust() {
    const N = 140, pos = new Float32Array(N * 3); for (let i = 0; i < N; i++) { pos[i * 3] = (Math.random() - 0.5) * 14; pos[i * 3 + 1] = Math.random() * 3; pos[i * 3 + 2] = (Math.random() - 0.5) * 14; }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    this.dust = new THREE.Points(geo, new THREE.PointsMaterial({ map: radialTexture('255,235,200'), size: 0.07, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true }));
    this.dust.frustumCulled = false; this.scene.add(this.dust); this.dustPos = pos;
  }
  updateDust(dt) {
    const p = this.player, pos = this.dustPos; this.dust.position.set(p.x, 0, p.z);
    for (let i = 0; i < pos.length; i += 3) {
      pos[i] += Math.sin(this.time * 0.3 + i) * dt * 0.05; pos[i + 1] += Math.sin(this.time * 0.2 + i * 0.7) * dt * 0.04 - dt * 0.01; pos[i + 2] += Math.cos(this.time * 0.25 + i) * dt * 0.05;
      for (const o of [0, 2]) { if (pos[i + o] > 7) pos[i + o] -= 14; else if (pos[i + o] < -7) pos[i + o] += 14; }
      if (pos[i + 1] < 0) pos[i + 1] += 3; else if (pos[i + 1] > 3) pos[i + 1] -= 3;
    }
    this.dust.geometry.attributes.position.needsUpdate = true;
  }
  // anomalías: aviso al entrar por primera vez en una habitación alterada y maniquíes que giran
  updateAnomalies(dt) {
    const p = this.player, rid = this.world.roomAt(p.x, p.z);
    this.anom.update(dt, p, p.yaw);
    if (rid !== this.lastRoom) {
      this.lastRoom = rid;
      if (rid > 0 && this.anom.rooms.has(rid) && !this.anomSeen.has(rid)) { this.anomSeen.add(rid); this.audio.stinger(); this.audio.whisper({ x: p.x - Math.sin(p.yaw) * 1.5, y: 1.5, z: p.z - Math.cos(p.yaw) * 1.5 }); this.shake = Math.max(this.shake, 0.08); UI.toast('Algo no está bien en esta habitación…', 'warn'); }
    }
  }
  chaseOnset() {
    this.flickT = 2.6; this.shake = Math.max(this.shake, 0.5); this.fovKick = 16;
    this.audio.chaseScream(null, 1); this.audio.stinger();
    $('warn').textContent = 'CORRE'; UI.toast('¡Algo te ha visto! Corre o escóndete en un armario.', 'warn');
  }
  updateSilhouette(dt) {
    const s = this.sil; if (!s) return; s.t += dt;
    const p = this.player, dx = s.obj.position.x - p.x, dz = s.obj.position.z - p.z, d = Math.hypot(dx, dz);
    const cos = (dx * -Math.sin(p.yaw) + dz * -Math.cos(p.yaw)) / d;
    if (cos > 0.97) s.look += dt; if (s.t > s.dur || s.look > 0.25 || d < 4) { this.scene.remove(s.obj); this.sil = null; }
  }
  updateEffects(dt) {
    const e = this.enemy, t = e.tgt, p = this.player;
    // peligro: cercanía + persecución dirigida a mí
    let danger = 0, chase = 0;
    if (t) { const d = e.near; danger = Math.max(0, 1 - d / 18) ** 1.4; if (t.st === 3 && t.tg) { danger = Math.max(danger, 0.65); chase = 1; } else if (t.st === 3 && d < 25) chase = 0.5; }
    this.danger += (danger - this.danger) * Math.min(1, dt * 3);
    $('fxDanger').style.opacity = this.myState === 'alive' ? Math.min(0.9, this.danger * (0.7 + 0.3 * Math.sin(this.time * (4 + this.danger * 6)))) : 0;
    this.audio.setChase(chase); this.audio.rumble(this.myState === 'alive' ? Math.min(1, this.danger * 1.1) : 0);
    this.hbT -= dt; if (this.danger > 0.2 && this.hbT <= 0 && this.myState === 'alive') { this.hbT = 1.15 - this.danger * 0.6; this.audio.heartbeat(0.35 + this.danger * 0.65); }
    $('warn').textContent = this.myState === 'alive' && t && t.st === 3 && t.tg ? 'CORRE' : ($('warn').textContent === 'CORRE' ? '' : $('warn').textContent);
    // parpadeo de luces: aviso cuando el enemigo está cerca y apagón intermitente al empezar la persecución
    this.flickT = Math.max(0, (this.flickT || 0) - dt); this.flickN = (this.flickN || 0) - dt;
    let amt = 0; if (this.flickT > 0) amt = 0.9; else if (t && !t.sil && e.near < 13 && this.myState === 'alive') amt = 0.55 * (1 - e.near / 13);
    if (this.flickN <= 0) { this.flickN = 0.05 + Math.random() * 0.09; this.flickV = amt > 0 && Math.random() < (this.flickT > 0 ? 0.6 : 0.15 + amt * 0.35) ? 1 - amt * (0.45 + Math.random() * 0.55) : 1; }
    this.renderer.toneMappingExposure = 1.2 * (amt > 0 ? (this.flickV ?? 1) : 1);
    if (!this.jump) this.fovKick *= Math.max(0, 1 - dt * 2.5);
    // número de habitación actual (como en Doors)
    const rid = this.world.roomAt(p.x, p.z), rm = rid > 0 ? this.map.rooms[rid] : null, rt = rm ? 'HABITACIÓN ' + rm.number : '';
    if (rt !== this.roomTxt) { this.roomTxt = rt; $('roomNow').textContent = rt; }
    // fondo de grano
    this.grainT -= dt; if (this.grainT <= 0) { this.grainT = 0.07; const g = this.grain, id = g.createImageData(160, 90), d = id.data; for (let i = 0; i < d.length; i += 4) { const v = Math.random() * 255; d[i] = d[i + 1] = d[i + 2] = v; d[i + 3] = 255; } g.putImageData(id, 0, 0); }
    // niebla algo más densa en fase final
    if (this.scene.fog) this.scene.fog.density += ((this.q.fog * (this.final ? 1.25 : 1)) - this.scene.fog.density) * Math.min(1, dt);
  }
}
  }

// Construcción de la escena 3D a partir del mapa: muros, suelos, puertas, mobiliario, objetos y gestor de luces
import * as THREE from 'three';
import { CELL, WALL_H, JAMB, DOOR_W } from '/shared/config.js';
import { T } from '/shared/collision.js';
import * as TX from './textures.js';
import { buildFurniture, buildItem, buildHalo, buildDeco, buildNote, buildLever, MAT } from './models.js';

class Acc {
  constructor() { this.p = []; this.n = []; this.u = []; }
  quad(a, b, c, d, n) { // a=BL b=BR c=TR d=TL (vistos desde la normal)
    const base = this.p.length / 3;
    this.p.push(...a, ...b, ...c, ...a, ...c, ...d);
    for (let i = 0; i < 6; i++) this.n.push(...n);
    this.u.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1); void base;
  }
  mesh(mat, shadow = true) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(this.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(this.n, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(this.u, 2));
    const m = new THREE.Mesh(g, mat); m.castShadow = shadow; m.receiveShadow = true; m.matrixAutoUpdate = false; return m;
  }
}
const hash01 = (n) => { const s = Math.sin(n * 12.9898) * 43758.5453; return s - Math.floor(s); };

export class WorldView {
  constructor(scene, world, opts) {
    this.scene = scene; this.world = world; this.map = world.map; this.opts = opts;
    this.root = new THREE.Group(); scene.add(this.root);
    this.power = !this.map.power; this.exitUnlocked = false; this.emergency = false; this.time = 0;
    this.doors = new Map(); this.items = new Map(); this.roomGroups = new Map(); this.deadLights = new Set();
    this.leverMesh = null; this.fuseLed = null;
    this.buildShell(); this.buildDoors(); this.buildFurniture(); this.buildItems(); this.buildLights();
  }
  roomOfCell(x, y) { return this.world.roomGrid[y * this.world.W + x]; }
  roomType(id) { return id >= 0 ? this.map.rooms[id].type : 'corridor'; }
  wallKey(cx, cy) {
    const t = this.world.cellType(cx, cy);
    if (t === T.CORR) return 'corridor'; if (t === T.LOBBY) return 'lobby'; if (t === T.OUT) return 'outside';
    const id = this.roomOfCell(cx, cy); const ty = id >= 0 ? this.map.rooms[id].type : 'empty';
    return ty === 'bedroom' ? 'bed' + (id % 3) : ty;
  }
  floorKey(cx, cy) {
    const t = this.world.cellType(cx, cy);
    if (t === T.CORR) return 'carpet'; if (t === T.LOBBY) return 'marble'; if (t === T.OUT) return 'stone'; if (t === T.DOOR) return 'wood';
    const id = this.roomOfCell(cx, cy); const ty = id >= 0 ? this.map.rooms[id].type : 'empty';
    if (ty === 'storage' || ty === 'maintenance') return 'concrete'; if (ty === 'laundry') return 'tile';
    if (ty === 'luxury' || (ty === 'bedroom' && id % 2)) return 'carpet'; return 'wood';
  }
  buildShell() {
    const w = this.world, M = this.map;
    const walls = {}, floors = {}, ceil = new Acc();
    const wallAcc = (k) => (walls[k] ||= new Acc()), floorAcc = (k) => (floors[k] ||= new Acc());
    for (let y = 0; y < M.H; y++) for (let x = 0; x < M.W; x++) {
      const t = w.cellType(x, y);
      if (t === T.SOLID) {
        for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
          const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= M.W || ny >= M.H) continue;
          const nt = w.cellType(nx, ny); if (nt === T.SOLID || nt === T.DOOR) continue;
          const key = this.wallKey(nx, ny);
          // cara compartida: punto medio en y=0, normal hacia el espacio abierto, r = up x n
          const mx = (x + 0.5 + dx * 0.5) * CELL, mz = (y + 0.5 + dy * 0.5) * CELL;
          const rx = dy, rz = -dx; // up(0,1,0) x n(dx,0,dy) = (1*dy - 0, 0, 0 - 1*dx)
          const h = CELL / 2;
          wallAcc(key).quad([mx - rx * h, 0, mz - rz * h], [mx + rx * h, 0, mz + rz * h], [mx + rx * h, WALL_H, mz + rz * h], [mx - rx * h, WALL_H, mz - rz * h], [dx, 0, dy]);
        }
      } else {
        const x0 = x * CELL, z0 = y * CELL, x1 = x0 + CELL, z1 = z0 + CELL;
        floorAcc(this.floorKey(x, y)).quad([x0, 0, z1], [x1, 0, z1], [x1, 0, z0], [x0, 0, z0], [0, 1, 0]);
        if (t !== T.OUT) ceil.quad([x0, WALL_H, z0], [x1, WALL_H, z0], [x1, WALL_H, z1], [x0, WALL_H, z1], [0, -1, 0]);
      }
    }
    let seed = 1;
    for (const k of Object.keys(walls)) { const m = walls[k].mesh(new THREE.MeshStandardMaterial({ map: TX.wallTexture(k.replace(/\d$/, (d) => d), seed++ * 7 + k.length), roughness: 0.95, metalness: 0 })); this.root.add(m); }
    for (const k of Object.keys(floors)) { const m = floors[k].mesh(new THREE.MeshStandardMaterial({ map: TX.floorTexture(k), roughness: k === 'marble' ? 0.35 : 0.9, metalness: 0 }), false); this.root.add(m); }
    const c = ceil.mesh(new THREE.MeshStandardMaterial({ map: TX.floorTexture('ceiling'), roughness: 1 }), false); this.root.add(c);
  }
  doorSwing(d) {
    const zc = (d.cy + 0.5) * CELL, xc = (d.cx + 0.5) * CELL;
    let tx, tz;
    if (d.kind === 'room') { const r = this.map.rooms[d.room]; tx = (r.x + r.w / 2) * CELL; tz = (r.y + r.h / 2) * CELL; }
    else if (d.kind === 'exit') { const r = this.map.rooms[0]; tx = (r.x + r.w / 2) * CELL; tz = zc; }
    else { tx = xc; tz = zc + 10; }
    return d.axis === 'ns' ? (tz >= zc ? 1 : -1) : (tx >= xc ? 1 : -1);
  }
  buildDoors() {
    const M = this.map, ledGeo = new THREE.BoxGeometry(0.06, 0.06, 0.03);
    M.doors.forEach((d) => {
      const g = new THREE.Group(); const x0 = d.cx * CELL, z0 = d.cy * CELL, xc = x0 + CELL / 2, zc = z0 + CELL / 2;
      const ns = d.axis === 'ns', frame = MAT.woodD;
      const bx = (w, h, dd, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, dd), mat); m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; g.add(m); return m; };
      if (ns) { bx(JAMB, WALL_H, CELL, frame, x0 + JAMB / 2, 0, zc); bx(JAMB, WALL_H, CELL, frame, x0 + CELL - JAMB / 2, 0, zc); bx(DOOR_W, WALL_H - 2.2, CELL, frame, xc, 2.2, zc); }
      else { bx(CELL, WALL_H, JAMB, frame, xc, 0, z0 + JAMB / 2); bx(CELL, WALL_H, JAMB, frame, xc, 0, z0 + CELL - JAMB / 2); bx(CELL, WALL_H - 2.2, DOOR_W, frame, xc, 2.2, zc); }
      const metal = d.kind === 'exit' || d.kind === 'gate';
      const pivot = new THREE.Group(); const hx = ns ? x0 + JAMB : xc, hz = ns ? zc : z0 + JAMB; pivot.position.set(hx, 0, hz); g.add(pivot);
      const dm = new THREE.MeshStandardMaterial({ map: TX.doorTexture(d.id * 3 + 1, metal), roughness: metal ? 0.5 : 0.85, metalness: metal ? 0.6 : 0 });
      if (d.kind === 'gate') {
        const bars = new THREE.Group();
        for (let i = 0; i < 8; i++) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.02, 0.02, 2.2, 6), MAT.metal); m.position.set(0.1 + i * 0.17, 1.1, 0); m.castShadow = true; bars.add(m); }
        for (const y of [0.4, 1.1, 1.9]) { const m = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W, 0.04, 0.04), MAT.metal); m.position.set(DOOR_W / 2, y, 0); bars.add(m); }
        if (!ns) bars.rotation.y = Math.PI / 2; pivot.add(bars);
      } else {
        const pm = new THREE.Mesh(new THREE.BoxGeometry(ns ? DOOR_W - 0.02 : 0.06, 2.15, ns ? 0.06 : DOOR_W - 0.02), dm);
        pm.position.set(ns ? DOOR_W / 2 : 0, 1.075, ns ? 0 : DOOR_W / 2); pm.castShadow = true; pm.receiveShadow = true; pivot.add(pm);
        const kn = new THREE.Mesh(new THREE.SphereGeometry(0.035, 8, 6), MAT.brass); kn.position.set(ns ? DOOR_W - 0.12 : 0.05, 1.0, ns ? 0.05 : DOOR_W - 0.12); pivot.add(kn);
      }
      const view = { id: d.id, d, group: g, pivot, ns, swing: this.doorSwing(d), angle: 0, target: 0, led: null, boards: null, sign: null };
      // número de habitación en la pared (lado del pasillo)
      if (d.kind === 'room') {
        const room = M.rooms[d.room]; const cr = ns ? (zc > (room.y + room.h / 2) * CELL ? 1 : -1) : (xc > (room.x + room.w / 2) * CELL ? 1 : -1); // lado del pasillo
        const plate = new THREE.Mesh(new THREE.PlaneGeometry(0.26, 0.13), new THREE.MeshBasicMaterial({ map: TX.plateTexture(room.number) }));
        const off = CELL / 2 + 0.01;
        if (ns) { plate.position.set(x0 + JAMB / 2, 1.65, zc + cr * off); plate.rotation.y = cr > 0 ? 0 : Math.PI; }
        else { plate.position.set(xc + cr * off, 1.65, z0 + JAMB / 2); plate.rotation.y = cr > 0 ? Math.PI / 2 : -Math.PI / 2; }
        g.add(plate);
        view.corridorSide = cr;
      }
      // indicadores de cerradura
      if (d.lock && d.lock !== 'exit') {
        const mat = new THREE.MeshBasicMaterial({ color: 0xff2a1a }); const led = new THREE.Mesh(ledGeo, mat);
        const side = d.kind === 'gate' ? 1 : (view.corridorSide || 1), off = CELL / 2 + 0.02;
        if (ns) { led.position.set(x0 + CELL - JAMB / 2, 1.35, zc + side * off); } else { led.position.set(xc + side * off, 1.35, z0 + CELL - JAMB / 2); led.rotation.y = Math.PI / 2; }
        g.add(led); view.led = mat;
        if (d.lock === 'card') { const rd = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.18, 0.04), MAT.black); rd.position.copy(led.position); rd.position.y = 1.2; if (ns) rd.position.z += side * 0.02; else { rd.position.x += side * 0.02; rd.rotation.y = Math.PI / 2; } g.add(rd); }
        if (d.lock === 'board') {
          const bg = new THREE.Group(); const side2 = side;
          for (let i = 0; i < 4; i++) { const p = new THREE.Mesh(new THREE.BoxGeometry(DOOR_W + 0.2, 0.16, 0.05), MAT.woodL); p.position.set(0, 0.45 + i * 0.5, 0); p.rotation.z = (i % 2 ? 0.08 : -0.06); p.castShadow = true; bg.add(p); }
          bg.position.set(xc, 0, zc); if (ns) bg.position.z += side2 * 0.12; else { bg.rotation.y = Math.PI / 2; bg.position.x += side2 * 0.12; }
          g.add(bg); view.boards = bg;
        }
      }
      if (d.kind === 'exit') {
        const mat = new THREE.MeshBasicMaterial({ map: TX.signTexture('SALIDA', '#ff3b2a') }); const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.22), mat);
        const dirIn = this.doorSwing(d); sign.position.set(xc + dirIn * (CELL / 2 + 0.02), 2.45, zc); sign.rotation.y = dirIn > 0 ? Math.PI / 2 : -Math.PI / 2;
        g.add(sign); view.sign = sign; view.signTexLocked = mat.map; view.signTexOpen = TX.signTexture('SALIDA', '#6dff8a');
        view.led = null;
        const l = new THREE.PointLight(0xff3a22, 0.0, 6, 2); l.position.set(xc + dirIn * 0.8, 2.2, zc); g.add(l); view.exitLight = l;
      }
      this.root.add(g); this.doors.set(d.id, view);
      this.setDoor(d.id, !!this.world.doorOpen[d.id], !!this.world.doorLocked[d.id], true);
    });
  }
  setDoor(id, open, locked, instant = false) {
    const v = this.doors.get(id); if (!v) return;
    v.open = open; v.target = open ? v.swing * (v.ns ? -1 : 1) * Math.PI * 0.5 * 0.96 : 0;
    if (instant) { v.angle = v.target; v.pivot.rotation.y = v.angle; }
    v.locked = locked;
    if (v.led) v.led.color.set(locked ? 0xff2a1a : 0x35e06a);
    if (v.boards) v.boards.visible = locked;
    if (v.d.kind === 'exit' && v.sign) {
      const unlocked = !locked; v.sign.material.map = unlocked ? v.signTexOpen : v.signTexLocked; v.sign.material.needsUpdate = true;
      v.exitLight.color.set(unlocked ? 0x44ff77 : 0xff3a22); v.exitLight.intensity = 6;
    }
  }
  buildFurniture() {
    const M = this.map, get = (id) => {
      let g = this.roomGroups.get(id);
      if (!g) { g = new THREE.Group(); g.userData.room = id; g.userData.furn = []; g.userData.deco = []; this.root.add(g); this.roomGroups.set(id, g); }
      return g;
    };
    M.furniture.forEach((f) => { const m = buildFurniture(f); const g = get(f.room); g.add(m); g.userData.furn.push({ mesh: m, f }); });
    M.deco.forEach((d, i) => { const m = buildDeco(d, i); const g = get(d.room); g.add(m); g.userData.deco.push({ mesh: m, d }); if (d.kind === 'fusebox') this.fuseLed = m.getObjectByName('led'); });
    for (const t of M.terminals) {
      if (t.kind === 'note') { const g = get(t.room); const m = buildNote(t); g.add(m); t.mesh = m; }
      if (t.kind === 'lever') { const g = get(t.room); const m = buildLever(t); g.add(m); this.leverMesh = m; }
    }
    this.roomCenters = new Map();
    for (const r of M.rooms) this.roomCenters.set(r.id, { x: (r.x + r.w / 2) * CELL, z: (r.y + r.h / 2) * CELL, r: Math.hypot(r.w, r.h) * CELL / 2 });
    this.cullT = 0;
  }
  buildItems() {
    const glow = this.opts.glow;
    for (const it of this.map.items) {
      if (this.world.taken && this.world.taken.has(it.id)) continue;
      const obj = buildItem(it.kind, it.mission ? glow : glow * 0.4); obj.position.set(it.x, it.y, it.z); obj.rotation.y = (it.x * 7.3) % 6.28;
      this.root.add(obj);
      let halo = null; if (glow > 0 && (it.mission || glow > 0.9)) { halo = buildHalo(it.mission ? glow : glow * 0.5); halo.position.set(it.x, it.y + 0.08, it.z); this.root.add(halo); }
      this.items.set(it.id, { obj, halo, it, phase: Math.random() * 6.28 });
    }
  }
  removeItem(id) { const v = this.items.get(id); if (!v) return; this.root.remove(v.obj); if (v.halo) this.root.remove(v.halo); this.items.delete(id); }
  buildLights() {
    const M = this.map; this.lights = [];
    const fixGeo = new THREE.CylinderGeometry(0.16, 0.2, 0.08, 10);
    for (const l of M.lights) {
      const col = l.kind === 'lobby' ? 0xffd9a0 : l.kind === 'corr' ? 0xffd08a : 0xffe0a8;
      const mat = new THREE.MeshBasicMaterial({ color: 0x1a1710 }); const fx = new THREE.Mesh(fixGeo, mat); fx.position.set(l.x, l.y + 0.1, l.z); this.root.add(fx);
      this.lights.push({ ...l, col: new THREE.Color(col), mat, forced: null, until: 0, f: 0, d2: 0 });
    }
    const n = this.opts.lightPool; this.pool = [];
    for (let i = 0; i < n; i++) { const pl = new THREE.PointLight(0xffd9a0, 0, 15, 2); pl.castShadow = false; this.scene.add(pl); this.pool.push({ light: pl, id: -1, fade: 0 }); }
    this.poolT = 0;
    // resplandor frío del exterior de la salida
    const out = M.exit; const ol = new THREE.PointLight(0x6f8fff, 3, 9, 2); ol.position.set(out.outX, 1.8, out.outZ); this.scene.add(ol);
  }
  lightFactor(l, t) {
    if (l.forced === 'off' && t < l.until) return 0;
    const forcedOn = l.forced === 'on' && t < l.until;
    if (l.mode === 'broken' && !forcedOn) return 0;
    if (l.tier === 1 && !this.power && !forcedOn) return 0;
    if (l.mode === 'flicker' || forcedOn) { const n = hash01(Math.floor(t * 9) + l.id * 17); return (n > 0.75 ? 0.04 : 1) * (0.82 + 0.18 * Math.sin(t * 43 + l.id)); }
    return 0.97 + 0.03 * Math.sin(t * 31 + l.id);
  }
  forceLight(id, state, dur) { const l = this.lights[id]; if (!l) return; l.forced = state; l.until = this.time + dur; }
  setPower(on) { this.power = on; if (this.fuseLed) this.fuseLed.material = new THREE.MeshStandardMaterial({ color: 0x003308, emissive: 0x22ff55, emissiveIntensity: 1.4 }); }
  setEmergency(on) { this.emergency = on; }
  pullLever() { if (this.leverMesh) { const a = this.leverMesh.getObjectByName('arm'); if (a) a.rotation.z = -0.7; } }
  alterRoom(id) { // "la habitación parece diferente al regresar"
    const g = this.roomGroups.get(id); if (!g) return;
    for (const { mesh, f } of g.userData.furn) if (f.type === 'chair' || f.type === 'armchair' || f.type === 'sofa' || f.type === 'lamp') mesh.rotation.y += Math.PI * (0.35 + Math.random() * 0.5);
    for (const { mesh } of g.userData.deco) mesh.rotation.z = (Math.random() - 0.5) * 0.9;
    const li = this.lights.filter((l) => l.room === id); for (const l of li) { l.forced = 'on'; l.until = this.time + 4; }
  }
  update(dt, cam) {
    this.time += dt; const t = this.time;
    // puertas
    for (const v of this.doors.values()) {
      if (Math.abs(v.angle - v.target) > 0.002) { const s = Math.sign(v.target - v.angle); v.angle += s * Math.min(Math.abs(v.target - v.angle), dt * 3.2); v.pivot.rotation.y = v.angle; }
    }
    // objetos: flotan y brillan según la dificultad
    for (const v of this.items.values()) {
      v.obj.rotation.y += dt * 0.4; if (v.halo) v.halo.material.opacity = (0.28 + 0.22 * Math.sin(t * 2 + v.phase)) * (v.it.mission ? this.opts.glow : this.opts.glow * 0.5);
    }
    // visibilidad por habitación
    this.cullT -= dt;
    if (this.cullT <= 0) {
      this.cullT = 0.35;
      for (const [id, g] of this.roomGroups) { if (id < 0) continue; const c = this.roomCenters.get(id); g.visible = Math.hypot(c.x - cam.x, c.z - cam.z) < 48 + c.r; }
    }
    // luces: estado de cada una y reparto en el pool
    const emerg = this.emergency ? 0.5 + 0.5 * Math.sin(t * 2.6) : 0;
    for (const l of this.lights) {
      l.f = this.lightFactor(l, t);
      const c = l.mat.color; if (l.f > 0.02) { c.copy(l.col).multiplyScalar(0.35 + 0.65 * l.f); if (this.emergency) c.lerp(new THREE.Color(0xff2a1a), 0.7); } else c.set(0x14110d);
    }
    this.poolT -= dt;
    if (this.poolT <= 0) {
      this.poolT = 0.2;
      const cand = [];
      for (const l of this.lights) { const d2 = (l.x - cam.x) ** 2 + (l.z - cam.z) ** 2; if (d2 < 26 * 26 && l.f > 0.02) { l.d2 = d2; cand.push(l); } }
      cand.sort((a, b) => a.d2 - b.d2);
      const take = cand.slice(0, this.pool.length), ids = new Set(take.map((l) => l.id));
      for (const s of this.pool) if (s.id >= 0 && !ids.has(s.id)) s.id = -1;
      const used = new Set(this.pool.filter((s) => s.id >= 0).map((s) => s.id));
      for (const l of take) { if (used.has(l.id)) continue; const s = this.pool.find((q) => q.id < 0); if (!s) break; s.id = l.id; s.fade = 0; s.light.position.set(l.x, l.y - 0.1, l.z); used.add(l.id); }
    }
    const k = this.opts.lightPower;
    for (const s of this.pool) {
      if (s.id < 0) { s.light.intensity = Math.max(0, s.light.intensity - dt * 30); continue; }
      const l = this.lights[s.id]; s.fade = Math.min(1, s.fade + dt * 4);
      const col = this.emergency ? 0xff3322 : l.col; s.light.color.set(col);
      s.light.intensity = k * l.f * s.fade * (this.emergency ? 0.55 + 0.45 * emerg : 1);
    }
  }
}

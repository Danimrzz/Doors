// Anomalías visuales en habitaciones: se generan de forma determinista a partir de la semilla (todos los jugadores ven las mismas)
import * as THREE from 'three';
import { RNG } from '/shared/rng.js';
import { CELL, WALL_H } from '/shared/config.js';
import { T } from '/shared/collision.js';
import * as TX from './textures.js';
import { buildMannequin } from './models.js';

const PHRASES = ['NO MIRES', 'CORRE', 'ÉL TE VE', 'SAL DE AQUÍ', 'DETRÁS DE TI', 'NO ESTÁS SOLO', 'VUELVE'];
const KINDS = ['writing', 'paintings', 'chairs', 'redlight', 'toppled', 'mirror', 'hands', 'mannequin'];
export const ANOMALY_NAMES = { writing: 'mensaje en la pared', paintings: 'cuadros con ojos', chairs: 'sillas giradas', redlight: 'luz roja', toppled: 'muebles volcados', mirror: 'rostro en el espejo', hands: 'manos ensangrentadas', mannequin: 'maniquí' };

export class Anomalies {
  constructor(view, map, world, seed) {
    this.view = view; this.map = map; this.world = world; this.rooms = new Map(); this.mannequins = [];
    const rng = new RNG(String(seed) + '|anom');
    for (const room of map.rooms) {
      if (room.id === 0 || !rng.chance(0.42)) continue;
      const n = rng.chance(0.3) ? 2 : 1, kinds = rng.shuffle(KINDS.slice()).slice(0, n), done = [];
      for (const k of kinds) { try { if (this.apply(k, room, rng)) done.push(k); } catch (e) { console.warn('anomalía', k, e); } }
      if (done.length) this.rooms.set(room.id, done);
    }
  }
  // busca una pared sólida del interior de la habitación (no la de la puerta) y devuelve posición y orientación
  wallSpot(room, rng, skip = 0) {
    const w = this.world, sides = [];
    const midX = (room.x + room.w / 2) * CELL, midZ = (room.y + room.h / 2) * CELL;
    const solidRow = (cx, cy) => w.cellType(cx, cy) === T.SOLID;
    const cxm = room.x + (room.w >> 1), cym = room.y + (room.h >> 1);
    if (solidRow(room.x - 1, cym)) sides.push({ x: room.x * CELL + 0.03, z: midZ, ry: Math.PI / 2 });
    if (solidRow(room.x + room.w, cym)) sides.push({ x: (room.x + room.w) * CELL - 0.03, z: midZ, ry: -Math.PI / 2 });
    if (solidRow(cxm, room.y - 1)) sides.push({ x: midX, z: room.y * CELL + 0.03, ry: 0 });
    if (solidRow(cxm, room.y + room.h)) sides.push({ x: midX, z: (room.y + room.h) * CELL - 0.03, ry: Math.PI });
    if (!sides.length) return null; return sides[(rng.int(0, sides.length - 1) + skip) % sides.length];
  }
  decal(room, tex, w, h, y, rng, skip) {
    const sp = this.wallSpot(room, rng, skip); if (!sp) return false;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, transparent: true, roughness: 0.8, emissive: 0x200404, emissiveIntensity: 0.4, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }));
    m.position.set(sp.x, y, sp.z); m.rotation.y = sp.ry; m.receiveShadow = true;
    this.view.roomGroups.get(room.id)?.add(m); return true;
  }
  apply(kind, room, rng) {
    const g = this.view.roomGroups.get(room.id); if (!g) return false;
    const furn = g.userData.furn, deco = g.userData.deco;
    switch (kind) {
      case 'writing': return this.decal(room, TX.bloodTextTexture(rng.pick(PHRASES)), 1.9, 0.72, 1.75, rng, 0);
      case 'hands': return this.decal(room, TX.handsTexture(), 1.5, 1.5, 1.4, rng, 1);
      case 'paintings': {
        const ps = deco.filter((d) => d.d.type === 'painting'); if (!ps.length) return this.apply('writing', room, rng);
        const eyes = TX.eyesPaintingTexture();
        ps.forEach(({ mesh }, i) => { const pl = mesh.children.find((c) => c.geometry && c.geometry.type === 'PlaneGeometry'); if (pl) { pl.material = pl.material.clone(); pl.material.map = eyes; pl.material.needsUpdate = true; } if (i % 2) mesh.rotation.z = Math.PI; });
        return true;
      }
      case 'chairs': {
        const cs = furn.filter((f) => f.f.type === 'chair' || f.f.type === 'armchair' || f.f.type === 'sofa'); if (!cs.length) return this.apply('toppled', room, rng);
        const tx = room.x * CELL, tz = room.y * CELL;
        for (const { mesh } of cs) { const dx = tx - mesh.position.x, dz = tz - mesh.position.z; mesh.rotation.y = Math.atan2(dx, dz); }
        return true;
      }
      case 'toppled': {
        const cs = furn.filter((f) => f.f.type === 'chair' || f.f.type === 'armchair' || f.f.type === 'lamp'); if (!cs.length) return this.apply('hands', room, rng);
        cs.forEach(({ mesh }, i) => { mesh.rotation.z = Math.PI / 2 * (i % 2 ? 1 : -1); mesh.position.y += 0.22; mesh.rotation.y += i; });
        return true;
      }
      case 'redlight': {
        let n = 0; for (const l of this.view.lights) if (l.room === room.id) { l.col.set(0xff1a10); n++; }
        return n > 0;
      }
      case 'mirror': {
        const mir = deco.find((d) => d.d.type === 'mirror'); if (!mir) return this.apply('hands', room, rng);
        const f = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.9), new THREE.MeshBasicMaterial({ map: TX.faceTexture(), transparent: true, opacity: 0.85 })); f.position.set(0, 0.55, 0.04); mir.mesh.add(f); return true;
      }
      case 'mannequin': {
        const dp = room.doorPos, cands = [[room.x + 0.6, room.y + 0.6], [room.x + room.w - 0.6, room.y + 0.6], [room.x + 0.6, room.y + room.h - 0.6], [room.x + room.w - 0.6, room.y + room.h - 0.6]];
        let best = null, bd = -1; for (const [cx, cy] of cands) { const d = Math.hypot(cx * CELL - dp.x, cy * CELL - dp.z); if (d > bd) { bd = d; best = [cx * CELL, cy * CELL]; } }
        const m = buildMannequin(); m.position.set(best[0], 0, best[1]); m.rotation.y = rng.next() * 6.28; g.add(m); this.mannequins.push({ m, room: room.id, spin: 0 }); return true;
      }
    }
    return false;
  }
  // el maniquí gira para mirarte… solo cuando no lo estás mirando
  update(dt, cam, yaw) {
    for (const q of this.mannequins) {
      const dx = cam.x - q.m.position.x, dz = cam.z - q.m.position.z, d = Math.hypot(dx, dz); if (d > 22) continue;
      const fx = -Math.sin(yaw), fz = -Math.cos(yaw), dot = (-dx * fx - dz * fz) / (d || 1);
      if (dot > 0.35 && d < 16) continue; // lo estás viendo: se queda quieto
      const want = Math.atan2(dx, dz); let df = (want - q.m.rotation.y) % (Math.PI * 2); if (df > Math.PI) df -= Math.PI * 2; if (df < -Math.PI) df += Math.PI * 2;
      q.m.rotation.y += Math.sign(df) * Math.min(Math.abs(df), dt * 2.2);
    }
  }
}

// Realismo: cornisa curva (cove) bajo el techo de las salas, manchas de humedad, grietas y suciedad en el suelo
import * as THREE from 'three';
import { RNG } from '/shared/rng.js';
import { CELL, WALL_H } from '/shared/config.js';
import { T } from '/shared/collision.js';

const tex = (c) => { const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; };
const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };
function stainTex(rng) {
  const [c, g] = cv(128, 128);
  for (let i = 0; i < 6; i++) { const x = 64 + (rng() - 0.5) * 40, y = 50 + (rng() - 0.5) * 30, r = 18 + rng() * 26, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(40,28,10,0.38)'); gr.addColorStop(0.7, 'rgba(50,36,14,0.16)'); gr.addColorStop(1, 'rgba(50,36,14,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  g.strokeStyle = 'rgba(30,20,8,0.3)'; g.lineWidth = 2; for (let i = 0; i < 4; i++) { const x = 40 + rng() * 48; g.beginPath(); g.moveTo(x, 60); g.lineTo(x + (rng() - 0.5) * 6, 60 + 30 + rng() * 38); g.stroke(); }
  return tex(c);
}
function crackTex(rng) {
  const [c, g] = cv(128, 256); g.strokeStyle = 'rgba(15,10,6,0.75)'; g.lineCap = 'round';
  const branch = (x, y, a, len, w) => { g.lineWidth = w; g.beginPath(); g.moveTo(x, y); for (let i = 0; i < len; i++) { a += (rng() - 0.5) * 0.7; x += Math.sin(a) * 7; y += Math.cos(a) * 7; g.lineTo(x, y); if (rng() < 0.08 && w > 1) branch(x, y, a + (rng() - 0.5) * 1.6, len - i - 4, w * 0.6); } g.stroke(); };
  branch(64, 6, 0, 32, 2.6); return tex(c);
}
function dirtTex(rng) {
  const [c, g] = cv(128, 128); for (let i = 0; i < 40; i++) { const x = rng() * 128, y = rng() * 128, r = 6 + rng() * 22, gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, 'rgba(10,6,2,0.22)'); gr.addColorStop(1, 'rgba(10,6,2,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); }
  const gm = g.createRadialGradient(64, 64, 20, 64, 64, 64); gm.addColorStop(0, 'rgba(0,0,0,0)'); gm.addColorStop(1, 'rgba(0,0,0,1)'); g.globalCompositeOperation = 'destination-in'; g.fillStyle = gm; g.fillStyle = 'rgba(0,0,0,1)'; g.fillRect(0, 0, 128, 128);
  return tex(c);
}

export function buildDetails3(view, map, world, seed) {
  const rng = new RNG(String(seed) + '|det3'), rf = () => rng.next ? rng.next() : Math.random(), SOL = (x, y) => world.cellType(x, y) === T.SOLID, H = WALL_H;
  // --- cornisa curva continua en el encuentro pared/techo de salas y vestíbulo ---
  const P = [], rc = 0.3, NA = 6;
  for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
    const t = world.cellType(x, y); if (t !== T.ROOM && t !== T.LOBBY) continue;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      if (!SOL(x + dx, y + dy)) continue;
      const mx = (x + 0.5 + dx * 0.5) * CELL, mz = (y + 0.5 + dy * 0.5) * CELL, rx = dy, rz = -dx, h = CELL / 2, nx = -dx, nz = -dy; // nx,nz: hacia el interior
      let prev = null;
      for (let i = 0; i <= NA; i++) {
        const a = i / NA * Math.PI / 2, off = rc - rc * Math.cos(a), yy = H - rc + rc * Math.sin(a), ox = nx * off, oz = nz * off;
        const A = [mx - rx * h + ox, yy, mz - rz * h + oz], B = [mx + rx * h + ox, yy, mz + rz * h + oz];
        if (prev) P.push(...prev[0], ...prev[1], ...B, ...prev[0], ...B, ...A);
        prev = [A, B];
      }
    }
  }
  if (P.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.computeVertexNormals();
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0x8a7a5c, roughness: 0.95, side: THREE.DoubleSide })); m.matrixAutoUpdate = false; view.root.add(m);
  }
  // --- manchas, grietas y suciedad ---
  const stM = new THREE.MeshBasicMaterial({ map: stainTex(rf), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const crM = new THREE.MeshBasicMaterial({ map: crackTex(rf), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
  const diM = new THREE.MeshBasicMaterial({ map: dirtTex(rf), transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -1 });
  const pg = new THREE.PlaneGeometry(1, 1);
  map.rooms.forEach((room) => {
    const g = view.roomGroups.get(room.id); if (!g) return;
    const n = 2 + (rng.chance(0.5) ? 1 : 0);
    for (let i = 0; i < n; i++) {
      const side = rng.int(0, 3), u = rng.int(0, 1000) / 1000, lenX = room.w * CELL, lenZ = room.h * CELL; let x, z, ry;
      const cxm = room.x + Math.min(room.w - 1, Math.floor(u * room.w)), cym = room.y + Math.min(room.h - 1, Math.floor(u * room.h));
      if (side === 0 && SOL(cxm, room.y - 1)) { x = (cxm + 0.5) * CELL; z = room.y * CELL + 0.02; ry = 0; }
      else if (side === 1 && SOL(cxm, room.y + room.h)) { x = (cxm + 0.5) * CELL; z = (room.y + room.h) * CELL - 0.02; ry = Math.PI; }
      else if (side === 2 && SOL(room.x - 1, cym)) { x = room.x * CELL + 0.02; z = (cym + 0.5) * CELL; ry = Math.PI / 2; }
      else if (side === 3 && SOL(room.x + room.w, cym)) { x = (room.x + room.w) * CELL - 0.02; z = (cym + 0.5) * CELL; ry = -Math.PI / 2; }
      else continue; void lenX; void lenZ;
      const crack = rng.chance(0.4), m = new THREE.Mesh(pg, crack ? crM : stM);
      if (crack) { m.scale.set(0.7, 1.4, 1); m.position.set(x, 1.7 - rng.int(0, 40) / 100, z); m.rotation.z = (rng.int(-20, 20)) / 100; } else { m.scale.set(1.5, 1.5, 1); m.position.set(x, 2.0, z); }
      m.rotation.order = 'YXZ'; m.rotation.y = ry; g.add(m);
    }
    // suciedad en el suelo
    const d = new THREE.Mesh(pg, diM); d.rotation.x = -Math.PI / 2; d.scale.set(2.2, 2.2, 1); d.position.set((room.x + 0.5 + rng.int(0, Math.max(0, room.w - 1))) * CELL, 0.015, (room.y + 0.5 + rng.int(0, Math.max(0, room.h - 1))) * CELL); g.add(d);
  });
}

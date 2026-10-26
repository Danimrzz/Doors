// Ventanas en arco con cortinas y jarrones sobre pedestales (solo visual, determinista)
import * as THREE from 'three';
import { RNG } from '/shared/rng.js';
import { CELL } from '/shared/config.js';
import { T } from '/shared/collision.js';
import { MAT } from './models.js';

function glassTexture() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 128; const g = c.getContext('2d');
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, '#2a3f66'); gr.addColorStop(1, '#0a0f1c'); g.fillStyle = gr; g.fillRect(0, 0, 64, 128);
  g.fillStyle = '#e8eeff'; for (let i = 0; i < 14; i++) g.fillRect(Math.random() * 64, Math.random() * 60, 1.5, 1.5);
  g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(44, 26, 6, 0, 6.283); g.fill();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function curtainGeo(w, h) {
  const g = new THREE.PlaneGeometry(w, h, 14, 1), p = g.attributes.position;
  for (let i = 0; i < p.count; i++) { const x = p.getX(i), y = p.getY(i); p.setZ(i, Math.sin(x / w * 6.283 * 3) * 0.04 * (0.5 + (0.5 - y / h) )); }
  g.computeVertexNormals(); return g;
}

export function buildDetails2(view, map, world, seed) {
  const rng = new RNG(String(seed) + '|det2'), SOL = (x, y) => world.cellType(x, y) === T.SOLID;
  const W = 0.9, H = 1.5, Y0 = 0.95, R = W / 2;
  const sh = new THREE.Shape(); sh.moveTo(-R, 0); sh.lineTo(R, 0); sh.lineTo(R, H); sh.absarc(0, H, R, 0, Math.PI, false); sh.lineTo(-R, 0);
  const glassGeo = new THREE.ShapeGeometry(sh, 18), glassMat = new THREE.MeshBasicMaterial({ map: glassTexture() });
  const gUV = glassGeo.attributes.uv, gP = glassGeo.attributes.position; for (let i = 0; i < gUV.count; i++) gUV.setXY(i, (gP.getX(i) + R) / W, 1 - gP.getY(i) / (H + R));
  const frameMat = MAT.woodD, arcGeo = new THREE.TorusGeometry(R, 0.035, 6, 20, Math.PI), postGeo = new THREE.BoxGeometry(0.06, H, 0.06), barGeo = new THREE.BoxGeometry(W, 0.04, 0.05), sillGeo = new THREE.BoxGeometry(W + 0.2, 0.05, 0.14);
  const cGeo = curtainGeo(0.32, 2.15), cMat = new THREE.MeshStandardMaterial({ color: 0x6a1a22, roughness: 1, side: THREE.DoubleSide });
  const rod = new THREE.CylinderGeometry(0.015, 0.015, W + 0.7, 6);
  const mkWin = (x, z, nx, nz) => {
    const g = new THREE.Group(); g.position.set(x, Y0, z); g.rotation.y = Math.atan2(nx, nz);
    const gl = new THREE.Mesh(glassGeo, glassMat); gl.position.z = 0.005; g.add(gl);
    const arc = new THREE.Mesh(arcGeo, frameMat); arc.position.set(0, H, 0.02); g.add(arc);
    for (const sx of [-R, R, 0]) { const p = new THREE.Mesh(postGeo, frameMat); p.position.set(sx, H / 2, 0.02); g.add(p); }
    for (const y of [0.02, H * 0.55]) { const b = new THREE.Mesh(barGeo, frameMat); b.position.set(0, y, 0.02); g.add(b); }
    const sill = new THREE.Mesh(sillGeo, frameMat); sill.position.set(0, -0.02, 0.07); g.add(sill);
    const r = new THREE.Mesh(rod, MAT.brass); r.rotation.z = Math.PI / 2; r.position.set(0, H + R + 0.2, 0.1); g.add(r);
    for (const s of [-1, 1]) { const c = new THREE.Mesh(cGeo, cMat); c.position.set(s * (R + 0.08), H + R + 0.2 - 1.075, 0.1); g.add(c); }
    g.traverse((o) => { o.receiveShadow = true; }); return g;
  };
  // jarrones sobre pedestal
  const ped = new THREE.CylinderGeometry(0.16, 0.2, 0.9, 14), vase = new THREE.LatheGeometry([[0, 0], [0.1, 0], [0.14, 0.1], [0.18, 0.24], [0.12, 0.38], [0.07, 0.44], [0.1, 0.5], [0.08, 0.5], [0, 0.47]].map(([x, y]) => new THREE.Vector2(x, y)), 14);
  const pedMat = new THREE.MeshStandardMaterial({ color: 0xcfc6b0, roughness: 0.5 }), vaseMat = new THREE.MeshStandardMaterial({ color: 0x24486a, roughness: 0.3, metalness: 0.2 });
  map.rooms.forEach((room) => {
    const g = view.roomGroups.get(room.id); if (!g || room.id === 0 && false) return;
    if (!(room.id === 0 || room.type === 'bedroom' || room.type === 'luxury' || room.type === 'office') || room.w < 3 || room.h < 3) return;
    const walls = [];
    for (let i = 1; i < room.w - 1; i++) { if (SOL(room.x + i, room.y - 1)) walls.push([(room.x + i + 0.5) * CELL, room.y * CELL + 0.03, 0, 1]); if (SOL(room.x + i, room.y + room.h)) walls.push([(room.x + i + 0.5) * CELL, (room.y + room.h) * CELL - 0.03, 0, -1]); }
    for (let i = 1; i < room.h - 1; i++) { if (SOL(room.x - 1, room.y + i)) walls.push([room.x * CELL + 0.03, (room.y + i + 0.5) * CELL, 1, 0]); if (SOL(room.x + room.w, room.y + i)) walls.push([(room.x + room.w) * CELL - 0.03, (room.y + i + 0.5) * CELL, -1, 0]); }
    const n = Math.min(walls.length, room.id === 0 ? 3 : rng.int(1, 2)), pool = rng.shuffle(walls.slice());
    for (let i = 0; i < n; i++) { const [x, z, nx, nz] = pool[i]; g.add(mkWin(x, z, nx, nz)); }
    if (room.id === 0 || room.type === 'luxury') for (const [sx, sz] of [[1, 1], [-1, -1]]) {
      const px = sx > 0 ? room.x * CELL + 0.5 : (room.x + room.w) * CELL - 0.5, pz = sz > 0 ? (room.y + room.h) * CELL - 0.5 : room.y * CELL + 0.5;
      const p = new THREE.Mesh(ped, pedMat); p.position.set(px, 0.45, pz); const v = new THREE.Mesh(vase, vaseMat); v.position.set(px, 0.9, pz); g.add(p); g.add(v);
    }
  });
}

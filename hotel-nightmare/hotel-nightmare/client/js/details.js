// Detalles decorativos redondeados (solo visuales, deterministas por semilla): apliques, relojes, alfombras, lámparas de araña, plantas
import * as THREE from 'three';
import { RNG } from '/shared/rng.js';
import { CELL, WALL_H } from '/shared/config.js';
import { T } from '/shared/collision.js';
import { mergeStatic, MAT } from './models.js';

const lathe = (pts, seg = 14) => new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
const mk = (geo, mat, x = 0, y = 0, z = 0) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); m.castShadow = false; m.receiveShadow = true; return m; };

function rugTexture(seed) {
  const c = document.createElement('canvas'); c.width = c.height = 256; const g = c.getContext('2d');
  const pal = [['#5a1a1a', '#c9a24a'], ['#1f3a4a', '#d8cba5'], ['#3a2a14', '#a8743f'], ['#2a3a22', '#c9a24a']][seed % 4];
  g.fillStyle = pal[0]; g.fillRect(0, 0, 256, 256);
  g.strokeStyle = pal[1]; for (let i = 0; i < 4; i++) { g.lineWidth = i === 0 ? 8 : 3; g.beginPath(); g.arc(128, 128, 118 - i * 22, 0, 6.283); g.stroke(); }
  g.fillStyle = pal[1]; for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; g.beginPath(); g.ellipse(128 + Math.cos(a) * 52, 128 + Math.sin(a) * 52, 9, 4, a, 0, 6.283); g.fill(); }
  const d = g.getImageData(0, 0, 256, 256); for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random() - 0.5) * 22; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; } g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}
function clockTexture() {
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#d8cfb4'; g.beginPath(); g.arc(64, 64, 62, 0, 6.283); g.fill(); g.strokeStyle = '#1a1208'; g.lineWidth = 3;
  for (let i = 0; i < 12; i++) { const a = i / 12 * 6.283; g.beginPath(); g.moveTo(64 + Math.sin(a) * 50, 64 - Math.cos(a) * 50); g.lineTo(64 + Math.sin(a) * 58, 64 - Math.cos(a) * 58); g.stroke(); }
  g.lineWidth = 5; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 + 24, 64 - 30); g.stroke(); g.lineWidth = 3; g.beginPath(); g.moveTo(64, 64); g.lineTo(64 - 8, 64 + 40); g.stroke();
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t;
}

export function buildDetails(view, map, world, seed) {
  const rng = new RNG(String(seed) + '|det'), SOL = (x, y) => world.cellType(x, y) === T.SOLID;
  const brass = MAT.brass, wood = MAT.woodD;
  const warm = new THREE.MeshBasicMaterial({ color: 0xffd9a0 });
  // --- apliques de pared en pasillos y vestíbulo (fusionados por bloque de 8x8 celdas) ---
  const shadeGeo = lathe([[0.02, 0], [0.09, 0.02], [0.12, 0.14], [0.1, 0.17], [0.0, 0.17]], 10), armGeo = new THREE.CylinderGeometry(0.015, 0.015, 0.12, 6), plateGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.02, 12);
  const chunks = new Map();
  for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
    const t = world.cellType(x, y); if (t !== T.CORR && t !== T.LOBBY) continue;
    if (((x * 7 + y * 13) % 4) !== 0 || rng.chance(0.25)) continue;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      if (!SOL(x + dx, y + dy)) continue;
      const cx = (x + 0.5) * CELL, cz = (y + 0.5) * CELL, off = CELL / 2 - 0.02;
      const g = new THREE.Group(); g.position.set(cx + dx * off, 1.95, cz + dy * off); g.rotation.y = Math.atan2(-dx, -dy);
      const plate = mk(plateGeo, brass); plate.rotation.x = Math.PI / 2; g.add(plate);
      const arm = mk(armGeo, brass, 0, 0, 0.06); arm.rotation.x = Math.PI / 2; g.add(arm);
      const sh = mk(shadeGeo, warm, 0, -0.02, 0.12); g.add(sh); g.updateMatrixWorld(true);
      const k = (x >> 3) + ',' + (y >> 3); let G = chunks.get(k); if (!G) chunks.set(k, (G = new THREE.Group())); G.add(g);
      break;
    }
  }
  for (const [k, G] of chunks) { G.updateMatrixWorld(true); const [a, b] = k.split(',').map(Number); for (const m of mergeStatic([G])) { view.root.add(m); view.shellChunks.push(Object.assign(m, {})); m.userData.ck = k; m.userData.cx = (a * 8 + 4) * CELL; m.userData.cz = (b * 8 + 4) * CELL; } }
  // --- por habitación ---
  const rugGeo = new THREE.CircleGeometry(1, 32), ringGeo = new THREE.TorusGeometry(0.5, 0.03, 8, 28), rimGeo = new THREE.TorusGeometry(0.19, 0.022, 6, 22);
  const potGeo = lathe([[0.0, 0], [0.12, 0], [0.17, 0.3], [0.19, 0.34], [0.15, 0.34], [0.0, 0.3]], 12), leafGeo = new THREE.SphereGeometry(0.16, 8, 6);
  const leafMat = new THREE.MeshStandardMaterial({ color: 0x2d4a24, roughness: 0.9 }), potMat = new THREE.MeshStandardMaterial({ color: 0x6b3a22, roughness: 0.8 });
  const candleGeo = new THREE.SphereGeometry(0.035, 6, 5), bodyGeo = lathe([[0, 0], [0.08, 0.02], [0.12, 0.12], [0.07, 0.24], [0.03, 0.34], [0, 0.36]], 12), chainGeo = new THREE.CylinderGeometry(0.01, 0.01, 1, 5);
  const clockMat = new THREE.MeshStandardMaterial({ map: clockTexture(), roughness: 0.5 });
  map.rooms.forEach((room) => {
    const g = view.roomGroups.get(room.id); if (!g) return;
    const lobby = room.id === 0, nice = lobby || room.type === 'luxury' || room.type === 'office' || room.type === 'bedroom';
    const cx = (room.x + room.w / 2) * CELL, cz = (room.y + room.h / 2) * CELL, big = room.w >= 4 && room.h >= 4;
    if (nice && big) {
      // alfombra circular
      const r = Math.max(1.0, Math.min(room.w, room.h) * CELL * (lobby ? 0.28 : 0.24));
      const rug = new THREE.Mesh(rugGeo, new THREE.MeshStandardMaterial({ map: rugTexture(room.id), roughness: 1, polygonOffset: true, polygonOffsetFactor: -1 }));
      rug.rotation.x = -Math.PI / 2; rug.position.set(cx, 0.012, cz); rug.scale.set(r, r, r); rug.receiveShadow = true; g.add(rug);
      // rosetón redondo en el techo
      const ring = new THREE.Mesh(ringGeo, wood); ring.rotation.x = Math.PI / 2; ring.position.set(cx, WALL_H - 0.03, cz); ring.scale.set(r * 1.6, r * 1.6, 1); g.add(ring);
    }
    if (lobby || room.type === 'luxury') {
      // lámpara de araña
      const h = new THREE.Group(); h.position.set(cx, WALL_H, cz);
      const chain = mk(chainGeo, brass, 0, -0.35, 0); chain.scale.y = 0.7; h.add(chain);
      const body = mk(bodyGeo, brass, 0, -1.05, 0); h.add(body);
      for (const rr of [0.3, 0.5]) { const ring2 = mk(rimGeo, brass, 0, -0.9 - rr * 0.2, 0); ring2.rotation.x = Math.PI / 2; ring2.scale.set(rr / 0.19, rr / 0.19, 1); h.add(ring2);
        for (let i = 0; i < 8; i++) { const a = i / 8 * 6.283; h.add(mk(candleGeo, warm, Math.cos(a) * rr, -0.86 - rr * 0.2, Math.sin(a) * rr)); } }
      g.add(h);
    }
    if (nice) {
      // plantas en dos esquinas
      const corners = [[1, 1], [-1, 1], [1, -1], [-1, -1]]; let n = 0;
      for (const [sx, sz] of corners) {
        if (n >= (lobby ? 2 : 1) || !rng.chance(0.7)) continue;
        const px = (sx > 0 ? room.x * CELL + 0.45 : (room.x + room.w) * CELL - 0.45), pz = (sz > 0 ? room.y * CELL + 0.45 : (room.y + room.h) * CELL - 0.45);
        if (!SOL(sx > 0 ? room.x - 1 : room.x + room.w, Math.floor(pz / CELL))) continue;
        const pl = new THREE.Group(); pl.position.set(px, 0, pz); pl.add(mk(potGeo, potMat));
        for (let i = 0; i < 7; i++) { const a = i * 2.4, lf = mk(leafGeo, leafMat, Math.cos(a) * 0.1, 0.5 + (i % 4) * 0.16, Math.sin(a) * 0.1); lf.scale.set(0.9, 1.5 + (i % 3) * 0.3, 0.6); lf.rotation.set(Math.sin(a) * 0.6, a, Math.cos(a) * 0.6); pl.add(lf); }
        g.add(pl); n++;
      }
      // reloj redondo en una pared
      if (rng.chance(0.6)) {
        const cxm = room.x + (room.w >> 1), cym = room.y + (room.h >> 1), opts = [];
        if (SOL(room.x - 1, cym)) opts.push([room.x * CELL + 0.04, cz, Math.PI / 2]); if (SOL(room.x + room.w, cym)) opts.push([(room.x + room.w) * CELL - 0.04, cz, -Math.PI / 2]);
        if (SOL(cxm, room.y - 1)) opts.push([cx, room.y * CELL + 0.04, 0]); if (SOL(cxm, room.y + room.h)) opts.push([cx, (room.y + room.h) * CELL - 0.04, Math.PI]);
        if (opts.length) { const [x, z, ry] = rng.pick(opts), cl = new THREE.Group(); cl.position.set(x, 2.35, z); cl.rotation.y = ry;
          const face = new THREE.Mesh(new THREE.CircleGeometry(0.19, 24), clockMat); face.position.z = 0.012; cl.add(face);
          cl.add(mk(rimGeo, brass, 0, 0, 0.015)); g.add(cl); }
      }
    }
  });
}

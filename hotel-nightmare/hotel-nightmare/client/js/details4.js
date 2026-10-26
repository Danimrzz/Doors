// Pasillos: alfombra larga con bordes dorados y resplandor suave alrededor de cada lámpara (sigue el parpadeo de la luz)
import * as THREE from 'three';
import { CELL } from '/shared/config.js';
import { T } from '/shared/collision.js';
import { radialTexture } from './textures.js';

function runnerTex() {
  const c = document.createElement('canvas'); c.width = 64; c.height = 64; const g = c.getContext('2d');
  g.fillStyle = '#4a1218'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#c9a24a'; g.fillRect(4, 0, 3, 64); g.fillRect(57, 0, 3, 64); g.fillRect(9, 0, 1, 64); g.fillRect(54, 0, 1, 64);
  g.fillStyle = '#8a6a2a'; g.beginPath(); g.moveTo(32, 12); g.lineTo(42, 32); g.lineTo(32, 52); g.lineTo(22, 32); g.fill();
  const d = g.getImageData(0, 0, 64, 64); for (let i = 0; i < d.data.length; i += 4) { const n = (Math.random() - 0.5) * 18; d.data[i] += n; d.data[i + 1] += n; d.data[i + 2] += n; } g.putImageData(d, 0, 0);
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

export function buildDetails4(view, map, world) {
  const SOL = (x, y) => world.cellType(x, y) === T.SOLID, P = [], U = [], N = [], hw = 0.55;
  for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
    if (world.cellType(x, y) !== T.CORR) continue;
    const sx = SOL(x - 1, y) && SOL(x + 1, y), sz = SOL(x, y - 1) && SOL(x, y + 1), x0 = x * CELL, z0 = y * CELL, xc = x0 + CELL / 2, zc = z0 + CELL / 2, yy = 0.012;
    if (sx && !sz) { P.push(xc - hw, yy, z0, xc - hw, yy, z0 + CELL, xc + hw, yy, z0 + CELL, xc - hw, yy, z0, xc + hw, yy, z0 + CELL, xc + hw, yy, z0); U.push(0, 0, 0, 1, 1, 1, 0, 0, 1, 1, 1, 0); }
    else if (sz && !sx) { P.push(x0, yy, zc - hw, x0 + CELL, yy, zc - hw, x0 + CELL, yy, zc + hw, x0, yy, zc - hw, x0 + CELL, yy, zc + hw, x0, yy, zc + hw); U.push(0, 0, 1, 0, 1, 1, 0, 0, 1, 1, 0, 1); }
    else continue;
    for (let i = 0; i < 6; i++) N.push(0, 1, 0);
  }
  if (P.length) {
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2));
    const m = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: runnerTex(), roughness: 1, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -1 })); m.matrixAutoUpdate = false; m.receiveShadow = true; view.root.add(m);
  }
  // resplandor de lámparas: un solo Points con color por vértice
  const L = view.lights, pos = new Float32Array(L.length * 3), col = new Float32Array(L.length * 3);
  L.forEach((l, i) => { pos[i * 3] = l.x; pos[i * 3 + 1] = l.y - 0.2; pos[i * 3 + 2] = l.z; });
  const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ map: radialTexture('255,214,150'), size: 1.5, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, sizeAttenuation: true, fog: false }));
  pts.frustumCulled = false; view.root.add(pts);
  const old = view.update.bind(view), cam0 = new THREE.Vector3();
  view.update = (dt, cam) => {
    old(dt, cam); cam0.set(cam.x, cam.y, cam.z);
    for (let i = 0; i < L.length; i++) { const l = L[i], d = Math.hypot(l.x - cam.x, l.z - cam.z), k = d < 30 ? Math.min(1, (30 - d) / 10) * Math.min(1, l.f) * 0.32 : 0; col[i * 3] = k; col[i * 3 + 1] = k * 0.82; col[i * 3 + 2] = k * 0.55; }
    geo.attributes.color.needsUpdate = true;
  };
}

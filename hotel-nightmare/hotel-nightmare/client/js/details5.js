// Retratos ovalados con marco dorado en los pasillos (fusionados por bloque)
import * as THREE from 'three';
import { CELL } from '/shared/config.js';
import { T } from '/shared/collision.js';
import { mergeStatic, MAT } from './models.js';
import { paintingTexture } from './textures.js';

export function buildDetails5(view, map, world) {
  const SOL = (x, y) => world.cellType(x, y) === T.SOLID;
  const mats = [3, 17, 29, 41].map((s) => new THREE.MeshStandardMaterial({ map: paintingTexture(s), roughness: 0.7 }));
  const face = new THREE.CircleGeometry(1, 28), rim = new THREE.TorusGeometry(1, 0.08, 8, 32), inner = new THREE.TorusGeometry(1, 0.025, 6, 32);
  const chunks = new Map();
  for (let y = 0; y < map.H; y++) for (let x = 0; x < map.W; x++) {
    if (world.cellType(x, y) !== T.CORR || ((x * 7 + y * 13) % 4) !== 2) continue;
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      if (!SOL(x + dx, y + dy)) continue;
      const g = new THREE.Group(), off = CELL / 2 - 0.035; g.position.set((x + 0.5) * CELL + dx * off, 1.75, (y + 0.5) * CELL + dy * off); g.rotation.y = Math.atan2(-dx, -dy);
      const p = new THREE.Mesh(face, mats[(x * 3 + y * 5) % 4]); p.scale.set(0.27, 0.36, 1); p.castShadow = false; g.add(p);
      const r1 = new THREE.Mesh(rim, MAT.brass); r1.scale.set(0.3, 0.39, 0.6); r1.position.z = 0.01; r1.castShadow = false; g.add(r1);
      const r2 = new THREE.Mesh(inner, MAT.brass); r2.scale.set(0.24, 0.33, 1); r2.position.z = 0.012; r2.castShadow = false; g.add(r2);
      g.updateMatrixWorld(true);
      const k = (x >> 3) + ',' + (y >> 3); let G = chunks.get(k); if (!G) chunks.set(k, (G = new THREE.Group())); G.add(g);
      break;
    }
  }
  for (const [k, G] of chunks) { G.updateMatrixWorld(true); const [a, b] = k.split(',').map(Number); for (const m of mergeStatic([G])) { view.root.add(m); view.shellChunks.push(m); m.userData.ck = k; m.userData.cx = (a * 8 + 4) * CELL; m.userData.cz = (b * 8 + 4) * CELL; } }
}

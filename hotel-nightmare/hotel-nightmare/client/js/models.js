// Modelos 3D procedurales: mobiliario, objetos de misión, el enemigo, avatares y decoración
import * as THREE from 'three';
import { FURN } from '/shared/furniture.js';
import { paintingTexture, signTexture, nameTexture, radialTexture } from './textures.js';

const std = (color, rough = 0.85, metal = 0, extra = {}) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal, ...extra });
export const MAT = {
  woodD: std(0x3a2416), woodM: std(0x5a3a22), woodL: std(0x7a5a38), fabR: std(0x5a1f24, 1), fabG: std(0x2b4a3a, 1), fabB: std(0x2a3a55, 1), fabY: std(0x6a5a30, 1),
  white: std(0xcfd2cc, 0.6), metal: std(0x5c6064, 0.45, 0.7), rust: std(0x6a3a22, 0.9, 0.3), black: std(0x0e0e0e, 0.7), plastic: std(0x2c3a40, 0.5), leaf: std(0x2b4a28, 1),
  pot: std(0x6b4a34, 0.9), paper: std(0xd9c9a1, 1), brass: std(0xb58b32, 0.35, 0.85), cardboard: std(0x7a6040, 1), glass: std(0x9fb0b0, 0.15, 0.1, { transparent: true, opacity: 0.35 }),
  shadow: new THREE.MeshBasicMaterial({ color: 0x000000 }),
};
const G = { box: new THREE.BoxGeometry(1, 1, 1), cyl: new THREE.CylinderGeometry(1, 1, 1, 16), cyl8: new THREE.CylinderGeometry(1, 1, 1, 8), sph: new THREE.SphereGeometry(1, 12, 10) };
// cajas con bordes redondeados (menos "cuadrado"); la geometría se cachea por tamaño
const RB_CACHE = new Map();
function roundedBox(w, h, d) {
  const key = w.toFixed(3) + '|' + h.toFixed(3) + '|' + d.toFixed(3);
  let g = RB_CACHE.get(key); if (g) return g;
  const mn = Math.min(w, h, d), r = Math.min(0.03, mn * 0.32);
  if (mn < 0.035) g = new THREE.BoxGeometry(w, h, d);
  else {
    g = new THREE.BoxGeometry(w, h, d, 3, 3, 3);
    const hx = w / 2, hy = h / 2, hz = d / 2, pa = g.attributes.position, na = g.attributes.normal, v = new THREE.Vector3(), inner = new THREE.Vector3();
    const remap = (t, hh) => { const a = Math.abs(t) / hh; const m = a > 0.99 ? hh : a > 0.3 ? hh - r : 0; return Math.sign(t) * m; };
    for (let i = 0; i < pa.count; i++) {
      v.set(pa.getX(i), pa.getY(i), pa.getZ(i));
      v.set(remap(v.x, hx), remap(v.y, hy), remap(v.z, hz));
      inner.set(Math.max(-(hx - r), Math.min(hx - r, v.x)), Math.max(-(hy - r), Math.min(hy - r, v.y)), Math.max(-(hz - r), Math.min(hz - r, v.z)));
      v.sub(inner); const len = v.length();
      if (len > 1e-6) { v.divideScalar(len); na.setXYZ(i, v.x, v.y, v.z); v.multiplyScalar(r).add(inner); } else v.copy(inner);
      pa.setXYZ(i, v.x, v.y, v.z);
    }
  }
  RB_CACHE.set(key, g); return g;
}
function b(w, h, d, mat, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(roundedBox(w, h, d), mat); m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; if (parent) parent.add(m); return m; }
// fusiona en pocas mallas (una por material) todas las mallas estáticas de una lista de objetos con matrixWorld ya calculada
export function mergeStatic(objs) {
  const buckets = new Map();
  for (const o of objs) o.traverse((m) => {
    if (!m.isMesh || m.isSprite || Array.isArray(m.material)) return;
    const key = m.material.uuid + (m.castShadow ? 's' : 'n'); let bk = buckets.get(key); if (!bk) buckets.set(key, (bk = { mat: m.material, shadow: m.castShadow, items: [] }));
    bk.items.push(m);
  });
  const out = [], nm = new THREE.Matrix3();
  for (const bk of buckets.values()) {
    let nv = 0, ni = 0; for (const m of bk.items) { nv += m.geometry.attributes.position.count; ni += m.geometry.index ? m.geometry.index.count : m.geometry.attributes.position.count; }
    const P = new Float32Array(nv * 3), N = new Float32Array(nv * 3), U = new Float32Array(nv * 2), I = nv > 65535 ? new Uint32Array(ni) : new Uint16Array(ni);
    let vo = 0, io = 0; const v = new THREE.Vector3();
    for (const m of bk.items) {
      const g = m.geometry, pa = g.attributes.position, na = g.attributes.normal, ua = g.attributes.uv; nm.getNormalMatrix(m.matrixWorld);
      for (let i = 0; i < pa.count; i++) {
        v.fromBufferAttribute(pa, i).applyMatrix4(m.matrixWorld); P.set([v.x, v.y, v.z], (vo + i) * 3);
        if (na) { v.fromBufferAttribute(na, i).applyMatrix3(nm).normalize(); N.set([v.x, v.y, v.z], (vo + i) * 3); }
        if (ua) U.set([ua.getX(i), ua.getY(i)], (vo + i) * 2);
      }
      if (g.index) for (let i = 0; i < g.index.count; i++) I[io++] = g.index.getX(i) + vo; else for (let i = 0; i < pa.count; i++) I[io++] = vo + i;
      vo += pa.count;
    }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(U, 2)); geo.setIndex(new THREE.BufferAttribute(I, 1)); geo.computeBoundingSphere();
    const mesh = new THREE.Mesh(geo, bk.mat); mesh.castShadow = bk.shadow; mesh.receiveShadow = true; mesh.matrixAutoUpdate = false; out.push(mesh);
  }
  return out;
}
function cyl(r, h, mat, x = 0, y = 0, z = 0, parent, seg8 = false) { const m = new THREE.Mesh(seg8 ? G.cyl8 : G.cyl, mat); m.scale.set(r, h, r); m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; if (parent) parent.add(m); return m; }

const FABRICS = [MAT.fabR, MAT.fabG, MAT.fabB, MAT.fabY];
function hashN(s) { let h = 7; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); }

export function buildFurniture(f) {
  const g = new THREE.Group(); const spec = FURN[f.type]; const w = spec.lw, d = spec.ld, h = spec.h;
  const fab = FABRICS[hashN(f.id) % FABRICS.length];
  switch (f.type) {
    case 'bed': case 'bedDouble': {
      b(w, 0.3, d, MAT.woodD, 0, 0, 0, g); b(w - 0.1, 0.22, d - 0.15, MAT.white, 0, 0.3, 0.05, g); b(w - 0.1, 0.12, d * 0.62, fab, 0, 0.5, 0.35, g);
      b(w, 0.9, 0.08, MAT.woodD, 0, 0, -d / 2 + 0.04, g); b(0.5, 0.12, 0.35, MAT.white, -w * 0.22, 0.52, -d / 2 + 0.3, g); b(0.5, 0.12, 0.35, MAT.white, w * 0.22, 0.52, -d / 2 + 0.3, g); break;
    }
    case 'nightstand': b(w, h, d, MAT.woodM, 0, 0, 0, g); b(w - 0.06, 0.02, 0.01, MAT.black, 0, 0.3, d / 2); break;
    case 'wardrobe': b(w, h, d, MAT.woodD, 0, 0, 0, g); b(0.02, h - 0.2, 0.02, MAT.black, 0, 0.1, d / 2); b(0.04, 0.2, 0.04, MAT.brass, -0.1, 1.0, d / 2); b(0.04, 0.2, 0.04, MAT.brass, 0.1, 1.0, d / 2); b(w + 0.06, 0.1, d + 0.04, MAT.woodM, 0, h, 0, g); break;
    case 'desk': b(w, 0.06, d, MAT.woodM, 0, h - 0.06, 0, g); b(0.06, h - 0.06, d - 0.1, MAT.woodD, -w / 2 + 0.05, 0, 0, g); b(0.06, h - 0.06, d - 0.1, MAT.woodD, w / 2 - 0.05, 0, 0, g); b(w - 0.2, 0.4, 0.03, MAT.woodD, 0, 0.3, -d / 2 + 0.05, g); break;
    case 'chair': b(0.45, 0.05, 0.45, MAT.woodM, 0, 0.45, 0, g); b(0.45, 0.5, 0.05, MAT.woodM, 0, 0.45, -0.2, g); for (const sx of [-1, 1]) for (const sz of [-1, 1]) b(0.04, 0.45, 0.04, MAT.woodD, sx * 0.19, 0, sz * 0.19, g); break;
    case 'sofa': b(w, 0.4, d, fab, 0, 0.1, 0, g); b(w, 0.5, 0.25, fab, 0, 0.4, -d / 2 + 0.12, g); b(0.2, 0.55, d, fab, -w / 2 + 0.1, 0.1, 0, g); b(0.2, 0.55, d, fab, w / 2 - 0.1, 0.1, 0, g); for (const sx of [-1, 1]) b(0.06, 0.1, 0.06, MAT.woodD, sx * (w / 2 - 0.1), 0, d / 2 - 0.1, g); break;
    case 'armchair': b(w, 0.4, d, fab, 0, 0.1, 0, g); b(w, 0.55, 0.22, fab, 0, 0.4, -d / 2 + 0.11, g); b(0.18, 0.5, d, fab, -w / 2 + 0.09, 0.1, 0, g); b(0.18, 0.5, d, fab, w / 2 - 0.09, 0.1, 0, g); break;
    case 'table': cyl(0.6, 0.05, MAT.woodM, 0, h - 0.05, 0, g); cyl(0.07, h - 0.05, MAT.woodD, 0, 0, 0, g); cyl(0.3, 0.04, MAT.woodD, 0, 0, 0, g); break;
    case 'shelf': b(w, h, 0.03, MAT.woodD, 0, 0, -d / 2 + 0.02, g); for (const sx of [-1, 1]) b(0.04, h, d, MAT.woodD, sx * (w / 2 - 0.02), 0, 0, g); for (let i = 0; i < 5; i++) b(w, 0.03, d, MAT.woodM, 0, 0.05 + i * 0.45, 0, g);
      for (let i = 0; i < 4; i++) b(0.15 + (i % 3) * 0.05, 0.25, 0.2, FABRICS[(i + hashN(f.id)) % 4], -0.4 + i * 0.28, 0.08 + (i % 2) * 0.9, 0, g); break;
    case 'crate': b(w, h, d, MAT.cardboard, 0, 0, 0, g); b(w + 0.02, 0.04, 0.1, MAT.woodD, 0, h * 0.5, d / 2); break;
    case 'crateStack': b(w, 0.75, d, MAT.cardboard, 0, 0, 0, g); b(w * 0.8, 0.7, d * 0.8, MAT.woodL, 0.05, 0.75, 0, g); break;
    case 'washer': b(w, h, d, MAT.white, 0, 0, 0, g); { const dr = cyl(0.27, 0.05, MAT.glass, 0, 0.45, d / 2, g); dr.rotation.x = Math.PI / 2; } b(w, 0.15, 0.03, MAT.metal, 0, h - 0.18, d / 2); break;
    case 'lamp': cyl(0.12, 0.03, MAT.black, 0, 0, 0, g); cyl(0.02, 1.35, MAT.brass, 0, 0.03, 0, g); { const s = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.2, 0.25, 12, 1, true), std(0xd9c28a, 1, 0, { side: THREE.DoubleSide, emissive: 0x3a2a10 })); s.position.y = 1.5; g.add(s); } break;
    case 'reception': b(w, h, d, MAT.woodD, 0, 0, 0, g); b(w + 0.1, 0.06, d + 0.1, MAT.woodM, 0, h, 0, g); b(0.3, 0.2, 0.2, MAT.brass, -1, h + 0.06, 0.1, g); b(0.15, 0.3, 0.15, MAT.black, 1, h + 0.06, 0, g); break;
    case 'boiler': cyl(0.55, 1.7, MAT.rust, 0, 0, 0, g); cyl(0.6, 0.12, MAT.metal, 0, 1.6, 0, g); cyl(0.1, 0.4, MAT.metal, 0.2, 1.7, 0.1, g); b(0.12, 1.7, 0.12, MAT.metal, 0.6, 0.2, -0.45, g); b(0.4, 0.4, 0.15, MAT.black, 0, 0.9, 0.55, g); break;
    case 'locker': b(w, h, d, MAT.metal, 0, 0, 0, g); b(0.02, h - 0.2, 0.01, MAT.black, 0, 0.1, d / 2); b(0.06, 0.12, 0.03, MAT.black, 0.12, 1.0, d / 2); break;
    case 'cabinet': b(w, h, d, MAT.metal, 0, 0, 0, g); for (let i = 0; i < 3; i++) b(w - 0.06, 0.01, 0.01, MAT.black, 0, 0.3 + i * 0.35, d / 2); break;
    case 'sink': b(w, h - 0.1, d, MAT.white, 0, 0, 0, g); b(w, 0.1, d, MAT.white, 0, h - 0.1, 0, g); cyl(0.015, 0.2, MAT.metal, 0, h, -d / 2 + 0.1, g); break;
    case 'bench': b(w, 0.07, d, MAT.woodM, 0, 0.42, 0, g); for (const sx of [-1, 1]) b(0.06, 0.42, d - 0.06, MAT.woodD, sx * (w / 2 - 0.1), 0, 0, g); break;
    case 'cart': b(w, 0.05, d, MAT.metal, 0, 0.25, 0, g); b(w, 0.05, d, MAT.metal, 0, 0.8, 0, g); for (const sx of [-1, 1]) b(0.03, 0.85, d, MAT.metal, sx * (w / 2 - 0.02), 0.1, 0, g); b(0.3, 0.25, 0.3, MAT.white, -0.15, 0.3, 0, g); b(0.25, 0.2, 0.35, MAT.fabR, 0.2, 0.85, 0, g); break;
    case 'plant': cyl(0.2, 0.35, MAT.pot, 0, 0, 0, g); for (let i = 0; i < 7; i++) { const l = new THREE.Mesh(G.sph, MAT.leaf); l.scale.set(0.12, 0.3, 0.05); const a = i * 0.9; l.position.set(Math.cos(a) * 0.12, 0.7 + (i % 3) * 0.1, Math.sin(a) * 0.12); l.rotation.set(Math.sin(a) * 0.5, a, Math.cos(a) * 0.5); l.castShadow = true; g.add(l); } break;
    case 'workbench': b(w, 0.07, d, MAT.woodL, 0, h - 0.07, 0, g); for (const sx of [-1, 1]) b(0.08, h - 0.07, d - 0.1, MAT.metal, sx * (w / 2 - 0.08), 0, 0, g); b(0.2, 0.1, 0.12, MAT.rust, -0.4, h, 0, g); break;
    case 'basket': cyl(0.22, 0.45, MAT.woodL, 0, 0, 0, g); b(0.3, 0.1, 0.25, MAT.white, 0, 0.45, 0, g); break;
    case 'debris': for (let i = 0; i < 5; i++) { const p = b(0.2 + (i % 3) * 0.15, 0.05 + (i % 2) * 0.12, 0.5, MAT.woodD, (i - 2) * 0.17, 0, ((i * 37) % 10) / 20 - 0.2, g); p.rotation.y = i * 0.9; } break;
    case 'mattress': b(w, h, d, MAT.fabY, 0, 0, 0, g); break;
    case 'rug': { const m = b(w, 0.015, d, MAT.fabR, 0, 0, 0, g); m.castShadow = false; break; }
    case 'elevator': b(w, h, d, MAT.metal, 0, 0, 0, g); b(0.9, 2.1, 0.05, MAT.brass, -0.46, 0, d / 2 + 0.01, g); b(0.9, 2.1, 0.05, MAT.brass, 0.46, 0, d / 2 + 0.01, g); b(0.1, 0.1, 0.03, MAT.black, 1.3, 1.1, d / 2, g); b(0.5, 0.18, 0.03, MAT.black, 0, 2.25, d / 2 + 0.02, g); break;
    default: b(w, h, d, MAT.woodM, 0, 0, 0, g);
  }
  g.rotation.y = f.rot; g.position.set(f.x, 0, f.z);
  if (f.type === 'rug' || f.type === 'mattress') g.traverse((o) => { if (o.isMesh) o.castShadow = false; });
  g.updateMatrixWorld(true);
  return g;
}

// ---------- objetos recogibles ----------
const emis = (color, k) => std(color, 0.4, 0.6, { emissive: color, emissiveIntensity: k });
export function buildItem(kind, glow) {
  const g = new THREE.Group(); const k = 0.1 + glow * 0.5;
  switch (kind) {
    case 'masterKey': { const m = emis(0xc9a24b, k); const r = new THREE.Mesh(new THREE.TorusGeometry(0.045, 0.012, 8, 14), m); r.position.set(0, 0.012, 0.09); r.rotation.x = Math.PI / 2; g.add(r); b(0.016, 0.014, 0.16, m, 0, 0, -0.02, g); b(0.04, 0.014, 0.02, m, 0.02, 0, -0.08, g); b(0.03, 0.014, 0.02, m, 0.018, 0, -0.05, g); break; }
    case 'finalKey': { const m = emis(0xd8b24a, k * 1.3); const r = new THREE.Mesh(new THREE.TorusGeometry(0.06, 0.016, 8, 16), m); r.position.set(0, 0.016, 0.12); r.rotation.x = Math.PI / 2; g.add(r); b(0.022, 0.02, 0.22, m, 0, 0, -0.04, g); b(0.07, 0.02, 0.03, m, 0.03, 0, -0.14, g); b(0.05, 0.02, 0.03, m, 0.025, 0, -0.1, g); b(0.04, 0.02, 0.03, m, 0, 0, 0.0, g); g.scale.setScalar(1.15); break; }
    case 'keycard': { b(0.085, 0.004, 0.055, emis(0x2a6a8a, k), 0, 0, 0, g); b(0.085, 0.005, 0.012, MAT.black, 0, 0, -0.012, g); break; }
    case 'fuse': { const m = emis(0xcfc3a0, k * 0.6); cyl(0.014, 0.1, MAT.glass, 0, 0, 0, g).rotation.z = Math.PI / 2; cyl(0.016, 0.02, MAT.brass, 0.055, 0, 0, g); cyl(0.016, 0.02, MAT.brass, -0.055, 0, 0, g); g.children.forEach((c) => (c.position.y += 0.016)); void m; break; }
    case 'crowbar': { const m = emis(0x6a6a6a, k * 0.5); b(0.025, 0.025, 0.5, m, 0, 0, 0, g); const h2 = b(0.025, 0.025, 0.12, m, 0, 0, -0.27, g); h2.rotation.y = 0.8; break; }
    case 'codeNote': { const p = b(0.14, 0.004, 0.18, emis(0xe6d9b0, k * 0.8), 0, 0, 0, g); p.rotation.y = 0.4; break; }
    case 'battery': { cyl(0.016, 0.05, emis(0x1a6b3a, k * 0.5), 0, 0, 0, g); cyl(0.008, 0.008, MAT.brass, 0, 0.05, 0, g); g.rotation.z = Math.PI / 2; g.position.y = 0.02; break; }
    default: b(0.08, 0.08, 0.08, MAT.brass, 0, 0, 0, g);
  }
  g.traverse((o) => { if (o.isMesh) { o.castShadow = false; } });
  return g;
}
let haloTex = null;
export function buildHalo(glow) {
  haloTex ||= radialTexture('255,225,150');
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, opacity: 0.5 * glow, depthWrite: false, blending: THREE.AdditiveBlending }));
  s.scale.setScalar(0.5); return s;
}

// ---------- decoración de pared ----------
export function buildDeco(d, i) {
  const g = new THREE.Group();
  if (d.type === 'painting') {
    const w = 0.7 + (i % 3) * 0.12, h = 0.9;
    b(w + 0.1, h + 0.1, 0.05, MAT.woodD, 0, 0, 0, g);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: paintingTexture(i), roughness: 0.9 }));
    m.position.set(0, h / 2 + 0.05, 0.027); g.add(m); g.position.set(d.x, d.y - 0.5, d.z);
  } else if (d.type === 'mirror') {
    b(0.8, 1.1, 0.04, MAT.brass, 0, 0, 0, g);
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.7, 1.0), new THREE.MeshStandardMaterial({ color: 0x20282a, roughness: 0.05, metalness: 0.9 })); m.position.set(0, 0.55, 0.022); g.add(m); g.position.set(d.x, d.y - 0.5, d.z);
  } else if (d.type === 'sign') {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.5, 0.125), new THREE.MeshBasicMaterial({ map: signTexture(['SALIDA ←', 'HABITACIONES', 'NO CORRER', 'SILENCIO'][i % 4], i % 4 === 0 ? '#7be08a' : '#c9b57a') }));
    m.position.set(0, 0, 0.01); g.add(m); g.position.set(d.x, 2.35, d.z);
  } else if (d.type === 'panel') {
    b(d.kind === 'keypad' ? 0.3 : 0.45, d.kind === 'keypad' ? 0.4 : 0.6, 0.08, MAT.metal, 0, 0, 0, g);
    if (d.kind === 'keypad') { b(0.2, 0.07, 0.02, std(0x0b3a22, 0.3, 0, { emissive: 0x16c060, emissiveIntensity: 0.9 }), 0, 0.28, 0.05, g); for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) b(0.055, 0.04, 0.02, MAT.black, (c - 1) * 0.075, 0.03 + r * 0.055, 0.045, g); g.position.set(d.x, d.y - 0.2, d.z); }
    else { b(0.38, 0.5, 0.02, MAT.black, 0, 0.05, 0.045, g); for (let k = 0; k < 3; k++) b(0.05, 0.14, 0.03, MAT.brass, -0.1 + k * 0.1, 0.35, 0.06, g); const led = b(0.05, 0.05, 0.03, std(0x330000, 0.3, 0, { emissive: 0xff2200, emissiveIntensity: 1.2 }), 0.15, 0.1, 0.06, g); led.name = 'led'; g.position.set(d.x, d.y - 0.3, d.z); }
  }
  g.rotation.y = d.rot; g.updateMatrixWorld(true);
  return g;
}
export function buildNote(t) {
  const g = new THREE.Group(); const p = b(0.2, 0.005, 0.26, MAT.paper, 0, 0, 0, g); p.castShadow = false;
  for (let i = 0; i < 4; i++) b(0.14, 0.001, 0.008, MAT.black, 0, 0.006, -0.08 + i * 0.045, g);
  g.position.set(t.x, t.y, t.z); g.rotation.y = t.rot; return g;
}
export function buildLever(t) {
  const g = new THREE.Group(); b(0.3, 0.3, 0.05, MAT.black, 0, 0, 0, g); const arm = cyl(0.015, 0.3, MAT.metal, 0, 0.15, 0.05, g); arm.name = 'arm'; arm.rotation.z = 0.7; cyl(0.03, 0.04, MAT.rust, 0, 0.3, 0.05, g).name = 'knob';
  g.position.set(t.x, t.y - 0.1, t.z); g.rotation.y = t.rot; return g;
}

// ---------- el enemigo: "El Botones" ----------
let eyeTex = null;
export function buildEnemy() {
  const root = new THREE.Group();
  const suit = std(0x0c0808, 0.95), skin = std(0x9a978c, 0.8, 0, { emissive: 0x0e0d0b, emissiveIntensity: 0.6 }), dark = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const gold = std(0x7a5a1a, 0.4, 0.8), red = std(0x4a0c0c, 0.8), toothM = new THREE.MeshBasicMaterial({ color: 0xd9d3bd });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  const body = new THREE.Group(); root.add(body);
  const hips = new THREE.Group(); hips.position.y = 1.3; body.add(hips);
  const torso = new THREE.Group(); torso.position.y = 0.05; hips.add(torso);
  const chest = b(0.3, 0.95, 0.17, suit, 0, 0, 0, torso); chest.position.y = 0.45;
  for (let i = 0; i < 3; i++) { const tail = b(0.07 + i * 0.01, 0.55 + i * 0.12, 0.02, suit, -0.12 + i * 0.12, -0.5, -0.09, torso); tail.rotation.z = (i - 1) * 0.12; }
  const neck = new THREE.Group(); neck.position.y = 0.98; torso.add(neck);
  b(0.06, 0.3, 0.06, skin, 0, 0, 0, neck);
  const head = new THREE.Group(); head.position.y = 0.3; neck.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.12, 16, 12), skin); skull.scale.set(0.8, 1.55, 0.95); skull.position.y = 0.2; skull.castShadow = true; head.add(skull);
  // cuencas vacías y ojos blancos que brillan en la oscuridad (sin niebla: se ven desde lejos)
  eyeTex ||= radialTexture('255,255,255');
  for (const sx of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), dark); socket.scale.set(1.05, 1.7, 0.7); socket.position.set(sx * 0.055, 0.27, 0.085); socket.rotation.z = -sx * 0.35; head.add(socket);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.018, 8, 6), glow); eye.scale.set(1.2, 1.1, 0.6); eye.position.set(sx * 0.055, 0.265, 0.125); head.add(eye);
    const hl = new THREE.Sprite(new THREE.SpriteMaterial({ map: eyeTex, color: 0xffffff, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); hl.scale.set(0.34, 0.34, 1); hl.position.set(sx * 0.055, 0.265, 0.14); head.add(hl);
  }
  // boca: cavidad negra + mandíbula articulada con dientes largos
  const cavity = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), dark); cavity.scale.set(1.4, 1.5, 0.6); cavity.position.set(0, 0.06, 0.07); head.add(cavity);
  for (let i = -4; i <= 4; i++) { const tt = new THREE.Mesh(new THREE.ConeGeometry(0.0075, 0.05 + (i % 2 ? 0.015 : 0), 4), toothM); tt.position.set(i * 0.0165, 0.115 - Math.abs(i) * 0.004, 0.105); tt.rotation.x = Math.PI; head.add(tt); }
  const jaw = new THREE.Group(); jaw.position.set(0, 0.09, 0.0); head.add(jaw);
  const jb = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 8), skin); jb.scale.set(1.05, 0.5, 1.2); jb.position.set(0, -0.03, 0.06); jaw.add(jb);
  for (let i = -4; i <= 4; i++) { const tt = new THREE.Mesh(new THREE.ConeGeometry(0.0075, 0.055, 4), toothM); tt.position.set(i * 0.0165, 0.0 + Math.abs(i) * 0.004, 0.105); jaw.add(tt); }
  head.userData.jaw = jaw;
  const hat = new THREE.Mesh(new THREE.CylinderGeometry(0.075, 0.09, 0.1, 14), red); hat.position.set(0.03, 0.43, -0.01); hat.rotation.z = -0.25; head.add(hat);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.0905, 0.0905, 0.012, 14), gold); band.position.set(0.03, 0.4, -0.01); band.rotation.z = -0.25; head.add(band);
  // brazos larguísimos con dedos de aguja
  const mkArm = (sx) => {
    const sh = new THREE.Group(); sh.position.set(sx * 0.2, 0.9, 0); torso.add(sh);
    b(0.06, 0.75, 0.06, suit, 0, -0.75, 0, sh);
    const el = new THREE.Group(); el.position.y = -0.75; sh.add(el);
    b(0.05, 0.8, 0.05, suit, 0, -0.8, 0, el);
    const hand = new THREE.Group(); hand.position.y = -0.8; el.add(hand);
    b(0.07, 0.12, 0.03, skin, 0, -0.12, 0, hand);
    for (let i = 0; i < 4; i++) { const f = b(0.012, 0.3, 0.012, skin, (i - 1.5) * 0.02, -0.4, 0, hand); f.rotation.x = 0.1 + i * 0.03; }
    return { sh, el, hand };
  };
  const mkLeg = (sx) => {
    const th = new THREE.Group(); th.position.set(sx * 0.09, 0, 0); hips.add(th);
    b(0.09, 0.65, 0.09, suit, 0, -0.65, 0, th);
    const kn = new THREE.Group(); kn.position.y = -0.65; th.add(kn);
    b(0.075, 0.65, 0.075, suit, 0, -0.65, 0, kn); b(0.09, 0.05, 0.22, dark, 0, -0.64, 0.06, kn);
    return { th, kn };
  };
  const aL = mkArm(-1), aR = mkArm(1), lL = mkLeg(-1), lR = mkLeg(1);
  root.userData = { body, hips, torso, neck, head, aL, aR, lL, lR, phase: 0, twitch: 0, tw: 0, acc: 0, chaseK: 0 };
  root.scale.set(1.1, 1.25, 1.1);
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return root;
}
// animación procedural y antinatural: erguido y errático al patrullar; a la carrera va casi a cuatro patas, con los brazos extendidos hacia ti y la mandíbula desencajada
export function animateEnemy(e, dt, speed, state, time) {
  const u = e.userData, mv = Math.min(1, speed / 3), chase = state === 3;
  u.chaseK += ((chase ? 1 : 0) - u.chaseK) * Math.min(1, dt * 6);
  u.acc += dt;
  const stutter = chase ? 1 / 30 : 1 / 14;
  if (u.acc < stutter) return; const step = u.acc; u.acc = 0;
  u.phase += step * (2.2 + speed * (chase ? 2.6 : 1.7));
  const s = Math.sin(u.phase), c = Math.cos(u.phase), ck = u.chaseK;
  u.lL.th.rotation.x = s * (0.7 + ck * 0.4) * mv; u.lR.th.rotation.x = -s * (0.7 + ck * 0.4) * mv;
  u.lL.kn.rotation.x = Math.max(0, -s) * 1.1 * mv; u.lR.kn.rotation.x = Math.max(0, s) * 1.1 * mv;
  // brazos: al correr se extienden al frente, arañando
  u.aL.sh.rotation.x = (-s * 0.25 * mv + 0.15) * (1 - ck) + (-1.95 + s * 0.3) * ck; u.aR.sh.rotation.x = (s * 0.25 * mv + 0.15) * (1 - ck) + (-1.95 - s * 0.3) * ck;
  u.aL.sh.rotation.z = 0.1 + ck * 0.25; u.aR.sh.rotation.z = -0.1 - ck * 0.25;
  u.aL.el.rotation.x = -0.2 - ck * 0.3 + Math.sin(time * 9) * 0.1 * ck; u.aR.el.rotation.x = -0.2 - ck * 0.3 + Math.cos(time * 9) * 0.1 * ck;
  u.hips.position.y = 1.3 - ck * 0.35 + Math.abs(c) * 0.06 * mv; u.hips.rotation.z = s * 0.06 * mv;
  u.torso.rotation.x = 0.15 + ck * 0.85 * Math.max(mv, 0.6); u.torso.rotation.y = s * 0.14 * mv;
  // cabeza: ladeada con tirones; en persecución mira fijamente hacia delante
  u.tw -= step; if (u.tw <= 0) { u.tw = 0.3 + Math.random() * 1.8; u.twitch = (Math.random() - 0.5) * 1.6; }
  u.head.rotation.z = (0.4 + Math.sin(time * 0.7) * 0.08) * (1 - ck * 0.6); u.head.rotation.y += ((u.twitch * (1 - ck)) - u.head.rotation.y) * Math.min(1, step * 14);
  u.head.rotation.x = 0.1 + (state === 4 ? Math.sin(time * 1.4) * 0.25 : 0) - ck * 0.9;
  // mandíbula: entreabierta siempre, desencajada al perseguir
  u.head.userData.jaw.rotation.x = 0.18 + Math.sin(time * 2.3) * 0.05 + ck * (0.75 + Math.sin(time * 38) * 0.18);
  // fallos visuales ("glitch") al perseguir
  if (chase) { u.body.position.set((Math.random() - 0.5) * 0.09, 0, (Math.random() - 0.5) * 0.09); u.body.scale.set(1 + (Math.random() - 0.5) * 0.08, 1 + (Math.random() < 0.12 ? 0.15 : 0), 1); }
  else { u.body.position.set(0, 0, 0); u.body.scale.set(1, 1, 1); }
}

// ---------- avatar de otro jugador (estilo Roblox: piezas cuadradas de plástico, cara sonriente) ----------
let faceTex = null;
function robloxFace() {
  if (faceTex) return faceTex;
  const c = document.createElement('canvas'); c.width = c.height = 128; const g = c.getContext('2d');
  g.fillStyle = '#f5cd30'; g.fillRect(0, 0, 128, 128);
  g.fillStyle = '#1a1a1a'; g.beginPath(); g.ellipse(44, 52, 7, 13, 0, 0, 6.28); g.fill(); g.beginPath(); g.ellipse(84, 52, 7, 13, 0, 0, 6.28); g.fill();
  g.strokeStyle = '#1a1a1a'; g.lineWidth = 6; g.lineCap = 'round'; g.beginPath(); g.arc(64, 70, 30, 0.25 * Math.PI, 0.75 * Math.PI); g.stroke();
  faceTex = new THREE.CanvasTexture(c); faceTex.colorSpace = THREE.SRGBColorSpace; return faceTex;
}
export function buildAvatar(name, color) {
  const g = new THREE.Group();
  const plastic = (c) => std(c, 0.45, 0, { emissive: c, emissiveIntensity: 0.08 });
  const shirt = plastic(color), skinM = plastic(0xf5cd30), pants = plastic(0x2b5fb8);
  const body = new THREE.Group(); g.add(body);
  // proporciones R6: torso 2x2x1, brazos 1x2x1, piernas 1x2x1, cabeza 1.2 (1 stud = 0.29 m)
  const st = 0.29;
  b(2 * st, 2 * st, 1 * st, shirt, 0, 2 * st, 0, body);
  const head = new THREE.Mesh(new THREE.CylinderGeometry(0.6 * st, 0.6 * st, 1.2 * st, 20), skinM); head.position.y = 4 * st + 0.6 * st; head.castShadow = true; g.add(head);
  const face = new THREE.Mesh(new THREE.PlaneGeometry(1.0 * st, 1.0 * st), new THREE.MeshStandardMaterial({ map: robloxFace(), roughness: 0.5, transparent: true })); face.position.set(0, 4 * st + 0.62 * st, 0.6 * st + 0.002); g.add(face);
  const legs = [], arms = [];
  for (const sx of [-1, 1]) {
    const l = new THREE.Group(); l.position.set(sx * 0.5 * st, 2 * st, 0); b(1 * st - 0.01, 2 * st, 1 * st, pants, 0, -2 * st, 0, l); g.add(l); legs.push(l);
    const a = new THREE.Group(); a.position.set(sx * 1.5 * st, 4 * st, 0); b(1 * st - 0.01, 2 * st, 1 * st, skinM, 0, -2 * st, 0, a); b(1 * st - 0.01, 0.7 * st, 1 * st, shirt, 0, -0.7 * st, 0, a); g.add(a); arms.push(a);
  }
  g.scale.setScalar(1.12);
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.14, 8), MAT.metal); lamp.rotation.x = Math.PI / 2; lamp.position.set(0.5, 1.0, -0.2); g.add(lamp);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.7, 6, 16, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0.025, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  cone.rotation.x = Math.PI / 2; cone.position.set(0.5, 1.0, -3.2); cone.name = 'beam'; g.add(cone);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(name), transparent: true, depthWrite: false, depthTest: false })); spr.scale.set(1.1, 0.28, 1); spr.position.y = 2.0; spr.renderOrder = 10; g.add(spr);
  g.userData = { legs, arms, head, body, spr, cone, phase: 0 };
  return g;
}
// maniquí pálido sin cara (anomalía): en pie en una esquina, con una mano levantada
export function buildMannequin() {
  const g = new THREE.Group(), m = std(0xcfc8b8, 0.45, 0, { emissive: 0x201d18, emissiveIntensity: 0.5 });
  const legs = []; for (const sx of [-1, 1]) b(0.12, 0.85, 0.14, m, sx * 0.1, 0, 0, g);
  b(0.4, 0.6, 0.2, m, 0, 0.85, 0, g);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 14, 12), m); head.scale.set(0.85, 1.25, 0.95); head.position.y = 1.62; head.castShadow = true; g.add(head);
  b(0.07, 0.18, 0.07, m, 0, 1.45, 0, g);
  const a1 = new THREE.Group(); a1.position.set(-0.27, 1.38, 0); b(0.08, 0.65, 0.08, m, 0, -0.65, 0, a1); a1.rotation.z = 0.08; g.add(a1);
  const a2 = new THREE.Group(); a2.position.set(0.27, 1.38, 0); b(0.08, 0.65, 0.08, m, 0, -0.65, 0, a2); a2.rotation.x = Math.PI * 0.85; a2.rotation.z = -0.2; g.add(a2);
  g.userData = { head }; g.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return g;
}
export function buildSilhouette() {
  const g = new THREE.Group(); const m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.94 });
  const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.22), m); t.position.y = 1.3; g.add(t);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), m); h.position.y = 1.9; h.scale.set(0.85, 1.35, 0.95); g.add(h);
  for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.95, 0.15), m); l.position.set(sx * 0.1, 0.48, 0); g.add(l); const a = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), m); a.position.set(sx * 0.28, 1.15, 0); g.add(a); }
  g.scale.setScalar(1.12); return g;
}

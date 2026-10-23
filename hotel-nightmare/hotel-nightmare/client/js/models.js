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
function b(w, h, d, mat, x = 0, y = 0, z = 0, parent) { const m = new THREE.Mesh(G.box, mat); m.scale.set(w, h, d); m.position.set(x, y + h / 2, z); m.castShadow = true; m.receiveShadow = true; if (parent) parent.add(m); return m; }
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
export function buildEnemy() {
  const root = new THREE.Group();
  const suit = std(0x1a0d0d, 0.9), skin = std(0xb9b2a2, 0.7, 0, { emissive: 0x15130f, emissiveIntensity: 0.5 }), gold = std(0x8a6a22, 0.4, 0.8), black = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const body = new THREE.Group(); root.add(body);
  const hips = new THREE.Group(); hips.position.y = 1.15; body.add(hips);
  const torso = new THREE.Group(); torso.position.y = 0.05; hips.add(torso);
  const chest = b(0.34, 0.7, 0.2, suit, 0, 0, 0, torso); chest.position.y = 0.4;
  for (let i = 0; i < 4; i++) { const bt = cyl(0.018, 0.012, gold, 0, 0.18 + i * 0.14, 0.105, torso); bt.rotation.x = Math.PI / 2; }
  b(0.36, 0.05, 0.22, gold, 0, 0.72, 0, torso);
  const neck = new THREE.Group(); neck.position.y = 0.78; torso.add(neck);
  b(0.07, 0.22, 0.07, skin, 0, 0, 0, neck);
  const head = new THREE.Group(); head.position.y = 0.22; neck.add(head);
  const skull = new THREE.Mesh(new THREE.SphereGeometry(0.115, 14, 12), skin); skull.scale.set(0.85, 1.35, 0.95); skull.position.y = 0.15; skull.castShadow = true; head.add(skull);
  // cara de pesadilla: cuencas negras con ojos blancos brillantes y una sonrisa enorme llena de dientes
  const glow = new THREE.MeshBasicMaterial({ color: 0xffffff });
  for (const sx of [-1, 1]) {
    const socket = new THREE.Mesh(new THREE.SphereGeometry(0.045, 10, 8), black); socket.scale.set(1.05, 1.5, 0.6); socket.position.set(sx * 0.052, 0.2, 0.095); socket.rotation.z = -sx * 0.25; head.add(socket);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.02, 8, 6), glow); eye.scale.set(1, 1.3, 0.5); eye.position.set(sx * 0.052, 0.205, 0.128); head.add(eye);
  }
  const mouth = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), black); mouth.scale.set(2.6, 2.4, 0.5); mouth.position.set(0, 0.075, 0.1); head.add(mouth); head.userData.mouth = mouth;
  const tooth = new THREE.MeshBasicMaterial({ color: 0xe8e2cf });
  for (let i = -4; i <= 4; i++) { const tt = new THREE.Mesh(new THREE.ConeGeometry(0.0065, 0.03, 4), tooth); tt.position.set(i * 0.0185, 0.108 - Math.abs(i) * 0.004, 0.123); tt.rotation.x = Math.PI; head.add(tt); const tb = tt.clone(); tb.position.y = 0.045 + Math.abs(i) * 0.004; tb.rotation.x = 0; head.add(tb); }
  const hat = cyl(0.11, 0.12, std(0x5b1612, 0.8), 0, 0.3, 0, head); hat.scale.set(0.11, 0.12, 0.11); b(0.2, 0.012, 0.02, gold, 0, 0.35, 0.1, head);
  const mkArm = (sx) => {
    const sh = new THREE.Group(); sh.position.set(sx * 0.22, 0.7, 0); torso.add(sh);
    const up = b(0.07, 0.5, 0.07, suit, 0, -0.5, 0, sh);
    const el = new THREE.Group(); el.position.y = -0.5; sh.add(el);
    b(0.06, 0.55, 0.06, suit, 0, -0.55, 0, el); b(0.07, 0.2, 0.05, skin, 0, -0.74, 0, el);
    void up; return { sh, el };
  };
  const mkLeg = (sx) => {
    const th = new THREE.Group(); th.position.set(sx * 0.1, 0, 0); hips.add(th);
    b(0.1, 0.55, 0.1, suit, 0, -0.55, 0, th);
    const kn = new THREE.Group(); kn.position.y = -0.55; th.add(kn);
    b(0.08, 0.55, 0.08, suit, 0, -0.55, 0, kn); b(0.1, 0.06, 0.2, black, 0, -0.58, 0.05, kn);
    return { th, kn };
  };
  const aL = mkArm(-1), aR = mkArm(1), lL = mkLeg(-1), lR = mkLeg(1);
  root.userData = { body, hips, torso, neck, head, aL, aR, lL, lR, phase: 0, twitch: 0, tw: 0, acc: 0 };
  root.scale.set(1.08, 1.3, 1.08); // más alto y flaco
  root.traverse((o) => { if (o.isMesh) o.frustumCulled = false; });
  return root;
}
// animación procedural y antinatural (zancadas largas, cabeza ladeada, tirones)
export function animateEnemy(e, dt, speed, state, time) {
  const u = e.userData, mv = Math.min(1, speed / 3);
  u.acc += dt;
  const stutter = state === 3 ? 1 / 24 : 1 / 14; // ritmo entrecortado
  if (u.acc < stutter) return; const step = u.acc; u.acc = 0;
  u.phase += step * (2.2 + speed * 1.7);
  const s = Math.sin(u.phase), c = Math.cos(u.phase);
  u.lL.th.rotation.x = s * 0.7 * mv; u.lR.th.rotation.x = -s * 0.7 * mv;
  u.lL.kn.rotation.x = Math.max(0, -s) * 0.9 * mv; u.lR.kn.rotation.x = Math.max(0, s) * 0.9 * mv;
  const drag = state === 3 ? 0.9 : 0.2;
  u.aL.sh.rotation.x = -s * 0.25 * mv + drag * 0.2; u.aR.sh.rotation.x = s * 0.25 * mv + drag * 0.2;
  u.aL.sh.rotation.z = 0.1 + (state === 3 ? 0.5 : 0); u.aR.sh.rotation.z = -0.1 - (state === 3 ? 0.5 : 0);
  u.aL.el.rotation.x = -0.2 - (state === 3 ? 0.9 : 0); u.aR.el.rotation.x = -0.2 - (state === 3 ? 0.9 : 0);
  u.hips.position.y = 1.15 + Math.abs(c) * 0.05 * mv; u.hips.rotation.z = s * 0.05 * mv;
  u.torso.rotation.x = 0.12 + (state === 3 ? 0.35 : 0) * mv; u.torso.rotation.y = s * 0.12 * mv;
  // cabeza: ladeada y con tirones
  u.tw -= step; if (u.tw <= 0) { u.tw = 0.4 + Math.random() * 2.2; u.twitch = (Math.random() - 0.5) * 1.4; }
  u.head.rotation.z = 0.35 + (Math.sin(time * 0.7) * 0.08); u.head.rotation.y += (u.twitch - u.head.rotation.y) * Math.min(1, step * 14);
  u.head.rotation.x = 0.1 + (state === 4 ? Math.sin(time * 1.4) * 0.2 : 0);
  u.head.userData.mouth.scale.y = 2.4 + (state === 3 ? 2.4 + Math.sin(time * 40) * 0.6 : 0);
}

// ---------- avatar de otro jugador ----------
export function buildAvatar(name, color) {
  const g = new THREE.Group();
  const cloth = std(color, 0.9), skin = std(0xd0a98a, 0.8);
  const body = new THREE.Group(); g.add(body);
  b(0.4, 0.62, 0.22, cloth, 0, 0.78, 0, body);
  const head = new THREE.Mesh(new THREE.SphereGeometry(0.12, 12, 10), skin); head.position.y = 1.55; head.castShadow = true; g.add(head);
  const legs = [];
  for (const sx of [-1, 1]) { const l = new THREE.Group(); l.position.set(sx * 0.1, 0.8, 0); b(0.14, 0.8, 0.16, std(0x2a2a30, 0.9), 0, -0.8, 0, l); g.add(l); legs.push(l); }
  const arms = [];
  for (const sx of [-1, 1]) { const a = new THREE.Group(); a.position.set(sx * 0.27, 1.38, 0); b(0.09, 0.62, 0.1, cloth, 0, -0.6, 0, a); g.add(a); arms.push(a); }
  const lamp = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.035, 0.14, 8), MAT.metal); lamp.rotation.x = Math.PI / 2; lamp.position.set(0.27, 1.05, -0.2); g.add(lamp);
  const cone = new THREE.Mesh(new THREE.ConeGeometry(1.7, 6, 20, 1, true), new THREE.MeshBasicMaterial({ color: 0xffe6b0, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  cone.rotation.x = Math.PI / 2; cone.position.set(0.27, 1.05, -3.2); cone.name = 'beam'; g.add(cone);
  const spr = new THREE.Sprite(new THREE.SpriteMaterial({ map: nameTexture(name), transparent: true, depthWrite: false, depthTest: false })); spr.scale.set(1.1, 0.28, 1); spr.position.y = 1.95; spr.renderOrder = 10; g.add(spr);
  g.userData = { legs, arms, head, body, spr, cone, phase: 0 };
  return g;
}
export function buildSilhouette() {
  const g = new THREE.Group(); const m = new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.94 });
  const t = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.8, 0.22), m); t.position.y = 1.3; g.add(t);
  const h = new THREE.Mesh(new THREE.SphereGeometry(0.13, 10, 8), m); h.position.y = 1.9; h.scale.set(0.85, 1.35, 0.95); g.add(h);
  for (const sx of [-1, 1]) { const l = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.95, 0.15), m); l.position.set(sx * 0.1, 0.48, 0); g.add(l); const a = new THREE.Mesh(new THREE.BoxGeometry(0.1, 1.0, 0.1), m); a.position.set(sx * 0.28, 1.15, 0); g.add(a); }
  g.scale.setScalar(1.12); return g;
}

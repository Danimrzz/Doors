// Texturas procedurales (canvas) con aspecto envejecido: papel pintado, madera, moqueta, baldosa, mármol...
import * as THREE from 'three';

function mk(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; }
function lcg(seed) { let s = (seed * 9301 + 49297) % 233280; return () => { s = (s * 9301 + 49297) % 233280; return s / 233280; }; }
function grain(ctx, w, h, amt, r) {
  const id = ctx.getImageData(0, 0, w, h), d = id.data;
  for (let i = 0; i < d.length; i += 4) { const n = (r() - 0.5) * amt; d[i] += n; d[i + 1] += n; d[i + 2] += n; }
  ctx.putImageData(id, 0, 0);
}
function stains(ctx, w, h, r, n, col, maxR = 60) {
  for (let i = 0; i < n; i++) {
    const x = r() * w, y = r() * h, rad = 10 + r() * maxR;
    const g = ctx.createRadialGradient(x, y, 0, x, y, rad);
    g.addColorStop(0, col); g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
}
function toTex(c, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.anisotropy = 4;
  return t;
}
function dirtGradient(ctx, w, h) {
  const g = ctx.createLinearGradient(0, 0, 0, h);
  g.addColorStop(0, 'rgba(0,0,0,.45)'); g.addColorStop(0.15, 'rgba(0,0,0,0)'); g.addColorStop(0.8, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,.55)');
  ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
}

// Pared: 256 x 400 (2 m x 3.1 m)
const WALLS = {
  corridor: { a: '#27342a', b: '#2f3f33', trim: '#3b2a1c', pat: 'stripes', gold: true },
  bed0: { a: '#4a2326', b: '#552a2d', trim: '#2e1d14', pat: 'damask' },
  bed1: { a: '#2c3b4a', b: '#34465a', trim: '#2a2118', pat: 'stripes' },
  bed2: { a: '#5a4a2c', b: '#665533', trim: '#33251a', pat: 'damask' },
  luxury: { a: '#3a0f14', b: '#4a1a1f', trim: '#1c120c', pat: 'damask', gold: true },
  storage: { a: '#4b4d49', b: '#555750', trim: '#2c2c2a', pat: 'plain' },
  maintenance: { a: '#2f4338', b: '#38503f', trim: '#1e2a22', pat: 'plain', pipe: true },
  laundry: { a: '#b9bfb8', b: '#c4cac2', trim: '#6c746c', pat: 'tile' },
  office: { a: '#6a6350', b: '#736b57', trim: '#3a2c1e', pat: 'plain' },
  abandoned: { a: '#2d2a24', b: '#35312a', trim: '#1c1814', pat: 'peel' },
  empty: { a: '#3b3a36', b: '#44423d', trim: '#26241f', pat: 'plain' },
  lobby: { a: '#4b3b2b', b: '#56452f', trim: '#1e140d', pat: 'panel', gold: true },
  outside: { a: '#0b0f14', b: '#10161d', trim: '#05070a', pat: 'plain' },
};
export function wallTexture(kind, seed = 1) {
  const W = WALLS[kind] || WALLS.empty, r = lcg(seed + kind.length * 17);
  const [c, ctx] = mk(256, 400);
  ctx.fillStyle = W.a; ctx.fillRect(0, 0, 256, 400);
  const wain = 130; // altura del zócalo (px desde abajo)
  if (W.pat === 'stripes') {
    for (let x = 0; x < 256; x += 32) { ctx.fillStyle = W.b; ctx.fillRect(x, 0, 16, 400); if (W.gold) { ctx.fillStyle = 'rgba(190,160,80,.35)'; ctx.fillRect(x + 15, 0, 2, 400); } }
  } else if (W.pat === 'damask') {
    for (let y = 0; y < 400; y += 40) for (let x = 0; x < 256; x += 40) {
      ctx.fillStyle = W.b; ctx.beginPath(); ctx.ellipse(x + 20 + ((y / 40) % 2) * 20, y + 20, 9, 14, 0, 0, 6.28); ctx.fill();
      if (W.gold) { ctx.fillStyle = 'rgba(190,160,80,.25)'; ctx.beginPath(); ctx.arc(x + 20 + ((y / 40) % 2) * 20, y + 20, 3, 0, 6.28); ctx.fill(); }
    }
  } else if (W.pat === 'tile') {
    ctx.fillStyle = W.b; ctx.fillRect(0, 400 - 260, 256, 260);
    ctx.strokeStyle = 'rgba(60,70,60,.55)'; ctx.lineWidth = 2;
    for (let x = 0; x <= 256; x += 32) { ctx.beginPath(); ctx.moveTo(x, 140); ctx.lineTo(x, 400); ctx.stroke(); }
    for (let y = 140; y <= 400; y += 32) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(256, y); ctx.stroke(); }
  } else if (W.pat === 'panel') {
    ctx.fillStyle = W.b; ctx.fillRect(0, 0, 256, 400);
    ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 3;
    for (let x = 10; x < 256; x += 120) ctx.strokeRect(x, 20, 100, 360);
  } else if (W.pat === 'peel') {
    for (let i = 0; i < 14; i++) { ctx.fillStyle = r() < 0.5 ? '#3d382f' : '#211e19'; const x = r() * 256, y = r() * 400; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + 30 + r() * 40, y + 10); ctx.lineTo(x + 10, y + 50 + r() * 60); ctx.fill(); }
  }
  // zócalo de madera y moldura
  ctx.fillStyle = W.trim; ctx.fillRect(0, 400 - 90, 256, 90);
  ctx.fillStyle = 'rgba(255,255,255,.08)'; ctx.fillRect(0, 400 - 92, 256, 3);
  ctx.strokeStyle = 'rgba(0,0,0,.4)'; ctx.lineWidth = 2;
  for (let x = 0; x < 256; x += 64) ctx.strokeRect(x + 6, 400 - 80, 52, 62);
  ctx.fillStyle = W.trim; ctx.fillRect(0, 0, 256, 16);
  if (W.pipe) { ctx.fillStyle = '#5b5f58'; ctx.fillRect(0, 60, 256, 14); ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(0, 62, 256, 3); ctx.fillStyle = '#7a3a22'; ctx.fillRect(0, 110, 256, 8); }
  stains(ctx, 256, 400, r, 7, 'rgba(10,8,5,.5)', 55);
  stains(ctx, 256, 400, r, 3, 'rgba(70,90,50,.25)', 40);
  // chorretones de humedad
  for (let i = 0; i < 5; i++) { const x = r() * 256; const g = ctx.createLinearGradient(0, 0, 0, 260); g.addColorStop(0, 'rgba(0,0,0,.35)'); g.addColorStop(1, 'rgba(0,0,0,0)'); ctx.fillStyle = g; ctx.fillRect(x, 16, 3 + r() * 6, 100 + r() * 160); }
  dirtGradient(ctx, 256, 400);
  grain(ctx, 256, 400, 26, r);
  return toTex(c);
}

const FLOORS = {
  carpet: (ctx, r) => { ctx.fillStyle = '#4a1d1f'; ctx.fillRect(0, 0, 256, 256); ctx.strokeStyle = '#7a5a2a'; ctx.lineWidth = 5; ctx.strokeRect(14, 14, 228, 228); ctx.lineWidth = 2; ctx.strokeRect(28, 28, 200, 200); ctx.fillStyle = '#5c2a2a'; for (let y = 64; y < 200; y += 40) for (let x = 64; x < 200; x += 40) { ctx.beginPath(); ctx.moveTo(x, y - 12); ctx.lineTo(x + 12, y); ctx.lineTo(x, y + 12); ctx.lineTo(x - 12, y); ctx.fill(); } },
  wood: (ctx, r) => { for (let i = 0; i < 8; i++) { const l = 28 + r() * 24; ctx.fillStyle = `rgb(${70 + l},${44 + l * 0.6},${26 + l * 0.35})`; ctx.fillRect(0, i * 32, 256, 31); ctx.fillStyle = 'rgba(0,0,0,.35)'; ctx.fillRect(0, i * 32 + 30, 256, 2); const j = r() * 256; ctx.fillRect(j, i * 32, 2, 31); } },
  concrete: (ctx, r) => { ctx.fillStyle = '#4a4b48'; ctx.fillRect(0, 0, 256, 256); ctx.strokeStyle = 'rgba(0,0,0,.35)'; ctx.strokeRect(0, 0, 256, 256); },
  tile: (ctx, r) => { for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) { ctx.fillStyle = (x + y) % 2 ? '#9aa39b' : '#6e776f'; ctx.fillRect(x * 32, y * 32, 32, 32); } ctx.strokeStyle = 'rgba(0,0,0,.4)'; for (let i = 0; i <= 256; i += 32) { ctx.beginPath(); ctx.moveTo(i, 0); ctx.lineTo(i, 256); ctx.moveTo(0, i); ctx.lineTo(256, i); ctx.stroke(); } },
  marble: (ctx, r) => { for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { ctx.fillStyle = (x + y) % 2 ? '#a79c85' : '#2d2a27'; ctx.fillRect(x * 128, y * 128, 128, 128); } ctx.strokeStyle = 'rgba(255,255,255,.14)'; ctx.lineWidth = 1; for (let i = 0; i < 24; i++) { ctx.beginPath(); ctx.moveTo(r() * 256, r() * 256); ctx.bezierCurveTo(r() * 256, r() * 256, r() * 256, r() * 256, r() * 256, r() * 256); ctx.stroke(); } },
  stone: (ctx, r) => { ctx.fillStyle = '#10151a'; ctx.fillRect(0, 0, 256, 256); },
  ceiling: (ctx, r) => { ctx.fillStyle = '#34322d'; ctx.fillRect(0, 0, 256, 256); ctx.strokeStyle = 'rgba(0,0,0,.5)'; ctx.lineWidth = 3; ctx.strokeRect(0, 0, 256, 256); ctx.strokeRect(0, 0, 128, 128); ctx.strokeRect(128, 128, 128, 128); },
};
export function floorTexture(kind, seed = 3) {
  const r = lcg(seed + kind.length), [c, ctx] = mk(256, 256);
  (FLOORS[kind] || FLOORS.concrete)(ctx, r);
  stains(ctx, 256, 256, r, 6, 'rgba(0,0,0,.45)', 50);
  grain(ctx, 256, 256, 22, r);
  return toTex(c);
}

export function doorTexture(seed = 1, metal = false) {
  const r = lcg(seed + 5), [c, ctx] = mk(128, 256);
  if (metal) { ctx.fillStyle = '#3a3f42'; ctx.fillRect(0, 0, 128, 256); ctx.fillStyle = '#2a2e30'; ctx.fillRect(8, 8, 112, 240); ctx.strokeStyle = '#555'; ctx.lineWidth = 3; ctx.strokeRect(10, 10, 108, 236); }
  else {
    const l = 20 + r() * 20; ctx.fillStyle = `rgb(${60 + l},${38 + l * 0.6},${24 + l * 0.35})`; ctx.fillRect(0, 0, 128, 256);
    ctx.strokeStyle = 'rgba(0,0,0,.45)'; ctx.lineWidth = 3; ctx.strokeRect(14, 14, 100, 90); ctx.strokeRect(14, 120, 100, 122);
    ctx.fillStyle = '#b09040'; ctx.beginPath(); ctx.arc(106, 130, 5, 0, 6.28); ctx.fill();
  }
  stains(ctx, 128, 256, r, 4, 'rgba(0,0,0,.4)', 30); grain(ctx, 128, 256, 24, r);
  return toTex(c);
}

export function plateTexture(text, bg = '#b79b4a', fg = '#1a1208') {
  const [c, ctx] = mk(128, 64);
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 128, 64); ctx.strokeStyle = 'rgba(0,0,0,.6)'; ctx.lineWidth = 3; ctx.strokeRect(2, 2, 124, 60);
  ctx.fillStyle = fg; ctx.font = 'bold 34px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 64, 34);
  return toTex(c);
}
export function signTexture(text, color) {
  const [c, ctx] = mk(256, 64);
  ctx.fillStyle = '#0a0a0a'; ctx.fillRect(0, 0, 256, 64); ctx.fillStyle = color; ctx.font = 'bold 36px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(text, 128, 34);
  return toTex(c);
}
export function paintingTexture(seed) {
  const r = lcg(seed + 11), [c, ctx] = mk(128, 160);
  const hue = Math.floor(r() * 360);
  const g = ctx.createLinearGradient(0, 0, 0, 160); g.addColorStop(0, `hsl(${hue},25%,22%)`); g.addColorStop(1, `hsl(${(hue + 40) % 360},30%,10%)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 128, 160);
  const kind = Math.floor(r() * 3);
  if (kind === 0) { ctx.fillStyle = 'rgba(0,0,0,.55)'; ctx.beginPath(); ctx.arc(64, 70, 26, 0, 6.28); ctx.fill(); ctx.fillRect(34, 96, 60, 64); ctx.fillStyle = 'rgba(220,200,160,.5)'; ctx.beginPath(); ctx.arc(64, 66, 17, 0, 6.28); ctx.fill(); }
  else if (kind === 1) { ctx.fillStyle = 'rgba(0,0,0,.5)'; ctx.beginPath(); ctx.moveTo(0, 130); for (let x = 0; x <= 128; x += 16) ctx.lineTo(x, 100 + r() * 40); ctx.lineTo(128, 160); ctx.lineTo(0, 160); ctx.fill(); ctx.fillStyle = 'rgba(230,220,170,.4)'; ctx.beginPath(); ctx.arc(90, 40, 12, 0, 6.28); ctx.fill(); }
  else { for (let i = 0; i < 6; i++) { ctx.fillStyle = `hsla(${(hue + i * 30) % 360},30%,${20 + r() * 25}%,.6)`; ctx.fillRect(r() * 90, r() * 120, 20 + r() * 50, 20 + r() * 40); } }
  grain(ctx, 128, 160, 30, r);
  return toTex(c);
}
export function radialTexture(color = '255,230,170') {
  const [c, ctx] = mk(64, 64); const g = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
  g.addColorStop(0, `rgba(${color},1)`); g.addColorStop(0.35, `rgba(${color},.35)`); g.addColorStop(1, `rgba(${color},0)`);
  ctx.fillStyle = g; ctx.fillRect(0, 0, 64, 64); return toTex(c, true);
}
export function nameTexture(name) {
  const [c, ctx] = mk(256, 64); ctx.font = 'bold 30px Georgia'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.lineWidth = 6; ctx.strokeStyle = 'rgba(0,0,0,.85)'; ctx.strokeText(name, 128, 32); ctx.fillStyle = '#f0e6c8'; ctx.fillText(name, 128, 32);
  return toTex(c);
}

export const WALL_KINDS = Object.keys(WALLS);

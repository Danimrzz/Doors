// Malla de navegación fina (0.5 m) con A*; sirve al enemigo y a la validación del mapa
import { CELL, NAV_RES } from './config.js';

export class Nav {
  constructor(world, radius, res = NAV_RES) {
    this.world = world; this.r = radius; this.res = res;
    this.nw = Math.round(world.W * CELL / res);
    this.nh = Math.round(world.H * CELL / res);
    const n = this.nw * this.nh;
    this.free = new Uint8Array(n);
    this.doorIdx = new Int16Array(n).fill(-1);
    // la malla se calcula con todas las puertas abiertas (las cerraduras se tratan con 'blocked')
    const saved = { ...world.doorOpen };
    for (const k in world.doorOpen) world.doorOpen[k] = true;
    for (let j = 0; j < this.nh; j++) for (let i = 0; i < this.nw; i++) {
      this.free[j * this.nw + i] = world.circleBlocked((i + 0.5) * res, (j + 0.5) * res, radius) ? 0 : 1;
    }
    Object.assign(world.doorOpen, saved);
    world.doors.forEach((d, k) => {
      const per = Math.round(CELL / res);
      for (let j = 0; j < per; j++) for (let i = 0; i < per; i++) this.doorIdx[(d.cy * per + j) * this.nw + d.cx * per + i] = k;
    });
    this.g = new Float32Array(n); this.from = new Int32Array(n); this.stamp = new Int32Array(n); this.cur = 0;
    this.closedMark = new Int32Array(n);
  }
  ci(x) { return Math.floor(x / this.res); }
  idx(i, j) { return j * this.nw + i; }
  inb(i, j) { return i >= 0 && j >= 0 && i < this.nw && j < this.nh; }
  isFree(x, z, blocked) {
    const i = this.ci(x), j = this.ci(z);
    if (!this.inb(i, j)) return false;
    const k = j * this.nw + i;
    if (!this.free[k]) return false;
    if (blocked && this.doorIdx[k] >= 0 && blocked(this.doorIdx[k])) return false;
    return true;
  }
  nearestFree(x, z, maxR = 8, blocked) {
    const i0 = this.ci(x), j0 = this.ci(z);
    for (let r = 0; r <= maxR / this.res; r++) {
      let best = null, bd = 1e9;
      for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
        if (Math.max(Math.abs(i - i0), Math.abs(j - j0)) !== r || !this.inb(i, j)) continue;
        const k = j * this.nw + i;
        if (!this.free[k] || (blocked && this.doorIdx[k] >= 0 && blocked(this.doorIdx[k]))) continue;
        const d = (i - i0) ** 2 + (j - j0) ** 2;
        if (d < bd) { bd = d; best = [i, j]; }
      }
      if (best) return { x: (best[0] + 0.5) * this.res, z: (best[1] + 0.5) * this.res };
    }
    return null;
  }
  lineFree(x0, z0, x1, z1, blocked) {
    const d = Math.hypot(x1 - x0, z1 - z0), n = Math.max(1, Math.ceil(d / (this.res * 0.4)));
    for (let s = 1; s <= n; s++) {
      const t = s / n;
      if (!this.isFree(x0 + (x1 - x0) * t, z0 + (z1 - z0) * t, blocked)) return false;
    }
    return true;
  }
  // A* 8 vecinos sin cortar esquinas. Devuelve [{x,z}] suavizado o null.
  findPath(sx, sz, tx, tz, blocked, maxNodes = 90000) {
    const s = this.nearestFree(sx, sz, 3, blocked), t = this.nearestFree(tx, tz, 4, blocked);
    if (!s || !t) return null;
    const nw = this.nw, res = this.res;
    const si = this.ci(s.x), sj = this.ci(s.z), ti = this.ci(t.x), tj = this.ci(t.z);
    const start = sj * nw + si, goal = tj * nw + ti;
    if (start === goal) return [{ x: t.x, z: t.z }];
    const cur = ++this.cur;
    const heap = []; // [f, idx]
    const push = (f, k) => { heap.push([f, k]); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { let l = 2 * c + 1, r = l + 1, m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    const h = (i, j) => { const dx = Math.abs(i - ti), dz = Math.abs(j - tj); return (dx + dz + (Math.SQRT2 - 2) * Math.min(dx, dz)) * res; };
    this.stamp[start] = cur; this.g[start] = 0; this.from[start] = -1;
    push(h(si, sj), start);
    const DX = [1, -1, 0, 0, 1, 1, -1, -1], DZ = [0, 0, 1, -1, 1, -1, 1, -1];
    let nodes = 0, found = false;
    const ok = (i, j) => {
      if (!this.inb(i, j)) return false;
      const k = j * nw + i;
      if (!this.free[k]) return false;
      if (blocked && this.doorIdx[k] >= 0 && blocked(this.doorIdx[k])) return false;
      return true;
    };
    while (heap.length && nodes++ < maxNodes) {
      const [, k] = pop();
      if (this.closedMark[k] === cur) continue;
      this.closedMark[k] = cur;
      if (k === goal) { found = true; break; }
      const i = k % nw, j = (k / nw) | 0;
      for (let d = 0; d < 8; d++) {
        const ni = i + DX[d], nj = j + DZ[d];
        if (!ok(ni, nj)) continue;
        if (d >= 4 && (!ok(i + DX[d], j) || !ok(i, j + DZ[d]))) continue;
        const nk = nj * nw + ni;
        const ng = this.g[k] + (d < 4 ? res : res * Math.SQRT2);
        if (this.stamp[nk] !== cur || ng < this.g[nk]) {
          this.stamp[nk] = cur; this.g[nk] = ng; this.from[nk] = k;
          push(ng + h(ni, nj), nk);
        }
      }
    }
    if (!found) return null;
    const raw = [];
    for (let k = goal; k !== -1; k = this.from[k]) raw.push({ x: ((k % nw) + 0.5) * res, z: (((k / nw) | 0) + 0.5) * res });
    raw.reverse();
    // suavizado por línea de visión
    const out = [];
    let a = 0;
    while (a < raw.length - 1) {
      let b = raw.length - 1;
      while (b > a + 1 && !this.lineFree(raw[a].x, raw[a].z, raw[b].x, raw[b].z, blocked)) b--;
      out.push(raw[b]); a = b;
    }
    return out;
  }
  // Inundación desde un punto; devuelve Uint8Array de celdas alcanzables
  flood(x, z, blocked) {
    const s = this.nearestFree(x, z, 3, blocked);
    const vis = new Uint8Array(this.nw * this.nh);
    if (!s) return vis;
    const stack = [this.ci(s.z) * this.nw + this.ci(s.x)];
    vis[stack[0]] = 1;
    const DX = [1, -1, 0, 0], DZ = [0, 0, 1, -1];
    while (stack.length) {
      const k = stack.pop(), i = k % this.nw, j = (k / this.nw) | 0;
      for (let d = 0; d < 4; d++) {
        const ni = i + DX[d], nj = j + DZ[d];
        if (!this.inb(ni, nj)) continue;
        const nk = nj * this.nw + ni;
        if (vis[nk] || !this.free[nk]) continue;
        if (blocked && this.doorIdx[nk] >= 0 && blocked(this.doorIdx[nk])) continue;
        vis[nk] = 1; stack.push(nk);
      }
    }
    return vis;
  }
  reached(vis, x, z, radius = 1.2) {
    const i0 = this.ci(x), j0 = this.ci(z), r = Math.ceil(radius / this.res);
    for (let j = j0 - r; j <= j0 + r; j++) for (let i = i0 - r; i <= i0 + r; i++) {
      if (this.inb(i, j) && vis[j * this.nw + i] && Math.hypot((i + 0.5) * this.res - x, (j + 0.5) * this.res - z) <= radius) return true;
    }
    return false;
  }
}

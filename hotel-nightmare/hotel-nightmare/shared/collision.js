// Mundo de colisiones: rejilla de celdas + cajas (muebles, jambas, hojas de puerta)
import { CELL, JAMB } from './config.js';

export const T = { SOLID: 0, CORR: 1, ROOM: 2, LOBBY: 3, DOOR: 4, OUT: 5 };
const CH = { '#': T.SOLID, '.': T.CORR, r: T.ROOM, L: T.LOBBY, D: T.DOOR, o: T.OUT };

export class World {
  constructor(map) {
    this.map = map;
    this.W = map.W; this.H = map.H;
    this.cells = new Uint8Array(this.W * this.H);
    for (let y = 0; y < this.H; y++) {
      const row = map.grid[y];
      for (let x = 0; x < this.W; x++) this.cells[y * this.W + x] = CH[row[x]] ?? 0;
    }
    this.roomGrid = new Int16Array(this.W * this.H).fill(-1);
    for (const r of map.rooms) {
      for (let y = r.y; y < r.y + r.h; y++) for (let x = r.x; x < r.x + r.w; x++) this.roomGrid[y * this.W + x] = r.id;
    }
    this.doors = map.doors;
    this.doorByCell = new Map();
    this.doorOpen = {};
    this.doorLocked = {};
    this.buckets = new Map();
    this.panels = [];
    for (const d of map.doors) {
      this.doorByCell.set(d.cy * this.W + d.cx, d);
      this.doorOpen[d.id] = false;
      this.doorLocked[d.id] = !!d.lock;
      const x0 = d.cx * CELL, z0 = d.cy * CELL;
      if (d.axis === 'ns') {
        this.addStatic({ minX: x0, maxX: x0 + JAMB, minZ: z0, maxZ: z0 + CELL });
        this.addStatic({ minX: x0 + CELL - JAMB, maxX: x0 + CELL, minZ: z0, maxZ: z0 + CELL });
        this.addStatic({ minX: x0 + JAMB, maxX: x0 + CELL - JAMB, minZ: z0 + CELL / 2 - 0.08, maxZ: z0 + CELL / 2 + 0.08, door: d.id });
      } else {
        this.addStatic({ minX: x0, maxX: x0 + CELL, minZ: z0, maxZ: z0 + JAMB });
        this.addStatic({ minX: x0, maxX: x0 + CELL, minZ: z0 + CELL - JAMB, maxZ: z0 + CELL });
        this.addStatic({ minX: x0 + CELL / 2 - 0.08, maxX: x0 + CELL / 2 + 0.08, minZ: z0 + JAMB, maxZ: z0 + CELL - JAMB, door: d.id });
      }
    }
    for (const f of map.furniture) {
      if (!f.solid) continue;
      this.addStatic({ minX: f.x - f.w / 2, maxX: f.x + f.w / 2, minZ: f.z - f.d / 2, maxZ: f.z + f.d / 2 });
    }
  }
  addStatic(b) {
    const cx0 = Math.floor(b.minX / CELL), cx1 = Math.floor((b.maxX - 1e-6) / CELL);
    const cy0 = Math.floor(b.minZ / CELL), cy1 = Math.floor((b.maxZ - 1e-6) / CELL);
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      const k = cy * this.W + cx;
      let a = this.buckets.get(k);
      if (!a) this.buckets.set(k, (a = []));
      a.push(b);
    }
  }
  cellType(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= this.W || cy >= this.H) return T.SOLID;
    return this.cells[cy * this.W + cx];
  }
  typeAt(x, z) { return this.cellType(Math.floor(x / CELL), Math.floor(z / CELL)); }
  roomAt(x, z) {
    const cx = Math.floor(x / CELL), cy = Math.floor(z / CELL);
    if (cx < 0 || cy < 0 || cx >= this.W || cy >= this.H) return -1;
    return this.roomGrid[cy * this.W + cx];
  }
  isOpen(id) { return !!this.doorOpen[id]; }
  circleBlocked(x, z, r) {
    const cx0 = Math.floor((x - r) / CELL), cx1 = Math.floor((x + r) / CELL);
    const cy0 = Math.floor((z - r) / CELL), cy1 = Math.floor((z + r) / CELL);
    const r2 = r * r;
    for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) {
      if (this.cellType(cx, cy) === T.SOLID) {
        const dx = x - Math.max(cx * CELL, Math.min(x, (cx + 1) * CELL));
        const dz = z - Math.max(cy * CELL, Math.min(z, (cy + 1) * CELL));
        if (dx * dx + dz * dz < r2) return true;
        continue;
      }
      const list = this.buckets.get(cy * this.W + cx);
      if (!list) continue;
      for (const b of list) {
        if (b.door !== undefined && this.doorOpen[b.door]) continue;
        const dx = x - Math.max(b.minX, Math.min(x, b.maxX));
        const dz = z - Math.max(b.minZ, Math.min(z, b.maxZ));
        if (dx * dx + dz * dz < r2) return true;
      }
    }
    return false;
  }
  // Movimiento con deslizamiento por ejes
  move(x, z, dx, dz, r) {
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / 0.15));
    const sx = dx / steps, sz = dz / steps;
    for (let i = 0; i < steps; i++) {
      if (!this.circleBlocked(x + sx, z, r)) x += sx;
      if (!this.circleBlocked(x, z + sz, r)) z += sz;
    }
    return [x, z];
  }
  // Línea de visión sobre la rejilla (paredes y puertas cerradas bloquean)
  los(x0, z0, x1, z1, ignoreDoor = -1) {
    let cx = Math.floor(x0 / CELL), cy = Math.floor(z0 / CELL);
    const ex = Math.floor(x1 / CELL), ey = Math.floor(z1 / CELL);
    const dx = x1 - x0, dz = z1 - z0;
    const stepX = dx > 0 ? 1 : -1, stepY = dz > 0 ? 1 : -1;
    const tDX = dx !== 0 ? Math.abs(CELL / dx) : Infinity, tDY = dz !== 0 ? Math.abs(CELL / dz) : Infinity;
    let tMX = dx !== 0 ? ((dx > 0 ? (cx + 1) * CELL - x0 : x0 - cx * CELL) / Math.abs(dx)) : Infinity;
    let tMY = dz !== 0 ? ((dz > 0 ? (cy + 1) * CELL - z0 : z0 - cy * CELL) / Math.abs(dz)) : Infinity;
    let guard = 0;
    while ((cx !== ex || cy !== ey) && guard++ < 400) {
      if (tMX < tMY) { cx += stepX; tMX += tDX; } else { cy += stepY; tMY += tDY; }
      const t = this.cellType(cx, cy);
      if (t === T.SOLID) return false;
      if (t === T.DOOR) {
        const d = this.doorByCell.get(cy * this.W + cx);
        if (d && d.id !== ignoreDoor && !this.doorOpen[d.id]) return false;
      }
    }
    return true;
  }
  doorAtPoint(x, z) {
    return this.doorByCell.get(Math.floor(z / CELL) * this.W + Math.floor(x / CELL)) || null;
  }
}

// Controlador en primera persona: entrada, movimiento con colisiones, resistencia y linterna
import { WALK_SPEED, RUN_SPEED, PLAYER_R } from '/shared/config.js';

export class Player {
  constructor(world, diff, settings) {
    this.world = world; this.diff = diff; this.settings = settings;
    this.x = 0; this.z = 0; this.yaw = 0; this.pitch = 0; this.vx = 0; this.vz = 0;
    this.stamina = 100; this.exhausted = false; this.regenDelay = 0; this.running = false; this.moving = false;
    this.fl = true; this.battery = 100; this.bat = 1; this.bob = 0; this.stride = 0;
    this.keys = new Set(); this.frozen = false; this.locked = false; this.pressed = new Set();
    this.onStep = null; this.onBattery = null; this.onFlash = null; this.speedNow = 0;
  }
  attach(canvas) {
    this.canvas = canvas;
    this._kd = (e) => {
      if (e.repeat) { if (['Tab', 'Space'].includes(e.code)) e.preventDefault(); return; }
      if (e.code === 'Tab') e.preventDefault();
      this.keys.add(e.code); this.pressed.add(e.code);
    };
    this._ku = (e) => { this.keys.delete(e.code); this.released = this.released || new Set(); this.released.add(e.code); };
    this._mm = (e) => {
      if (document.pointerLockElement !== canvas || this.frozen) return;
      const s = 0.0022 * this.settings.sens;
      this.yaw -= e.movementX * s; this.pitch -= e.movementY * s;
      this.pitch = Math.max(-1.45, Math.min(1.45, this.pitch));
    };
    this._bl = () => this.keys.clear();
    addEventListener('keydown', this._kd); addEventListener('keyup', this._ku); addEventListener('mousemove', this._mm); addEventListener('blur', this._bl);
    this.released = new Set();
  }
  detach() { removeEventListener('keydown', this._kd); removeEventListener('keyup', this._ku); removeEventListener('mousemove', this._mm); removeEventListener('blur', this._bl); }
  wasPressed(code) { const r = this.pressed.has(code); this.pressed.delete(code); return r; }
  wasReleased(code) { const r = this.released.has(code); this.released.delete(code); return r; }
  has(code) { return this.keys.has(code); }
  toggleFlashlight() {
    if (this.fl) this.fl = false; else if (this.battery > 0 || this.bat > 0) { this.fl = true; if (this.battery <= 0 && this.bat > 0) { this.bat--; this.battery = 100; this.onBattery && this.onBattery(); } } else return false;
    this.onFlash && this.onFlash(this.fl); return true;
  }
  update(dt) {
    const d = this.diff;
    // linterna y pilas
    if (this.fl) {
      this.battery -= d.flDrain * dt;
      if (this.battery <= 0) {
        if (this.bat > 0) { this.bat--; this.battery = 100; this.onBattery && this.onBattery(); }
        else { this.battery = 0; this.fl = false; this.onFlash && this.onFlash(false, true); }
      }
    }
    const can = !this.frozen && this.locked;
    let ix = 0, iz = 0;
    if (can) {
      if (this.has('KeyW') || this.has('ArrowUp')) iz += 1; if (this.has('KeyS') || this.has('ArrowDown')) iz -= 1;
      if (this.has('KeyD') || this.has('ArrowRight')) ix += 1; if (this.has('KeyA') || this.has('ArrowLeft')) ix -= 1;
    }
    const len = Math.hypot(ix, iz); if (len > 0) { ix /= len; iz /= len; }
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw), rx = Math.cos(this.yaw), rz = -Math.sin(this.yaw);
    const wantRun = can && (this.has('ShiftLeft') || this.has('ShiftRight')) && len > 0 && iz > 0;
    if (this.exhausted && this.stamina > 25) this.exhausted = false;
    this.running = wantRun && !this.exhausted && this.stamina > 0;
    if (this.running) { this.stamina = Math.max(0, this.stamina - d.stamina.drain * dt); this.regenDelay = d.stamina.delay; if (this.stamina <= 0) { this.exhausted = true; this.running = false; } }
    else { this.regenDelay -= dt; if (this.regenDelay <= 0) this.stamina = Math.min(100, this.stamina + d.stamina.regen * dt * (len > 0 ? 0.6 : 1.4)); }
    const speed = this.running ? RUN_SPEED : WALK_SPEED;
    const tx = (fx * iz + rx * ix) * speed, tz = (fz * iz + rz * ix) * speed;
    const k = Math.min(1, dt * 14);
    this.vx += (tx - this.vx) * k; this.vz += (tz - this.vz) * k;
    const ox = this.x, oz = this.z;
    if (Math.abs(this.vx) > 0.001 || Math.abs(this.vz) > 0.001) [this.x, this.z] = this.world.move(this.x, this.z, this.vx * dt, this.vz * dt, PLAYER_R);
    const moved = Math.hypot(this.x - ox, this.z - oz);
    this.speedNow = moved / Math.max(dt, 1e-4); this.moving = this.speedNow > 0.4;
    if (this.moving) { this.bob += moved * (this.running ? 4.6 : 4.0); this.stride += moved; const sl = this.running ? 1.55 : 1.95; if (this.stride > sl) { this.stride = 0; this.onStep && this.onStep(this.running); } }
    else this.bob += dt * 1.4;
  }
}

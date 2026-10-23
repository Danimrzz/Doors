// Motor de audio 100 % procedural (Web Audio): no necesita archivos externos
export class AudioEngine {
  constructor() { this.ctx = null; this.vol = { master: 0.8, sfx: 0.9, amb: 0.7 }; this.tension = 0; this.chase = 0; this.hbT = 0; this.stepAcc = 0; this.breath = null; this.enemyStepAcc = 0; }
  init() {
    if (this.ctx) { this.ctx.resume?.(); return; }
    const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return;
    const c = (this.ctx = new AC());
    this.master = c.createGain(); this.sfx = c.createGain(); this.amb = c.createGain();
    const comp = c.createDynamicsCompressor(); comp.threshold.value = -14; comp.ratio.value = 6;
    this.sfx.connect(this.master); this.amb.connect(this.master); this.master.connect(comp); comp.connect(c.destination);
    this.applyVol();
    // ruido blanco reutilizable
    const len = c.sampleRate * 2, buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    this.noiseBuf = buf;
    // reverberación sencilla (cola de ruido decreciente)
    const rl = Math.floor(c.sampleRate * 1.8), rb = c.createBuffer(2, rl, c.sampleRate);
    for (let ch = 0; ch < 2; ch++) { const rd = rb.getChannelData(ch); for (let i = 0; i < rl; i++) rd[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / rl, 3); }
    this.rev = c.createConvolver(); this.rev.buffer = rb; this.revGain = c.createGain(); this.revGain.gain.value = 0.35; this.rev.connect(this.revGain); this.revGain.connect(this.master);
    this.startAmbience();
  }
  applyVol() { if (!this.ctx) return; const t = this.ctx.currentTime; this.master.gain.setTargetAtTime(this.vol.master, t, 0.05); this.sfx.gain.setTargetAtTime(this.vol.sfx, t, 0.05); this.amb.gain.setTargetAtTime(this.vol.amb, t, 0.05); }
  setVol(k, v) { this.vol[k] = v; this.applyVol(); }
  setListener(x, y, z, fx, fz) {
    if (!this.ctx) return; const l = this.ctx.listener;
    if (l.positionX) { l.positionX.value = x; l.positionY.value = y; l.positionZ.value = z; l.forwardX.value = fx; l.forwardY.value = 0; l.forwardZ.value = fz; l.upX.value = 0; l.upY.value = 1; l.upZ.value = 0; }
    else { l.setPosition(x, y, z); l.setOrientation(fx, 0, fz, 0, 1, 0); }
  }
  out(pos, bus) {
    const dest = bus === 'amb' ? this.amb : this.sfx;
    if (!pos) return dest;
    const p = this.ctx.createPanner(); p.panningModel = 'HRTF'; p.distanceModel = 'inverse'; p.refDistance = 2; p.rolloffFactor = 1.35; p.maxDistance = 70;
    if (p.positionX) { p.positionX.value = pos.x; p.positionY.value = pos.y ?? 1; p.positionZ.value = pos.z; } else p.setPosition(pos.x, pos.y ?? 1, pos.z);
    p.connect(dest); return p;
  }
  noise(loop = false) { const s = this.ctx.createBufferSource(); s.buffer = this.noiseBuf; s.loop = loop; return s; }
  burst({ dur = 0.2, type = 'lowpass', f0 = 800, f1 = f0, q = 1, gain = 0.3, attack = 0.005, pos = null, bus = 'sfx', wet = 0, delay = 0 }) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + delay;
    const s = this.noise(), f = c.createBiquadFilter(), g = c.createGain();
    f.type = type; f.Q.value = q; f.frequency.setValueAtTime(f0, t); f.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); const o = this.out(pos, bus); g.connect(o); if (wet) g.connect(this.rev);
    s.start(t, Math.random() * 1.5); s.stop(t + dur + 0.05);
  }
  tone({ f0 = 440, f1 = f0, dur = 0.3, type = 'sine', gain = 0.2, attack = 0.01, pos = null, bus = 'sfx', wet = 0, lp = 0, delay = 0 }) {
    if (!this.ctx) return; const c = this.ctx, t = c.currentTime + delay;
    const o = c.createOscillator(), g = c.createGain(); o.type = type; o.frequency.setValueAtTime(f0, t); if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(10, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(gain, t + attack); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    let n = o; if (lp) { const f = c.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = lp; o.connect(f); n = f; }
    n.connect(g); g.connect(this.out(pos, bus)); if (wet) g.connect(this.rev); o.start(t); o.stop(t + dur + 0.05);
  }
  // ---------- ambiente continuo ----------
  startAmbience() {
    const c = this.ctx, t = c.currentTime;
    const mk = (type, f, g) => { const o = c.createOscillator(), gn = c.createGain(); o.type = type; o.frequency.value = f; gn.gain.value = g; o.connect(gn); o.start(t); return { o, gn }; };
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = 260; lp.connect(this.amb);
    const d1 = mk('sine', 49, 0.2), d2 = mk('triangle', 73.6, 0.06), d3 = mk('sine', 98.3, 0.05);
    [d1, d2, d3].forEach((d) => d.gn.connect(lp));
    const lfo = c.createOscillator(), lg = c.createGain(); lfo.frequency.value = 0.07; lg.gain.value = 1.2; lfo.connect(lg); lg.connect(d2.o.detune); lfo.start(t);
    // aire / viento en pasillos
    const w = this.noise(true), bp = c.createBiquadFilter(), wg = c.createGain(); bp.type = 'bandpass'; bp.frequency.value = 420; bp.Q.value = 0.6; wg.gain.value = 0.045;
    const wl = c.createOscillator(), wlg = c.createGain(); wl.frequency.value = 0.05; wlg.gain.value = 260; wl.connect(wlg); wlg.connect(bp.frequency); wl.start(t);
    w.connect(bp); bp.connect(wg); wg.connect(this.amb); w.start(t);
    // capa de tensión: segunda menor disonante
    const tl = c.createBiquadFilter(); tl.type = 'lowpass'; tl.frequency.value = 900; this.tensionGain = c.createGain(); this.tensionGain.gain.value = 0; tl.connect(this.tensionGain); this.tensionGain.connect(this.amb);
    for (const f of [233, 246.9, 349]) { const o = c.createOscillator(); o.type = 'sawtooth'; o.frequency.value = f; const g = c.createGain(); g.gain.value = 0.25; o.connect(g); g.connect(tl); o.start(t); }
    // capa de persecución: pulso grave
    const po = c.createOscillator(); po.type = 'sawtooth'; po.frequency.value = 55; const pg = c.createGain(); pg.gain.value = 0; const pl = c.createBiquadFilter(); pl.type = 'lowpass'; pl.frequency.value = 200;
    const pm = c.createOscillator(), pmg = c.createGain(); pm.frequency.value = 2.1; pmg.gain.value = 0.5; pm.connect(pmg); const pb = c.createGain(); pb.gain.value = 0.5; pmg.connect(pb.gain); pm.start(t);
    po.connect(pb); pb.connect(pl); pl.connect(pg); pg.connect(this.sfx); po.start(t); this.chaseGain = pg;
    this.droneLP = lp;
  }
  setTension(v) { this.tension = v; if (this.tensionGain) this.tensionGain.gain.setTargetAtTime(0.004 + v * 0.02, this.ctx.currentTime, 1); }
  setChase(v) { this.chase = v; if (this.chaseGain) this.chaseGain.gain.setTargetAtTime(v * 0.22, this.ctx.currentTime, 0.25); }
  duck(on) { if (this.amb && this.ctx) this.amb.gain.setTargetAtTime(on ? this.vol.amb * 0.15 : this.vol.amb, this.ctx.currentTime, 0.4); }
  // ---------- efectos ----------
  step(run) { this.burst({ dur: 0.1, f0: run ? 700 : 450, f1: 160, gain: run ? 0.22 : 0.13, q: 0.8 }); this.tone({ f0: 80, f1: 45, dur: 0.1, gain: run ? 0.18 : 0.1 }); }
  enemyStep(pos, k = 1) { this.tone({ f0: 62, f1: 34, dur: 0.22, gain: 0.55 * k, pos, type: 'sine' }); this.burst({ dur: 0.14, f0: 520, f1: 120, gain: 0.35 * k, pos, q: 1.2 }); if (Math.random() < 0.35) this.burst({ dur: 0.12, type: 'bandpass', f0: 1100, f1: 700, q: 3, gain: 0.07 * k, pos }); }
  breathUpdate(pos, vol) {
    if (!this.ctx) return;
    if (!this.breath) {
      const c = this.ctx, s = this.noise(true), bp = c.createBiquadFilter(), g = c.createGain(), p = this.out(pos, 'sfx');
      bp.type = 'bandpass'; bp.frequency.value = 650; bp.Q.value = 1.1; g.gain.value = 0;
      const l = c.createOscillator(), lg = c.createGain(); l.frequency.value = 0.32; lg.gain.value = 0.5; l.connect(lg); const base = c.createGain(); base.gain.value = 0.5; lg.connect(base.gain);
      s.connect(bp); bp.connect(g); g.connect(base); base.connect(p); s.start(); l.start(); this.breath = { g, p, bp, l };
    }
    const b = this.breath; if (b.p.positionX) { b.p.positionX.value = pos.x; b.p.positionY.value = 1.6; b.p.positionZ.value = pos.z; }
    b.g.gain.setTargetAtTime(vol, this.ctx.currentTime, 0.2);
  }
  doorOpen(pos) { this.tone({ f0: 110, f1: 190, dur: 0.7, type: 'sawtooth', gain: 0.05, pos, lp: 500, attack: 0.1 }); this.burst({ dur: 0.7, type: 'bandpass', f0: 300, f1: 700, q: 4, gain: 0.05, pos, attack: 0.1 }); this.burst({ dur: 0.05, f0: 1800, f1: 900, gain: 0.12, pos }); }
  doorClose(pos) { this.tone({ f0: 90, f1: 40, dur: 0.3, gain: 0.35, pos }); this.burst({ dur: 0.2, f0: 700, f1: 150, gain: 0.25, pos }); this.burst({ dur: 0.04, f0: 2200, f1: 1200, gain: 0.1, pos }); }
  locked(pos) { for (let i = 0; i < 3; i++) setTimeout(() => this.burst({ dur: 0.05, type: 'highpass', f0: 1500, f1: 3000, gain: 0.18, pos }), i * 90); }
  unlock(pos) { this.burst({ dur: 0.12, type: 'highpass', f0: 2500, f1: 1500, gain: 0.25, pos }); this.tone({ f0: 1400, f1: 900, dur: 0.25, gain: 0.08, pos, wet: 1 }); }
  pickup() { [660, 880, 1320].forEach((f, i) => this.tone({ f0: f, dur: 0.5, gain: 0.07, delay: i * 0.07, wet: 1 })); this.burst({ dur: 0.05, type: 'highpass', f0: 3000, gain: 0.05 }); }
  keypad(ok) { if (ok === null) this.tone({ f0: 1250, dur: 0.07, gain: 0.07, type: 'square' }); else if (ok) { this.tone({ f0: 880, dur: 0.12, gain: 0.08 }); this.tone({ f0: 1320, dur: 0.25, gain: 0.08, delay: 0.12 }); } else { this.tone({ f0: 150, dur: 0.25, type: 'square', gain: 0.09 }); this.tone({ f0: 120, dur: 0.35, type: 'square', gain: 0.09, delay: 0.25 }); } }
  click() { this.burst({ dur: 0.025, type: 'highpass', f0: 2500, gain: 0.14 }); }
  thump(pos, bus = 'sfx') { this.tone({ f0: 70, f1: 32, dur: 0.55, gain: 0.7, pos, lp: 160, bus }); this.burst({ dur: 0.3, f0: 260, f1: 60, gain: 0.35, pos, bus }); }
  creak(pos, bus = 'amb') { this.tone({ f0: 85, f1: 150, dur: 1.4, type: 'sawtooth', gain: 0.06, pos, lp: 420, attack: 0.3, bus }); this.burst({ dur: 1.3, type: 'bandpass', f0: 280, f1: 760, q: 5, gain: 0.05, pos, attack: 0.3, bus }); }
  whisper(pos) { this.burst({ dur: 1.8, type: 'bandpass', f0: 1700, f1: 2300, q: 9, gain: 0.05, pos, attack: 0.5, bus: 'amb' }); this.burst({ dur: 1.4, type: 'bandpass', f0: 900, f1: 1300, q: 7, gain: 0.035, pos, attack: 0.4, bus: 'amb' }); }
  ding(pos) { this.tone({ f0: 880, dur: 1.6, gain: 0.12, pos, wet: 1 }); this.tone({ f0: 659, dur: 1.6, gain: 0.1, pos, wet: 1, delay: 0.3 }); }
  farSlam() { this.tone({ f0: 60, f1: 30, dur: 0.7, gain: 0.5, lp: 140, bus: 'amb' }); this.burst({ dur: 0.5, f0: 200, f1: 50, gain: 0.25, bus: 'amb', wet: 1 }); }
  buzzPop(pos) { this.tone({ f0: 100, dur: 0.18, type: 'square', gain: 0.1, pos, lp: 700 }); this.burst({ dur: 0.1, type: 'highpass', f0: 3000, gain: 0.2, pos }); }
  machine(pos) { this.tone({ f0: 38, f1: 75, dur: 2.4, type: 'sawtooth', gain: 0.35, pos, lp: 180, attack: 0.6 }); this.burst({ dur: 0.4, f0: 400, f1: 80, gain: 0.5, pos }); this.burst({ dur: 2.0, type: 'bandpass', f0: 200, f1: 120, q: 2, gain: 0.2, pos, attack: 0.5 }); }
  alarm() { for (let i = 0; i < 6; i++) { this.tone({ f0: 620, dur: 0.3, type: 'triangle', gain: 0.1, delay: i * 0.6, lp: 1800 }); this.tone({ f0: 830, dur: 0.3, type: 'triangle', gain: 0.1, delay: i * 0.6 + 0.3, lp: 1800 }); } }
  stinger() { this.tone({ f0: 466, dur: 0.9, type: 'sawtooth', gain: 0.05, lp: 1500, attack: 0.05, wet: 1 }); this.tone({ f0: 493, dur: 0.9, type: 'sawtooth', gain: 0.05, lp: 1500, attack: 0.05, wet: 1 }); }
  growl(pos) { const c = this.ctx; if (!c) return; this.tone({ f0: 70, f1: 48, dur: 1.4, type: 'sawtooth', gain: 0.4, pos, lp: 340, attack: 0.15 }); this.burst({ dur: 1.3, type: 'bandpass', f0: 380, f1: 240, q: 3, gain: 0.3, pos, attack: 0.15 }); }
  roar(pos) { this.tone({ f0: 110, f1: 60, dur: 1.2, type: 'sawtooth', gain: 0.5, pos, lp: 900, attack: 0.04, wet: 1 }); this.tone({ f0: 1300, f1: 600, dur: 0.9, type: 'sine', gain: 0.18, pos, attack: 0.03 }); this.burst({ dur: 1.0, type: 'bandpass', f0: 1500, f1: 500, q: 1.2, gain: 0.35, pos }); }
  heartbeat(strength = 1) { const g = 0.5 * strength; this.tone({ f0: 62, f1: 38, dur: 0.16, gain: g, lp: 150 }); this.tone({ f0: 58, f1: 34, dur: 0.18, gain: g * 0.75, lp: 150, delay: 0.17 }); }
  jumpscare() {
    this.burst({ dur: 0.8, type: 'lowpass', f0: 9000, f1: 800, gain: 1.0, attack: 0.002 });
    this.tone({ f0: 240, f1: 2200, dur: 0.7, type: 'sawtooth', gain: 0.6, attack: 0.002 }); this.tone({ f0: 250, f1: 1700, dur: 0.7, type: 'square', gain: 0.35, attack: 0.002 });
    this.tone({ f0: 48, f1: 28, dur: 1.4, gain: 1.0, attack: 0.002 }); this.burst({ dur: 1.5, type: 'bandpass', f0: 1200, f1: 400, q: 0.7, gain: 0.5, attack: 0.05, wet: 1 });
    // chillido humano-demoníaco: varias voces desafinadas y modulación rápida
    for (let i = 0; i < 5; i++) this.tone({ f0: 520 + i * 83, f1: 1900 + i * 140, dur: 1.9, type: 'sawtooth', gain: 0.22, attack: 0.004, wet: 1, lp: 6500, delay: 0.04 + i * 0.015 });
    for (let i = 0; i < 6; i++) this.burst({ dur: 0.18, type: 'highpass', f0: 2500, gain: 0.5, delay: 0.1 + i * 0.28, attack: 0.002 });
    this.tone({ f0: 38, f1: 24, dur: 2.2, gain: 1.0, attack: 0.002, delay: 0.1 });
  }
  // chillido estridente de persecución (global o posicional)
  chaseScream(pos = null, k = 1) {
    this.tone({ f0: 900, f1: 2700, dur: 1.2, type: 'sawtooth', gain: 0.42 * k, attack: 0.01, wet: 1, lp: 7000, pos });
    this.tone({ f0: 1380, f1: 2100, dur: 1.2, type: 'square', gain: 0.2 * k, attack: 0.01, wet: 1, pos, delay: 0.05 });
    this.burst({ dur: 1.3, type: 'bandpass', f0: 2600, f1: 1100, q: 2.2, gain: 0.55 * k, attack: 0.01, wet: 1, pos });
    this.tone({ f0: 52, f1: 28, dur: 1.7, gain: 0.8 * k, attack: 0.01, pos });
  }
  scream(pos) { this.tone({ f0: 700, f1: 1500, dur: 0.9, type: 'sawtooth', gain: 0.2, pos, lp: 3000, attack: 0.05, wet: 1 }); }
  win() { [261.6, 329.6, 392, 523.3].forEach((f, i) => this.tone({ f0: f, dur: 3.5, gain: 0.12, attack: 0.6, delay: i * 0.25, wet: 1, type: 'triangle' })); }
  lose() { [392, 311, 233, 196].forEach((f, i) => this.tone({ f0: f, f1: f * 0.97, dur: 2.5, gain: 0.12, attack: 0.3, delay: i * 0.5, wet: 1, type: 'sawtooth', lp: 700 })); }
  ambientRandom(listener) {
    const r = Math.random(), a = Math.random() * 6.28, d = 6 + Math.random() * 14;
    const pos = { x: listener.x + Math.cos(a) * d, y: 1.2, z: listener.z + Math.sin(a) * d };
    if (r < 0.3) this.creak(pos); else if (r < 0.5) this.thump(pos, 'amb'); else if (r < 0.62) this.whisper(pos);
    else if (r < 0.85) { for (let i = 0; i < 4; i++) setTimeout(() => this.burst({ dur: 0.1, f0: 380, f1: 120, gain: 0.07, pos, bus: 'amb' }), i * 520); } // pasos lejanos
    else this.burst({ dur: 1.2, type: 'bandpass', f0: 500, f1: 250, q: 2, gain: 0.05, pos, bus: 'amb', attack: 0.4 });
  }
}

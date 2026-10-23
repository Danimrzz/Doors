// Cliente WebSocket con medición de latencia
export class Net {
  constructor(on) { this.on = on; this.ws = null; this.rtt = null; this.lastPong = 0; this.timer = null; this.open = false; }
  connect() {
    return new Promise((resolve, reject) => {
      const url = (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
      let ws; try { ws = new WebSocket(url); } catch (e) { reject(e); return; }
      this.ws = ws;
      ws.onopen = () => { this.open = true; this.lastPong = performance.now(); this.timer = setInterval(() => this.ping(), 2000); resolve(); };
      ws.onerror = () => { if (!this.open) reject(new Error('No se pudo conectar con el servidor')); };
      ws.onclose = () => { const was = this.open; this.open = false; clearInterval(this.timer); if (was) this.on.close && this.on.close(); };
      ws.onmessage = (ev) => { let m; try { m = JSON.parse(ev.data); } catch { return; } if (m.t === 'pong') { this.rtt = Math.round(performance.now() - m.c); this.lastPong = performance.now(); return; } this.on.msg(m); };
    });
  }
  ping() { this.send({ t: 'ping', c: performance.now() }); }
  stale() { return this.open && performance.now() - this.lastPong > 6000; }
  send(o) { if (this.ws && this.ws.readyState === 1) this.ws.send(JSON.stringify(o)); }
  close() { try { this.ws && this.ws.close(); } catch { /* nada */ } this.open = false; clearInterval(this.timer); }
}

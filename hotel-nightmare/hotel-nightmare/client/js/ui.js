// Interfaz: menú/sala, ajustes persistentes, HUD discreto, avisos y pantallas finales
import { ITEM_SHORT } from '/shared/missions.js';

export const $ = (id) => document.getElementById(id);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const DEFAULTS = { master: 0.8, sfx: 0.9, amb: 0.7, sens: 1, quality: 'medium', name: '' };
export const settings = { ...DEFAULTS };
try { Object.assign(settings, JSON.parse(localStorage.getItem('hn_settings') || '{}')); } catch { /* sin almacenamiento */ }
export function saveSettings() { try { localStorage.setItem('hn_settings', JSON.stringify(settings)); } catch { /* ignorar */ } }

let onSetting = () => {};
export function initSettingsPanels(cb) {
  onSetting = cb;
  for (const id of ['settingsMenu', 'settingsPause']) {
    const el = $(id); if (!el) continue;
    const mk = (key, label, min, max, step, fmt) => `<div class="setrow"><span>${label}</span><input type="range" data-k="${key}" min="${min}" max="${max}" step="${step}" value="${settings[key]}"><b data-v="${key}">${fmt(settings[key])}</b></div>`;
    el.innerHTML = mk('master', 'Volumen general', 0, 1, 0.05, (v) => Math.round(v * 100)) + mk('sfx', 'Efectos', 0, 1, 0.05, (v) => Math.round(v * 100)) + mk('amb', 'Ambiente', 0, 1, 0.05, (v) => Math.round(v * 100)) + mk('sens', 'Sensibilidad', 0.2, 3, 0.1, (v) => (+v).toFixed(1)) +
      `<div class="setrow"><span>Calidad gráfica</span><select data-k="quality"><option value="low">Baja</option><option value="medium">Media</option><option value="high">Alta</option></select></div>`;
    el.querySelectorAll('[data-k]').forEach((inp) => {
      const k = inp.dataset.k; if (k === 'quality') inp.value = settings.quality;
      inp.addEventListener('input', () => {
        settings[k] = k === 'quality' ? inp.value : +inp.value; saveSettings();
        document.querySelectorAll(`[data-k="${k}"]`).forEach((o) => { if (o !== inp) o.value = inp.value; });
        document.querySelectorAll(`[data-v="${k}"]`).forEach((b) => (b.textContent = k === 'sens' ? (+settings[k]).toFixed(1) : Math.round(settings[k] * 100)));
        onSetting(k, settings[k]);
      });
    });
  }
}

export function show(id, on = true) { $(id).classList.toggle('hidden', !on); }
export function toast(text, kind = '') {
  const t = document.createElement('div'); t.className = 'toast ' + kind; t.textContent = text; $('toasts').appendChild(t);
  while ($('toasts').children.length > 4) $('toasts').firstChild.remove();
  setTimeout(() => t.remove(), 6200);
}
export function menuError(m) { $('menuErr').textContent = m || ''; }

export function renderLobby(info, myId) {
  show('panelMain', false); show('panelLobby', true);
  $('lobbyCode').textContent = info.code;
  const isHost = info.host === myId;
  $('lobbyPlayers').innerHTML = info.players.map((p) => `<div class="pl"><span>${esc(p.name)}${p.id === myId ? ' (tú)' : ''}</span>${p.id === info.host ? '<b>ANFITRIÓN</b>' : ''}</div>`).join('');
  $('selMode').value = info.settings.captureMode; if (document.activeElement !== $('inSeed')) $('inSeed').value = info.settings.seed || '';
  for (const id of ['selMode', 'inSeed']) $(id).disabled = !isHost;
  $('btnStart').disabled = !(isHost && info.state === 'lobby');
  $('btnStart').textContent = info.state === 'playing' ? 'Partida en curso…' : 'Iniciar partida';
  $('lobbyHint').textContent = isHost ? (info.players.length < 2 ? 'Puedes empezar ya (en solitario) o esperar a tus amigos.' : `${info.players.length} jugadores conectados. Más jugadores = hotel más peligroso.`) : 'Esperando a que el anfitrión inicie la partida.';
}
export function showMainPanel() { show('panelMain', true); show('panelLobby', false); }

// ---- HUD ----
let lastObj = '';
export function renderObjectives(missions, doneSet) {
  const html = '<h4>OBJETIVOS</h4>' + missions.map((m) => `<div class="ob ${doneSet.has(m.id) ? 'done' : ''}">${doneSet.has(m.id) ? '☑' : '☐'} ${esc(m.title)}${doneSet.has(m.id) ? '' : `<small>${esc(m.hint || '')}</small>`}</div>`).join('');
  if (html !== lastObj) { $('objectives').innerHTML = html; lastObj = html; }
}
export function pulseObjectives() { const o = $('objectives'); o.classList.add('show'); clearTimeout(pulseObjectives.t); pulseObjectives.t = setTimeout(() => o.classList.remove('show'), 6000); }
export function renderInventory(inv, bat) {
  const chips = Object.keys(inv).map((k) => `<span class="chip">${esc(ITEM_SHORT[k] || k)}${k === 'codeNote' ? ': ' + esc(inv[k]) : ''}</span>`);
  $('inventory').innerHTML = chips.join('') || '<span class="chip" style="opacity:.5">Sin objetos</span>';
  $('battTxt').textContent = `Pilas: ${bat}`;
}
export function renderMates(players, myId, states) {
  $('mates').innerHTML = players.filter((p) => p.id !== myId).map((p) => `<div class="m ${states[p.id] === 'downed' ? 'down' : states[p.id] === 'dead' ? 'dead' : ''}">${esc(p.name)}${states[p.id] === 'downed' ? ' (caído)' : states[p.id] === 'escaped' ? ' (ha escapado)' : ''}</div>`).join('');
}
export function setConn(rtt, stale) {
  const dot = $('connDot'); dot.className = stale ? 'dead' : rtt > 220 ? 'bad' : '';
  $('connTxt').textContent = stale ? 'Sin respuesta…' : rtt == null ? '--' : rtt + ' ms';
}
export function setExitState(unlocked, done, total) {
  const e = $('exitState'); e.className = unlocked ? 'open' : ''; e.textContent = unlocked ? 'SALIDA DESBLOQUEADA · LLEGA A LA PUERTA DE EMERGENCIA' : `SALIDA BLOQUEADA · ${done}/${total}`;
}
export function showResult(stats, myName, onBack) {
  const win = stats.result === 'victory';
  const mm = Math.floor(stats.time / 60), ss = String(stats.time % 60).padStart(2, '0');
  $('resultBox').className = 'box wide res ' + (win ? 'win' : 'lose');
  $('resultBox').innerHTML = `<h2>${win ? 'HAS ESCAPADO' : 'EL HOTEL SE QUEDA CONTIGO'}</h2>
    <p style="text-align:center;margin-top:0">${win ? 'La puerta de emergencia se cierra a vuestras espaldas.' : 'Nadie ha conseguido salir.'}</p>
    <table><tr><td>Tiempo de partida</td><td>${mm}:${ss}</td></tr>
    <tr><td>Objetivos completados</td><td>${stats.done} / ${stats.total}</td></tr>
    <tr><td>Jugadores que han escapado</td><td>${stats.escaped.length ? stats.escaped.map(esc).join(', ') : 'ninguno'}</td></tr>
    <tr><td>Capturas del enemigo</td><td>${stats.captures}</td></tr>
    <tr><td>Semilla</td><td>${esc(stats.seed)}</td></tr></table>
    <ul>${stats.missions.map((m) => `<li>${m.done ? '☑' : '☐'} ${esc(m.title)}</li>`).join('')}</ul>
    <button class="btn primary" id="btnBack">Volver a la sala</button>`;
  show('result', true); $('btnBack').onclick = () => { show('result', false); onBack(); };
}

// Arranque del cliente: conecta menú/sala, red, audio y juego
import { AudioEngine } from './audio.js';
import { Net } from './net.js';
import { Game } from './game.js';
import * as UI from './ui.js';
import { ROOM_CODE_RE } from '/shared/config.js';

const $ = UI.$;
let myId = null, lobby = null, inGame = false, game = null;
const audio = new AudioEngine();

const net = new Net({
  msg(m) {
    switch (m.t) {
      case 'hello': myId = m.id; return;
      case 'lobby': lobby = m; if (!inGame) UI.renderLobby(m, myId); return;
      case 'err': UI.menuError(m.m); UI.toast(m.m, 'bad'); return;
      case 'start': inGame = true; UI.show('menu', false); UI.show('loading', true);
        setTimeout(() => { try { game.start(m); } catch (e) { console.error(e); UI.menuError('Error al cargar el hotel: ' + e.message); backToMenu(); } UI.show('loading', false); }, 30);
        return;
      case 'joined': if (inGame) UI.toast(m.name + ' se ha unido'); return;
      case 'hostChanged': if (inGame) UI.toast(m.name + ' es ahora el anfitrión'); return;
      default: game.onMessage(m);
    }
  },
  close() {
    if (inGame) { game.stop(); UI.show('connLost', true); } else { UI.show('panelLobby', false); UI.show('panelMain', true); UI.menuError('Conexión perdida con el servidor.'); }
    lobby = null; myId = null;
  },
});
game = new Game($('gl'), net, audio);

function applySetting(k, v) {
  if (k === 'master' || k === 'sfx' || k === 'amb') audio.setVol(k, v);
  if (k === 'quality') game.applyQuality();
}
UI.initSettingsPanels(applySetting);

function backToMenu() {
  inGame = false; UI.show('menu', true); UI.show('loading', false);
  if (lobby && net.open) UI.renderLobby(lobby, myId); else UI.showMainPanel();
}
game.onExit = backToMenu;

async function ensureConnected() {
  audio.init();
  if (net.open) return true;
  try { await net.connect(); return true; } catch (e) { UI.menuError('No se pudo conectar con el servidor.'); return false; }
}
function playerName() {
  const n = $('inName').value.trim().slice(0, 16) || 'Huésped' + Math.floor(Math.random() * 90 + 10);
  UI.settings.name = $('inName').value.trim().slice(0, 16); UI.saveSettings(); return n;
}

$('inName').value = UI.settings.name || '';
$('btnCreate').onclick = async () => { UI.menuError(''); if (await ensureConnected()) net.send({ t: 'create', name: playerName() }); };
const doJoin = async () => {
  const code = $('inCode').value.trim().toUpperCase();
  if (!ROOM_CODE_RE.test(code)) return UI.menuError('El código debe tener 5 caracteres (letras y números).');
  UI.menuError(''); if (await ensureConnected()) net.send({ t: 'join', code, name: playerName() });
};
$('btnJoin').onclick = doJoin;
$('inCode').addEventListener('keydown', (e) => { if (e.key === 'Enter') doJoin(); });
$('inCode').addEventListener('input', (e) => { e.target.value = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, ''); });
$('btnLeave').onclick = () => { net.send({ t: 'leave' }); lobby = null; UI.showMainPanel(); };
$('btnStart').onclick = () => { audio.init(); net.send({ t: 'start' }); };
$('btnCopy').onclick = async () => {
  const code = $('lobbyCode').textContent;
  try { await navigator.clipboard.writeText(code); UI.toast('Código copiado'); } catch { UI.toast('Código: ' + code); }
};
const sendSettings = () => net.send({ t: 'settings', captureMode: $('selMode').value, seed: $('inSeed').value });
$('selMode').onchange = sendSettings; $('inSeed').onchange = sendSettings;

$('clickPlay').onclick = () => game.requestLock();
$('btnResume').onclick = () => game.requestLock();
$('btnQuit').onclick = () => { net.send({ t: 'leave' }); game.stop(); lobby = null; backToMenu(); };
$('btnLostMenu').onclick = () => { UI.show('connLost', false); inGame = false; UI.show('menu', true); UI.showMainPanel(); };

if (new URLSearchParams(location.search).has('debug')) window.__hn = { game, net, audio, UI };
UI.show('loading', false);

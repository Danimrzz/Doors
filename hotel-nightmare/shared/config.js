// Constantes y reglas de dificultad compartidas por servidor y cliente
export const CELL = 2;            // metros por celda de la rejilla
export const WALL_H = 3.1;
export const DOOR_W = 1.4;        // hueco libre de una puerta
export const JAMB = (CELL - DOOR_W) / 2;
export const PLAYER_R = 0.3;
export const ENEMY_R = 0.4;
export const EYE_H = 1.65;
export const WALK_SPEED = 3.0;
export const RUN_SPEED = 5.3;
export const INTERACT_DIST = 2.4;
export const NAV_RES = 0.5;
export const TICK_HZ = 20;
export const MAX_PLAYERS = 6;
export const ROOM_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export const ROOM_CODE_RE = /^[A-Z0-9]{5}$/;

export const CAPTURE_MODES = {
  downed: 'Incapacitado (los compañeros pueden rescatarte)',
  eliminated: 'Eliminado (fuera de la partida)',
  teamLoss: 'Derrota colectiva',
};
export const DEFAULT_CAPTURE_MODE = 'downed';

// hint: 2 = exacta, 1 = orientativa, 0 = críptica
// Dificultad única (sin selector): partida corta, pistas con la habitación exacta y un enemigo bastante peligroso
export const DIFFICULTY_ID = 'normal';
export const DIFFICULTIES = {
  normal: {
    id: 'normal', label: 'Normal', hint: 2, missionGroups: 2,
    enemy: { patrol: 1.8, investigate: 2.8, chase: 4.5, sight: 12, fov: 115, detect: 0.85, hearWalk: 3.2, hearRun: 11, loseSight: 3.2, search: 13, grace: 22, find: 0.55 },
    stamina: { drain: 22, regen: 15, delay: 1.1 },
    batteries: 8, flDrain: 0.35, flIntensity: 0.95, flAngle: 0.44,
    ambient: 0.95, broken: 0.3, glow: 0.6, events: 1.2,
  },
};

// Escalado progresivo con el número de jugadores (acotado para no ser imposible)
export function playerScaling(n) {
  const k = Math.max(0, Math.min(n, MAX_PLAYERS) - 1);
  return {
    speed: Math.min(1.1, 1 + 0.025 * k),
    hearing: Math.min(1.3, 1 + 0.06 * k),
    search: 1 + 0.08 * k,
    events: 1 + 0.1 * k,
    detect: Math.max(0.8, 1 - 0.04 * k),
    extraGroup: n >= 4 ? 1 : 0,
    batteryMul: (1 + 0.55 * k) * (1 - 0.06 * k),
  };
}

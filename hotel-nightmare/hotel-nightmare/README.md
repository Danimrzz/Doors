# HOTEL NIGHTMARE

Juego cooperativo de terror en primera persona, en el navegador, con multijugador online (servidor autoritativo).
Hotel abandonado generado proceduralmente en cada partida, un enemigo con IA (El Botones), misiones aleatorias, audio procedural.

## Tecnología
- **Cliente:** Three.js r170 (incluido en `client/vendor/`, sin build), módulos ES, Web Audio procedural, HTML/CSS.
- **Servidor:** Node.js ≥ 20 + `ws` (WebSocket). Simulación a 20 Hz; el servidor decide puertas, objetos, misiones, enemigo, capturas y salida.
- **Código compartido** (`shared/`): generador de mapas, colisiones, navegación y misiones, usado por cliente y servidor.

## Instalación y ejecución
```bash
npm install
npm start          # http://localhost:3000   (PORT=8080 npm start para cambiar el puerto)
npm test           # generador, juego (bots), enemigo y servidor real por WebSocket
```
Jugar online: despliega en cualquier hosting con Node (Render, Railway, Fly, VPS…) o expón el puerto local con un túnel
(p. ej. `cloudflared tunnel --url http://localhost:3000`). Los amigos entran con el código de 5 caracteres.

## Controles
WASD mover · Ratón mirar · Shift correr (stamina) · E interactuar · F linterna · Tab objetivos · Esc pausa/ajustes.

## Estructura
```
server/   index.js (HTTP+WS), rooms.js (salas/códigos), game.js (partida), enemy.js (IA)
shared/   config, rng, collision, nav, furniture, mapgen, missions, validate
client/   index.html, style.css, vendor/three, js/{main,game,world,models,textures,audio,player,net,ui}.js
tests/    pruebas automáticas (npm test)
```

## Cómo se juega (inspirado en Doors)
- Partida corta: 3-6 objetivos (llaves, fusible/electricidad, código, palanca…) y escapar por la puerta principal. Los objetivos indican la habitación exacta.
- Dificultad única, media-alta: el enemigo (El Botones) patrulla, oye correr y te persigue más rápido de lo que aguantas corriendo (Shift gasta stamina).
- Escóndete en los armarios para que te pierda. Cuando te ve: las luces parpadean, chillido, sacudida de cámara y música de persecución. Al atraparte: jumpscare a pantalla completa.
- Aviso de cercanía: las luces parpadean cuando el enemigo está cerca. Se muestra el número de habitación actual.
- Más jugadores → enemigo algo más peligroso y una misión extra.

## Modos de captura (anfitrión)
Incapacitado/rescatable (por defecto, mantén E para reanimar), eliminado, o derrota de equipo. En solitario, ser capturado es derrota.

## Limitaciones conocidas
- Un solo piso por hotel, pequeño (~25 habitaciones; ascensor decorativo en el vestíbulo).
- Sin reconexión a una partida tras perder la conexión; el inventario es compartido por el equipo.
- El enemigo puede reubicarse lejos de los jugadores (nunca a la vista) si pierde demasiado el contacto.
- Probado con bots/red real en Node y con Chromium headless (render, lobby y 2 clientes); no probado con mandos/móviles ni con pantallas táctiles.
- Variable `HN_TEST_NOENEMY` solo para pruebas.

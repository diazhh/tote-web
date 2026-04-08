/**
 * Mapa de slots fijos para el proveedor Virtuales.
 *
 * Cada slot ID es un número entero que el proveedor envía en el campo `drawSlotId`.
 * Internamente mapeamos: slotId → { gameId, drawTime }
 * Luego resolvemos el Draw del día con: gameId + drawDate (hoy) + drawTime.
 *
 * Estructura:
 *   IDs  1–12: LOTOANIMALITO    (08:00 a 19:00)
 *   IDs 13–24: LOTTOPANTERA     (08:00 a 19:00)
 *   IDs 25–36: TRIPLE PANTERA   (08:00 a 19:00)
 *   IDs 37–48: TERMINAL PANTERA (08:00 a 19:00)
 */

const GAMES = [
  { gameId: 'd953f80c-4335-4bc9-9f78-9b56193286fe', name: 'LOTOANIMALITO' },
  { gameId: '61580ccf-5a2d-4d10-877e-4883515135e4', name: 'LOTTOPANTERA' },
  { gameId: '69efc4d7-52cb-41a6-951d-be299590f393', name: 'TRIPLE PANTERA' },
  { gameId: '741ef8e9-129b-446b-abad-d00f68323f1c', name: 'TERMINAL PANTERA' },
];

const HOURS = [
  '08:00:00', '09:00:00', '10:00:00', '11:00:00', '12:00:00', '13:00:00',
  '14:00:00', '15:00:00', '16:00:00', '17:00:00', '18:00:00', '19:00:00',
];

// Generar mapa: { 1: { gameId, drawTime, gameName }, 2: {...}, ... 48: {...} }
const SLOTS = {};
let id = 1;
for (const game of GAMES) {
  for (const hour of HOURS) {
    SLOTS[id] = {
      gameId: game.gameId,
      gameName: game.name,
      drawTime: hour,
    };
    id++;
  }
}

export default SLOTS;

import { addDays } from 'date-fns';

/**
 * Algoritmo de Meeus para calcular el Domingo de Pascua.
 */
function getEasterSunday(year) {
  const a = year % 19, b = Math.floor(year / 100), c = year % 100;
  const d = Math.floor(b / 4), e = b % 4, f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3), h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4), k = c % 4, l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(year, month - 1, day);
}

function isSameDay(a, b) {
  return a.getDate() === b.getDate() && a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear();
}

/**
 * Devuelve la capa a aplicar para LOTOANIMALITO en la fecha dada.
 * @param {Date} date
 * @returns {{ type: 'overlay'|'fondo', file: string } | null}
 */
export function getCapaForDate(date) {
  const y = date.getFullYear(), m = date.getMonth(), d = date.getDate();
  const easter = getEasterSunday(y);

  // Halloween (31 Oct)
  if (m === 9 && d === 31) return { type: 'fondo', file: 'capa_halloween' };

  // Navidad (1-25 Dic)
  if (m === 11 && d >= 1 && d <= 25) return { type: 'fondo', file: 'capa_navidad' };

  // Semana Santa: Jueves y Viernes Santo (-3 y -2 dias antes de Pascua)
  const juevesSanto = addDays(easter, -3);
  const viernesSanto = addDays(easter, -2);
  if (isSameDay(date, juevesSanto) || isSameDay(date, viernesSanto))
    return { type: 'fondo', file: 'capa_semanasanta' };

  // Carnaval: Lunes y Martes (-48 y -47 dias antes de Pascua)
  const lunesCarnaval = addDays(easter, -48);
  const martesCarnaval = addDays(easter, -47);
  if (isSameDay(date, lunesCarnaval) || isSameDay(date, martesCarnaval))
    return { type: 'overlay', file: 'capa_carnaval' };

  // Efemerides venezolanas fijas [mes0indexed, dia]
  const efemerides = [
    [0, 1],   // Ano Nuevo
    [3, 19],  // 19 de Abril
    [4, 1],   // Dia del Trabajador
    [5, 24],  // Batalla de Carabobo
    [6, 5],   // Dia de la Independencia
    [6, 24],  // Natalicio de Bolivar
    [9, 12],  // Dia de la Resistencia Indigena
    [11, 31], // Fin de Ano
  ];
  if (efemerides.some(([em, ed]) => m === em && d === ed))
    return { type: 'overlay', file: 'capa_efemerides' };

  return null;
}

/**
 * Verifica si la fecha es Semana Santa (para LOTTOPANTERA piramide1).
 */
export function isSemanaSanta(date) {
  const easter = getEasterSunday(date.getFullYear());
  const juevesSanto = addDays(easter, -3);
  const viernesSanto = addDays(easter, -2);
  return isSameDay(date, juevesSanto) || isSameDay(date, viernesSanto);
}

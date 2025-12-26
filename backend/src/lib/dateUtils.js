/**
 * Utilidades para manejo de fechas - ZONA HORARIA VENEZUELA (America/Caracas, UTC-4)
 * Todas las fechas/horas se manejan en hora de Venezuela
 */

import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

const VENEZUELA_TIMEZONE = 'America/Caracas';

/**
 * Convierte un string o Date a objeto Date
 * @param {string|Date} date - Fecha en formato ISO string o Date object
 * @returns {Date} Objeto Date
 */
function toDate(date) {
  if (!date) return null;
  return typeof date === 'string' ? parseISO(date) : date;
}

/**
 * Obtiene la fecha actual en Venezuela como string YYYY-MM-DD
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
export function getVenezuelaDateString() {
  const now = new Date();
  return now.toLocaleDateString('en-CA', {
    timeZone: VENEZUELA_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
}

/**
 * Obtiene la hora actual en Venezuela como string HH:MM:SS
 * @returns {string} Hora en formato HH:MM:SS
 */
export function getVenezuelaTimeString() {
  const now = new Date();
  return now.toLocaleTimeString('es-VE', {
    timeZone: VENEZUELA_TIMEZONE,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit'
  });
}

/**
 * Obtiene la fecha de Venezuela como objeto Date UTC (para guardar en DB)
 * La fecha se guarda como UTC pero representa la fecha de Venezuela
 * @returns {Date} Fecha como Date UTC
 */
export function getVenezuelaDateAsUTC() {
  const dateStr = getVenezuelaDateString();
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Convierte un string de fecha YYYY-MM-DD a Date UTC (para queries de DB)
 * @param {string} dateStr - Fecha en formato YYYY-MM-DD
 * @returns {Date} Fecha como Date UTC
 */
export function dateStringToUTC(dateStr) {
  const [year, month, day] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day, 0, 0, 0, 0));
}

/**
 * Obtiene el día de la semana en Venezuela (1=Lunes, 7=Domingo)
 * @returns {number} Día de la semana
 */
export function getVenezuelaDayOfWeek() {
  const dateStr = getVenezuelaDateString();
  const [year, month, day] = dateStr.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  const jsDay = date.getDay();
  return jsDay === 0 ? 7 : jsDay;
}

/**
 * Compara si una hora (HH:MM:SS) es menor o igual a otra
 * @param {string} time1 - Primera hora
 * @param {string} time2 - Segunda hora
 * @returns {boolean} true si time1 <= time2
 */
export function isTimeLessThanOrEqual(time1, time2) {
  return time1 <= time2;
}

/**
 * Suma minutos a una hora y retorna el nuevo string HH:MM:SS
 * @param {string} timeStr - Hora en formato HH:MM:SS
 * @param {number} minutes - Minutos a sumar
 * @returns {string} Nueva hora en formato HH:MM:SS
 */
export function addMinutesToTime(timeStr, minutes) {
  const [hours, mins, secs = 0] = timeStr.split(':').map(Number);
  const totalMinutes = hours * 60 + mins + minutes;
  const newHours = Math.floor(totalMinutes / 60) % 24;
  const newMins = totalMinutes % 60;
  return `${newHours.toString().padStart(2, '0')}:${newMins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Formatea una fecha a string
 * @param {string|Date} date - Fecha en formato ISO string o Date object
 * @param {string} formatStr - Formato de salida (por defecto: 'dd/MM/yyyy HH:mm')
 * @returns {string} Fecha formateada
 */
export function formatDate(date, formatStr = 'dd/MM/yyyy HH:mm') {
  if (!date) return '-';
  const dateObj = toDate(date);
  return format(dateObj, formatStr, { locale: es });
}

/**
 * Formatea solo la fecha (sin hora)
 * @param {string|Date} date - Fecha en formato ISO string o Date object
 * @returns {string} Fecha formateada (dd/MM/yyyy)
 */
export function formatDateOnly(date) {
  return formatDate(date, 'dd/MM/yyyy');
}

/**
 * Formatea solo la hora
 * @param {string|Date} date - Fecha en formato ISO string o Date object
 * @returns {string} Hora formateada (HH:mm)
 */
export function formatTimeOnly(date) {
  return formatDate(date, 'HH:mm');
}

/**
 * Formatea fecha y hora completa
 * @param {string|Date} date - Fecha en formato ISO string o Date object
 * @returns {string} Fecha y hora formateada (dd/MM/yyyy HH:mm:ss)
 */
export function formatDateTime(date) {
  return formatDate(date, 'dd/MM/yyyy HH:mm:ss');
}

/**
 * Obtiene la fecha actual
 * @returns {Date} Fecha actual
 */
export function now() {
  return new Date();
}

/**
 * Obtiene la fecha de hoy (sin hora)
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
export function today() {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * Crea una fecha a partir de componentes de fecha/hora
 * @param {number} year - Año
 * @param {number} month - Mes (1-12, no 0-11)
 * @param {number} day - Día
 * @param {number} hour - Hora (0-23)
 * @param {number} minute - Minuto (0-59)
 * @param {number} second - Segundo (0-59)
 * @returns {Date} Fecha creada
 */
export function createDate(year, month, day, hour = 0, minute = 0, second = 0) {
  return new Date(year, month - 1, day, hour, minute, second);
}

/**
 * Convierte un string de hora (HH:MM:SS o HH:MM) a una fecha
 * para el día especificado
 * @param {Date} baseDate - Fecha base
 * @param {string} timeString - String de hora en formato "HH:MM:SS" o "HH:MM"
 * @returns {Date} Fecha con la hora especificada
 */
export function timeStringToDate(baseDate, timeString) {
  const [hours, minutes, seconds = 0] = timeString.split(':').map(Number);
  const date = toDate(baseDate);
  
  return createDate(
    date.getFullYear(),
    date.getMonth() + 1,
    date.getDate(),
    hours,
    minutes,
    seconds
  );
}

/**
 * Obtiene el día de la semana
 * @param {string|Date} date - Fecha
 * @returns {number} Día de la semana (1=Lunes, 7=Domingo)
 */
export function getDayOfWeek(date) {
  const dateObj = toDate(date);
  const day = dateObj.getDay();
  return day === 0 ? 7 : day;
}

/**
 * Verifica si una fecha está en el pasado
 * @param {string|Date} date - Fecha a verificar
 * @returns {boolean} True si la fecha es pasada
 */
export function isPast(date) {
  if (!date) return false;
  return toDate(date) < new Date();
}

/**
 * Verifica si una fecha está en el futuro
 * @param {string|Date} date - Fecha a verificar
 * @returns {boolean} True si la fecha es futura
 */
export function isFuture(date) {
  if (!date) return false;
  return toDate(date) > new Date();
}

/**
 * Verifica si una fecha es hoy
 * @param {string|Date} date - Fecha a verificar
 * @returns {boolean} True si la fecha es hoy
 */
export function isToday(date) {
  if (!date) return false;
  const dateObj = toDate(date);
  const todayDate = new Date();
  return format(dateObj, 'yyyy-MM-dd') === format(todayDate, 'yyyy-MM-dd');
}

/**
 * Obtiene el inicio del día (00:00:00)
 * @param {string|Date} date - Fecha
 * @returns {Date} Inicio del día
 */
export function startOfDayDate(date) {
  const dateObj = toDate(date);
  return startOfDay(dateObj);
}

/**
 * Obtiene el fin del día (23:59:59.999)
 * @param {string|Date} date - Fecha
 * @returns {Date} Fin del día
 */
export function endOfDayDate(date) {
  const dateObj = toDate(date);
  return endOfDay(dateObj);
}

// Mantener compatibilidad con nombres antiguos (deprecated)
export const formatToCaracasTime = formatDate;
export const formatCaracasDate = formatDateOnly;
export const formatCaracasTime = formatTimeOnly;
export const formatCaracasDateTime = formatDateTime;
export const nowInCaracas = now;
export const todayInCaracas = today;
export const createCaracasDate = createDate;
export const timeStringToCaracasDate = timeStringToDate;
export const getDayOfWeekInCaracas = getDayOfWeek;
export const startOfDayInCaracas = startOfDayDate;
export const endOfDayInCaracas = endOfDayDate;

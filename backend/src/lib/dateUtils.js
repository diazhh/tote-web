/**
 * Utilidades para manejo de fechas - SIN conversiones de zona horaria
 * Todas las fechas se manejan como fechas planas sin conversiones
 */

import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { es } from 'date-fns/locale';

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

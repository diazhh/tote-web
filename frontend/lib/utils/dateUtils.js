/**
 * Utilidades para manejo de fechas con zona horaria de Caracas
 * Todas las fechas en la BD están en UTC y deben mostrarse en hora de Caracas (UTC-4)
 */

import { format, parseISO } from 'date-fns';
import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { es } from 'date-fns/locale';

// Zona horaria de Caracas, Venezuela
export const CARACAS_TIMEZONE = 'America/Caracas';

/**
 * Convierte una fecha UTC a la zona horaria de Caracas
 * @param {string|Date} date - Fecha en formato ISO string o Date object
 * @returns {Date} Fecha convertida a zona horaria de Caracas
 */
export function toCaracasTime(date) {
  if (!date) return null;
  const dateObj = typeof date === 'string' ? parseISO(date) : date;
  return toZonedTime(dateObj, CARACAS_TIMEZONE);
}

/**
 * Convierte una fecha de Caracas a UTC
 * @param {Date} date - Fecha en zona horaria de Caracas
 * @returns {Date} Fecha convertida a UTC
 */
export function toUTC(date) {
  if (!date) return null;
  return fromZonedTime(date, CARACAS_TIMEZONE);
}

/**
 * Formatea una fecha UTC a string en zona horaria de Caracas
 * @param {string|Date} date - Fecha en formato ISO string o Date object
 * @param {string} formatStr - Formato de salida (por defecto: 'dd/MM/yyyy HH:mm')
 * @returns {string} Fecha formateada en zona horaria de Caracas
 */
export function formatToCaracasTime(date, formatStr = 'dd/MM/yyyy HH:mm') {
  if (!date) return '-';
  const zonedDate = toCaracasTime(date);
  return format(zonedDate, formatStr, { locale: es });
}

/**
 * Formatea solo la fecha (sin hora) en zona horaria de Caracas
 * @param {string|Date} date - Fecha en formato ISO string o Date object
 * @returns {string} Fecha formateada (dd/MM/yyyy)
 */
export function formatCaracasDate(date) {
  return formatToCaracasTime(date, 'dd/MM/yyyy');
}

/**
 * Formatea solo la hora en zona horaria de Caracas
 * @param {string|Date} date - Fecha en formato ISO string o Date object
 * @returns {string} Hora formateada (HH:mm)
 */
export function formatCaracasTime(date) {
  return formatToCaracasTime(date, 'HH:mm');
}

/**
 * Formatea fecha y hora completa en zona horaria de Caracas
 * @param {string|Date} date - Fecha en formato ISO string o Date object
 * @returns {string} Fecha y hora formateada (dd/MM/yyyy HH:mm:ss)
 */
export function formatCaracasDateTime(date) {
  return formatToCaracasTime(date, 'dd/MM/yyyy HH:mm:ss');
}

/**
 * Formatea fecha en formato largo en zona horaria de Caracas
 * @param {string|Date} date - Fecha en formato ISO string o Date object
 * @returns {string} Fecha formateada (ej: "Lunes, 4 de octubre de 2025")
 */
export function formatCaracasDateLong(date) {
  return formatToCaracasTime(date, "EEEE, d 'de' MMMM 'de' yyyy");
}

/**
 * Obtiene la fecha actual en zona horaria de Caracas
 * @returns {Date} Fecha actual en zona horaria de Caracas
 */
export function nowInCaracas() {
  return toCaracasTime(new Date());
}

/**
 * Obtiene la fecha de hoy (sin hora) en zona horaria de Caracas
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
export function todayInCaracas() {
  const now = nowInCaracas();
  return format(now, 'yyyy-MM-dd');
}

/**
 * Crea una fecha en zona horaria de Caracas y la convierte a UTC
 * @param {number} year - Año
 * @param {number} month - Mes (1-12)
 * @param {number} day - Día
 * @param {number} hour - Hora (0-23)
 * @param {number} minute - Minuto (0-59)
 * @param {number} second - Segundo (0-59)
 * @returns {Date} Fecha en UTC
 */
export function createCaracasDate(year, month, day, hour = 0, minute = 0, second = 0) {
  // Crear fecha en zona horaria de Caracas
  const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}:${String(second).padStart(2, '0')}`;
  
  // Convertir a UTC
  return fromZonedTime(dateStr, CARACAS_TIMEZONE);
}

/**
 * Verifica si una fecha está en el pasado (en zona horaria de Caracas)
 * @param {string|Date} date - Fecha a verificar
 * @returns {boolean} True si la fecha es pasada
 */
export function isPast(date) {
  if (!date) return false;
  const zonedDate = toCaracasTime(date);
  const now = nowInCaracas();
  return zonedDate < now;
}

/**
 * Verifica si una fecha está en el futuro (en zona horaria de Caracas)
 * @param {string|Date} date - Fecha a verificar
 * @returns {boolean} True si la fecha es futura
 */
export function isFuture(date) {
  if (!date) return false;
  const zonedDate = toCaracasTime(date);
  const now = nowInCaracas();
  return zonedDate > now;
}

/**
 * Verifica si una fecha es hoy (en zona horaria de Caracas)
 * @param {string|Date} date - Fecha a verificar
 * @returns {boolean} True si la fecha es hoy
 */
export function isToday(date) {
  if (!date) return false;
  const zonedDate = toCaracasTime(date);
  const today = nowInCaracas();
  return format(zonedDate, 'yyyy-MM-dd') === format(today, 'yyyy-MM-dd');
}

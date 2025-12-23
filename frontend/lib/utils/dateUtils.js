/**
 * Utilidades para manejo de fechas - SIN conversiones de zona horaria
 * Todas las fechas se manejan como fechas planas sin conversiones
 */

import { format, parseISO } from 'date-fns';
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
export function formatToCaracasTime(date, formatStr = 'dd/MM/yyyy HH:mm') {
  if (!date) return '-';
  const dateObj = toDate(date);
  return format(dateObj, formatStr, { locale: es });
}

/**
 * Formatea solo la fecha (sin hora)
 * @param {string|Date} date - Fecha en formato ISO string o Date object
 * @returns {string} Fecha formateada (dd/MM/yyyy)
 */
export function formatCaracasDate(date) {
  return formatToCaracasTime(date, 'dd/MM/yyyy');
}

/**
 * Formatea solo la hora
 * @param {string|Date} date - Fecha en formato ISO string o Date object
 * @returns {string} Hora formateada (HH:mm)
 */
export function formatCaracasTime(date) {
  return formatToCaracasTime(date, 'HH:mm');
}

/**
 * Formatea fecha y hora completa
 * @param {string|Date} date - Fecha en formato ISO string o Date object
 * @returns {string} Fecha y hora formateada (dd/MM/yyyy HH:mm:ss)
 */
export function formatCaracasDateTime(date) {
  return formatToCaracasTime(date, 'dd/MM/yyyy HH:mm:ss');
}

/**
 * Formatea fecha en formato largo
 * @param {string|Date} date - Fecha en formato ISO string o Date object
 * @returns {string} Fecha formateada (ej: "Lunes, 4 de octubre de 2025")
 */
export function formatCaracasDateLong(date) {
  return formatToCaracasTime(date, "EEEE, d 'de' MMMM 'de' yyyy");
}

/**
 * Obtiene la fecha actual
 * @returns {Date} Fecha actual
 */
export function nowInCaracas() {
  return new Date();
}

/**
 * Obtiene la fecha de hoy (sin hora)
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
export function todayInCaracas() {
  return format(new Date(), 'yyyy-MM-dd');
}

/**
 * Crea una fecha a partir de componentes de fecha/hora
 * @param {number} year - Año
 * @param {number} month - Mes (1-12)
 * @param {number} day - Día
 * @param {number} hour - Hora (0-23)
 * @param {number} minute - Minuto (0-59)
 * @param {number} second - Segundo (0-59)
 * @returns {Date} Fecha creada
 */
export function createCaracasDate(year, month, day, hour = 0, minute = 0, second = 0) {
  return new Date(year, month - 1, day, hour, minute, second);
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
 * Formatea fecha y hora en formato AM/PM
 * @param {string|Date} date - Fecha en formato ISO string o Date object
 * @returns {string} Fecha y hora formateada (dd/MM/yyyy hh:mm a)
 */
export function formatDateTimeAMPM(date) {
  return formatToCaracasTime(date, 'dd/MM/yyyy hh:mm a');
}

/**
 * Extrae solo la hora de un string de fecha formateado (yyyy-MM-dd HH:mm:ss)
 * @param {string} dateString - String de fecha en formato 'yyyy-MM-dd HH:mm:ss'
 * @returns {string} Hora en formato HH:mm
 */
export function extractTimeFromCaracasString(dateString) {
  if (!dateString) return '';
  const parts = dateString.split(' ');
  if (parts.length >= 2) {
    const timeParts = parts[1].split(':');
    return `${timeParts[0]}:${timeParts[1]}`;
  }
  return '';
}

/**
 * Extrae solo la fecha de un string de fecha formateado (yyyy-MM-dd HH:mm:ss)
 * @param {string} dateString - String de fecha en formato 'yyyy-MM-dd HH:mm:ss'
 * @returns {string} Fecha en formato dd/MM/yyyy
 */
export function extractDateFromCaracasString(dateString) {
  if (!dateString) return '';
  const parts = dateString.split(' ');
  if (parts.length >= 1) {
    const dateParts = parts[0].split('-');
    return `${dateParts[2]}/${dateParts[1]}/${dateParts[0]}`;
  }
  return '';
}

/**
 * Utilidades para manejo de fechas - ZONA HORARIA VENEZUELA (America/Caracas, UTC-4)
 * Todas las fechas/horas se manejan en hora de Venezuela
 */

import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale';

const VENEZUELA_TIMEZONE = 'America/Caracas';

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
 * Formatea un drawTime (HH:MM o HH:MM:SS) a formato 12h AM/PM
 * @param {string} timeStr - Hora en formato HH:MM o HH:MM:SS
 * @returns {string} Hora formateada (ej: "8:00 AM")
 */
export function formatDrawTimeToAMPM(timeStr) {
  if (!timeStr) return '-';
  try {
    const [hoursStr, minutesStr] = timeStr.split(':');
    const hours = parseInt(hoursStr, 10);
    const minutes = minutesStr || '00';
    
    if (isNaN(hours)) return '-';
    
    const ampm = hours >= 12 ? 'PM' : 'AM';
    const displayHours = hours % 12 || 12;
    
    return `${displayHours}:${minutes.substring(0, 2)} ${ampm}`;
  } catch (e) {
    return '-';
  }
}

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
 * Obtiene la fecha de hoy en Venezuela (sin hora)
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
export function todayInCaracas() {
  return getVenezuelaDateString();
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

/**
 * Construye un Date a partir de drawDate y drawTime
 * @param {Date|string} drawDate - Fecha del sorteo
 * @param {string} drawTime - Hora en formato "HH:MM:SS" o "HH:MM"
 * @returns {Date} Fecha y hora combinadas
 */
export function buildDrawDateTime(drawDate, drawTime) {
  if (!drawDate || !drawTime) return null;
  
  const date = new Date(drawDate);
  const [hours, minutes, seconds = '0'] = drawTime.split(':');
  
  date.setHours(parseInt(hours, 10), parseInt(minutes, 10), parseInt(seconds, 10), 0);
  return date;
}

/**
 * Formatea la hora de un draw (usando drawTime directamente)
 * @param {Object} draw - Objeto draw con drawTime
 * @returns {string} Hora formateada
 */
export function formatDrawTime(draw) {
  if (!draw) return '-';
  
  // Si tiene drawTime, usarlo directamente (ya está en hora Venezuela)
  if (draw.drawTime) {
    return formatDrawTimeToAMPM(draw.drawTime);
  }
  
  // Fallback a scheduledAt (legacy)
  if (draw.scheduledAt) {
    return formatCaracasTime(draw.scheduledAt);
  }
  
  return '-';
}

/**
 * Formatea la fecha de un draw (usando drawDate)
 * @param {Object} draw - Objeto draw con drawDate
 * @returns {string} Fecha formateada
 */
export function formatDrawDate(draw) {
  if (!draw) return '-';
  
  // Si tiene drawDate, usarlo
  if (draw.drawDate) {
    return formatCaracasDate(draw.drawDate);
  }
  
  // Fallback a scheduledAt (legacy)
  if (draw.scheduledAt) {
    return formatCaracasDate(draw.scheduledAt);
  }
  
  return '-';
}

/**
 * Formatea fecha y hora de un draw
 * @param {Object} draw - Objeto draw con drawDate y drawTime
 * @returns {string} Fecha y hora formateadas
 */
export function formatDrawDateTime(draw) {
  if (!draw) return '-';
  
  // Si tiene drawDate y drawTime, combinarlos
  if (draw.drawDate && draw.drawTime) {
    const dateTime = buildDrawDateTime(draw.drawDate, draw.drawTime);
    return formatCaracasDateTime(dateTime);
  }
  
  // Fallback a scheduledAt (legacy)
  if (draw.scheduledAt) {
    return formatCaracasDateTime(draw.scheduledAt);
  }
  
  return '-';
}

/**
 * Obtiene el Date completo de un draw para countdown
 * @param {Object} draw - Objeto draw con drawDate y drawTime
 * @returns {Date|null} Fecha completa o null
 */
export function getDrawDateTimeForCountdown(draw) {
  if (!draw) return null;
  
  // Si tiene drawDate y drawTime, combinarlos
  if (draw.drawDate && draw.drawTime) {
    return buildDrawDateTime(draw.drawDate, draw.drawTime);
  }
  
  // Fallback a scheduledAt (legacy)
  if (draw.scheduledAt) {
    return new Date(draw.scheduledAt);
  }
  
  return null;
}

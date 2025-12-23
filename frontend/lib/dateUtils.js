/**
 * Utilidades para manejo de fechas - SIN conversiones de zona horaria
 */

/**
 * Obtiene la fecha actual en formato YYYY-MM-DD
 * @returns {string} Fecha en formato YYYY-MM-DD
 */
export function getTodayVenezuela() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  
  return `${year}-${month}-${day}`;
}

/**
 * Formatea una fecha ISO a hora local
 * @param {string} dateStr - Fecha en formato ISO
 * @returns {string} Hora en formato HH:MM
 */
export function formatTimeVenezuela(dateStr) {
  const date = new Date(dateStr);
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Formatea una fecha ISO a fecha completa
 * @param {string} dateStr - Fecha en formato ISO
 * @returns {string} Fecha en formato DD/MM/YYYY
 */
export function formatDateVenezuela(dateStr) {
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  return `${day}/${month}/${year}`;
}

/**
 * Formatea una fecha ISO a fecha y hora
 * @param {string} dateStr - Fecha en formato ISO
 * @returns {string} Fecha y hora en formato DD/MM/YYYY HH:MM
 */
export function formatDateTimeVenezuela(dateStr) {
  const date = new Date(dateStr);
  const day = String(date.getDate()).padStart(2, '0');
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const year = date.getFullYear();
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes}`;
}

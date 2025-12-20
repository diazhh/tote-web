import { format, formatDistanceToNow } from 'date-fns';
import { es } from 'date-fns/locale';

/**
 * Format date to string
 * @param {Date|string} date - Date to format
 * @param {string} formatStr - Format string (default: 'd de MMMM, yyyy')
 * @returns {string} Formatted date
 */
export function formatDate(date, formatStr = 'dd/MM/yyyy') {
  if (!date) return '';
  // Las fechas ya vienen en hora de Caracas desde la DB (timestamp without time zone)
  // Parseamos como string para evitar conversión automática de zona horaria
  const dateStr = typeof date === 'string' ? date : date.toISOString();
  const [datePart] = dateStr.split('T');
  const [year, month, day] = datePart.split('-');
  return `${day}/${month}/${year}`;
}

/**
 * Format time to string (12-hour format with AM/PM)
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted time
 */
export function formatTime(date) {
  if (!date) return '';
  // Las horas ya vienen en hora de Caracas desde la DB (timestamp without time zone)
  // Parseamos como string para evitar conversión automática de zona horaria
  const dateStr = typeof date === 'string' ? date : date.toISOString();
  const [, timePart] = dateStr.split('T');
  const [hoursStr, minutes] = timePart.split(':');
  let hours = parseInt(hoursStr);
  
  // Convertir a formato 12 horas (sin ajuste de zona horaria)
  const period = hours >= 12 ? 'PM' : 'AM';
  const hours12 = hours % 12 || 12;
  
  return `${hours12}:${minutes} ${period}`;
}

/**
 * Format date and time to string
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted date and time
 */
export function formatDateTime(date) {
  if (!date) return '';
  return `${formatDate(date)} ${formatTime(date)}`;
}

/**
 * Format relative time
 * @param {Date|string} date - Date to format
 * @returns {string} Relative time
 */
export function formatRelativeTime(date) {
  if (!date) return '';
  return formatDistanceToNow(new Date(date), { locale: es, addSuffix: true });
}

/**
 * Format number with thousands separator
 * @param {number} num - Number to format
 * @returns {string} Formatted number
 */
export function formatNumber(num) {
  if (num === null || num === undefined) return '0';
  return new Intl.NumberFormat('es-ES').format(num);
}

/**
 * Get status color
 * @param {string} status - Status
 * @returns {string} Color class
 */
export function getStatusColor(status) {
  const colors = {
    PENDING: 'bg-gray-500',
    CLOSED: 'bg-yellow-500',
    DRAWN: 'bg-blue-500',
    PUBLISHED: 'bg-green-500',
    CANCELLED: 'bg-red-500'
  };
  return colors[status] || 'bg-gray-500';
}

/**
 * Get status label
 * @param {string} status - Status
 * @returns {string} Status label
 */
export function getStatusLabel(status) {
  const labels = {
    PENDING: 'Pendiente',
    CLOSED: 'Cerrado',
    DRAWN: 'Sorteado',
    PUBLISHED: 'Publicado',
    CANCELLED: 'Cancelado'
  };
  return labels[status] || status;
}

/**
 * Get channel icon name
 * @param {string} channel - Channel name
 * @returns {string} Icon name
 */
export function getChannelIcon(channel) {
  const icons = {
    TELEGRAM: 'Send',
    WHATSAPP: 'MessageCircle',
    FACEBOOK: 'Facebook',
    INSTAGRAM: 'Instagram',
    TIKTOK: 'Music'
  };
  return icons[channel] || 'Globe';
}

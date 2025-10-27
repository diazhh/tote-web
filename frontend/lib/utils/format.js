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
  // Convertir UTC a Venezuela (UTC-4)
  // UTC-4 significa que Venezuela está 4 horas DETRÁS de UTC
  // Por lo tanto, restamos 4 horas del timestamp UTC
  const utcDate = new Date(date);
  const venezuelaDate = new Date(utcDate.getTime() - (4 * 60 * 60 * 1000));
  return format(venezuelaDate, formatStr, { locale: es });
}

/**
 * Format time to string (12-hour format with AM/PM)
 * @param {Date|string} date - Date to format
 * @returns {string} Formatted time
 */
export function formatTime(date) {
  if (!date) return '';
  // Parsear la fecha como string y extraer la hora sin conversión de zona horaria
  const dateStr = typeof date === 'string' ? date : date.toISOString();
  const [datePart, timePart] = dateStr.split('T');
  const [hoursStr, minutes] = timePart.split(':');
  let hours = parseInt(hoursStr);
  
  // Convertir de UTC a Venezuela (UTC-4)
  hours = hours - 4;
  if (hours < 0) hours += 24;
  
  // Convertir a formato 12 horas
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

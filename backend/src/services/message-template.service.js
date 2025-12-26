import Mustache from 'mustache';
import { format, parseISO } from 'date-fns';
import { es } from 'date-fns/locale/es';

/**
 * Servicio para renderizar plantillas de mensajes con Mustache
 * Soporta variables dinámicas para sorteos
 */
class MessageTemplateService {
  /**
   * Renderizar plantilla de mensaje con datos del sorteo
   * 
   * @param {string} template - Plantilla Mustache
   * @param {object} draw - Objeto Draw con relaciones (game, winnerItem)
   * @returns {string} Mensaje renderizado
   */
  renderDrawMessage(template, draw) {
    const data = this.prepareDrawData(draw);
    return Mustache.render(template, data);
  }

  /**
   * Preparar datos del sorteo para la plantilla
   * 
   * Variables disponibles:
   * - gameName: Nombre del juego
   * - gameSlug: Slug del juego
   * - drawId: ID del sorteo
   * - drawDate: Fecha del sorteo (Date)
   * - drawTime: Hora del sorteo (HH:MM:SS)
   * - date: Fecha en formato legible
   * - dateShort: Fecha corta (DD/MM/YYYY)
   * - dateLong: Fecha larga (Lunes, 4 de octubre de 2025)
   * - time: Hora (HH:mm)
   * - time12: Hora formato 12h (08:00 AM)
   * - timeShort: Hora sin minutos (08h)
   * - hour: Hora (08)
   * - minute: Minuto (00)
   * - winnerNumber: Número ganador
   * - winnerName: Nombre del ganador
   * - winnerNumberPadded: Número ganador con ceros (00, 001)
   * - status: Estado del sorteo
   * - imageUrl: URL de la imagen (si existe)
   * - hasImage: true/false si tiene imagen
   * 
   * @param {object} draw - Objeto Draw
   * @returns {object} Datos para la plantilla
   */
  prepareDrawData(draw) {
    // Usar drawDate para la fecha
    const drawDateObj = draw.drawDate instanceof Date 
      ? draw.drawDate 
      : parseISO(draw.drawDate);
    
    // Datos básicos del juego
    const gameName = draw.game?.name || 'Sorteo';
    const gameSlug = draw.game?.slug || '';
    
    // Datos del ganador
    const winnerNumber = draw.winnerItem?.number || 'N/A';
    const winnerName = draw.winnerItem?.name || 'N/A';
    
    // Formatear número con padding según tipo de juego
    let winnerNumberPadded = winnerNumber;
    if (draw.game?.type === 'ANIMALITOS') {
      winnerNumberPadded = winnerNumber.padStart(2, '0');
    } else if (draw.game?.type === 'TRIPLE') {
      winnerNumberPadded = winnerNumber.padStart(3, '0');
    }
    
    // Formatos de fecha
    const date = format(drawDateObj, "PPP", { locale: es }); // 4 de octubre de 2025
    const dateShort = format(drawDateObj, "dd/MM/yyyy"); // 04/10/2025
    const dateLong = format(drawDateObj, "PPPP", { locale: es }); // Lunes, 4 de octubre de 2025
    
    // Formatos de hora - usar drawTime directamente (ya está en hora Venezuela)
    const [hours, mins] = (draw.drawTime || '00:00:00').split(':');
    const hourNum = parseInt(hours, 10);
    const time = `${hours}:${mins}`; // 08:00
    const ampm = hourNum >= 12 ? 'PM' : 'AM';
    const displayHour = hourNum % 12 || 12;
    const time12 = `${displayHour.toString().padStart(2, '0')}:${mins} ${ampm}`; // 08:00 AM
    const timeShort = `${hours}h`; // 08h
    const hour = hours; // 08
    const minute = mins; // 00
    
    // Día de la semana
    const dayOfWeek = format(drawDateObj, "EEEE", { locale: es }); // Lunes
    const dayOfWeekShort = format(drawDateObj, "EEE", { locale: es }); // Lun
    
    return {
      // Juego
      gameName,
      gameSlug,
      gameType: draw.game?.type || '',
      
      // Sorteo
      drawId: draw.id,
      drawDate: draw.drawDate,
      drawTime: draw.drawTime,
      status: draw.status,
      
      // Fechas
      date,
      dateShort,
      dateLong,
      dayOfWeek,
      dayOfWeekShort,
      
      // Horas
      time,
      time12,
      timeShort,
      hour,
      minute,
      
      // Ganador
      winnerNumber,
      winnerName,
      winnerNumberPadded,
      
      // Imagen
      imageUrl: draw.imageUrl || '',
      hasImage: !!draw.imageUrl,
      
      // Helpers para emojis comunes
      emoji: {
        game: '🎰',
        time: '⏰',
        result: '🎯',
        winner: '🏆',
        star: '✨',
        fire: '🔥',
        trophy: '🏆',
        money: '💰',
        calendar: '📅',
        clock: '🕐'
      }
    };
  }

  /**
   * Validar plantilla Mustache
   * 
   * @param {string} template - Plantilla a validar
   * @returns {object} { valid: boolean, error?: string }
   */
  validateTemplate(template) {
    try {
      // Intentar parsear la plantilla
      Mustache.parse(template);
      
      // Intentar renderizar con datos de prueba
      const testData = this.prepareDrawData({
        id: 'test-id',
        drawDate: new Date().toISOString(),
        drawTime: '08:00:00',
        status: 'DRAWN',
        game: {
          name: 'TEST GAME',
          slug: 'test-game',
          type: 'ANIMALITOS'
        },
        winnerItem: {
          number: '01',
          name: 'TEST WINNER'
        },
        imageUrl: 'https://example.com/image.jpg'
      });
      
      Mustache.render(template, testData);
      
      return { valid: true };
    } catch (error) {
      return {
        valid: false,
        error: error.message
      };
    }
  }

  /**
   * Obtener plantilla por defecto según tipo de canal
   * 
   * @param {string} channelType - WHATSAPP, TELEGRAM, etc.
   * @returns {string} Plantilla por defecto
   */
  getDefaultTemplate(channelType) {
    const templates = {
      WHATSAPP: `{{emoji.game}} *{{gameName}}*

{{emoji.time}} Hora: {{time}}
{{emoji.result}} Resultado: *{{winnerNumberPadded}}*
{{emoji.winner}} {{winnerName}}

{{emoji.star}} ¡Buena suerte en el próximo sorteo!`,

      TELEGRAM: `🎰 <b>{{gameName}}</b>

⏰ Hora: {{time}}
🎯 Resultado: <b>{{winnerNumberPadded}}</b>
🏆 {{winnerName}}

✨ ¡Buena suerte en el próximo sorteo!`,

      FACEBOOK: `🎰 {{gameName}}

⏰ Hora: {{time}}
🎯 Resultado: {{winnerNumberPadded}}
🏆 {{winnerName}}

✨ ¡Buena suerte en el próximo sorteo!`,

      INSTAGRAM: `{{emoji.game}} {{gameName}}
{{emoji.time}} {{time}}
{{emoji.result}} {{winnerNumberPadded}}
{{emoji.winner}} {{winnerName}}`,

      TIKTOK: `🎰 {{gameName}} - {{time}}
🎯 Ganador: {{winnerNumberPadded}} - {{winnerName}}
✨ #loteria #sorteo`
    };

    return templates[channelType] || templates.WHATSAPP;
  }

  /**
   * Obtener lista de variables disponibles
   * 
   * @returns {array} Lista de variables con descripción
   */
  getAvailableVariables() {
    return [
      { name: 'gameName', description: 'Nombre del juego', example: 'LOTOANIMALITO' },
      { name: 'gameSlug', description: 'Slug del juego', example: 'lotoanimalito' },
      { name: 'gameType', description: 'Tipo de juego', example: 'ANIMALITOS' },
      
      { name: 'drawId', description: 'ID del sorteo', example: 'abc123...' },
      { name: 'status', description: 'Estado del sorteo', example: 'DRAWN' },
      
      { name: 'date', description: 'Fecha completa', example: '4 de octubre de 2025' },
      { name: 'dateShort', description: 'Fecha corta', example: '04/10/2025' },
      { name: 'dateLong', description: 'Fecha larga', example: 'Lunes, 4 de octubre de 2025' },
      { name: 'dayOfWeek', description: 'Día de la semana', example: 'Lunes' },
      { name: 'dayOfWeekShort', description: 'Día corto', example: 'Lun' },
      
      { name: 'time', description: 'Hora 24h', example: '08:00' },
      { name: 'time12', description: 'Hora 12h', example: '08:00 AM' },
      { name: 'timeShort', description: 'Hora sin minutos', example: '08h' },
      { name: 'hour', description: 'Hora', example: '08' },
      { name: 'minute', description: 'Minuto', example: '00' },
      
      { name: 'winnerNumber', description: 'Número ganador', example: '1' },
      { name: 'winnerName', description: 'Nombre del ganador', example: 'BALLENA' },
      { name: 'winnerNumberPadded', description: 'Número con ceros', example: '01' },
      
      { name: 'imageUrl', description: 'URL de la imagen', example: 'https://...' },
      { name: 'hasImage', description: 'Tiene imagen', example: 'true' },
      
      { name: 'emoji.game', description: 'Emoji de juego', example: '🎰' },
      { name: 'emoji.time', description: 'Emoji de tiempo', example: '⏰' },
      { name: 'emoji.result', description: 'Emoji de resultado', example: '🎯' },
      { name: 'emoji.winner', description: 'Emoji de ganador', example: '🏆' },
      { name: 'emoji.star', description: 'Emoji de estrella', example: '✨' },
      { name: 'emoji.fire', description: 'Emoji de fuego', example: '🔥' },
      { name: 'emoji.trophy', description: 'Emoji de trofeo', example: '🏆' },
      { name: 'emoji.money', description: 'Emoji de dinero', example: '💰' },
      { name: 'emoji.calendar', description: 'Emoji de calendario', example: '📅' },
      { name: 'emoji.clock', description: 'Emoji de reloj', example: '🕐' }
    ];
  }
}

export default new MessageTemplateService();

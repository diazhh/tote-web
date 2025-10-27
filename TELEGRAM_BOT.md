# Bot de Telegram - Sistema Totalizador de Loterías

## Visión General

Bot de Telegram para administración y notificaciones en tiempo real del sistema de sorteos.

---

## Funcionalidades

### 1. Para Administradores

#### Comandos Disponibles

##### `/start`
Iniciar el bot y registrar usuario

**Respuesta**:
```
👋 Bienvenido al Bot de Administración

Estás registrado como: @username
Rol: ADMIN

Comandos disponibles:
/sorteos - Ver sorteos de hoy
/proximo - Próximo sorteo
/cambiar - Cambiar ganador
/info - Info de sorteo
/pausar - Pausar sorteos
/help - Ayuda
```

---

##### `/sorteos`
Listar sorteos del día

**Respuesta**:
```
📅 SORTEOS DE HOY - 01/10/2025

✅ COMPLETADOS:
🎲 Triple A - 08:00
   Ganador: 123 - Mariposa

🎲 Ruleta Caracas - 09:00
   Ganador: 15 - Niño

🔒 CERRADOS (esperando):
🎲 Triple A - 10:00
   Preselección: 456 - Gato
   Falta: 2 minutos

⏱ PENDIENTES:
🎲 Triple A - 11:00, 12:00, 13:00...
🎲 Ruleta Caracas - 11:30, 12:30...

Total: 25 sorteos
```

---

##### `/proximo`
Ver próximo sorteo

**Respuesta**:
```
⏱ PRÓXIMO SORTEO

🎲 Triple A
⏰ 10:00 AM (en 2 minutos)
🔒 Estado: CERRADO

🎯 Preselección: 456 - Gato

Para cambiar:
/cambiar abc-123-def 789
```

---

##### `/cambiar <drawId> <numero>`
Cambiar número ganador preseleccionado

**Uso**: `/cambiar abc-123 456`

**Validaciones**:
- Sorteo debe existir
- Sorteo debe estar en estado CLOSED
- Debe faltar tiempo antes del sorteo (no ejecutado aún)
- Número debe existir y estar activo

**Respuesta Éxito**:
```
✅ GANADOR CAMBIADO

🎲 Triple A - 10:00
📝 Anterior: 123 - Mariposa
✨ Nuevo: 456 - Gato
👤 Cambiado por: @admin
⏰ Faltan 2 minutos para el sorteo
```

**Respuesta Error**:
```
❌ ERROR

El sorteo ya fue ejecutado.
No es posible cambiar el ganador.
```

---

##### `/info <drawId>`
Obtener información detallada de un sorteo

**Uso**: `/info abc-123`

**Respuesta**:
```
ℹ️ INFORMACIÓN DEL SORTEO

🎲 Juego: Triple A
⏰ Hora: 10:00 AM - 01/10/2025
📊 Estado: PUBLICADO

🏆 Ganador: 123 - Mariposa
🔒 Cerrado: 09:55 AM
🎯 Ejecutado: 10:00 AM
📤 Publicado: 10:01 AM

📢 Publicaciones:
✅ Telegram - Enviado
✅ WhatsApp - Enviado
❌ Facebook - Fallido
⏳ Instagram - Pendiente

🖼 Imagen:
https://loteria.com/images/abc-123.png
```

---

##### `/pausar <juego> <fecha_inicio> <fecha_fin> [razon]`
Pausar sorteos de un juego

**Uso**: `/pausar triple-a 15/10/2025 17/10/2025 Feriado`

**Respuesta**:
```
⏸ SORTEOS PAUSADOS

🎲 Juego: Triple A
📅 Desde: 15/10/2025
📅 Hasta: 17/10/2025
📝 Razón: Feriado

No se generarán sorteos en estas fechas.
```

---

##### `/estadisticas [juego] [dias]`
Ver estadísticas

**Uso**: `/estadisticas triple-a 30`

**Respuesta**:
```
📊 ESTADÍSTICAS - Triple A
📅 Últimos 30 días

🎯 Total sorteos: 300
✅ Completados: 298
❌ Cancelados: 2

🔝 Números más salidos:
1. 123 - Mariposa (8 veces)
2. 456 - Gato (7 veces)
3. 789 - Perro (6 veces)

📉 Números menos salidos:
1. 999 - Otro (1 vez)
2. 888 - Algo (1 vez)
```

---

##### `/help`
Mostrar ayuda

**Respuesta**:
```
📖 AYUDA - Comandos disponibles

/sorteos
  Ver todos los sorteos de hoy

/proximo
  Ver próximo sorteo y su preselección

/cambiar <drawId> <numero>
  Cambiar ganador preseleccionado
  Ejemplo: /cambiar abc-123 456

/info <drawId>
  Ver información detallada de un sorteo

/pausar <juego> <desde> <hasta> [razon]
  Pausar sorteos de un juego
  Ejemplo: /pausar triple-a 15/10/2025 17/10/2025

/estadisticas [juego] [dias]
  Ver estadísticas
  Ejemplo: /estadisticas triple-a 30

💡 Tip: También recibirás notificaciones
automáticas cuando se cierren sorteos.
```

---

### 2. Notificaciones Automáticas

#### Notificación de Cierre de Sorteo
Enviada 5 minutos antes del sorteo

```
🔒 SORTEO CERRADO

🎲 Triple A
⏰ 10:00 AM (en 5 minutos)

🎯 Preselección: 456 - Gato

Para cambiar el ganador:
/cambiar abc-123-def 789

⏱ Tienes 5 minutos para decidir
```

---

#### Notificación de Sorteo Ejecutado
Enviada cuando se ejecuta el sorteo

```
🎊 SORTEO EJECUTADO

🎲 Triple A - 10:00 AM
🏆 Ganador: 456 - Gato

📸 Imagen generada
📤 Publicando en canales...

Ver detalles: /info abc-123-def
```

---

#### Alerta de Publicación Fallida
Enviada cuando una publicación falla 3 veces

```
⚠️ ALERTA - Publicación Fallida

🎲 Triple A - 10:00 AM
📢 Canal: Facebook
❌ Error: Connection timeout
🔄 Reintentos: 3/3

Por favor revisa la configuración del canal
o republica manualmente desde la interfaz web.

Ver sorteo: /info abc-123-def
```

---

#### Alerta de Job Fallido
Enviada cuando un job crítico falla

```
🚨 ALERTA CRÍTICA - Job Fallido

📋 Job: ExecuteDrawJob
⏰ Última ejecución: 10:05 AM
❌ Error: Database connection lost

Revisa el sistema inmediatamente.
```

---

## Implementación

### Estructura del Bot

```typescript
// src/bots/TelegramBot.ts
import TelegramBot from 'node-telegram-bot-api';
import { prisma } from '../config/database';
import { logger } from '../utils/logger';

export class TelegramBotService {
  private bot: TelegramBot;
  private adminChatIds: Set<string> = new Set();
  
  constructor() {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    if (!token) {
      throw new Error('TELEGRAM_BOT_TOKEN not configured');
    }
    
    this.bot = new TelegramBot(token, { polling: true });
    this.initialize();
  }
  
  private initialize() {
    this.loadAdminChatIds();
    this.registerCommands();
    this.handleErrors();
    
    logger.info('Telegram bot initialized');
  }
  
  private async loadAdminChatIds() {
    const users = await prisma.user.findMany({
      where: {
        telegramUserId: { not: null },
        isActive: true
      }
    });
    
    users.forEach(user => {
      if (user.telegramUserId) {
        this.adminChatIds.add(user.telegramUserId);
      }
    });
  }
  
  private registerCommands() {
    this.bot.onText(/\/start/, this.handleStart.bind(this));
    this.bot.onText(/\/sorteos/, this.handleSorteos.bind(this));
    this.bot.onText(/\/proximo/, this.handleProximo.bind(this));
    this.bot.onText(/\/cambiar (.+) (.+)/, this.handleCambiar.bind(this));
    this.bot.onText(/\/info (.+)/, this.handleInfo.bind(this));
    this.bot.onText(/\/pausar (.+)/, this.handlePausar.bind(this));
    this.bot.onText(/\/estadisticas/, this.handleEstadisticas.bind(this));
    this.bot.onText(/\/help/, this.handleHelp.bind(this));
  }
  
  private async handleStart(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    const userId = msg.from?.id.toString();
    
    // Verificar si el usuario está registrado
    const user = await prisma.user.findUnique({
      where: { telegramUserId: userId }
    });
    
    if (!user) {
      await this.bot.sendMessage(
        chatId,
        '❌ No estás autorizado para usar este bot.\n\n' +
        'Contacta al administrador para obtener acceso.'
      );
      return;
    }
    
    this.adminChatIds.add(userId!);
    
    await this.bot.sendMessage(
      chatId,
      `👋 Bienvenido ${user.username}\n\n` +
      `Rol: ${user.role}\n\n` +
      `Comandos disponibles:\n` +
      `/sorteos - Ver sorteos de hoy\n` +
      `/proximo - Próximo sorteo\n` +
      `/cambiar - Cambiar ganador\n` +
      `/info - Info de sorteo\n` +
      `/help - Ayuda completa`
    );
  }
  
  private async handleSorteos(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    
    if (!this.isAuthorized(msg)) {
      await this.sendUnauthorized(chatId);
      return;
    }
    
    try {
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const tomorrow = new Date(today);
      tomorrow.setDate(tomorrow.getDate() + 1);
      
      const draws = await prisma.draw.findMany({
        where: {
          scheduledAt: {
            gte: today,
            lt: tomorrow
          }
        },
        include: {
          game: true,
          winnerItem: true,
          preselectedItem: true
        },
        orderBy: {
          scheduledAt: 'asc'
        }
      });
      
      const message = this.formatSorteosMessage(draws);
      await this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
      
    } catch (error) {
      logger.error('Error in handleSorteos:', error);
      await this.bot.sendMessage(chatId, '❌ Error al obtener sorteos');
    }
  }
  
  private async handleProximo(msg: TelegramBot.Message) {
    const chatId = msg.chat.id;
    
    if (!this.isAuthorized(msg)) {
      await this.sendUnauthorized(chatId);
      return;
    }
    
    try {
      const nextDraw = await prisma.draw.findFirst({
        where: {
          scheduledAt: { gte: new Date() },
          status: { in: ['SCHEDULED', 'CLOSED'] }
        },
        include: {
          game: true,
          preselectedItem: true
        },
        orderBy: {
          scheduledAt: 'asc'
        }
      });
      
      if (!nextDraw) {
        await this.bot.sendMessage(chatId, 'No hay sorteos próximos');
        return;
      }
      
      const message = this.formatProximoMessage(nextDraw);
      await this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
      
    } catch (error) {
      logger.error('Error in handleProximo:', error);
      await this.bot.sendMessage(chatId, '❌ Error al obtener próximo sorteo');
    }
  }
  
  private async handleCambiar(
    msg: TelegramBot.Message,
    match: RegExpExecArray | null
  ) {
    const chatId = msg.chat.id;
    
    if (!this.isAuthorized(msg)) {
      await this.sendUnauthorized(chatId);
      return;
    }
    
    if (!match) {
      await this.bot.sendMessage(
        chatId,
        '❌ Uso: /cambiar <drawId> <numero>\n\n' +
        'Ejemplo: /cambiar abc-123 456'
      );
      return;
    }
    
    const [, drawId, newNumber] = match;
    
    try {
      // Buscar sorteo
      const draw = await prisma.draw.findUnique({
        where: { id: drawId },
        include: {
          game: {
            include: {
              items: true
            }
          },
          preselectedItem: true
        }
      });
      
      if (!draw) {
        await this.bot.sendMessage(chatId, '❌ Sorteo no encontrado');
        return;
      }
      
      // Validar estado
      if (draw.status !== 'CLOSED') {
        await this.bot.sendMessage(
          chatId,
          '❌ Solo se puede cambiar el ganador de sorteos cerrados'
        );
        return;
      }
      
      // Buscar nuevo número
      const newItem = draw.game.items.find(
        item => item.number === newNumber && item.isActive
      );
      
      if (!newItem) {
        await this.bot.sendMessage(
          chatId,
          `❌ Número ${newNumber} no encontrado o no está activo`
        );
        return;
      }
      
      // Actualizar sorteo
      const updatedDraw = await prisma.draw.update({
        where: { id: drawId },
        data: {
          preselectedItemId: newItem.id
        },
        include: {
          game: true,
          preselectedItem: true
        }
      });
      
      // Registrar en audit log
      await prisma.auditLog.create({
        data: {
          userId: msg.from?.id.toString(),
          action: 'WINNER_CHANGED',
          entity: 'Draw',
          entityId: drawId,
          changes: {
            from: draw.preselectedItem?.number,
            to: newNumber,
            via: 'telegram'
          }
        }
      });
      
      const message = 
        `✅ <b>GANADOR CAMBIADO</b>\n\n` +
        `🎲 ${updatedDraw.game.name}\n` +
        `⏰ ${format(updatedDraw.scheduledAt, 'HH:mm')}\n\n` +
        `📝 Anterior: ${draw.preselectedItem?.number} - ${draw.preselectedItem?.name}\n` +
        `✨ Nuevo: ${newItem.number} - ${newItem.name}\n` +
        `👤 Por: @${msg.from?.username}`;
      
      await this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
      
      // Notificar a otros admins
      await this.notifyAdmins(message, [chatId]);
      
    } catch (error) {
      logger.error('Error in handleCambiar:', error);
      await this.bot.sendMessage(chatId, '❌ Error al cambiar ganador');
    }
  }
  
  // Métodos de notificación
  
  async notifyDrawClosing(draw: DrawWithRelations) {
    const message =
      `🔒 <b>SORTEO CERRADO</b>\n\n` +
      `🎲 ${draw.game.name}\n` +
      `⏰ ${format(draw.scheduledAt, 'HH:mm')} (en 5 minutos)\n\n` +
      `🎯 Preselección: ${draw.preselectedItem.number} - ${draw.preselectedItem.name}\n\n` +
      `Para cambiar:\n` +
      `/cambiar ${draw.id} [número]`;
    
    await this.notifyAdmins(message);
  }
  
  async notifyDrawExecuted(draw: DrawWithRelations) {
    const message =
      `🎊 <b>SORTEO EJECUTADO</b>\n\n` +
      `🎲 ${draw.game.name}\n` +
      `⏰ ${format(draw.scheduledAt, 'HH:mm')}\n` +
      `🏆 Ganador: ${draw.winnerItem.number} - ${draw.winnerItem.name}\n\n` +
      `📸 Imagen generada\n` +
      `📤 Publicando en canales...`;
    
    await this.notifyAdmins(message);
  }
  
  async notifyPublicationFailed(
    draw: DrawWithRelations,
    channel: string,
    error: string
  ) {
    const message =
      `⚠️ <b>ALERTA - Publicación Fallida</b>\n\n` +
      `🎲 ${draw.game.name} - ${format(draw.scheduledAt, 'HH:mm')}\n` +
      `📢 Canal: ${channel}\n` +
      `❌ Error: ${error}\n\n` +
      `Revisa la configuración o republica manualmente.`;
    
    await this.notifyAdmins(message);
  }
  
  async notifyAdmins(message: string, excludeChatIds: number[] = []) {
    for (const chatId of this.adminChatIds) {
      if (excludeChatIds.includes(Number(chatId))) continue;
      
      try {
        await this.bot.sendMessage(Number(chatId), message, {
          parse_mode: 'HTML'
        });
      } catch (error) {
        logger.error(`Error sending to ${chatId}:`, error);
      }
    }
  }
  
  private isAuthorized(msg: TelegramBot.Message): boolean {
    const userId = msg.from?.id.toString();
    return userId ? this.adminChatIds.has(userId) : false;
  }
  
  private async sendUnauthorized(chatId: number) {
    await this.bot.sendMessage(
      chatId,
      '❌ No estás autorizado para usar este comando'
    );
  }
  
  private handleErrors() {
    this.bot.on('polling_error', (error) => {
      logger.error('Telegram polling error:', error);
    });
  }
}

// Exportar instancia singleton
export const telegramBot = new TelegramBotService();
```

---

## Configuración

### Variables de Entorno

```env
TELEGRAM_BOT_TOKEN=123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11
TELEGRAM_ADMIN_CHAT_IDS=123456789,987654321  # Opcional, backup
```

### Crear Bot en Telegram

1. Hablar con @BotFather
2. Enviar `/newbot`
3. Dar nombre y username al bot
4. Copiar el token
5. Configurar comandos: `/setcommands`

```
sorteos - Ver sorteos de hoy
proximo - Próximo sorteo
cambiar - Cambiar ganador
info - Info de sorteo
pausar - Pausar sorteos
estadisticas - Ver estadísticas
help - Ayuda
```

---

## Seguridad

### 1. Autenticación
- Solo usuarios registrados en BD pueden usar el bot
- Verificación por `telegramUserId`

### 2. Autorización
- Comandos sensibles requieren rol ADMIN o OPERATOR
- Validación en cada comando

### 3. Rate Limiting
```typescript
private commandRateLimiter = new Map<string, number>();

private checkRateLimit(userId: string): boolean {
  const now = Date.now();
  const lastCommand = this.commandRateLimiter.get(userId);
  
  if (lastCommand && now - lastCommand < 1000) {
    return false; // Muy rápido
  }
  
  this.commandRateLimiter.set(userId, now);
  return true;
}
```

### 4. Logging
- Todos los comandos se registran en audit log
- Incluye userId, comando, timestamp

---

## Testing

```typescript
describe('TelegramBot', () => {
  it('should register user on /start', async () => {
    // Mock telegram message
    // Verify response
  });
  
  it('should reject unauthorized users', async () => {
    // Test with non-registered user
  });
  
  it('should change winner correctly', async () => {
    // Test /cambiar command
  });
});
```

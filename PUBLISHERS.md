# Sistema de Publishers - Publicación Multi-Canal

## Arquitectura

Sistema modular para publicar resultados de sorteos en múltiples canales sociales.

---

## Interface Base

```typescript
// src/publishers/IPublisher.ts
export interface IPublisher {
  type: Channel;
  
  /**
   * Publica un sorteo en el canal
   */
  publish(
    draw: DrawWithRelations,
    imageBuffer: Buffer,
    message: string
  ): Promise<PublishResult>;
  
  /**
   * Verifica la conexión y configuración del canal
   */
  test(config: ChannelConfigData): Promise<TestResult>;
}

export interface PublishResult {
  success: boolean;
  externalId?: string;  // ID del mensaje en el canal
  error?: string;
}

export interface TestResult {
  success: boolean;
  message: string;
  details?: any;
}
```

---

## 1. Telegram Publisher

```typescript
// src/publishers/TelegramPublisher.ts
import TelegramBot from 'node-telegram-bot-api';
import { IPublisher, PublishResult, TestResult } from './IPublisher';

export class TelegramPublisher implements IPublisher {
  type: Channel = 'TELEGRAM';
  private bots: Map<string, TelegramBot> = new Map();
  
  async publish(
    draw: DrawWithRelations,
    imageBuffer: Buffer,
    message: string
  ): Promise<PublishResult> {
    try {
      const config = await this.getChannelConfig('TELEGRAM');
      const bot = this.getBot(config.botToken);
      
      const result = await bot.sendPhoto(
        config.chatId,
        imageBuffer,
        {
          caption: message,
          parse_mode: 'HTML'
        }
      );
      
      return {
        success: true,
        externalId: result.message_id.toString()
      };
      
    } catch (error) {
      logger.error('Telegram publish error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  async test(config: ChannelConfigData): Promise<TestResult> {
    try {
      const bot = new TelegramBot(config.botToken, { polling: false });
      const me = await bot.getMe();
      
      // Intentar obtener info del chat
      const chat = await bot.getChat(config.chatId);
      
      return {
        success: true,
        message: `Conectado como @${me.username} al chat ${chat.title || chat.id}`,
        details: { bot: me, chat }
      };
      
    } catch (error) {
      return {
        success: false,
        message: `Error: ${error.message}`
      };
    }
  }
  
  private getBot(token: string): TelegramBot {
    if (!this.bots.has(token)) {
      this.bots.set(token, new TelegramBot(token, { polling: false }));
    }
    return this.bots.get(token)!;
  }
  
  private async getChannelConfig(type: Channel): Promise<any> {
    const config = await prisma.channelConfig.findFirst({
      where: { type, isActive: true }
    });
    
    if (!config) {
      throw new Error(`No active ${type} channel configured`);
    }
    
    return config.config;
  }
}
```

---

## 2. WhatsApp Publisher

```typescript
// src/publishers/WhatsAppPublisher.ts
import { Client, MessageMedia } from 'whatsapp-web.js';
import { IPublisher, PublishResult, TestResult } from './IPublisher';

export class WhatsAppPublisher implements IPublisher {
  type: Channel = 'WHATSAPP';
  private client: Client | null = null;
  private isReady = false;
  
  constructor() {
    this.initializeClient();
  }
  
  private initializeClient() {
    this.client = new Client({
      authStrategy: new LocalAuth({
        clientId: 'lottery-system'
      }),
      puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox']
      }
    });
    
    this.client.on('qr', (qr) => {
      logger.info('WhatsApp QR Code generated');
      // Guardar QR en BD o enviar a admin para escanear
      this.saveQRCode(qr);
    });
    
    this.client.on('ready', () => {
      logger.info('WhatsApp client ready');
      this.isReady = true;
    });
    
    this.client.on('disconnected', () => {
      logger.warn('WhatsApp client disconnected');
      this.isReady = false;
    });
    
    this.client.initialize();
  }
  
  async publish(
    draw: DrawWithRelations,
    imageBuffer: Buffer,
    message: string
  ): Promise<PublishResult> {
    try {
      if (!this.isReady || !this.client) {
        throw new Error('WhatsApp client not ready');
      }
      
      const config = await this.getChannelConfig('WHATSAPP');
      
      // Convertir buffer a base64
      const media = new MessageMedia(
        'image/png',
        imageBuffer.toString('base64'),
        `sorteo-${draw.id}.png`
      );
      
      // Enviar a grupos/listas de difusión
      for (const chatId of config.chatIds) {
        await this.client.sendMessage(chatId, media, {
          caption: message
        });
      }
      
      return {
        success: true,
        externalId: `whatsapp-${Date.now()}`
      };
      
    } catch (error) {
      logger.error('WhatsApp publish error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  async test(config: ChannelConfigData): Promise<TestResult> {
    if (!this.isReady) {
      return {
        success: false,
        message: 'Cliente no está conectado. Escanea el código QR.'
      };
    }
    
    try {
      const state = await this.client!.getState();
      
      return {
        success: true,
        message: `Cliente conectado. Estado: ${state}`,
        details: { state }
      };
      
    } catch (error) {
      return {
        success: false,
        message: `Error: ${error.message}`
      };
    }
  }
  
  private async saveQRCode(qr: string) {
    // Generar imagen del QR y guardar en BD o filesystem
    // para que admin pueda escanearlo desde la interfaz web
    const QRCode = require('qrcode');
    const qrImage = await QRCode.toDataURL(qr);
    
    await prisma.channelConfig.updateMany({
      where: { type: 'WHATSAPP' },
      data: {
        config: {
          qrCode: qrImage,
          qrGeneratedAt: new Date()
        }
      }
    });
  }
}
```

---

## 3. Facebook Publisher

```typescript
// src/publishers/FacebookPublisher.ts
import axios from 'axios';
import FormData from 'form-data';
import { IPublisher, PublishResult, TestResult } from './IPublisher';

export class FacebookPublisher implements IPublisher {
  type: Channel = 'FACEBOOK';
  private readonly apiUrl = 'https://graph.facebook.com/v18.0';
  
  async publish(
    draw: DrawWithRelations,
    imageBuffer: Buffer,
    message: string
  ): Promise<PublishResult> {
    try {
      const config = await this.getChannelConfig('FACEBOOK');
      
      // 1. Subir foto
      const photoId = await this.uploadPhoto(
        config.pageId,
        config.accessToken,
        imageBuffer
      );
      
      // 2. Publicar en página
      const response = await axios.post(
        `${this.apiUrl}/${config.pageId}/feed`,
        {
          message,
          attached_media: [{ media_fbid: photoId }]
        },
        {
          params: {
            access_token: config.accessToken
          }
        }
      );
      
      return {
        success: true,
        externalId: response.data.id
      };
      
    } catch (error) {
      logger.error('Facebook publish error:', error);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message
      };
    }
  }
  
  private async uploadPhoto(
    pageId: string,
    accessToken: string,
    imageBuffer: Buffer
  ): Promise<string> {
    const formData = new FormData();
    formData.append('source', imageBuffer, {
      filename: 'sorteo.png',
      contentType: 'image/png'
    });
    formData.append('published', 'false'); // No publicar aún
    
    const response = await axios.post(
      `${this.apiUrl}/${pageId}/photos`,
      formData,
      {
        params: {
          access_token: accessToken
        },
        headers: formData.getHeaders()
      }
    );
    
    return response.data.id;
  }
  
  async test(config: ChannelConfigData): Promise<TestResult> {
    try {
      const response = await axios.get(
        `${this.apiUrl}/${config.pageId}`,
        {
          params: {
            fields: 'id,name,access_token',
            access_token: config.accessToken
          }
        }
      );
      
      return {
        success: true,
        message: `Conectado a página: ${response.data.name}`,
        details: response.data
      };
      
    } catch (error) {
      return {
        success: false,
        message: `Error: ${error.response?.data?.error?.message || error.message}`
      };
    }
  }
}
```

---

## 4. Instagram Publisher

```typescript
// src/publishers/InstagramPublisher.ts
import axios from 'axios';
import FormData from 'form-data';
import { IPublisher, PublishResult, TestResult } from './IPublisher';

export class InstagramPublisher implements IPublisher {
  type: Channel = 'INSTAGRAM';
  private readonly apiUrl = 'https://graph.facebook.com/v18.0';
  
  async publish(
    draw: DrawWithRelations,
    imageBuffer: Buffer,
    message: string
  ): Promise<PublishResult> {
    try {
      const config = await this.getChannelConfig('INSTAGRAM');
      
      // Instagram requiere que la imagen esté en una URL pública
      // 1. Subir imagen a servidor público o S3
      const imageUrl = await this.uploadToPublicUrl(imageBuffer, draw.id);
      
      // 2. Crear contenedor de medios
      const containerId = await this.createMediaContainer(
        config.businessAccountId,
        config.accessToken,
        imageUrl,
        message
      );
      
      // 3. Publicar contenedor
      const response = await axios.post(
        `${this.apiUrl}/${config.businessAccountId}/media_publish`,
        {
          creation_id: containerId
        },
        {
          params: {
            access_token: config.accessToken
          }
        }
      );
      
      return {
        success: true,
        externalId: response.data.id
      };
      
    } catch (error) {
      logger.error('Instagram publish error:', error);
      return {
        success: false,
        error: error.response?.data?.error?.message || error.message
      };
    }
  }
  
  private async createMediaContainer(
    businessAccountId: string,
    accessToken: string,
    imageUrl: string,
    caption: string
  ): Promise<string> {
    const response = await axios.post(
      `${this.apiUrl}/${businessAccountId}/media`,
      {
        image_url: imageUrl,
        caption
      },
      {
        params: {
          access_token: accessToken
        }
      }
    );
    
    return response.data.id;
  }
  
  private async uploadToPublicUrl(
    imageBuffer: Buffer,
    drawId: string
  ): Promise<string> {
    // Opción 1: Subir a S3 y retornar URL pública
    // Opción 2: Servir desde nuestro servidor
    
    // Para este ejemplo, asumimos que tenemos un endpoint público
    const baseUrl = process.env.PUBLIC_URL || 'https://loteria.com';
    return `${baseUrl}/storage/images/draws/${drawId}.png`;
  }
  
  async test(config: ChannelConfigData): Promise<TestResult> {
    try {
      const response = await axios.get(
        `${this.apiUrl}/${config.businessAccountId}`,
        {
          params: {
            fields: 'id,username,name',
            access_token: config.accessToken
          }
        }
      );
      
      return {
        success: true,
        message: `Conectado a cuenta: @${response.data.username}`,
        details: response.data
      };
      
    } catch (error) {
      return {
        success: false,
        message: `Error: ${error.response?.data?.error?.message || error.message}`
      };
    }
  }
}
```

---

## 5. TikTok Publisher

```typescript
// src/publishers/TikTokPublisher.ts
import axios from 'axios';
import { IPublisher, PublishResult, TestResult } from './IPublisher';

export class TikTokPublisher implements IPublisher {
  type: Channel = 'TIKTOK';
  private readonly apiUrl = 'https://open-api.tiktok.com';
  
  async publish(
    draw: DrawWithRelations,
    imageBuffer: Buffer,
    message: string
  ): Promise<PublishResult> {
    try {
      // TikTok requiere video, no imagen
      // Convertir imagen a video corto (5 segundos)
      const videoBuffer = await this.imageToVideo(imageBuffer);
      
      const config = await this.getChannelConfig('TIKTOK');
      
      // 1. Iniciar upload
      const uploadInfo = await this.initUpload(config);
      
      // 2. Subir video
      await this.uploadVideo(uploadInfo.upload_url, videoBuffer);
      
      // 3. Publicar
      const response = await axios.post(
        `${this.apiUrl}/share/video/upload/`,
        {
          video_id: uploadInfo.video_id,
          description: message
        },
        {
          headers: {
            'Authorization': `Bearer ${config.accessToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return {
        success: true,
        externalId: response.data.share_id
      };
      
    } catch (error) {
      logger.error('TikTok publish error:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
  
  private async imageToVideo(imageBuffer: Buffer): Promise<Buffer> {
    // Usar ffmpeg para crear video de 5 segundos con la imagen
    const ffmpeg = require('fluent-ffmpeg');
    const path = require('path');
    const fs = require('fs');
    
    const tempImagePath = path.join('/tmp', `temp-${Date.now()}.png`);
    const tempVideoPath = path.join('/tmp', `temp-${Date.now()}.mp4`);
    
    // Guardar imagen temporal
    fs.writeFileSync(tempImagePath, imageBuffer);
    
    return new Promise((resolve, reject) => {
      ffmpeg()
        .input(tempImagePath)
        .inputOptions(['-loop 1', '-t 5'])
        .videoCodec('libx264')
        .size('1080x1920') // Vertical para TikTok
        .outputOptions(['-pix_fmt yuv420p', '-r 30'])
        .save(tempVideoPath)
        .on('end', () => {
          const videoBuffer = fs.readFileSync(tempVideoPath);
          // Limpiar archivos temporales
          fs.unlinkSync(tempImagePath);
          fs.unlinkSync(tempVideoPath);
          resolve(videoBuffer);
        })
        .on('error', reject);
    });
  }
  
  async test(config: ChannelConfigData): Promise<TestResult> {
    try {
      const response = await axios.get(
        `${this.apiUrl}/oauth/userinfo/`,
        {
          headers: {
            'Authorization': `Bearer ${config.accessToken}`
          }
        }
      );
      
      return {
        success: true,
        message: `Conectado como: ${response.data.display_name}`,
        details: response.data
      };
      
    } catch (error) {
      return {
        success: false,
        message: `Error: ${error.message}`
      };
    }
  }
  
  private async initUpload(config: any) {
    // Implementar lógica de inicio de upload según API de TikTok
  }
  
  private async uploadVideo(uploadUrl: string, videoBuffer: Buffer) {
    // Implementar upload del video
  }
}
```

---

## Publisher Manager

```typescript
// src/publishers/PublisherManager.ts
import { IPublisher } from './IPublisher';
import { TelegramPublisher } from './TelegramPublisher';
import { WhatsAppPublisher } from './WhatsAppPublisher';
import { FacebookPublisher } from './FacebookPublisher';
import { InstagramPublisher } from './InstagramPublisher';
import { TikTokPublisher } from './TikTokPublisher';

export class PublisherManager {
  private publishers: Map<Channel, IPublisher> = new Map();
  
  constructor() {
    this.registerPublishers();
  }
  
  private registerPublishers() {
    this.publishers.set('TELEGRAM', new TelegramPublisher());
    this.publishers.set('WHATSAPP', new WhatsAppPublisher());
    this.publishers.set('FACEBOOK', new FacebookPublisher());
    this.publishers.set('INSTAGRAM', new InstagramPublisher());
    this.publishers.set('TIKTOK', new TikTokPublisher());
  }
  
  getPublisher(channel: Channel): IPublisher {
    const publisher = this.publishers.get(channel);
    
    if (!publisher) {
      throw new Error(`Publisher not found for channel: ${channel}`);
    }
    
    return publisher;
  }
  
  async publishToChannel(
    channel: Channel,
    draw: DrawWithRelations,
    imageBuffer: Buffer,
    message: string
  ): Promise<PublishResult> {
    const publisher = this.getPublisher(channel);
    return publisher.publish(draw, imageBuffer, message);
  }
  
  async testChannel(
    channel: Channel,
    config: ChannelConfigData
  ): Promise<TestResult> {
    const publisher = this.getPublisher(channel);
    return publisher.test(config);
  }
}

export const publisherManager = new PublisherManager();
```

---

## Formato de Mensajes

```typescript
// src/publishers/MessageFormatter.ts
export class MessageFormatter {
  static formatDrawResult(draw: DrawWithRelations): string {
    const time = format(draw.scheduledAt, 'HH:mm');
    const date = format(draw.scheduledAt, 'dd/MM/yyyy');
    
    return (
      `🎰 RESULTADO SORTEO 🎰\n\n` +
      `🎲 ${draw.game.name}\n` +
      `⏰ ${time} - ${date}\n\n` +
      `🏆 GANADOR: ${draw.winnerItem.number}\n` +
      `✨ ${draw.winnerItem.name}\n\n` +
      `🔗 ${process.env.WEBSITE_URL || 'www.loteria.com'}`
    );
  }
  
  static formatForTelegram(draw: DrawWithRelations): string {
    return this.formatDrawResult(draw);
  }
  
  static formatForWhatsApp(draw: DrawWithRelations): string {
    return this.formatDrawResult(draw);
  }
  
  static formatForFacebook(draw: DrawWithRelations): string {
    const time = format(draw.scheduledAt, 'HH:mm');
    const date = format(draw.scheduledAt, 'dd/MM/yyyy');
    
    return (
      `🎰 RESULTADO SORTEO - ${draw.game.name}\n\n` +
      `Fecha: ${date} - ${time}\n` +
      `Ganador: ${draw.winnerItem.number} - ${draw.winnerItem.name}\n\n` +
      `#Sorteo #Lotería #${draw.game.slug}`
    );
  }
  
  static formatForInstagram(draw: DrawWithRelations): string {
    return (
      `🎰 ${draw.game.name} - ${draw.winnerItem.number}\n\n` +
      `✨ ${draw.winnerItem.name}\n\n` +
      `#sorteo #loteria #${draw.game.slug} #resultados`
    );
  }
  
  static formatForTikTok(draw: DrawWithRelations): string {
    return (
      `🎰 Resultado: ${draw.winnerItem.number} - ${draw.winnerItem.name}\n` +
      `#sorteo #loteria #${draw.game.slug}`
    );
  }
}
```

---

## Configuración de Canales

### Estructura en BD

```typescript
// Ejemplo de configuración en channelConfig.config (JSON)

// Telegram
{
  "botToken": "123456:ABC-DEF...",
  "chatId": "-1001234567890"
}

// WhatsApp
{
  "chatIds": [
    "123456789@g.us",  // Grupo
    "status@broadcast"  // Lista de difusión
  ]
}

// Facebook
{
  "pageId": "1234567890",
  "accessToken": "EAABsbCS..."
}

// Instagram
{
  "businessAccountId": "1234567890",
  "accessToken": "EAABsbCS..."
}

// TikTok
{
  "clientKey": "abc123",
  "clientSecret": "xyz789",
  "accessToken": "token..."
}
```

---

## Rate Limiting

```typescript
// src/publishers/RateLimiter.ts
export class RateLimiter {
  private limits: Map<Channel, { count: number; resetAt: number }> = new Map();
  
  private readonly LIMITS: Record<Channel, { perMinute: number }> = {
    TELEGRAM: { perMinute: 30 },
    WHATSAPP: { perMinute: 20 },
    FACEBOOK: { perMinute: 60 },
    INSTAGRAM: { perMinute: 25 },
    TIKTOK: { perMinute: 10 }
  };
  
  async checkLimit(channel: Channel): Promise<boolean> {
    const now = Date.now();
    const limit = this.limits.get(channel);
    
    if (!limit || now > limit.resetAt) {
      // Reset límite
      this.limits.set(channel, {
        count: 1,
        resetAt: now + 60000 // 1 minuto
      });
      return true;
    }
    
    if (limit.count >= this.LIMITS[channel].perMinute) {
      return false; // Límite alcanzado
    }
    
    limit.count++;
    return true;
  }
  
  async waitForLimit(channel: Channel): Promise<void> {
    while (!(await this.checkLimit(channel))) {
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}
```

---

## Error Handling

```typescript
export class PublisherError extends Error {
  constructor(
    public channel: Channel,
    public code: string,
    message: string,
    public retryable: boolean = true
  ) {
    super(message);
    this.name = 'PublisherError';
  }
}

// Uso en publishers
throw new PublisherError(
  'TELEGRAM',
  'RATE_LIMIT_EXCEEDED',
  'Too many requests',
  true  // Puede reintentarse
);
```

---

## Monitoring

```typescript
// Métricas a rastrear
export interface PublisherMetrics {
  channel: Channel;
  totalPublications: number;
  successfulPublications: number;
  failedPublications: number;
  averagePublishTime: number;
  lastPublishTime: Date;
  successRate: number;
}
```

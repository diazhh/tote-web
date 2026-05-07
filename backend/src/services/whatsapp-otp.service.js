import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import sessionManager from '../lib/whatsapp/session-manager.js';
import logger from '../lib/logger.js';

class WhatsAppOtpService {
  /**
   * Genera y envía un OTP por WhatsApp al jugador
   */
  async sendOtp(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, phone: true, role: true, whatsappVerified: true }
    });

    if (!user) throw new Error('Usuario no encontrado');
    if (user.role !== 'PLAYER') throw new Error('Solo jugadores pueden verificar WhatsApp');
    if (!user.phone) throw new Error('No tienes un número de teléfono registrado');
    if (user.whatsappVerified) throw new Error('Tu WhatsApp ya está verificado');

    // Generar código de 6 dígitos con CSPRNG (Math.random no es seguro)
    const code = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutos

    // Upsert OTP (reemplaza el anterior si existe)
    await prisma.whatsAppOtpCode.upsert({
      where: { userId },
      update: { code, phone: user.phone, expiresAt, attempts: 0 },
      create: { userId, phone: user.phone, code, expiresAt }
    });

    // Buscar una instancia de WhatsApp conectada
    const instance = await this._getConnectedInstance();
    if (!instance) {
      throw new Error('No hay instancias de WhatsApp disponibles. Intenta más tarde.');
    }

    // Formatear número para WhatsApp (quitar + y espacios)
    const phoneNumber = user.phone.replace(/[^0-9]/g, '');

    const message = `*Multiloterias* - Verificación de WhatsApp\n\nTu código de verificación es: *${code}*\n\nEste código expira en 10 minutos.\nSi no solicitaste este código, ignora este mensaje.`;

    await sessionManager.sendTextMessage(instance.instanceId, phoneNumber, message);

    logger.info('WhatsApp OTP sent', { userId, phone: user.phone });
    return { success: true, message: 'Código enviado por WhatsApp' };
  }

  /**
   * Verifica el OTP ingresado por el jugador
   */
  async verifyOtp(userId, code) {
    const otpRecord = await prisma.whatsAppOtpCode.findUnique({
      where: { userId }
    });

    if (!otpRecord) throw new Error('No hay código pendiente. Solicita uno nuevo.');

    if (otpRecord.attempts >= 5) {
      await prisma.whatsAppOtpCode.delete({ where: { userId } });
      throw new Error('Demasiados intentos fallidos. Solicita un nuevo código.');
    }

    if (new Date() > otpRecord.expiresAt) {
      await prisma.whatsAppOtpCode.delete({ where: { userId } });
      throw new Error('El código ha expirado. Solicita uno nuevo.');
    }

    if (otpRecord.code !== code) {
      await prisma.whatsAppOtpCode.update({
        where: { userId },
        data: { attempts: { increment: 1 } }
      });
      throw new Error('Código incorrecto');
    }

    // Verificación exitosa
    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { whatsappVerified: true, whatsappNotifications: true }
      }),
      prisma.whatsAppOtpCode.delete({ where: { userId } })
    ]);

    logger.info('WhatsApp verified successfully', { userId });
    return { success: true, message: 'WhatsApp verificado correctamente' };
  }

  /**
   * Activa/desactiva notificaciones por WhatsApp
   */
  async toggleNotifications(userId, enabled) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { whatsappVerified: true }
    });

    if (!user) throw new Error('Usuario no encontrado');
    if (!user.whatsappVerified) throw new Error('Debes verificar tu WhatsApp primero');

    await prisma.user.update({
      where: { id: userId },
      data: { whatsappNotifications: enabled }
    });

    return { success: true, enabled };
  }

  /**
   * Busca la primera instancia de WhatsApp conectada
   */
  async _getConnectedInstance() {
    const instance = await prisma.whatsAppInstance.findFirst({
      where: { status: 'CONNECTED', isActive: true },
      orderBy: { lastSeen: 'desc' }
    });
    return instance;
  }
}

export default new WhatsAppOtpService();

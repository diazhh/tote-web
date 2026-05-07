import crypto from 'crypto';
import { prisma } from '../lib/prisma.js';
import emailService from './email.service.js';
import logger from '../lib/logger.js';

class EmailVerificationService {
  async sendCode(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, username: true, emailVerified: true }
    });

    if (!user) throw new Error('Usuario no encontrado');
    if (!user.email) throw new Error('No tienes un correo electrónico registrado');
    if (user.emailVerified) throw new Error('Tu correo ya está verificado');

    // CSPRNG — Math.random es predecible.
    const code = String(crypto.randomInt(100000, 1000000));
    const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 minutes

    await prisma.emailVerificationCode.upsert({
      where: { userId },
      update: { code, email: user.email, expiresAt, attempts: 0 },
      create: { userId, email: user.email, code, expiresAt }
    });

    await emailService.sendWelcomeVerification(user.email, user.username, code);

    logger.info('Email verification code sent', { userId, email: user.email });
    return { success: true, message: 'Código de verificación enviado a tu correo' };
  }

  async verifyCode(userId, code) {
    const record = await prisma.emailVerificationCode.findUnique({
      where: { userId }
    });

    if (!record) throw new Error('No hay código pendiente. Solicita uno nuevo.');

    if (record.attempts >= 5) {
      await prisma.emailVerificationCode.delete({ where: { userId } });
      throw new Error('Demasiados intentos fallidos. Solicita un nuevo código.');
    }

    if (new Date() > record.expiresAt) {
      await prisma.emailVerificationCode.delete({ where: { userId } });
      throw new Error('El código ha expirado. Solicita uno nuevo.');
    }

    if (record.code !== code) {
      await prisma.emailVerificationCode.update({
        where: { userId },
        data: { attempts: { increment: 1 } }
      });
      const remaining = 5 - record.attempts - 1;
      throw new Error(`Código incorrecto. ${remaining} intento(s) restante(s).`);
    }

    await prisma.$transaction([
      prisma.user.update({
        where: { id: userId },
        data: { emailVerified: true }
      }),
      prisma.emailVerificationCode.delete({ where: { userId } })
    ]);

    logger.info('Email verified', { userId });
    return { success: true, message: 'Correo verificado exitosamente' };
  }

  async getStatus(userId) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { emailVerified: true, email: true }
    });
    return {
      emailVerified: user?.emailVerified || false,
      email: user?.email || null
    };
  }
}

export default new EmailVerificationService();

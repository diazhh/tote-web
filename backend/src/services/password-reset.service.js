import crypto from 'crypto';
import bcrypt from 'bcrypt';
import { prisma } from '../lib/prisma.js';
import emailService from './email.service.js';
import logger from '../lib/logger.js';

class PasswordResetService {
  async requestReset(email) {
    const user = await prisma.user.findUnique({
      where: { email },
      select: { id: true, username: true, email: true, role: true }
    });

    // Always return success to prevent email enumeration
    if (!user || user.role !== 'PLAYER') {
      return { success: true, message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.' };
    }

    // Invalidate previous tokens
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, used: false },
      data: { used: true }
    });

    const token = crypto.randomBytes(32).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000); // 1 hour

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        token,
        expiresAt
      }
    });

    const frontendUrl = process.env.FRONTEND_URL || 'https://tote.atilax.io';
    const resetUrl = `${frontendUrl}/reset-password?token=${token}`;

    await emailService.sendPasswordReset(user.email, user.username, resetUrl);

    logger.info('Password reset requested', { userId: user.id, email });
    return { success: true, message: 'Si el correo está registrado, recibirás un enlace para restablecer tu contraseña.' };
  }

  async resetPassword(token, newPassword) {
    if (!newPassword || newPassword.length < 6) {
      throw new Error('La contraseña debe tener al menos 6 caracteres');
    }

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token },
      include: { user: { select: { id: true, username: true } } }
    });

    if (!resetToken) {
      throw new Error('El enlace es inválido o ha expirado.');
    }

    if (resetToken.used) {
      throw new Error('Este enlace ya fue utilizado. Solicita uno nuevo.');
    }

    if (new Date() > resetToken.expiresAt) {
      await prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true }
      });
      throw new Error('El enlace ha expirado. Solicita uno nuevo.');
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { password: hashedPassword }
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { used: true }
      })
    ]);

    logger.info('Password reset completed', { userId: resetToken.userId });
    return { success: true, message: 'Contraseña actualizada exitosamente.' };
  }

  async validateToken(token) {
    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { token }
    });

    if (!resetToken || resetToken.used || new Date() > resetToken.expiresAt) {
      return { valid: false };
    }

    return { valid: true };
  }
}

export default new PasswordResetService();

import { prisma } from '../lib/prisma.js';
import sessionManager from '../lib/whatsapp/session-manager.js';
import logger from '../lib/logger.js';

class PlayerNotificationService {
  /**
   * Envía notificación por WhatsApp si el jugador lo tiene verificado y habilitado.
   * Siempre fire-and-forget: nunca bloquea ni lanza errores al caller.
   */
  async _send(userId, message) {
    if (process.env.DISABLE_SOCIAL_CHANNELS === 'true') {
      logger.warn(`⛔ [LOCAL] DISABLE_SOCIAL_CHANNELS=true — notificación WhatsApp jugador desactivada`);
      return;
    }

    try {
      if (!userId) return;

      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { phone: true, whatsappVerified: true, whatsappNotifications: true }
      });

      if (!user?.whatsappVerified || !user?.whatsappNotifications || !user?.phone) return;

      const instance = await prisma.whatsAppInstance.findFirst({
        where: { status: 'CONNECTED', isActive: true },
        orderBy: { lastSeen: 'desc' }
      });

      if (!instance) {
        logger.warn('No WhatsApp instance available for player notification');
        return;
      }

      const phoneNumber = user.phone.replace(/[^0-9]/g, '');
      await sessionManager.sendTextMessage(instance.instanceId, phoneNumber, message);
      logger.info('Player WhatsApp notification sent', { userId });
    } catch (error) {
      logger.error('Error sending player WhatsApp notification:', error.message);
    }
  }

  async notifyTicketCreated(ticket) {
    const gameName = ticket.draw?.game?.name || 'Juego';
    const drawTime = ticket.draw?.drawTime || '';
    const amount = parseFloat(ticket.totalAmount).toFixed(2);
    const detailsCount = ticket.details?.length || 0;

    const message = `*Multiloterias* - Ticket Creado\n\nTu ticket fue registrado exitosamente.\n\nJuego: *${gameName}*\nHora: ${drawTime}\nJugadas: ${detailsCount}\nMonto total: *Bs. ${amount}*\n\nBuena suerte!`;

    await this._send(ticket.userId, message);
  }

  async notifyPrizeWon(userId, prize, draw) {
    const gameName = draw?.game?.name || 'Juego';
    const winnerNumber = draw?.winnerItem?.number || '';
    const prizeAmount = parseFloat(prize).toFixed(2);

    const message = `*Multiloterias* - Premio Ganado!\n\nFelicidades! Ganaste en el sorteo.\n\nJuego: *${gameName}*\nNumero ganador: *${winnerNumber}*\nPremio: *Bs. ${prizeAmount}*\n\nEl monto ya fue acreditado a tu saldo.`;

    await this._send(userId, message);
  }

  async notifyDepositApproved(deposit) {
    const amount = parseFloat(deposit.amount).toFixed(2);

    const message = `*Multiloterias* - Deposito Aprobado\n\nTu deposito de *Bs. ${amount}* fue aprobado y acreditado a tu saldo.\n\nYa puedes usar tu saldo para jugar!`;

    await this._send(deposit.userId, message);
  }

  async notifyDepositRejected(deposit) {
    const amount = parseFloat(deposit.amount).toFixed(2);
    const reason = deposit.notes || 'No especificada';

    const message = `*Multiloterias* - Deposito Rechazado\n\nTu deposito de *Bs. ${amount}* fue rechazado.\n\nRazon: ${reason}\n\nSi tienes dudas, contacta soporte.`;

    await this._send(deposit.userId, message);
  }

  async notifyWithdrawalCompleted(withdrawal) {
    const amount = parseFloat(withdrawal.amount).toFixed(2);

    const message = `*Multiloterias* - Retiro Completado\n\nTu retiro de *Bs. ${amount}* fue procesado exitosamente.\n\nEl pago fue enviado a tu cuenta de Pago Movil.`;

    await this._send(withdrawal.userId, message);
  }

  async notifyWithdrawalRejected(withdrawal) {
    const amount = parseFloat(withdrawal.amount).toFixed(2);
    const reason = withdrawal.notes || 'No especificada';

    const message = `*Multiloterias* - Retiro Rechazado\n\nTu retiro de *Bs. ${amount}* fue rechazado.\n\nRazon: ${reason}\n\nEl monto fue restaurado a tu saldo disponible.`;

    await this._send(withdrawal.userId, message);
  }
}

export default new PlayerNotificationService();

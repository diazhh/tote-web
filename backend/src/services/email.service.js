import nodemailer from 'nodemailer';
import logger from '../lib/logger.js';
import { renderTemplate } from '../templates/base-layout.js';

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialized = false;
  }

  init() {
    if (this.initialized) return;

    const user = process.env.SMTP_USER;
    const from = process.env.SMTP_FROM || `Multiloterias <${user || 'noreply@atilax.io'}>`;

    // Use sendmail transport (local Postfix) for reliable delivery
    this.transporter = nodemailer.createTransport({
      sendmail: true,
      newline: 'unix',
      path: '/usr/sbin/sendmail'
    });

    this.from = from;
    this.initialized = true;
    logger.info('Email service initialized (sendmail transport)');
  }

  async send({ to, subject, template, data }) {
    this.init();

    if (!this.transporter) {
      logger.warn('Email not sent - service not configured', { to, subject });
      return { success: false, error: 'Email service not configured' };
    }

    try {
      const html = renderTemplate(template, data);

      const info = await this.transporter.sendMail({
        from: this.from,
        to,
        subject,
        html
      });

      logger.info('Email sent', { to, subject, messageId: info.messageId });
      return { success: true, messageId: info.messageId };
    } catch (error) {
      logger.error('Error sending email:', { to, subject, error: error.message });
      return { success: false, error: error.message };
    }
  }

  // --- Convenience methods ---

  async sendWelcomeVerification(email, username, code) {
    return this.send({
      to: email,
      subject: 'Verifica tu correo - Multiloterias',
      template: 'welcome-verify',
      data: { username, code, email }
    });
  }

  async sendPasswordReset(email, username, resetUrl) {
    return this.send({
      to: email,
      subject: 'Recuperar contraseña - Multiloterias',
      template: 'forgot-password',
      data: { username, resetUrl }
    });
  }

  async sendWithdrawalRequest(email, username, amount, createdAt) {
    return this.send({
      to: email,
      subject: 'Solicitud de retiro recibida - Multiloterias',
      template: 'withdrawal-request',
      data: { username, amount, createdAt }
    });
  }

  async sendDepositApproved(email, username, amount, newBalance) {
    return this.send({
      to: email,
      subject: 'Saldo acreditado en tu cuenta - Multiloterias',
      template: 'deposit-approved',
      data: { username, amount, newBalance }
    });
  }
}

export default new EmailService();

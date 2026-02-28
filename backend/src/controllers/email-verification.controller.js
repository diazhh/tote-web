import emailVerificationService from '../services/email-verification.service.js';
import logger from '../lib/logger.js';

class EmailVerificationController {
  async sendCode(req, res) {
    try {
      const result = await emailVerificationService.sendCode(req.user.id);
      res.json(result);
    } catch (error) {
      logger.error('Error sending email verification:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async verifyCode(req, res) {
    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ success: false, error: 'El código es requerido' });
      }
      const result = await emailVerificationService.verifyCode(req.user.id, code);
      res.json(result);
    } catch (error) {
      logger.error('Error verifying email:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async getStatus(req, res) {
    try {
      const status = await emailVerificationService.getStatus(req.user.id);
      res.json({ success: true, data: status });
    } catch (error) {
      logger.error('Error getting email status:', error);
      res.status(500).json({ success: false, error: error.message });
    }
  }
}

export default new EmailVerificationController();

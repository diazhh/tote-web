import whatsappOtpService from '../services/whatsapp-otp.service.js';

class WhatsAppOtpController {
  async sendOtp(req, res) {
    try {
      const result = await whatsappOtpService.sendOtp(req.user.id);
      res.json(result);
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async verifyOtp(req, res) {
    try {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ success: false, error: 'El código es requerido' });
      }
      const result = await whatsappOtpService.verifyOtp(req.user.id, code);
      res.json(result);
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async toggleNotifications(req, res) {
    try {
      const { enabled } = req.body;
      if (typeof enabled !== 'boolean') {
        return res.status(400).json({ success: false, error: 'El campo enabled es requerido (true/false)' });
      }
      const result = await whatsappOtpService.toggleNotifications(req.user.id, enabled);
      res.json(result);
    } catch (error) {
      res.status(400).json({ success: false, error: error.message });
    }
  }
}

export default new WhatsAppOtpController();

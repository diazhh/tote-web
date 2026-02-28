import passwordResetService from '../services/password-reset.service.js';
import logger from '../lib/logger.js';

class PasswordResetController {
  async requestReset(req, res) {
    try {
      const { email } = req.body;
      if (!email) {
        return res.status(400).json({ success: false, error: 'El correo es requerido' });
      }
      const result = await passwordResetService.requestReset(email);
      res.json(result);
    } catch (error) {
      logger.error('Error requesting password reset:', error);
      res.status(500).json({ success: false, error: 'Error al procesar la solicitud' });
    }
  }

  async resetPassword(req, res) {
    try {
      const { token, password } = req.body;
      if (!token || !password) {
        return res.status(400).json({ success: false, error: 'Token y contraseña son requeridos' });
      }
      const result = await passwordResetService.resetPassword(token, password);
      res.json(result);
    } catch (error) {
      logger.error('Error resetting password:', error);
      res.status(400).json({ success: false, error: error.message });
    }
  }

  async validateToken(req, res) {
    try {
      const { token } = req.query;
      if (!token) {
        return res.status(400).json({ success: false, error: 'Token requerido' });
      }
      const result = await passwordResetService.validateToken(token);
      res.json({ success: true, data: result });
    } catch (error) {
      logger.error('Error validating reset token:', error);
      res.status(500).json({ success: false, error: 'Error al validar el token' });
    }
  }
}

export default new PasswordResetController();

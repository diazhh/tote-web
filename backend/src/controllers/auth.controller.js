import authService from '../services/auth.service.js';
import logger from '../lib/logger.js';

class AuthController {
  /**
   * POST /api/auth/register
   * Registrar nuevo usuario
   */
  async register(req, res) {
    try {
      const { username, email, password, role, telegramUserId } = req.body;

      // Validaciones básicas
      if (!username || !email || !password) {
        return res.status(400).json({
          success: false,
          error: 'Username, email y password son requeridos'
        });
      }

      // Solo admins pueden crear otros admins
      if (role === 'ADMIN' && (!req.user || req.user.role !== 'ADMIN')) {
        return res.status(403).json({
          success: false,
          error: 'Solo administradores pueden crear otros administradores'
        });
      }

      const user = await authService.register({
        username,
        email,
        password,
        role,
        telegramUserId
      });

      res.status(201).json({
        success: true,
        data: user
      });
    } catch (error) {
      logger.error('Error en register:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/auth/login
   * Iniciar sesión
   */
  async login(req, res) {
    try {
      const { username, password } = req.body;

      if (!username || !password) {
        return res.status(400).json({
          success: false,
          error: 'Username y password son requeridos'
        });
      }

      const result = await authService.login({ username, password });

      res.json({
        success: true,
        data: result
      });
    } catch (error) {
      logger.error('Error en login:', error);
      res.status(401).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/auth/me
   * Obtener usuario actual
   */
  async me(req, res) {
    try {
      res.json({
        success: true,
        data: req.user
      });
    } catch (error) {
      logger.error('Error en me:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * POST /api/auth/change-password
   * Cambiar contraseña
   */
  async changePassword(req, res) {
    try {
      const { oldPassword, currentPassword, newPassword } = req.body;
      const actualOldPassword = oldPassword || currentPassword;

      if (!actualOldPassword || !newPassword) {
        return res.status(400).json({
          success: false,
          error: 'Contraseña actual y nueva son requeridas'
        });
      }

      if (newPassword.length < 6) {
        return res.status(400).json({
          success: false,
          error: 'La nueva contraseña debe tener al menos 6 caracteres'
        });
      }

      await authService.changePassword(req.user.id, actualOldPassword, newPassword);

      res.json({
        success: true,
        message: 'Contraseña actualizada exitosamente'
      });
    } catch (error) {
      logger.error('Error en changePassword:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * GET /api/auth/users
   * Listar usuarios (solo admins)
   */
  async listUsers(req, res) {
    try {
      const users = await authService.listUsers();

      res.json({
        success: true,
        data: users
      });
    } catch (error) {
      logger.error('Error en listUsers:', error);
      res.status(500).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * PATCH /api/auth/users/:id
   * Actualizar usuario (solo admins)
   */
  async updateUser(req, res) {
    try {
      const { id } = req.params;
      const data = req.body;

      const user = await authService.updateUser(id, data);

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      logger.error('Error en updateUser:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }

  /**
   * PATCH /api/auth/profile
   * Actualizar perfil del usuario actual
   */
  async updateProfile(req, res) {
    try {
      const { email } = req.body;
      const user = await authService.updateUser(req.user.id, { email });

      res.json({
        success: true,
        data: user
      });
    } catch (error) {
      logger.error('Error en updateProfile:', error);
      res.status(400).json({
        success: false,
        error: error.message
      });
    }
  }
}

export default new AuthController();

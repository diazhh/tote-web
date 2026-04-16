import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import emailVerificationService from './email-verification.service.js';

class AuthService {
  /**
   * Registrar un nuevo usuario
   */
  async register({ username, email, password, role = 'OPERATOR', telegramUserId = null }) {
    try {
      // Verificar si el usuario ya existe
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { username },
            { email }
          ]
        }
      });

      if (existingUser) {
        throw new Error('Usuario o email ya existe');
      }

      // Hash de la contraseña
      const hashedPassword = await bcrypt.hash(password, 10);

      // Crear usuario
      const user = await prisma.user.create({
        data: {
          username,
          email,
          password: hashedPassword,
          role,
          telegramUserId,
          isActive: true
        },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          telegramUserId: true,
          isActive: true,
          createdAt: true
        }
      });

      logger.info(`Usuario registrado: ${username}`);
      return user;
    } catch (error) {
      logger.error('Error al registrar usuario:', error);
      throw error;
    }
  }

  /**
   * Login de usuario
   */
  async login({ username, password }) {
    try {
      // Buscar usuario
      const user = await prisma.user.findUnique({
        where: { username }
      });

      if (!user) {
        throw new Error('Credenciales inválidas');
      }

      if (!user.isActive) {
        throw new Error('Usuario inactivo');
      }

      // Verificar contraseña
      const isValidPassword = await bcrypt.compare(password, user.password);
      if (!isValidPassword) {
        throw new Error('Credenciales inválidas');
      }

      // Actualizar último login
      await prisma.user.update({
        where: { id: user.id },
        data: { lastLoginAt: new Date() }
      });

      // Generar token JWT
      const token = this.generateToken(user);

      logger.info(`Usuario autenticado: ${username}`);

      return {
        user: {
          id: user.id,
          username: user.username,
          email: user.email,
          phone: user.phone,
          role: user.role,
          telegramUserId: user.telegramUserId,
          whatsappVerified: user.whatsappVerified || false,
          whatsappNotifications: user.whatsappNotifications || false
        },
        token
      };
    } catch (error) {
      logger.error('Error en login:', error);
      throw error;
    }
  }

  /**
   * Generar token JWT
   */
  generateToken(user) {
    const payload = {
      id: user.id,
      username: user.username,
      email: user.email,
      role: user.role,
      apiSystemId: user.apiSystemId ?? null,
    };

    return jwt.sign(
      payload,
      process.env.JWT_SECRET || 'secret-key-change-in-production',
      { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
    );
  }

  /**
   * Verificar token JWT
   */
  verifyToken(token) {
    try {
      return jwt.verify(
        token,
        process.env.JWT_SECRET || 'secret-key-change-in-production'
      );
    } catch (error) {
      throw new Error('Token inválido o expirado');
    }
  }

  /**
   * Obtener usuario por ID
   */
  async getUserById(userId) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          telegramUserId: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true,
          apiSystemId: true
        }
      });

      return user;
    } catch (error) {
      logger.error('Error al obtener usuario:', error);
      throw error;
    }
  }

  /**
   * Cambiar contraseña
   */
  async changePassword(userId, oldPassword, newPassword) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // Verificar contraseña actual
      const isValidPassword = await bcrypt.compare(oldPassword, user.password);
      if (!isValidPassword) {
        throw new Error('Contraseña actual incorrecta');
      }

      // Hash de la nueva contraseña
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Actualizar contraseña
      await prisma.user.update({
        where: { id: userId },
        data: { password: hashedPassword }
      });

      logger.info(`Contraseña cambiada para usuario: ${user.username}`);
      return true;
    } catch (error) {
      logger.error('Error al cambiar contraseña:', error);
      throw error;
    }
  }

  /**
   * Listar todos los usuarios (solo para admins)
   */
  async listUsers() {
    try {
      const users = await prisma.user.findMany({
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          telegramUserId: true,
          isActive: true,
          lastLoginAt: true,
          createdAt: true
        },
        orderBy: { createdAt: 'desc' }
      });

      return users;
    } catch (error) {
      logger.error('Error al listar usuarios:', error);
      throw error;
    }
  }

  /**
   * Actualizar usuario (solo para admins)
   */
  async updateUser(userId, data) {
    try {
      const user = await prisma.user.update({
        where: { id: userId },
        data: {
          ...(data.email && { email: data.email }),
          ...(data.role && { role: data.role }),
          ...(data.telegramUserId !== undefined && { telegramUserId: data.telegramUserId }),
          ...(data.isActive !== undefined && { isActive: data.isActive })
        },
        select: {
          id: true,
          username: true,
          email: true,
          role: true,
          telegramUserId: true,
          isActive: true,
          createdAt: true
        }
      });

      logger.info(`Usuario actualizado: ${user.username}`);
      return user;
    } catch (error) {
      logger.error('Error al actualizar usuario:', error);
      throw error;
    }
  }

  /**
   * Actualizar perfil del jugador (self-service)
   */
  async updateProfile(userId, data) {
    try {
      const currentUser = await prisma.user.findUnique({ where: { id: userId } });
      if (!currentUser) throw new Error('Usuario no encontrado');

      const updateData = {};

      // Username
      if (data.username && data.username !== currentUser.username) {
        const usernameRegex = /^[a-zA-Z0-9_]{3,20}$/;
        if (!usernameRegex.test(data.username)) {
          throw new Error('Username debe tener 3-20 caracteres alfanuméricos');
        }
        const existing = await prisma.user.findFirst({
          where: { username: data.username, id: { not: userId } }
        });
        if (existing) throw new Error('El nombre de usuario ya está en uso');
        updateData.username = data.username;
      }

      // Email
      if (data.email && data.email !== currentUser.email) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailRegex.test(data.email)) throw new Error('Formato de email inválido');
        const existing = await prisma.user.findFirst({
          where: { email: data.email, id: { not: userId } }
        });
        if (existing) throw new Error('El email ya está registrado');
        updateData.email = data.email;
        updateData.emailVerified = false;
      }

      // Phone
      if (data.phone !== undefined && data.phone !== currentUser.phone) {
        if (data.phone) {
          const phoneRegex = /^(\+58|0)?4\d{9}$/;
          if (!phoneRegex.test(data.phone.replace(/\s|-/g, ''))) {
            throw new Error('Formato de teléfono inválido');
          }
          const existing = await prisma.user.findFirst({
            where: { phone: data.phone, id: { not: userId } }
          });
          if (existing) throw new Error('El teléfono ya está registrado');
        }
        updateData.phone = data.phone || null;
        updateData.whatsappVerified = false;
        updateData.whatsappNotifications = false;
      }

      if (Object.keys(updateData).length === 0) {
        throw new Error('No hay cambios para guardar');
      }

      const updated = await prisma.user.update({
        where: { id: userId },
        data: updateData,
        select: {
          id: true, username: true, email: true, phone: true, role: true,
          emailVerified: true, whatsappVerified: true, whatsappNotifications: true,
          balance: true, blockedBalance: true, createdAt: true
        }
      });

      logger.info(`Perfil actualizado: ${updated.username}`, { changes: Object.keys(updateData) });
      return updated;
    } catch (error) {
      logger.error('Error al actualizar perfil:', error);
      throw error;
    }
  }

  /**
   * Verificar disponibilidad de username
   */
  async checkUsername(username, excludeUserId) {
    const existing = await prisma.user.findFirst({
      where: { username, id: { not: excludeUserId } }
    });
    return !existing;
  }

  /**
   * Registrar un nuevo jugador (público)
   */
  async registerPlayer({ username, email, password, phone }) {
    try {
      // Validar formato de email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(email)) {
        throw new Error('Formato de email inválido');
      }

      // Validar longitud de contraseña
      if (password.length < 6) {
        throw new Error('La contraseña debe tener al menos 6 caracteres');
      }

      // Validar formato de teléfono (opcional)
      if (phone) {
        const phoneRegex = /^(\+58|0)?4\d{9}$/;
        if (!phoneRegex.test(phone.replace(/\s|-/g, ''))) {
          throw new Error('Formato de teléfono inválido. Debe ser un número venezolano válido');
        }
      }

      // Verificar si el usuario ya existe
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [
            { username },
            { email },
            ...(phone ? [{ phone }] : [])
          ]
        }
      });

      if (existingUser) {
        if (existingUser.username === username) {
          throw new Error('El nombre de usuario ya está en uso');
        }
        if (existingUser.email === email) {
          throw new Error('El email ya está registrado');
        }
        if (phone && existingUser.phone === phone) {
          throw new Error('El teléfono ya está registrado');
        }
      }

      // Hash de la contraseña
      const hashedPassword = await bcrypt.hash(password, 10);

      // Crear usuario jugador
      const user = await prisma.user.create({
        data: {
          username,
          email,
          password: hashedPassword,
          phone: phone || null,
          role: 'PLAYER',
          isActive: true,
          phoneVerified: false,
          whatsappVerified: false,
          whatsappNotifications: false,
          balance: 0,
          blockedBalance: 0
        },
        select: {
          id: true,
          username: true,
          email: true,
          phone: true,
          role: true,
          balance: true,
          whatsappVerified: true,
          whatsappNotifications: true,
          isActive: true,
          createdAt: true
        }
      });

      logger.info(`Jugador registrado: ${username}`);

      // Enviar email de verificación (no bloqueante)
      emailVerificationService.sendCode(user.id).catch(err => {
        logger.warn('Could not send verification email on register:', err.message);
      });

      // Generar token JWT
      const token = this.generateToken(user);

      return {
        user,
        token
      };
    } catch (error) {
      logger.error('Error al registrar jugador:', error);
      throw error;
    }
  }

  /**
   * Obtener juegos asignados a un usuario
   */
  async getUserGames(userId) {
    try {
      const userGames = await prisma.userGame.findMany({
        where: { userId },
        include: {
          game: {
            select: {
              id: true,
              name: true,
              slug: true,
              type: true
            }
          }
        }
      });

      return userGames.map(ug => ({
        ...ug.game,
        notify: ug.notify
      }));
    } catch (error) {
      logger.error('Error al obtener juegos del usuario:', error);
      throw error;
    }
  }

  /**
   * Asignar juegos a un usuario
   */
  async assignGamesToUser(userId, gameIds) {
    try {
      // Verificar que el usuario existe
      const user = await prisma.user.findUnique({
        where: { id: userId }
      });

      if (!user) {
        throw new Error('Usuario no encontrado');
      }

      // Eliminar asignaciones actuales
      await prisma.userGame.deleteMany({
        where: { userId }
      });

      // Crear nuevas asignaciones
      if (gameIds.length > 0) {
        await prisma.userGame.createMany({
          data: gameIds.map(gameId => ({
            userId,
            gameId,
            notify: true
          }))
        });
      }

      logger.info(`Juegos asignados al usuario ${user.username}: ${gameIds.length} juego(s)`);
      return true;
    } catch (error) {
      logger.error('Error al asignar juegos al usuario:', error);
      throw error;
    }
  }
}

export default new AuthService();

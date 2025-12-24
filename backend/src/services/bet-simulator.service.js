/**
 * Servicio de simulación de jugadas para pruebas
 * Genera jugadas aleatorias en sorteos activos
 */

import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import bcrypt from 'bcrypt';

const TEST_USER_USERNAME = 'jugador_test';
const TEST_USER_EMAIL = 'jugador_test@test.com';
const TEST_USER_INITIAL_BALANCE = 10000000; // 10 millones

class BetSimulatorService {
  /**
   * Obtener o crear el usuario de prueba
   */
  async getOrCreateTestUser() {
    let user = await prisma.user.findUnique({
      where: { username: TEST_USER_USERNAME }
    });

    if (!user) {
      const hashedPassword = await bcrypt.hash('test123456', 10);
      user = await prisma.user.create({
        data: {
          username: TEST_USER_USERNAME,
          email: TEST_USER_EMAIL,
          password: hashedPassword,
          role: 'PLAYER',
          balance: TEST_USER_INITIAL_BALANCE,
          isActive: true
        }
      });
      logger.info(`Usuario de prueba creado: ${user.username} con saldo ${TEST_USER_INITIAL_BALANCE}`);
    } else {
      // Recargar saldo si está bajo
      if (parseFloat(user.balance) < 100000) {
        user = await prisma.user.update({
          where: { id: user.id },
          data: { balance: TEST_USER_INITIAL_BALANCE }
        });
        logger.info(`Saldo del usuario de prueba recargado a ${TEST_USER_INITIAL_BALANCE}`);
      }
    }

    return user;
  }

  /**
   * Obtener el próximo sorteo disponible por cada juego (SCHEDULED y no cerrado)
   */
  async getNextDrawPerGame() {
    const now = new Date();
    
    // Obtener todos los juegos activos
    const games = await prisma.game.findMany({
      where: { isActive: true },
      include: {
        items: {
          where: { isActive: true }
        }
      }
    });

    const nextDraws = [];

    for (const game of games) {
      // Obtener solo el próximo sorteo de este juego
      const nextDraw = await prisma.draw.findFirst({
        where: {
          gameId: game.id,
          status: 'SCHEDULED',
          scheduledAt: {
            gt: now
          }
        },
        orderBy: {
          scheduledAt: 'asc'
        }
      });

      if (nextDraw) {
        // Verificar que no haya cerrado (5 min antes)
        const closeTime = new Date(nextDraw.scheduledAt);
        closeTime.setMinutes(closeTime.getMinutes() - 5);
        
        if (now < closeTime) {
          nextDraws.push({
            ...nextDraw,
            game
          });
        }
      }
    }

    return nextDraws;
  }

  /**
   * Generar número aleatorio entre min y max (inclusive)
   */
  randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  /**
   * Seleccionar elementos aleatorios de un array
   */
  randomSample(array, count) {
    const shuffled = [...array].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
  }

  /**
   * Crear una jugada (ticket) aleatoria para un sorteo
   */
  async createRandomBet(userId, draw) {
    const items = draw.game.items;
    if (items.length === 0) {
      logger.warn(`Sorteo ${draw.id} no tiene items disponibles`);
      return null;
    }

    // 1-10 detalles por jugada
    const detailsCount = this.randomInt(1, 10);
    const selectedItems = this.randomSample(items, Math.min(detailsCount, items.length));

    const details = selectedItems.map(item => ({
      gameItemId: item.id,
      amount: this.randomInt(1, 25) // Monto entre 1 y 25
    }));

    try {
      const ticket = await prisma.$transaction(async (tx) => {
        const totalAmount = details.reduce((sum, d) => sum + d.amount, 0);

        // Verificar saldo
        const user = await tx.user.findUnique({
          where: { id: userId }
        });

        if (parseFloat(user.balance) < totalAmount) {
          throw new Error('Saldo insuficiente');
        }

        // Descontar saldo
        await tx.user.update({
          where: { id: userId },
          data: {
            balance: {
              decrement: totalAmount
            }
          }
        });

        // Crear ticket con detalles
        const createdTicket = await tx.ticket.create({
          data: {
            userId,
            drawId: draw.id,
            totalAmount,
            status: 'ACTIVE',
            details: {
              create: details.map(d => ({
                gameItemId: d.gameItemId,
                amount: d.amount,
                multiplier: items.find(i => i.id === d.gameItemId)?.multiplier || 30,
                status: 'ACTIVE'
              }))
            }
          },
          include: {
            details: {
              include: {
                gameItem: true
              }
            }
          }
        });

        return createdTicket;
      });

      return ticket;
    } catch (error) {
      logger.error(`Error creando jugada para sorteo ${draw.id}:`, error.message);
      return null;
    }
  }

  /**
   * Crear una apuesta tripleta aleatoria
   */
  async createRandomTripleBet(userId, gameId) {
    try {
      // Obtener configuración del juego
      const game = await prisma.game.findUnique({
        where: { id: gameId },
        include: {
          items: {
            where: { isActive: true }
          }
        }
      });

      if (!game) {
        logger.warn(`Juego ${gameId} no encontrado`);
        return null;
      }

      const tripletaConfig = game.config?.tripleta;
      if (!tripletaConfig || !tripletaConfig.enabled) {
        return null; // Tripleta no habilitada
      }

      if (game.items.length < 3) {
        logger.warn(`Juego ${gameId} no tiene suficientes items para tripleta`);
        return null;
      }

      // Seleccionar 3 items aleatorios diferentes
      const selectedItems = this.randomSample(game.items, 3);
      const amount = this.randomInt(1, 25);

      // Obtener próximos sorteos
      const nextDraws = await prisma.draw.findMany({
        where: {
          gameId: gameId,
          status: 'SCHEDULED',
          scheduledAt: {
            gt: new Date()
          }
        },
        orderBy: {
          scheduledAt: 'asc'
        },
        take: tripletaConfig.drawsCount
      });

      if (nextDraws.length < tripletaConfig.drawsCount) {
        logger.warn(`No hay suficientes sorteos para tripleta en juego ${gameId}`);
        return null;
      }

      const startDrawId = nextDraws[0].id;
      const endDrawId = nextDraws[nextDraws.length - 1].id;
      const expiresAt = nextDraws[nextDraws.length - 1].scheduledAt;

      const tripleBet = await prisma.$transaction(async (tx) => {
        // Verificar saldo
        const user = await tx.user.findUnique({
          where: { id: userId }
        });

        if (parseFloat(user.balance) < amount) {
          throw new Error('Saldo insuficiente para tripleta');
        }

        // Descontar saldo
        await tx.user.update({
          where: { id: userId },
          data: {
            balance: {
              decrement: amount
            }
          }
        });

        // Crear tripleta
        const created = await tx.tripleBet.create({
          data: {
            userId,
            gameId,
            item1Id: selectedItems[0].id,
            item2Id: selectedItems[1].id,
            item3Id: selectedItems[2].id,
            amount,
            multiplier: tripletaConfig.multiplier,
            drawsCount: tripletaConfig.drawsCount,
            startDrawId,
            endDrawId,
            expiresAt
          }
        });

        return created;
      });

      return tripleBet;
    } catch (error) {
      logger.error(`Error creando tripleta para juego ${gameId}:`, error.message);
      return null;
    }
  }

  /**
   * Ejecutar simulación de jugadas
   * @param {Object} options - Opciones de simulación
   * @param {number} options.betsPerDraw - Jugadas por sorteo (20-40)
   * @param {boolean} options.includeTripletas - Incluir apuestas tripleta
   * @param {number} options.delayMs - Delay entre jugadas en ms
   */
  async runSimulation(options = {}) {
    const {
      betsPerDraw = this.randomInt(20, 40),
      includeTripletas = true,
      delayMs = 100
    } = options;

    logger.info('=== Iniciando simulación de jugadas ===');

    // Obtener o crear usuario de prueba
    const testUser = await this.getOrCreateTestUser();
    logger.info(`Usuario de prueba: ${testUser.username} (ID: ${testUser.id})`);
    logger.info(`Saldo inicial: ${testUser.balance}`);

    // Obtener el próximo sorteo de cada juego
    const availableDraws = await this.getNextDrawPerGame();
    logger.info(`Próximos sorteos (1 por juego): ${availableDraws.length}`);

    if (availableDraws.length === 0) {
      logger.warn('No hay sorteos disponibles para jugar');
      return {
        success: false,
        message: 'No hay sorteos disponibles',
        stats: { tickets: 0, tripletas: 0 }
      };
    }

    const stats = {
      tickets: 0,
      ticketDetails: 0,
      tripletas: 0,
      totalAmount: 0,
      errors: 0
    };

    const gamesWithTripleta = new Set();

    // Procesar cada sorteo
    for (const draw of availableDraws) {
      const numBets = this.randomInt(20, 40);
      logger.info(`\nSorteo: ${draw.game.name} - ${draw.drawTime} (${numBets} jugadas)`);

      for (let i = 0; i < numBets; i++) {
        const ticket = await this.createRandomBet(testUser.id, draw);
        
        if (ticket) {
          stats.tickets++;
          stats.ticketDetails += ticket.details.length;
          stats.totalAmount += parseFloat(ticket.totalAmount);
          
          if (i % 10 === 0) {
            logger.info(`  Jugada ${i + 1}/${numBets} - Ticket ${ticket.id} (${ticket.details.length} detalles, $${ticket.totalAmount})`);
          }
        } else {
          stats.errors++;
        }

        // Delay entre jugadas
        if (delayMs > 0) {
          await new Promise(resolve => setTimeout(resolve, delayMs));
        }
      }

      // Registrar juego para tripletas
      if (includeTripletas) {
        gamesWithTripleta.add(draw.gameId);
      }
    }

    // Crear algunas tripletas
    if (includeTripletas && gamesWithTripleta.size > 0) {
      logger.info('\n=== Creando apuestas Tripleta ===');
      
      for (const gameId of gamesWithTripleta) {
        const numTripletas = this.randomInt(5, 15);
        
        for (let i = 0; i < numTripletas; i++) {
          const tripleBet = await this.createRandomTripleBet(testUser.id, gameId);
          
          if (tripleBet) {
            stats.tripletas++;
            stats.totalAmount += parseFloat(tripleBet.amount);
            logger.info(`  Tripleta ${i + 1}/${numTripletas} - ID: ${tripleBet.id} ($${tripleBet.amount})`);
          }

          if (delayMs > 0) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
          }
        }
      }
    }

    // Obtener saldo final
    const finalUser = await prisma.user.findUnique({
      where: { id: testUser.id }
    });

    logger.info('\n=== Resumen de simulación ===');
    logger.info(`Tickets creados: ${stats.tickets}`);
    logger.info(`Detalles de tickets: ${stats.ticketDetails}`);
    logger.info(`Tripletas creadas: ${stats.tripletas}`);
    logger.info(`Monto total apostado: $${stats.totalAmount.toFixed(2)}`);
    logger.info(`Errores: ${stats.errors}`);
    logger.info(`Saldo inicial: $${testUser.balance}`);
    logger.info(`Saldo final: $${finalUser.balance}`);

    return {
      success: true,
      message: 'Simulación completada',
      stats,
      user: {
        id: testUser.id,
        username: testUser.username,
        initialBalance: parseFloat(testUser.balance),
        finalBalance: parseFloat(finalUser.balance)
      }
    };
  }
}

export const betSimulatorService = new BetSimulatorService();
export default betSimulatorService;

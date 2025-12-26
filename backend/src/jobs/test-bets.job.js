import cron from 'node-cron';
import { prisma } from '../lib/prisma.js';
import logger from '../lib/logger.js';
import systemConfigService from '../services/system-config.service.js';
import ticketService from '../services/ticket.service.js';

/**
 * Job para insertar jugadas de prueba automáticamente
 * Se ejecuta según la configuración del sistema
 */
class TestBetsJob {
  constructor() {
    this.task = null;
    this.interval = null;
    this.isRunning = false;
  }

  /**
   * Iniciar el job
   */
  async start() {
    try {
      // Verificar cada minuto si debe estar activo
      this.task = cron.schedule('* * * * *', async () => {
        await this.checkAndRun();
      }, { timezone: 'America/Caracas' });

      logger.info('✅ Job TestBets iniciado (verificación cada minuto)');
    } catch (error) {
      logger.error('Error al iniciar TestBetsJob:', error);
    }
  }

  /**
   * Detener el job
   */
  stop() {
    if (this.task) {
      this.task.stop();
      logger.info('Job TestBets detenido');
    }
    if (this.interval) {
      clearInterval(this.interval);
      this.interval = null;
    }
    this.isRunning = false;
  }

  /**
   * Verificar configuración y ejecutar si está activo
   */
  async checkAndRun() {
    try {
      const config = await systemConfigService.getTestBetsConfig();
      
      if (!config.enabled) {
        // Si estaba corriendo, detenerlo
        if (this.isRunning) {
          if (this.interval) {
            clearInterval(this.interval);
            this.interval = null;
          }
          this.isRunning = false;
          logger.info('🛑 Jugadas de prueba desactivadas');
        }
        return;
      }

      // Si no está corriendo, iniciarlo
      if (!this.isRunning) {
        this.isRunning = true;
        logger.info('🎲 Jugadas de prueba activadas', { config });
        
        // Ejecutar inmediatamente
        await this.insertTestBets(config);

        // Configurar intervalo
        const intervalMs = config.interval || 30000;
        this.interval = setInterval(async () => {
          await this.insertTestBets(config);
        }, intervalMs);
      }
    } catch (error) {
      logger.error('Error en checkAndRun:', error);
    }
  }

  /**
   * Insertar jugadas de prueba
   */
  async insertTestBets(config) {
    try {
      // Obtener sorteos abiertos
      const { getVenezuelaDateAsUTC, getVenezuelaTimeString } = await import('../lib/dateUtils.js');
      const todayVenezuela = getVenezuelaDateAsUTC();
      const currentTime = getVenezuelaTimeString();
      
      const openDraws = await prisma.draw.findMany({
        where: {
          status: 'OPEN',
          OR: [
            { drawDate: todayVenezuela, drawTime: { gt: currentTime } },
            { drawDate: { gt: todayVenezuela } }
          ]
        },
        include: {
          game: {
            include: {
              items: {
                where: { isActive: true }
              }
            }
          }
        },
        take: 5 // Máximo 5 sorteos
      });

      if (openDraws.length === 0) {
        logger.debug('No hay sorteos abiertos para jugadas de prueba');
        return;
      }

      // Obtener jugadores de prueba
      const testPlayers = await prisma.user.findMany({
        where: {
          role: 'PLAYER',
          username: {
            startsWith: 'test_'
          }
        },
        take: 10
      });

      if (testPlayers.length === 0) {
        logger.warn('No hay jugadores de prueba (username que empiece con test_)');
        return;
      }

      let totalBetsCreated = 0;

      // Crear jugadas para algunos sorteos
      for (const draw of openDraws.slice(0, 2)) {
        const numBets = Math.floor(Math.random() * (config.maxBets - config.minBets + 1)) + config.minBets;

        for (let i = 0; i < numBets; i++) {
          try {
            // Seleccionar jugador aleatorio
            const player = testPlayers[Math.floor(Math.random() * testPlayers.length)];

            // Seleccionar números aleatorios
            const availableItems = draw.game.items;
            if (availableItems.length === 0) continue;

            const numSelections = Math.floor(Math.random() * 3) + 1; // 1-3 números
            const selectedItems = [];
            
            for (let j = 0; j < numSelections; j++) {
              const randomItem = availableItems[Math.floor(Math.random() * availableItems.length)];
              const amount = Math.floor(Math.random() * (config.maxAmount - config.minAmount + 1)) + config.minAmount;
              
              selectedItems.push({
                itemId: randomItem.id,
                amount: amount
              });
            }

            // Crear ticket
            await ticketService.createTicket({
              playerId: player.id,
              drawId: draw.id,
              items: selectedItems,
              origin: 'TEST_AUTO'
            });

            totalBetsCreated++;
          } catch (error) {
            logger.error('Error creando jugada de prueba:', error);
          }
        }
      }

      if (totalBetsCreated > 0) {
        logger.info(`🎲 ${totalBetsCreated} jugadas de prueba creadas`);
      }
    } catch (error) {
      logger.error('Error en insertTestBets:', error);
    }
  }

  /**
   * Ejecutar manualmente (para testing)
   */
  async executeNow() {
    const config = await systemConfigService.getTestBetsConfig();
    if (!config.enabled) {
      throw new Error('Las jugadas de prueba no están activadas');
    }
    await this.insertTestBets(config);
  }
}

export default new TestBetsJob();

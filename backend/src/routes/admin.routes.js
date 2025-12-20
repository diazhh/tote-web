import express from 'express';
import { authenticate, authorize } from '../middlewares/auth.middleware.js';
import { prisma } from '../lib/prisma.js';

const router = express.Router();

router.get('/players', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), async (req, res) => {
  try {
    const players = await prisma.user.findMany({
      where: {
        role: 'PLAYER'
      },
      select: {
        id: true,
        username: true,
        email: true,
        phone: true,
        phoneVerified: true,
        balance: true,
        blockedBalance: true,
        isActive: true,
        createdAt: true,
        updatedAt: true
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: players
    });
  } catch (error) {
    console.error('Error fetching players:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener jugadores'
    });
  }
});

router.get('/tickets', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), async (req, res) => {
  try {
    const tickets = await prisma.ticket.findMany({
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true
          }
        },
        draw: {
          include: {
            game: {
              select: {
                id: true,
                name: true
              }
            }
          }
        },
        details: {
          include: {
            gameItem: {
              select: {
                id: true,
                number: true,
                name: true
              }
            }
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: tickets
    });
  } catch (error) {
    console.error('Error fetching tickets:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener tickets'
    });
  }
});

router.get('/deposits', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), async (req, res) => {
  try {
    const deposits = await prisma.deposit.findMany({
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            phone: true
          }
        },
        systemPagoMovil: {
          select: {
            id: true,
            bankCode: true,
            bankName: true,
            phone: true,
            holderName: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: deposits
    });
  } catch (error) {
    console.error('Error fetching deposits:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener depósitos'
    });
  }
});

router.get('/withdrawals', authenticate, authorize('ADMIN', 'TAQUILLA_ADMIN'), async (req, res) => {
  try {
    const withdrawals = await prisma.withdrawal.findMany({
      include: {
        user: {
          select: {
            id: true,
            username: true,
            email: true,
            phone: true
          }
        },
        pagoMovilAccount: {
          select: {
            id: true,
            bankCode: true,
            bankName: true,
            phone: true,
            cedula: true,
            holderName: true
          }
        }
      },
      orderBy: {
        createdAt: 'desc'
      }
    });

    res.json({
      success: true,
      data: withdrawals
    });
  } catch (error) {
    console.error('Error fetching withdrawals:', error);
    res.status(500).json({
      success: false,
      error: 'Error al obtener retiros'
    });
  }
});

export default router;

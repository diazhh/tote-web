// backend/src/controllers/__tests__/commission.controller.test.js
//
// Phase 12 Plan 12-03 — commission.controller.js unit tests.
//
// Coverage targets the 11 behaviors locked in 12-03-PLAN.md:
//   - createConfig per-formula validation (SALES_PCT requires salesRate, TIERED requires tiers, etc.)
//   - listConfigs returns rows ordered effectiveFrom desc with tiers included
//   - confirmSettlement state-machine gate (DRAFT → CONFIRMED only) + AuditLog write
//   - adjustSettlement originalAmount snapshot (D-02 path 1) + AuditLog write
//   - F-5 enforcement: no updateConfig method on the controller class
//
// Note: route-level auth gates (401/403) are exercised at the routing layer
// (router.use(authenticate, authorize('ADMIN'))) — verified live via curl in <verify>.

import { jest } from '@jest/globals';

// Mock prisma
const mockPrisma = {
  providerCommissionConfig: {
    findMany: jest.fn(),
    create: jest.fn(),
  },
  providerCommissionLedger: {
    findMany: jest.fn(),
  },
  providerWeeklySettlement: {
    findMany: jest.fn(),
    findUnique: jest.fn(),
    update: jest.fn(),
  },
  auditLog: {
    create: jest.fn(),
  },
};
jest.unstable_mockModule('../../lib/prisma.js', () => ({ prisma: mockPrisma }));

// Mock logger
jest.unstable_mockModule('../../lib/logger.js', () => ({
  default: { info: jest.fn(), error: jest.fn(), warn: jest.fn() },
}));

// Mock commission service (so the controller tests focus on controller logic)
const mockCommissionService = {
  buildSettlementExcel: jest.fn(),
  getSettlementWithLedger: jest.fn(),
  getSettlementPdfData: jest.fn(),
};
jest.unstable_mockModule('../../services/commission.service.js', () => mockCommissionService);

// Import AFTER mocks
const { default: commissionController } = await import('../commission.controller.js');

function mockReq({ params = {}, body = {}, query = {}, user = { id: 'admin-1', role: 'ADMIN' }, ip = '127.0.0.1', headers = { 'user-agent': 'jest' } } = {}) {
  return { params, body, query, user, ip, headers };
}

function mockRes() {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.setHeader = jest.fn();
  res.send = jest.fn();
  return res;
}

beforeEach(() => jest.clearAllMocks());

// ────────────────────────────────────────────────────────────────────────────
// createConfig — per-formula validation
// ────────────────────────────────────────────────────────────────────────────

describe('createConfig', () => {
  test('SALES_PCT without salesRate → 400 "salesRate required for SALES_PCT"', async () => {
    const req = mockReq({ body: { apiSystemId: 'sys-1', formulaType: 'SALES_PCT', effectiveFrom: '2026-05-15T00:00:00Z' } });
    const res = mockRes();
    await commissionController.createConfig(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: expect.stringMatching(/salesRate.*SALES_PCT/i) }));
    expect(mockPrisma.providerCommissionConfig.create).not.toHaveBeenCalled();
  });

  test('TIERED with empty tiers → 400 "tiers array required for TIERED"', async () => {
    const req = mockReq({ body: { apiSystemId: 'sys-1', formulaType: 'TIERED', effectiveFrom: '2026-05-15T00:00:00Z', tiers: [] } });
    const res = mockRes();
    await commissionController.createConfig(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: false, error: expect.stringMatching(/tiers.*TIERED/i) }));
  });

  test('UTILITY_PCT without utilityRate → 400', async () => {
    const req = mockReq({ body: { apiSystemId: 'sys-1', formulaType: 'UTILITY_PCT', effectiveFrom: '2026-05-15T00:00:00Z' } });
    const res = mockRes();
    await commissionController.createConfig(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ error: expect.stringMatching(/utilityRate.*UTILITY_PCT/i) }));
  });

  test('SALES_AND_UTILITY_PCT requires BOTH rates → 400 when one missing', async () => {
    const req = mockReq({ body: { apiSystemId: 'sys-1', formulaType: 'SALES_AND_UTILITY_PCT', salesRate: 5, effectiveFrom: '2026-05-15T00:00:00Z' } });
    const res = mockRes();
    await commissionController.createConfig(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('valid SALES_PCT → 201 + persisted row with createdById', async () => {
    const created = { id: 'cfg-1', apiSystemId: 'sys-1', formulaType: 'SALES_PCT', salesRate: '5.5000', tiers: [] };
    mockPrisma.providerCommissionConfig.create.mockResolvedValue(created);
    const req = mockReq({ body: { apiSystemId: 'sys-1', formulaType: 'SALES_PCT', salesRate: 5.5, effectiveFrom: '2026-05-15T00:00:00Z' } });
    const res = mockRes();
    await commissionController.createConfig(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(mockPrisma.providerCommissionConfig.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          apiSystemId: 'sys-1',
          formulaType: 'SALES_PCT',
          createdById: 'admin-1',
        }),
      }),
    );
  });

  test('valid TIERED → 201 + nested tier creates', async () => {
    const created = { id: 'cfg-2', apiSystemId: 'sys-1', formulaType: 'TIERED', tiers: [] };
    mockPrisma.providerCommissionConfig.create.mockResolvedValue(created);
    const req = mockReq({
      body: {
        apiSystemId: 'sys-1',
        formulaType: 'TIERED',
        effectiveFrom: '2026-05-15T00:00:00Z',
        tiers: [
          { minSales: 0, maxSales: 1000, rate: 3.0 },
          { minSales: 1000, maxSales: null, rate: 5.0 },
        ],
      },
    });
    const res = mockRes();
    await commissionController.createConfig(req, res);
    expect(res.status).toHaveBeenCalledWith(201);
    const callArg = mockPrisma.providerCommissionConfig.create.mock.calls[0][0];
    expect(callArg.data.tiers).toBeDefined();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// listConfigs
// ────────────────────────────────────────────────────────────────────────────

describe('listConfigs', () => {
  test('returns rows ordered effectiveFrom desc with tiers included', async () => {
    const rows = [
      { id: 'c2', effectiveFrom: new Date('2026-05-15'), tiers: [] },
      { id: 'c1', effectiveFrom: new Date('2026-04-17'), tiers: [] },
    ];
    mockPrisma.providerCommissionConfig.findMany.mockResolvedValue(rows);
    const req = mockReq({ params: { apiSystemId: 'sys-1' } });
    const res = mockRes();
    await commissionController.listConfigs(req, res);
    expect(mockPrisma.providerCommissionConfig.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { apiSystemId: 'sys-1' },
        orderBy: { effectiveFrom: 'desc' },
        include: expect.objectContaining({ tiers: expect.any(Object) }),
      }),
    );
    expect(res.json).toHaveBeenCalledWith({ success: true, data: rows });
  });
});

// ────────────────────────────────────────────────────────────────────────────
// confirmSettlement — state-machine gate + AuditLog
// ────────────────────────────────────────────────────────────────────────────

describe('confirmSettlement', () => {
  test('DRAFT → 200 + status CONFIRMED + AuditLog SETTLEMENT_CONFIRMED', async () => {
    mockPrisma.providerWeeklySettlement.findUnique.mockResolvedValue({
      id: 'set-1', status: 'DRAFT', amount: '123.45000000', apiSystemId: 'sys-1',
    });
    mockPrisma.providerWeeklySettlement.update.mockResolvedValue({
      id: 'set-1', status: 'CONFIRMED', amount: '123.45000000', confirmedAt: new Date(), confirmedById: 'admin-1',
    });
    mockPrisma.auditLog.create.mockResolvedValue({ id: 'log-1' });

    const req = mockReq({ params: { id: 'set-1' } });
    const res = mockRes();
    await commissionController.confirmSettlement(req, res);

    expect(mockPrisma.providerWeeklySettlement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'set-1' },
        data: expect.objectContaining({ status: 'CONFIRMED', confirmedById: 'admin-1' }),
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'SETTLEMENT_CONFIRMED',
          entity: 'ProviderWeeklySettlement',
          entityId: 'set-1',
          userId: 'admin-1',
          ipAddress: '127.0.0.1',
          userAgent: 'jest',
          changes: expect.objectContaining({
            previousStatus: 'DRAFT',
            newStatus: 'CONFIRMED',
            amount: '123.45000000',
          }),
        }),
      }),
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('CONFIRMED → 400 "Settlement is not in DRAFT status" (D-03)', async () => {
    mockPrisma.providerWeeklySettlement.findUnique.mockResolvedValue({
      id: 'set-1', status: 'CONFIRMED', amount: '123.45',
    });
    const req = mockReq({ params: { id: 'set-1' } });
    const res = mockRes();
    await commissionController.confirmSettlement(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: false,
      error: expect.stringContaining('Settlement is not in DRAFT'),
    }));
    expect(mockPrisma.providerWeeklySettlement.update).not.toHaveBeenCalled();
    expect(mockPrisma.auditLog.create).not.toHaveBeenCalled();
  });

  test('ADJUSTED → 400 (only DRAFT may transition to CONFIRMED)', async () => {
    mockPrisma.providerWeeklySettlement.findUnique.mockResolvedValue({
      id: 'set-1', status: 'ADJUSTED', amount: '123.45',
    });
    const req = mockReq({ params: { id: 'set-1' } });
    const res = mockRes();
    await commissionController.confirmSettlement(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.providerWeeklySettlement.update).not.toHaveBeenCalled();
  });

  test('not found → 404', async () => {
    mockPrisma.providerWeeklySettlement.findUnique.mockResolvedValue(null);
    const req = mockReq({ params: { id: 'nope' } });
    const res = mockRes();
    await commissionController.confirmSettlement(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });
});

// ────────────────────────────────────────────────────────────────────────────
// adjustSettlement — D-02 path 1 (originalAmount snapshot + AuditLog)
// ────────────────────────────────────────────────────────────────────────────

describe('adjustSettlement', () => {
  test('CONFIRMED row → 200, status ADJUSTED, originalAmount snapshot, AuditLog SETTLEMENT_ADJUSTED', async () => {
    mockPrisma.providerWeeklySettlement.findUnique.mockResolvedValue({
      id: 'set-1', status: 'CONFIRMED', amount: '100.00000000', apiSystemId: 'sys-1',
    });
    mockPrisma.providerWeeklySettlement.update.mockResolvedValue({
      id: 'set-1', status: 'ADJUSTED', amount: '999.50000000', originalAmount: '100.00000000',
    });
    mockPrisma.auditLog.create.mockResolvedValue({ id: 'log-2' });

    const req = mockReq({
      params: { id: 'set-1' },
      body: { amount: '999.50000000', adjustmentReason: 'manual override per audit' },
    });
    const res = mockRes();
    await commissionController.adjustSettlement(req, res);

    expect(mockPrisma.providerWeeklySettlement.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'set-1' },
        data: expect.objectContaining({
          amount: '999.50000000',
          originalAmount: '100.00000000',
          adjustmentReason: 'manual override per audit',
          status: 'ADJUSTED',
        }),
      }),
    );
    expect(mockPrisma.auditLog.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          action: 'SETTLEMENT_ADJUSTED',
          entity: 'ProviderWeeklySettlement',
          entityId: 'set-1',
        }),
      }),
    );
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({ success: true }));
  });

  test('missing adjustmentReason → 400 "adjustmentReason required"', async () => {
    const req = mockReq({
      params: { id: 'set-1' },
      body: { amount: '999.50000000' },
    });
    const res = mockRes();
    await commissionController.adjustSettlement(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      error: expect.stringMatching(/adjustmentReason/i),
    }));
    expect(mockPrisma.providerWeeklySettlement.update).not.toHaveBeenCalled();
  });

  test('DRAFT row → 400 "Adjustment requires CONFIRMED or ADJUSTED status"', async () => {
    mockPrisma.providerWeeklySettlement.findUnique.mockResolvedValue({
      id: 'set-1', status: 'DRAFT', amount: '100.00',
    });
    const req = mockReq({
      params: { id: 'set-1' },
      body: { amount: '999.50', adjustmentReason: 'manual override per audit' },
    });
    const res = mockRes();
    await commissionController.adjustSettlement(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    expect(mockPrisma.providerWeeklySettlement.update).not.toHaveBeenCalled();
  });
});

// ────────────────────────────────────────────────────────────────────────────
// F-5 enforcement: no updateConfig
// ────────────────────────────────────────────────────────────────────────────

describe('F-5 enforcement', () => {
  test('controller has no updateConfig method (append-only)', () => {
    expect(commissionController.updateConfig).toBeUndefined();
  });
});

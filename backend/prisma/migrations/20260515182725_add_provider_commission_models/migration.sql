-- CreateEnum
CREATE TYPE "CommissionFormulaType" AS ENUM ('SALES_PCT', 'UTILITY_PCT', 'SALES_AND_UTILITY_PCT', 'TIERED');

-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('DRAFT', 'CONFIRMED', 'ADJUSTED');

-- CreateTable
CREATE TABLE "ProviderCommissionConfig" (
    "id" TEXT NOT NULL,
    "apiSystemId" TEXT NOT NULL,
    "formulaType" "CommissionFormulaType" NOT NULL,
    "salesRate" DECIMAL(15,4),
    "utilityRate" DECIMAL(15,4),
    "effectiveFrom" TIMESTAMP(3) NOT NULL,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderCommissionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCommissionTier" (
    "id" TEXT NOT NULL,
    "configId" TEXT NOT NULL,
    "minSales" DECIMAL(18,8) NOT NULL,
    "maxSales" DECIMAL(18,8),
    "rate" DECIMAL(15,4) NOT NULL,

    CONSTRAINT "ProviderCommissionTier_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderCommissionLedger" (
    "id" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "apiSystemId" TEXT NOT NULL,
    "amount" DECIMAL(18,8) NOT NULL,
    "salesBase" DECIMAL(18,8) NOT NULL,
    "utilityBase" DECIMAL(18,8) NOT NULL,
    "configId" TEXT NOT NULL,
    "configSnapshot" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderCommissionLedger_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ProviderWeeklySettlement" (
    "id" TEXT NOT NULL,
    "apiSystemId" TEXT NOT NULL,
    "isoYear" INTEGER NOT NULL,
    "isoWeek" INTEGER NOT NULL,
    "amount" DECIMAL(18,8) NOT NULL,
    "originalAmount" DECIMAL(18,8),
    "adjustmentReason" TEXT,
    "ledgerRowCount" INTEGER NOT NULL DEFAULT 0,
    "status" "SettlementStatus" NOT NULL DEFAULT 'DRAFT',
    "snapshotAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" TEXT,

    CONSTRAINT "ProviderWeeklySettlement_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ProviderCommissionConfig_apiSystemId_effectiveFrom_idx" ON "ProviderCommissionConfig"("apiSystemId", "effectiveFrom" DESC);

-- CreateIndex
CREATE INDEX "ProviderCommissionConfig_apiSystemId_idx" ON "ProviderCommissionConfig"("apiSystemId");

-- CreateIndex
CREATE INDEX "ProviderCommissionTier_configId_idx" ON "ProviderCommissionTier"("configId");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCommissionTier_configId_minSales_key" ON "ProviderCommissionTier"("configId", "minSales");

-- CreateIndex
CREATE INDEX "ProviderCommissionLedger_drawId_idx" ON "ProviderCommissionLedger"("drawId");

-- CreateIndex
CREATE INDEX "ProviderCommissionLedger_apiSystemId_createdAt_idx" ON "ProviderCommissionLedger"("apiSystemId", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderCommissionLedger_drawId_apiSystemId_key" ON "ProviderCommissionLedger"("drawId", "apiSystemId");

-- CreateIndex
CREATE INDEX "ProviderWeeklySettlement_isoYear_isoWeek_idx" ON "ProviderWeeklySettlement"("isoYear", "isoWeek");

-- CreateIndex
CREATE INDEX "ProviderWeeklySettlement_apiSystemId_status_idx" ON "ProviderWeeklySettlement"("apiSystemId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "ProviderWeeklySettlement_apiSystemId_isoYear_isoWeek_key" ON "ProviderWeeklySettlement"("apiSystemId", "isoYear", "isoWeek");

-- AddForeignKey
ALTER TABLE "ProviderCommissionConfig" ADD CONSTRAINT "ProviderCommissionConfig_apiSystemId_fkey" FOREIGN KEY ("apiSystemId") REFERENCES "ApiSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCommissionTier" ADD CONSTRAINT "ProviderCommissionTier_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ProviderCommissionConfig"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCommissionLedger" ADD CONSTRAINT "ProviderCommissionLedger_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "Draw"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCommissionLedger" ADD CONSTRAINT "ProviderCommissionLedger_apiSystemId_fkey" FOREIGN KEY ("apiSystemId") REFERENCES "ApiSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderCommissionLedger" ADD CONSTRAINT "ProviderCommissionLedger_configId_fkey" FOREIGN KEY ("configId") REFERENCES "ProviderCommissionConfig"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProviderWeeklySettlement" ADD CONSTRAINT "ProviderWeeklySettlement_apiSystemId_fkey" FOREIGN KEY ("apiSystemId") REFERENCES "ApiSystem"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


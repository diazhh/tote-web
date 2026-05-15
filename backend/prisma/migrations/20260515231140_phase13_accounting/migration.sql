-- CreateEnum
CREATE TYPE "AccountingEntryType" AS ENUM ('INCOME', 'EXPENSE', 'PAYMENT');

-- CreateEnum
CREATE TYPE "ExchangeRateType" AS ENUM ('BCV', 'PARALELO', 'OTRO');

-- CreateEnum
CREATE TYPE "AccountingCurrency" AS ENUM ('BsF', 'USD');

-- CreateTable
CREATE TABLE "ExchangeRate" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "rateBsPerUsd" DECIMAL(18,8) NOT NULL,
    "rateType" "ExchangeRateType" NOT NULL,
    "notes" TEXT,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ExchangeRate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Category" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "appliesTo" "AccountingEntryType" NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Category_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingEntry" (
    "id" TEXT NOT NULL,
    "type" "AccountingEntryType" NOT NULL,
    "entryDate" DATE NOT NULL,
    "categoryId" TEXT NOT NULL,
    "amountBsF" DECIMAL(18,8) NOT NULL,
    "originalAmount" DECIMAL(18,8),
    "originalCurrency" "AccountingCurrency" NOT NULL,
    "exchangeRateId" TEXT,
    "description" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reversesId" TEXT,
    "reversedById" TEXT,
    "reversalReason" TEXT,
    "settlementId" TEXT,
    "sequentialNo" SERIAL NOT NULL,

    CONSTRAINT "AccountingEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountingEntryAttachment" (
    "id" TEXT NOT NULL,
    "entryId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountingEntryAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "ExchangeRate_date_createdAt_idx" ON "ExchangeRate"("date", "createdAt" DESC);

-- CreateIndex
CREATE INDEX "ExchangeRate_rateType_date_idx" ON "ExchangeRate"("rateType", "date");

-- CreateIndex
CREATE INDEX "Category_appliesTo_isActive_idx" ON "Category"("appliesTo", "isActive");

-- CreateIndex
CREATE UNIQUE INDEX "Category_appliesTo_name_key" ON "Category"("appliesTo", "name");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingEntry_reversesId_key" ON "AccountingEntry"("reversesId");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingEntry_reversedById_key" ON "AccountingEntry"("reversedById");

-- CreateIndex
CREATE UNIQUE INDEX "AccountingEntry_sequentialNo_key" ON "AccountingEntry"("sequentialNo");

-- CreateIndex
CREATE INDEX "AccountingEntry_entryDate_type_idx" ON "AccountingEntry"("entryDate", "type");

-- CreateIndex
CREATE INDEX "AccountingEntry_categoryId_entryDate_idx" ON "AccountingEntry"("categoryId", "entryDate");

-- CreateIndex
CREATE INDEX "AccountingEntry_settlementId_idx" ON "AccountingEntry"("settlementId");

-- CreateIndex
CREATE INDEX "AccountingEntry_type_entryDate_idx" ON "AccountingEntry"("type", "entryDate");

-- CreateIndex
CREATE INDEX "AccountingEntryAttachment_entryId_idx" ON "AccountingEntryAttachment"("entryId");

-- AddForeignKey
ALTER TABLE "ExchangeRate" ADD CONSTRAINT "ExchangeRate_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Category" ADD CONSTRAINT "Category_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_exchangeRateId_fkey" FOREIGN KEY ("exchangeRateId") REFERENCES "ExchangeRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_settlementId_fkey" FOREIGN KEY ("settlementId") REFERENCES "ProviderWeeklySettlement"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "AccountingEntry"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntryAttachment" ADD CONSTRAINT "AccountingEntryAttachment_entryId_fkey" FOREIGN KEY ("entryId") REFERENCES "AccountingEntry"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AccountingEntryAttachment" ADD CONSTRAINT "AccountingEntryAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;


-- ============================================
-- SEED: Initial Category rows (D-02, idempotent)
-- 5 EXPENSE + 2 INCOME + 2 PAYMENT = 9 rows total
-- createdById resolved at migration time to the oldest ADMIN user
-- ON CONFLICT ("appliesTo","name") DO NOTHING makes re-runs safe
-- ============================================
INSERT INTO "Category" ("id", "name", "appliesTo", "isActive", "createdById", "createdAt", "updatedAt")
SELECT gen_random_uuid()::text, v.name, v.applies_to::"AccountingEntryType", true, u.id, NOW(), NOW()
FROM (VALUES
  ('Sueldos',              'EXPENSE'),
  ('Internet',             'EXPENSE'),
  ('Alquiler',             'EXPENSE'),
  ('Hosting',              'EXPENSE'),
  ('Servicios',            'EXPENSE'),
  ('Premios cobrados',     'INCOME'),
  ('Otros ingresos',       'INCOME'),
  ('Comisiones proveedor', 'PAYMENT'),
  ('Premios pagados',      'PAYMENT')
) AS v(name, applies_to)
CROSS JOIN LATERAL (
  SELECT id FROM "User" WHERE role = 'ADMIN' ORDER BY "createdAt" ASC LIMIT 1
) AS u
ON CONFLICT ("appliesTo", "name") DO NOTHING;

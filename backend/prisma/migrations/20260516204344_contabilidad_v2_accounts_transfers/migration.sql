-- AlterTable
ALTER TABLE "AccountingEntry" ADD COLUMN     "accountId" TEXT;

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "currency" "AccountingCurrency" NOT NULL,
    "openingBalance" DECIMAL(18,8) NOT NULL,
    "openingDate" DATE NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "sortOrder" INTEGER NOT NULL DEFAULT 0,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Transfer" (
    "id" TEXT NOT NULL,
    "transferDate" DATE NOT NULL,
    "fromAccountId" TEXT NOT NULL,
    "toAccountId" TEXT NOT NULL,
    "amountFrom" DECIMAL(18,8) NOT NULL,
    "amountTo" DECIMAL(18,8) NOT NULL,
    "exchangeRateId" TEXT,
    "description" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "reversesId" TEXT,
    "reversedById" TEXT,
    "reversalReason" TEXT,
    "sequentialNo" SERIAL NOT NULL,

    CONSTRAINT "Transfer_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TransferAttachment" (
    "id" TEXT NOT NULL,
    "transferId" TEXT NOT NULL,
    "filename" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "TransferAttachment_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Account_isActive_sortOrder_idx" ON "Account"("isActive", "sortOrder");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_reversesId_key" ON "Transfer"("reversesId");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_reversedById_key" ON "Transfer"("reversedById");

-- CreateIndex
CREATE UNIQUE INDEX "Transfer_sequentialNo_key" ON "Transfer"("sequentialNo");

-- CreateIndex
CREATE INDEX "Transfer_transferDate_idx" ON "Transfer"("transferDate");

-- CreateIndex
CREATE INDEX "Transfer_fromAccountId_transferDate_idx" ON "Transfer"("fromAccountId", "transferDate");

-- CreateIndex
CREATE INDEX "Transfer_toAccountId_transferDate_idx" ON "Transfer"("toAccountId", "transferDate");

-- CreateIndex
CREATE INDEX "TransferAttachment_transferId_idx" ON "TransferAttachment"("transferId");

-- CreateIndex
CREATE INDEX "AccountingEntry_accountId_entryDate_idx" ON "AccountingEntry"("accountId", "entryDate");

-- AddForeignKey
ALTER TABLE "AccountingEntry" ADD CONSTRAINT "AccountingEntry_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_fromAccountId_fkey" FOREIGN KEY ("fromAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_toAccountId_fkey" FOREIGN KEY ("toAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_exchangeRateId_fkey" FOREIGN KEY ("exchangeRateId") REFERENCES "ExchangeRate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Transfer" ADD CONSTRAINT "Transfer_reversesId_fkey" FOREIGN KEY ("reversesId") REFERENCES "Transfer"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferAttachment" ADD CONSTRAINT "TransferAttachment_transferId_fkey" FOREIGN KEY ("transferId") REFERENCES "Transfer"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TransferAttachment" ADD CONSTRAINT "TransferAttachment_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- v2: seed default account "Sin clasificar" + backfill orphan entries
INSERT INTO "Account" (
  id, name, currency, "openingBalance", "openingDate",
  "isActive", "sortOrder", "createdById", "createdAt", "updatedAt"
)
SELECT
  '00000000-0000-0000-0000-000000000001',
  'Sin clasificar',
  'BsF'::"AccountingCurrency",
  0,
  '2025-01-01'::date,
  TRUE,
  999,
  u.id,
  NOW(),
  NOW()
FROM "User" u
WHERE u.role = 'ADMIN'
ORDER BY u."createdAt"
LIMIT 1;

-- If no admin user existed yet, abort to avoid orphan account
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM "Account" WHERE id = '00000000-0000-0000-0000-000000000001') THEN
    RAISE EXCEPTION 'Cannot create default Account: no ADMIN user exists. Create an admin first.';
  END IF;
END $$;

-- Backfill orphan entries to the default account
UPDATE "AccountingEntry"
SET "accountId" = '00000000-0000-0000-0000-000000000001'
WHERE "accountId" IS NULL;

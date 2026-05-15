-- CreateTable
CREATE TABLE "DrawFinancial" (
    "id" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "totalSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalPrize" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "utility" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ticketCount" INTEGER NOT NULL DEFAULT 0,
    "closedAt" TIMESTAMP(3),
    "totalizedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrawFinancial_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DrawFinancialProvider" (
    "id" TEXT NOT NULL,
    "drawId" TEXT NOT NULL,
    "apiSystemId" TEXT,
    "totalSales" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "totalPrize" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "ticketCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DrawFinancialProvider_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "DrawFinancial_drawId_key" ON "DrawFinancial"("drawId");

-- CreateIndex
CREATE INDEX "DrawFinancial_drawId_idx" ON "DrawFinancial"("drawId");

-- CreateIndex
CREATE INDEX "DrawFinancial_totalizedAt_idx" ON "DrawFinancial"("totalizedAt");

-- CreateIndex
CREATE INDEX "DrawFinancialProvider_drawId_idx" ON "DrawFinancialProvider"("drawId");

-- CreateIndex
CREATE INDEX "DrawFinancialProvider_apiSystemId_idx" ON "DrawFinancialProvider"("apiSystemId");

-- CreateIndex
CREATE UNIQUE INDEX "DrawFinancialProvider_drawId_apiSystemId_key" ON "DrawFinancialProvider"("drawId", "apiSystemId");

-- AddForeignKey
ALTER TABLE "DrawFinancial" ADD CONSTRAINT "DrawFinancial_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "Draw"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawFinancialProvider" ADD CONSTRAINT "DrawFinancialProvider_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "Draw"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DrawFinancialProvider" ADD CONSTRAINT "DrawFinancialProvider_apiSystemId_fkey" FOREIGN KEY ("apiSystemId") REFERENCES "ApiSystem"("id") ON DELETE SET NULL ON UPDATE CASCADE;


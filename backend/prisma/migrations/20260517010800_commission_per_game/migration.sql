-- AlterTable
ALTER TABLE "ProviderCommissionConfig" ADD COLUMN "gameId" TEXT;

-- CreateIndex
CREATE INDEX "ProviderCommissionConfig_apiSystemId_gameId_effectiveFrom_idx" ON "ProviderCommissionConfig"("apiSystemId", "gameId", "effectiveFrom" DESC);

-- AddForeignKey
ALTER TABLE "ProviderCommissionConfig" ADD CONSTRAINT "ProviderCommissionConfig_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE SET NULL ON UPDATE CASCADE;

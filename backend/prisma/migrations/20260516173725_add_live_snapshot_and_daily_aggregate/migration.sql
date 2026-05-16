-- CreateTable
CREATE TABLE "DrawLiveSnapshot" (
    "drawId" TEXT NOT NULL,
    "totalSales" DECIMAL(15,2) NOT NULL,
    "ticketCount" INTEGER NOT NULL,
    "byProvider" JSONB NOT NULL,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DrawLiveSnapshot_pkey" PRIMARY KEY ("drawId")
);

-- CreateTable
CREATE TABLE "DailyAggregateSnapshot" (
    "id" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "gameId" TEXT,
    "source" "TicketSource",
    "apiSystemId" TEXT,
    "totalSales" DECIMAL(15,2) NOT NULL,
    "ticketCount" INTEGER NOT NULL,
    "prizeTotal" DECIMAL(15,2) NOT NULL,
    "refreshedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DailyAggregateSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "DrawLiveSnapshot_refreshedAt_idx" ON "DrawLiveSnapshot"("refreshedAt");

-- CreateIndex
CREATE INDEX "DailyAggregateSnapshot_date_idx" ON "DailyAggregateSnapshot"("date");

-- CreateIndex
CREATE UNIQUE INDEX "DailyAggregateSnapshot_date_gameId_source_apiSystemId_key" ON "DailyAggregateSnapshot"("date", "gameId", "source", "apiSystemId");

-- CreateIndex
CREATE INDEX "Ticket_drawId_status_idx" ON "Ticket"("drawId", "status");

-- CreateIndex
CREATE INDEX "Ticket_apiSystemId_drawId_idx" ON "Ticket"("apiSystemId", "drawId");

-- AddForeignKey
ALTER TABLE "DrawLiveSnapshot" ADD CONSTRAINT "DrawLiveSnapshot_drawId_fkey" FOREIGN KEY ("drawId") REFERENCES "Draw"("id") ON DELETE CASCADE ON UPDATE CASCADE;

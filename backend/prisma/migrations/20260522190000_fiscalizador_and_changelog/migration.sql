-- Migración: rol FISCALIZADOR + UserApiSystem M2M + módulo Changelog
-- Fecha: 2026-05-22
-- Notas:
--  • ALTER TYPE ... ADD VALUE NO se puede ejecutar en la misma transacción
--    que sentencias que USAN ese valor nuevo. Prisma ejecuta cada migración
--    en una transacción implícita, por eso este archivo solo añade el valor
--    del enum + tablas/columnas. No referencia FISCALIZADOR como dato (solo schema).
--  • La M2M UserApiSystem es independiente del campo singular User.apiSystemId
--    (que se mantiene para el rol PROVIDER).

-- ============================================================
-- AlterEnum: nuevo valor FISCALIZADOR en UserRole
-- ============================================================
ALTER TYPE "UserRole" ADD VALUE IF NOT EXISTS 'FISCALIZADOR';

-- ============================================================
-- CreateEnum: ChangelogCategory
-- ============================================================
DO $$ BEGIN
    CREATE TYPE "ChangelogCategory" AS ENUM ('FEATURE', 'IMPROVEMENT', 'FIX', 'BREAKING');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- ============================================================
-- AlterTable: User.fiscalIncludeTaquilla
-- ============================================================
ALTER TABLE "User"
    ADD COLUMN IF NOT EXISTS "fiscalIncludeTaquilla" BOOLEAN NOT NULL DEFAULT false;

-- ============================================================
-- CreateTable: UserApiSystem (M2M fiscalizador ↔ ApiSystem)
-- ============================================================
CREATE TABLE IF NOT EXISTS "UserApiSystem" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "apiSystemId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserApiSystem_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX IF NOT EXISTS "UserApiSystem_userId_apiSystemId_key"
    ON "UserApiSystem"("userId", "apiSystemId");
CREATE INDEX IF NOT EXISTS "UserApiSystem_userId_idx" ON "UserApiSystem"("userId");
CREATE INDEX IF NOT EXISTS "UserApiSystem_apiSystemId_idx" ON "UserApiSystem"("apiSystemId");

DO $$ BEGIN
    ALTER TABLE "UserApiSystem"
        ADD CONSTRAINT "UserApiSystem_userId_fkey"
        FOREIGN KEY ("userId") REFERENCES "User"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    ALTER TABLE "UserApiSystem"
        ADD CONSTRAINT "UserApiSystem_apiSystemId_fkey"
        FOREIGN KEY ("apiSystemId") REFERENCES "ApiSystem"("id")
        ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ============================================================
-- CreateTable: ChangelogEntry
-- ============================================================
CREATE TABLE IF NOT EXISTS "ChangelogEntry" (
    "id" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "category" "ChangelogCategory" NOT NULL DEFAULT 'IMPROVEMENT',
    "publishedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isPublished" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ChangelogEntry_pkey" PRIMARY KEY ("id")
);

CREATE INDEX IF NOT EXISTS "ChangelogEntry_publishedAt_idx" ON "ChangelogEntry"("publishedAt");
CREATE INDEX IF NOT EXISTS "ChangelogEntry_isPublished_publishedAt_idx"
    ON "ChangelogEntry"("isPublished", "publishedAt");

DO $$ BEGIN
    ALTER TABLE "ChangelogEntry"
        ADD CONSTRAINT "ChangelogEntry_createdById_fkey"
        FOREIGN KEY ("createdById") REFERENCES "User"("id")
        ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN null; END $$;

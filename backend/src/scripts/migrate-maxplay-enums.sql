-- Maxplay provider integration: extend enums
-- Apply once on production VPS 144 before deploying the new code.
--
-- Usage:
--   ssh 144 "PGPASSWORD='ToteSecure2024*' psql -U tote_user -h localhost -p 5433 -d tote_db -f - < backend/src/scripts/migrate-maxplay-enums.sql"
-- Or copy the file and pipe psql -f.

ALTER TYPE "ApiSystemMode" ADD VALUE IF NOT EXISTS 'SCRAPE';
ALTER TYPE "TicketSource" ADD VALUE IF NOT EXISTS 'EXTERNAL_SCRAPE';

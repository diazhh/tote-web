-- Maxplay provider seed
-- Idempotent: safe to run multiple times. Apply once on production VPS 144.
--
-- ssh 144 "PGPASSWORD='ToteSecure2024*' psql -U tote_user -h localhost -p 5433 -d tote_db" < backend/src/scripts/seed-maxplay-provider.sql

INSERT INTO "ApiSystem" (id, name, description, slug, mode, "isActive", "createdAt", "updatedAt")
VALUES (
  gen_random_uuid(),
  'Maxplay',
  'Proveedor de TRIPLE PANTERA / TERMINAL PANTERA via scraping autenticado (mpgadmin.maxplaygo.com)',
  'maxplay',
  'SCRAPE',
  false,   -- arranca inactivo; activar via UI cuando todo esté listo
  NOW(),
  NOW()
)
ON CONFLICT (slug) DO UPDATE
  SET mode = 'SCRAPE',
      description = EXCLUDED.description,
      "updatedAt" = NOW()
RETURNING id, slug, mode, "isActive";

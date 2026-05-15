# Phase 12 Discussion Log

**Date:** 2026-05-15
**Mode:** discuss

## Decisions captured

### Area 1 — Behavior when a provider has no commission config

**Q:** Cuando un proveedor existe pero no tiene config de comisión cargada, ¿qué pasa al totalizar un draw suyo?

- Skip silencioso con warn ← **selected** → D-01
- Ledger row con status=SKIPPED, amount=0
- Bloquear el pipeline

### Area 2 — When does a settlement become ADJUSTED?

**Q:** ¿En qué casos una settlement pasa al estado ADJUSTED?

- Override manual del admin ← **selected** → D-02 path 1
- Re-totalización de un draw ya incluido en una settlement CONFIRMED ← **selected** → D-02 path 2
- Compensating row (ticket cancelado post-confirm) ← not selected

### Area 3 — Can a CONFIRMED settlement be un-confirmed?

**Q:** ¿Una settlement CONFIRMED puede deshacerse?

- Sí, con motivo escrito y audit log
- **No — CONFIRMED es terminal** ← selected → D-03
- Sí, sin audit

### Area 4 — TIERED bracket reset boundary

**Q:** TIERED resetea sus brackets cómo?

- **Lunes 00:00 VE (Recomendado)** ← selected → D-04
- Domingo 23:59 VE
- Por draw individual (no semanal)

### Area 5 — UI placement

**Q:** ¿Dónde vive la UI de comisiones?

- **Tab nuevo dentro de /admin/proveedores (Recomendado)** ← selected → D-05
- Sección nueva completa /admin/comisiones
- Embebido en la pantalla de cada draw

### Area 6 — Settlement identifier format

**Q:** ¿Cómo se identifica una settlement?

- **ISO year + week (ej. '2026-W19')** ← selected → D-06
- Rango de fechas humano
- Ambos visibles

### Area 7 — Backfill execution UX

**Q:** ¿Cómo se ejecuta el backfill histórico?

- **Script CLI standalone (como Phase 11)** ← selected → D-07
- Botón en /admin/comisiones
- Ambos

## Outcome

7 decisions locked (D-01..D-07). CONTEXT.md written. Ready for `/gsd-plan-phase 12`.

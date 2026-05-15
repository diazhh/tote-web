# Phase 14 Discussion Log

**Date:** 2026-05-15
**Mode:** discuss

## Decisions captured

### Area 1 — USD column rate for weekly P&L

**Q:** ¿Qué tasa de cambio usar para 'balance neto USD eq'?

- **La tasa del lunes (inicio de semana)** ← selected → D-01
- La tasa del domingo (cierre)
- Promedio de la semana
- Última cargada del periodo

### Area 2 — P&L expenses scope

**Q:** ¿Qué cuentan como 'expenses' en la fórmula?

- **Solo AccountingEntry.type = EXPENSE** ← selected → D-02
- EXPENSE + PAYMENT
- EXPENSE + PAYMENT (no enlazado a settlement)

### Area 3 — UI placement

**Q:** ¿Dónde vive el dashboard P&L?

- **Nueva sección /admin/reportes/pnl-semanal** ← selected → D-03
- Sub-tab en /admin/contabilidad
- Top-level /admin/finanzas hub

### Area 4 — Provider filter

**Q:** ¿Permite filtrar por proveedor?

- **Total agregado por defecto + filtro opcional por proveedor** ← selected → D-04
- Solo total agregado
- Una tabla por proveedor + total

### Area 5 — REPORT_USE_MATERIALIZED rollout in local

**Q:** ¿Cuándo se prende el flag en local?

- Prenderlo desde el primer minuto
- **Prenderlo solo después de re-correr el backfill de Phase 11 contra los 5937 draws** ← selected → D-05
- Probar ambos paths antes de decidir

### Area 6 — prizesProcessed retroactive fix location

**Q:** ¿Dónde corre el fix retroactivo?

- **Task dentro de Phase 14, antes de prender el flag** ← selected → D-05 (task ownership)
- Hot-patch en Phase 11
- Operador manual

Note: also led to D-06 (shadow-comparison test) as a natural extension — both paths run side-by-side so we prove the refactor closes the bug rather than just hoping.

## Outcome

6 decisions locked (D-01..D-06). CONTEXT.md written. Ready for `/gsd-plan-phase 14`.

Milestone v1.3 discuss phase complete (Phases 11, 12, 13, 14 all have CONTEXT.md). Phases 11 already executed. Phases 12-13-14 plans next.

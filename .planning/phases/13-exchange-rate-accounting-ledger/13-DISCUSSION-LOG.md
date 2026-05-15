# Phase 13 Discussion Log

**Date:** 2026-05-15
**Mode:** discuss

## Decisions captured

### Area 1 — Rate selection when multiple same-day rates exist

**Q:** Si admin tiene cargada tasa BCV y PARALELO para el mismo día, ¿cuál usa el sistema?

- Admin elige por cada entry
- BCV por defecto, override manual
- **Siempre la última cargada del día** ← selected → D-01

### Area 2 — Category structure

**Q:** Categorías por tipo o lista única?

- **Por tipo (INCOME / EXPENSE / PAYMENT separadas)** ← selected → D-02
- Lista única
- Por tipo con seeds default

### Area 3 — PAYMENT → Settlement relationship

**Q:** ¿Cómo se relaciona un PAYMENT con un Settlement?

- **FK opcional, 1 settlement → N payments** ← selected → D-03
- FK obligatorio cuando type=PAYMENT, 1:1
- FK opcional 1:1

### Area 4 — Receipts per entry

**Q:** ¿Pueden adjuntarse múltiples recibos a un entry?

- 1 archivo por entry, reemplazable
- **N archivos por entry** ← selected → D-04
- 1 archivo append-only

### Area 5 — UI placement

**Q:** ¿Dónde vive el módulo de contabilidad?

- **Sección nueva /admin/contabilidad con sub-tabs (Asientos, Tasas, Categorías, Pagos)** ← selected → D-05
- /admin/finanzas como hub
- Embebido en /admin/comisiones

### Area 6 — Delete / correction

**Q:** ¿Cómo elimina/corrige un entry?

- **Botón "Reversar" — sistema crea automático reversal entry** ← selected → D-06
- Admin crea manualmente entry negativa
- Soft-delete

### Area 7 — AuditLog events

**Q:** ¿Qué eventos quedan en AuditLog?

- **Crear/reversar ExchangeRate** ← selected
- **Crear/editar/reversar AccountingEntry** ← selected
- **Crear/desactivar Category** ← selected
- **Upload/delete Receipt** ← selected

All 4 selected → D-07 covers all categories.

## Outcome

7 decisions locked (D-01..D-07). CONTEXT.md written. Ready for `/gsd-plan-phase 13`.

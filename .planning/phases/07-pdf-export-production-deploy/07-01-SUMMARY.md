---
phase: 07-pdf-export-production-deploy
plan: "01"
subsystem: reporting
tags: [pdf, export, backend, frontend, reports]
dependency_graph:
  requires: []
  provides: [pdf-export-endpoint, pdf-download-button]
  affects: [monitor-controller, monitor-routes, reportes-page]
tech_stack:
  added: []
  patterns: [pdfkit-streaming-to-response, fetch-blob-download-with-auth]
key_files:
  created: []
  modified:
    - backend/src/controllers/monitor.controller.js
    - backend/src/routes/monitor.routes.js
    - frontend/app/admin/reportes/page.js
decisions:
  - "Used dynamic import for PDFKit (`(await import('pdfkit')).default`) to stay compatible with ES module context in the controller"
  - "Fetch+blob approach chosen for the frontend (not window.open) because the endpoint requires Authorization header — a plain URL would receive 401"
  - "PDF route registered before /reporte in monitor.routes.js to avoid Express route ambiguity"
metrics:
  duration: "2 minutes"
  completed_date: "2026-04-01"
  tasks_completed: 2
  files_modified: 3
---

# Phase 07 Plan 01: PDF Export Summary

## One-liner

Server-side PDF export of the filtered draws report using PDFKit streaming, with a "Descargar PDF" button in the admin reportes page that fetches via bearer token and triggers a file download.

## What Was Built

### Task 1: Backend PDF endpoint (`3ac310b`)

Added `getReportePdf` controller method to `monitor.controller.js` that:

- Resolves query params (date/dateFrom/dateTo/gameId/source/apiSystemId) with identical logic to `getDailyReport`
- Builds a human-readable filter label string shown in the PDF header
- Calls `monitorService.getDailyReport` with resolved params
- Streams a multi-page PDF via PDFKit (`bufferPages: true`) containing:
  - Title block with filter summary and generation timestamp
  - RESUMEN section (totals: sales, prizes, balance, draw count, tickets)
  - DESGLOSE POR JUEGO table
  - DESGLOSE POR FUENTE table
  - DETALLE POR SORTEO table (all draws, sorted ascending by date+time)
  - Footer with page numbers on every page
- Sets `Content-Type: application/pdf` and `Content-Disposition: attachment; filename="reporte-{from}-{to}.pdf"`

Registered as `GET /reporte/pdf` in `monitor.routes.js` **before** the existing `/reporte` route to avoid Express ambiguity.

### Task 2: Frontend "Descargar PDF" button (`63c1cc7`)

Modified `frontend/app/admin/reportes/page.js` to:

- Import `Download` icon from lucide-react
- Add `pdfLoading` state variable
- Add `handleDownloadPdf` useCallback that:
  - Reads the active filter state
  - Fetches `/api/monitor/reporte/pdf` with `Authorization: Bearer {token}` header
  - Converts response to a Blob and triggers a programmatic `<a>` click download
  - Shows error toast on failure; resets loading state in `finally`
- Replace the single "Actualizar" button in the header with a two-button wrapper:
  - Green "Descargar PDF" button (shows "Generando..." + disabled while in-flight)
  - Blue "Actualizar" button (unchanged behavior)

Frontend build completed cleanly.

## Deviations from Plan

None - plan executed exactly as written.

## Known Stubs

None.

## Self-Check: PASSED

- FOUND: backend/src/controllers/monitor.controller.js
- FOUND: backend/src/routes/monitor.routes.js
- FOUND: frontend/app/admin/reportes/page.js
- FOUND: .planning/phases/07-pdf-export-production-deploy/07-01-SUMMARY.md
- FOUND: commit 3ac310b (Task 1 - backend PDF endpoint)
- FOUND: commit 63c1cc7 (Task 2 - frontend PDF button)

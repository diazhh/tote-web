# Eliminar PDF de cierre de sorteo — Diseño

**Fecha:** 2026-05-11
**Estado:** Aprobado (pendiente revisión escrita)
**Autor:** Claude + diazhh
**Motivación:** El PDF de cierre se genera dentro del lock del optimizer y se manda como adjunto en Telegram. Su cómputo (composición Sharp + I/O de disco + subida a Telegram) es la causa principal de los timeouts de 15s que dispararon el incidente del 11-mayo-2026 (TRIPLE PANTERA 08:00 → 100). El PDF no aporta información que no esté ya en el mensaje de texto que se envía junto a él.

## Alcance

### Se elimina
- Generación automática del PDF de cierre (`pdfReportService.generateDrawClosingReport`) en **los 4 callers** del flujo de cierre/totalización.
- Envío del PDF como adjunto a Telegram en `adminNotificationService.notifyPrewinnerSelected`.
- El servicio `pdf-report.service.js` completo, si tras los cambios no queda ningún caller.
- Método muerto `pdfReportService.generateReportForDraw` (sin callers ya hoy).

### Se mantiene
- El **mensaje de texto** que se envía a los admins en Telegram tras el cierre (con número elegido, ventas, premio potencial, top tickets, riesgo de tripletas).
- El endpoint `GET /monitor/reporte/pdf` y `monitor.controller.getReportePdf`. Es un PDF on-demand que se descarga manualmente desde `/admin/reportes`. **No tiene nada que ver con el flujo de Telegram.**
- Todos los PDFs ya generados en disco. Este cambio detiene la creación de nuevos, no toca los existentes.

### Fuera de alcance
- Mover PDF+Telegram fuera del lock del optimizer en general. Este spec elimina solo el PDF; el envío de mensaje de texto a Telegram sigue dentro del lock. Si en el futuro Telegram solo (sin PDF) sigue causando timeouts, se hará un segundo spec para sacar el envío de texto también.
- Limpieza de PDFs históricos en disco. Si los queremos borrar, será un script aparte.

## Diseño

### Callers a modificar

| # | Archivo | Línea | Path |
|---|--|--|--|
| 1 | `backend/src/services/prewinner-selection.service.js` | 172 | Selección automática (close-draw cron, close-draw worker, force-totalize todos pasan por aquí) |
| 2 | `backend/src/queue/workers/close-draw.worker.js` | 253 | Fallback aleatorio (pg-boss; inactivo hoy en prod) |
| 3 | `backend/src/jobs/close-draw.job.js` | 431 | Fallback aleatorio (Croner legacy; activo en prod) |
| 4 | `backend/src/services/draw.service.js` | 512 | Pre-selección manual desde UI admin |

En cada caller:
- Eliminar el `try { pdfPath = await pdfReportService.generateDrawClosingReport(...) } catch (...) {}`
- Eliminar la variable `pdfPath` y su paso a `notifyPrewinnerSelected`
- Quitar el `import pdfReportService` (estático o dinámico) si ya no se usa

### Cambios en `admin-notification.service.js`

- Eliminar `pdfPath` del destructuring en `notifyPrewinnerSelected` (línea 64)
- Cambiar la llamada `adminTelegramBotService.notifyGameAdmins(game.id, message, null, pdfPath)` para no pasar el adjunto. Si la firma del método queda con un parámetro inútil, simplificarla también.

### Cambios en `admin-telegram-bot.service.js`

- Revisar firma de `notifyGameAdmins(gameId, message, ???, pdfPath?)`. Si `pdfPath` era el único uso del último parámetro, quitarlo. Confirmar que no rompe otros callers (notificaciones de otros tipos que también lo usen). Si rompe otros callers, dejar el parámetro pero internamente ignorarlo cuando sea nulo (ya lo hace).
- Eliminar la rama de código que adjunta el PDF al mensaje de Telegram.

### Eliminación del servicio

- `backend/src/services/pdf-report.service.js` — borrar el archivo si tras los cambios anteriores ya no aparece importado en ningún módulo (`grep -r "pdf-report" src/`). Tras este spec, no debería haber callers.
- Dependencias en `package.json` que solo lo usaba (revisar PDFKit u otra librería de PDF si existe). Si alguna queda huérfana, removerla con `npm uninstall <pkg>`.

### Tests

- Buscar tests que mockeen `pdfReportService` (visto: `backend/src/__tests__/terminal-pantera.test.js:257`). Eliminar el mock y el assert relacionado si lo hay.

## Verificación post-implementación

### Local
1. Levantar backend con `npm run dev`.
2. Forzar un cierre manual: ejecutar `force-totalize` sobre un sorteo SCHEDULED con tickets en local (seed). Verificar logs: debe seleccionar pre-ganador, mandar mensaje a Telegram (si admin local configurado), y NO debe haber línea `📄 PDF generado:` ni archivo nuevo en la carpeta de reportes.
3. `grep -r "pdf-report" backend/src/` debe retornar 0 matches.
4. `grep -r "pdfPath" backend/src/` debe retornar 0 matches.
5. Backend levanta sin errores de import.
6. Suite de tests pasa: `npm test`.

### Producción (post-deploy)
1. Esperar al próximo close-draw natural.
2. Verificar en logs: aparece `Preselección inteligente: ...` pero NO aparece `📄 PDF generado:` ni `Error generando PDF:`.
3. El optimizer libera el lock más rápido: el tiempo entre `🎯 Seleccionando pre-ganador` y `🔒 Sorteo cerrado: ...| Preselección inteligente` debe bajar de ~13s actuales a ~2-3s.
4. Mensaje de Telegram al admin sigue llegando con todo el contexto, solo sin adjunto.

## Riesgos

- **Si algún admin externo (humano o script) depende de los PDFs físicos en disco para auditoría retroactiva**, queda sin ese flujo. Mitigación: ya existe el endpoint on-demand `/monitor/reporte/pdf` que sirve el reporte para cualquier rango. Más versátil que los PDFs por sorteo.
- **Si en `admin-telegram-bot.service.notifyGameAdmins` el parámetro `pdfPath` también lo usa otro flujo no-relacionado** (ej. notificaciones de fallos), quitarlo rompe ese flujo. Mitigación: durante implementación, hacer `grep` exhaustivo de todos los callers de `notifyGameAdmins` antes de cambiar la firma. Si hay otros usos, dejar el parámetro pero hacerlo opcional y nunca pasarlo desde el flujo de cierre.
- **Cambio irreversible sin flag.** El usuario eligió eliminación limpia. Si tras una semana los admins lo extrañan, recuperarlo requiere `git revert`.

## Plan de despliegue

1. Implementación + tests en local
2. Confirmación del usuario
3. Commit en main con mensaje descriptivo
4. `ssh 94 "cd /var/proyectos/tote-web && git pull && pm2 restart tote-backend"`
5. Verificación post-deploy según checklist arriba

## Open questions

Ninguna. Las 3 decisiones que quedaban abiertas se resolvieron en la conversación:

1. **`monitor.controller.getReportePdf` se mantiene** — no es del flujo de Telegram.
2. **Eliminación limpia, sin flag** — confirmado.
3. **PDFs históricos en disco quedan donde están** — implícito.

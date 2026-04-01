# Phase 4: Webhook Log Viewer - Research

**Researched:** 2026-04-01
**Domain:** Express REST endpoint + Next.js admin page — paginated log table with modal inspector
**Confidence:** HIGH (all findings from direct codebase inspection)

## Summary

Phase 4 adds a read-only log viewer for `WebhookLog` records. The schema, data, and all infrastructure are already in place from Phases 1–3. This phase is purely additive: one new backend endpoint (GET with filters + pagination) and one new frontend page under `/admin/proveedores/logs`.

The `WebhookLog` model stores `rawPayload` (String), `headers` (Json?), `status` (enum), `errorMessage`, and a relation to `ApiSystem`. The existing `TestResultModal` in `proveedores/page.js` already demonstrates the exact pattern needed for the inspector modal: a fixed-overlay `div`, `bg-white rounded-lg`, and `<pre>` with `JSON.stringify(data, null, 2)` inside a scrollable container.

The proveedores page uses inline tab navigation (`activeTab` state) for Configuraciones/Sistemas. Phase 4 adds a third tab `Logs` that routes to `/admin/proveedores/logs` — a separate Next.js page file, consistent with how other admin sections with sub-pages work (e.g., `jugadores/[id]/page.js`). A separate page file is preferred over a third inline tab because the log data has its own fetch lifecycle and pagination state that would bloat the already large proveedores `page.js`.

**Primary recommendation:** Add a `/admin/proveedores/logs/page.js` (separate Next.js page), add a `logs` tab link to `proveedores/page.js` nav, add `GET /api/providers/webhook-logs` to `provider.routes.js` and `provider.controller.js` using the established ticket-service pagination shape.

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| LOGS-01 | Admin can view webhook log table with columns: provider, timestamp, status, payload preview | Backend: GET /api/providers/webhook-logs with `include: { apiSystem: { select: { name, slug } } }`. Frontend: `<table>` with same structure as tickets/page.js. Payload preview = first 80 chars of `rawPayload`. |
| LOGS-02 | Admin can filter logs by provider and by status | Backend: `where.apiSystemId` + `where.status` query params. Frontend: two `<select>` dropdowns fed by `systems` list (already loaded) and hardcoded status values. Reset page to 1 on filter change — same pattern as tickets page. |
| LOGS-03 | Admin can click a log entry to see full raw JSON payload in a modal (inspector) | Modal pattern: fixed-overlay div + `<pre className="bg-gray-100 p-4 rounded-lg text-xs overflow-x-auto">`. Use `JSON.stringify(JSON.parse(rawPayload), null, 2)` with try/catch fallback to raw string when payload is not valid JSON. |
| LOGS-04 | Admin can see request headers in the inspector modal | `headers` field is `Json?` on WebhookLog — already stored by webhook.service.js. Render in same modal as a second `<pre>` block below the payload block. Show "Sin headers" when null. |
</phase_requirements>

## Standard Stack

### Core
| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma Client | Already installed | `prisma.webhookLog.findMany` + `prisma.webhookLog.count` | Project ORM — singleton at `lib/prisma.js` |
| Express | Already installed | Route + controller additions | Project HTTP framework |
| Next.js 14 (App Router) | Already installed | New page file at `app/admin/proveedores/logs/page.js` | Project frontend framework |
| TailwindCSS v4 | Already installed | Styling — classes follow existing admin pages | Project CSS framework |
| Lucide React | Already installed | Icons (Eye, Filter, ChevronLeft, ChevronRight, RefreshCw) | Used throughout admin pages |

### Supporting
| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `URLSearchParams` (native) | Browser API | Build query string for fetch() | Used in tickets/page.js already |
| `JSON.stringify(x, null, 2)` | Native | Format JSON in `<pre>` | Used in TestResultModal already |

No new packages are needed. Zero new dependencies.

**Installation:** None required.

## Architecture Patterns

### Backend: New endpoint in existing provider controller

The new route follows the same file pattern as all existing provider routes.

**Route file addition** (`provider.routes.js`):
```javascript
// After existing special routes
router.get('/webhook-logs', providerController.getWebhookLogs.bind(providerController));
```

**Controller method** (`provider.controller.js`):
```javascript
async getWebhookLogs(req, res) {
  try {
    const { apiSystemId, status, page = '1', limit = '50' } = req.query;
    const pageNum = parseInt(page, 10);
    const limitNum = parseInt(limit, 10);
    const skip = (pageNum - 1) * limitNum;

    const where = {};
    if (apiSystemId) where.apiSystemId = apiSystemId;
    if (status) where.status = status;

    const [logs, total] = await Promise.all([
      prisma.webhookLog.findMany({
        where,
        skip,
        take: limitNum,
        orderBy: { createdAt: 'desc' },
        include: {
          apiSystem: {
            select: { id: true, name: true, slug: true }
          }
        }
      }),
      prisma.webhookLog.count({ where })
    ]);

    res.json({
      data: logs,
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
        hasNext: skip + logs.length < total,
        hasPrev: pageNum > 1
      }
    });
  } catch (error) {
    logger.error('Error obteniendo webhook logs:', error);
    res.status(500).json({ error: 'Error al obtener logs' });
  }
}
```

**Pagination shape** matches `ticket.service.js` exactly: `{ data, pagination: { page, limit, total, totalPages, hasNext, hasPrev } }`.

### Frontend: Separate page + tab link

**Route:** `frontend/app/admin/proveedores/logs/page.js`

**Tab link addition** in `proveedores/page.js` nav section (after the "Sistemas" button):
```jsx
<a
  href="/admin/proveedores/logs"
  className={`py-4 px-1 border-b-2 font-medium text-sm ${
    // highlight when pathname is /admin/proveedores/logs
    'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
  }`}
>
  Logs de Webhook
</a>
```

Using `<a>` (or Next.js `<Link>`) since it's a separate page, not an in-page tab state change.

**Logs page structure:**
- `useEffect` on mount: fetch systems list (to populate provider filter) + fetch logs
- `useEffect` on `[page, apiSystemIdFilter, statusFilter]`: re-fetch logs
- State: `logs`, `systems`, `loading`, `pagination`, `selectedLog` (for inspector), `apiSystemIdFilter`, `statusFilter`
- API call pattern: raw `fetch()` with `API_URL` + `localStorage.getItem('token')` — same as `proveedores/page.js`

### Frontend: Inspector Modal pattern

The `TestResultModal` in `proveedores/page.js` (line 887) is the exact precedent:

```jsx
function LogInspectorModal({ log, onClose }) {
  let parsedPayload = null;
  let parseError = false;
  try {
    parsedPayload = JSON.parse(log.rawPayload);
  } catch {
    parseError = true;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-3xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Inspector de Payload</h2>
        
        <div className="space-y-4">
          {/* Metadata */}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div><strong>Proveedor:</strong> {log.apiSystem?.name}</div>
            <div><strong>Status:</strong> {log.status}</div>
            <div><strong>Fecha:</strong> {new Date(log.createdAt).toLocaleString('es-VE')}</div>
            {log.errorMessage && <div className="col-span-2 text-red-600"><strong>Error:</strong> {log.errorMessage}</div>}
          </div>

          {/* Payload */}
          <div>
            <h3 className="font-medium mb-2">Payload Raw</h3>
            <pre className="bg-gray-100 p-4 rounded-lg text-xs overflow-x-auto">
              {parseError ? log.rawPayload : JSON.stringify(parsedPayload, null, 2)}
            </pre>
          </div>

          {/* Headers — LOGS-04 */}
          <div>
            <h3 className="font-medium mb-2">Headers</h3>
            {log.headers ? (
              <pre className="bg-gray-100 p-4 rounded-lg text-xs overflow-x-auto">
                {JSON.stringify(log.headers, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-gray-400 italic">Sin headers registrados</p>
            )}
          </div>
        </div>

        <div className="flex justify-end mt-4">
          <button onClick={onClose} className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700">
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Recommended Project Structure (additions only)

```
frontend/app/admin/proveedores/
├── page.js                  # EXISTING — add Logs tab link
└── logs/
    └── page.js              # NEW — webhook log viewer page

backend/src/routes/
└── provider.routes.js       # EXISTING — add GET /webhook-logs route

backend/src/controllers/
└── provider.controller.js   # EXISTING — add getWebhookLogs method
```

### Anti-Patterns to Avoid

- **Adding logs state to proveedores/page.js:** The existing file is already 927 lines. A separate page file keeps concerns isolated and avoids pagination/filter state collision.
- **Returning `rawPayload` parsed as JSON from backend:** `rawPayload` is stored as String deliberately (to survive malformed JSON from providers). Keep it as String in the API response; let the frontend do `JSON.parse` with try/catch.
- **Using axios instead of raw fetch():** All fetch calls in `proveedores/page.js` use raw `fetch()` with `localStorage.getItem('token')`. Stay consistent — don't mix axios into this page family.
- **Sending `headers` as full unfiltered object:** The webhook service already stores `req.headers` verbatim. The backend endpoint should return it as-is; the frontend renders it in `<pre>`. No server-side filtering needed.

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Pagination math | Custom offset/count logic | Copy ticket.service.js pattern exactly | Already proven, includes edge cases |
| JSON pretty-print | Custom formatter | `JSON.stringify(data, null, 2)` in `<pre>` | Standard; already used in TestResultModal |
| Status badge styling | New badge system | Copy `getStatusBadge()` pattern from tickets/page.js | Consistent with rest of admin |
| Modal overlay | Custom dialog component | Inline fixed-overlay div (same as all existing modals) | No modal component library exists in this project |

## Common Pitfalls

### Pitfall 1: rawPayload is a String, not JSON
**What goes wrong:** Trying to render `{log.rawPayload}` directly in JSX or calling `.key` on it.
**Why it happens:** Prisma schema has `rawPayload String` (not Json). The field is always a string, even if the content happens to be valid JSON.
**How to avoid:** Always `JSON.parse(log.rawPayload)` inside a try/catch; render the raw string as fallback.
**Warning signs:** React "Objects are not valid as a React child" error, or silent empty render.

### Pitfall 2: headers field may be null
**What goes wrong:** `JSON.stringify(log.headers, null, 2)` when `headers` is null returns the string `"null"`, which looks odd.
**Why it happens:** Schema has `headers Json?` — optional. Early webhook logs from test runs may have null headers.
**How to avoid:** Guard with `{log.headers ? <pre>...</pre> : <p>Sin headers</p>}`.

### Pitfall 3: Stale page on filter change
**What goes wrong:** User changes provider filter, page stays at 3, API returns page 3 of filtered results (empty or wrong).
**Why it happens:** Filter change doesn't reset pagination.page to 1.
**How to avoid:** When `apiSystemIdFilter` or `statusFilter` changes, always reset page to 1 before fetching. Pattern from tickets/page.js: `handleFilterChange()` sets `setPagination(prev => ({ ...prev, page: 1 }))`.

### Pitfall 4: API_URL fallback value inconsistency
**What goes wrong:** Some admin pages use `http://localhost:10000` as fallback, others use `http://localhost:10000/api`. The proveedores page uses `http://localhost:10000` but calls `${API_URL}/providers/systems` — this only works because env var `NEXT_PUBLIC_API_URL=http://localhost:3001/api` is always set in `.env.local`.
**Why it happens:** Inconsistent defaults across pages.
**How to avoid:** In the new logs page, use the same `const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';` header-level constant as `proveedores/page.js`. Since `.env.local` always sets `NEXT_PUBLIC_API_URL`, the fallback is a last resort only.

### Pitfall 5: Tab highlighting — proveedores/page.js uses `activeTab` state, not pathname
**What goes wrong:** Adding a third `<button onClick={() => setActiveTab('logs')}>` tab in proveedores/page.js that tries to render the log content inline — this requires loading all log data in the proveedores page.
**Why it happens:** The existing "Configuraciones" and "Sistemas" tabs are inline content-switch tabs.
**How to avoid:** Use a Next.js `<Link href="/admin/proveedores/logs">` styled as a tab button. Use `usePathname()` to highlight the active tab. This is already done in the layout sidebar.

## Code Examples

### Backend: Prisma query with include and pagination

```javascript
// Source: ticket.service.js lines 239-278 (established pattern)
const [logs, total] = await Promise.all([
  prisma.webhookLog.findMany({
    where,
    skip,
    take: limitNum,
    orderBy: { createdAt: 'desc' },
    include: {
      apiSystem: { select: { id: true, name: true, slug: true } }
    }
  }),
  prisma.webhookLog.count({ where })
]);
```

### Frontend: Fetch with auth token (established pattern)

```javascript
// Source: proveedores/page.js lines 46-79
const token = localStorage.getItem('token');
const headers = {
  'Authorization': `Bearer ${token}`,
  'Content-Type': 'application/json'
};
const res = await fetch(`${API_URL}/providers/webhook-logs?${params}`, { headers });
const json = await res.json();
// json = { data: [...], pagination: { page, limit, total, totalPages, hasNext, hasPrev } }
```

### Frontend: Pagination component (established pattern)

```jsx
// Source: tickets/page.js lines 449-470
{pagination.totalPages > 1 && (
  <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
    <div className="text-sm text-gray-600">
      Mostrando {((pagination.page - 1) * pagination.limit) + 1} - {Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} logs
    </div>
    <div className="flex items-center gap-2">
      <button onClick={() => setPage(p => p - 1)} disabled={!pagination.hasPrev} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50">
        <ChevronLeft className="w-5 h-5" />
      </button>
      <span className="px-4 py-2 text-sm">Página {pagination.page} de {pagination.totalPages}</span>
      <button onClick={() => setPage(p => p + 1)} disabled={!pagination.hasNext} className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50">
        <ChevronRight className="w-5 h-5" />
      </button>
    </div>
  </div>
)}
```

### Frontend: Status badge for WebhookLogStatus

```javascript
// Adapted from tickets/page.js getStatusBadge pattern
const STATUS_STYLES = {
  DISCOVERED: 'bg-yellow-100 text-yellow-800',
  PROCESSED:  'bg-green-100 text-green-800',
  DUPLICATE:  'bg-gray-100 text-gray-800',
  FAILED:     'bg-red-100 text-red-800',
};
const STATUS_LABELS = {
  DISCOVERED: 'Descubierto',
  PROCESSED:  'Procesado',
  DUPLICATE:  'Duplicado',
  FAILED:     'Fallido',
};
```

## Environment Availability

Step 2.6: SKIPPED — Phase is purely code/config changes (new route, controller method, and frontend page). No external tools or services beyond the already-running PostgreSQL and Node.js.

## Validation Architecture

> nyquist_validation not explicitly disabled in config.json — including this section.

### Test Framework
| Property | Value |
|----------|-------|
| Framework | Jest (backend) |
| Config file | `backend/package.json` (jest config inline) |
| Quick run command | `cd backend && npm test -- --testPathPattern=provider` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements → Test Map
| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| LOGS-01 | GET /api/providers/webhook-logs returns paginated list with apiSystem relation | integration | `cd backend && npm test -- --testPathPattern=provider` | ❌ Wave 0 |
| LOGS-02 | Filters by apiSystemId and status query params | integration | same | ❌ Wave 0 |
| LOGS-03 | Response includes rawPayload as String | integration | same | ❌ Wave 0 |
| LOGS-04 | Response includes headers field (null or object) | integration | same | ❌ Wave 0 |

### Sampling Rate
- **Per task commit:** `cd backend && npm test -- --testPathPattern=provider`
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps
- [ ] `backend/src/controllers/__tests__/provider-webhook-logs.test.js` — covers LOGS-01 through LOGS-04
- [ ] May reuse existing test setup from `backend/src/controllers/__tests__/` if fixtures exist there

## Sources

### Primary (HIGH confidence)
- Direct file inspection: `backend/src/controllers/provider.controller.js` — controller method patterns
- Direct file inspection: `backend/src/routes/provider.routes.js` — route registration
- Direct file inspection: `frontend/app/admin/proveedores/page.js` — tab pattern, modal pattern, fetch pattern
- Direct file inspection: `frontend/app/admin/tickets/page.js` — pagination pattern (UI + state)
- Direct file inspection: `backend/src/services/ticket.service.js` lines 202–279 — pagination response shape
- Direct file inspection: `backend/prisma/schema.prisma` lines 449–465 — WebhookLog model fields
- Direct file inspection: `backend/src/services/webhook.service.js` — confirms rawPayload stored as String, headers stored as Json?
- Direct file inspection: `frontend/app/admin/layout.js` — confirms Proveedores nav entry, sidebar structure

### Secondary (MEDIUM confidence)
- `.planning/STATE.md` — accumulated decisions from Phases 1–3 (confirms rawPayload as String, headers as Json?)
- `.planning/REQUIREMENTS.md` — LOGS-01 through LOGS-04 requirement definitions

## Project Constraints (from CLAUDE.md)

- Backend uses ES modules throughout (`import`/`export`) — new controller method and route must use ES module syntax
- Prisma client is a singleton from `lib/prisma.js` — import from there, not instantiate new PrismaClient
- Frontend uses `process.env.NEXT_PUBLIC_API_URL` via raw `fetch()` — do not introduce axios for this page family
- All new files must follow existing naming conventions: `provider.controller.js`, `provider.routes.js`, `logs/page.js`
- `'use client'` directive required at top of all Next.js admin page files (all existing admin pages use it)
- TailwindCSS v4 classes — no CSS modules or styled-components

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all from direct codebase inspection, no guessing
- Architecture: HIGH — patterns copied from working code in same codebase
- Pitfalls: HIGH — derived from actual schema constraints and observed code patterns

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable codebase, patterns won't shift)

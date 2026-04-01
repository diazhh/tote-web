# Phase 3: Admin Provider Management - Research

**Researched:** 2026-04-01
**Domain:** Next.js 14 admin UI extension + Express backend CRUD/token endpoints
**Confidence:** HIGH — all findings from direct codebase inspection; no external verification needed

---

## Summary

Phase 3 extends the existing `/admin/proveedores` page and its backend to expose the new `ApiSystem` fields (`slug`, `mode`, `webhookToken`, `isActive`) that were added to the schema in Phase 1. The backend already has full Prisma schema support; the controllers and routes simply need two new endpoints and updated field handling. The frontend needs two new sections in the existing `SystemModal` component: slug/mode/isActive controls and a token management panel.

The existing proveedores page uses raw `fetch` with hardcoded `localStorage.getItem('token')`, but other admin pages use the `axios` singleton at `frontend/lib/api/axios.js` (which reads `accessToken`, not `token`). New code for this phase should follow the axios pattern used everywhere else, using the shared api client. The proveedores page itself reads `localStorage.getItem('token')` — this is a pre-existing inconsistency; new code added to this file should match its existing pattern (raw fetch + `token` key) to stay consistent within the file.

The adapter-status badge (ADMIN-06) requires a new backend endpoint since the adapter files live on the filesystem and the frontend cannot inspect them directly. The adapter directory exists at `backend/src/webhooks/adapters/` (empty, confirmed). The endpoint needs to check whether `{slug}.adapter.js` exists in that directory.

**Primary recommendation:** Extend existing `SystemModal` in place; add two new backend endpoints to `provider.routes.js` and `provider.controller.js`; no new files needed on the backend beyond service logic kept inside the controller.

---

<phase_requirements>
## Phase Requirements

| ID | Description | Research Support |
|----|-------------|------------------|
| ADMIN-01 | Admin can create/edit providers with PULL or PUSH mode selection | Schema has `mode: ApiSystemMode` (PULL/PUSH enum) — add `mode` field to `createSystem`/`updateSystem` controller methods and `SystemModal` form |
| ADMIN-02 | Admin can set provider slug (auto-generated from name, editable) | Schema has `slug String @unique` — auto-derive from name on frontend (slugify), allow override; send in create/update body |
| ADMIN-03 | Admin can generate webhook token (shown once on creation, masked after) | Backend: `POST /api/providers/systems/:id/generate-token` → `crypto.randomBytes(32).toString('hex')` → return plaintext once; frontend: show-once state |
| ADMIN-04 | Admin can regenerate token for existing provider | Same endpoint as ADMIN-03; no distinction needed — endpoint always generates fresh token and returns it once |
| ADMIN-05 | Admin sees provider mode badge (PULL/PUSH) in provider list | `system.mode` already returned by `GET /api/providers/systems` (Prisma `findMany` includes all fields); add badge in list render |
| ADMIN-06 | Admin sees adapter status badge (Ready/Discovery) per provider | New endpoint `GET /api/providers/systems/:id/adapter-status` — filesystem check for `webhooks/adapters/{slug}.adapter.js`; returns `{ adapterReady: boolean }` |
</phase_requirements>

---

## Project Constraints (from CLAUDE.md)

- Backend uses ES modules throughout (`import`/`export`, not `require`)
- Prisma client is a singleton from `lib/prisma.js` — always import from there
- Socket.io instance is a singleton from `lib/socket.js`
- Timezone: Venezuela (America/Caracas, UTC-4) via `lib/dateUtils.js`
- Draw status queries: filter by `DRAWN` locally; `PUBLISHED` in production
- All social channel publishing goes through `services/publication.service.js`
- Frontend: Next.js 14 App Router, TailwindCSS v4, Zustand for state management
- Frontend API client: `frontend/lib/api/axios.js` singleton (uses `accessToken` from localStorage)

---

## Standard Stack

### Core (already in use — no new installs)

| Library | Version | Purpose | Why Standard |
|---------|---------|---------|--------------|
| Prisma | existing | DB queries for `ApiSystem` | Already in use; `ApiSystem` model complete |
| Express | existing | New backend endpoints | Already in use; additive routes only |
| Node.js `crypto` | built-in | `randomBytes(32).toString('hex')` for token generation | Built-in; no dependency needed |
| Node.js `fs/promises` | built-in | `fs.access()` to check adapter file existence | Built-in; no dependency needed |
| React (Next.js 14) | existing | Frontend UI | Already in use |
| TailwindCSS v4 | existing | Styling — match existing badge/button patterns | Already in use |
| `lucide-react` | existing | Icons — `Plug`, `Eye`, `EyeOff`, `Copy`, `RefreshCw` | Already imported in layout.js and proveedores page |

### Supporting

| Library | Version | Purpose | When to Use |
|---------|---------|---------|-------------|
| `sonner` (toast) | existing | Success/error toasts | Other admin pages use it via `toast.error` / `toast.success` |

**Installation:** No new packages needed. All dependencies already present.

---

## Architecture Patterns

### Recommended Project Structure

No new directories needed. Changes are additive to existing files:

```
backend/src/
├── routes/
│   └── provider.routes.js          MODIFY — add 2 new routes
├── controllers/
│   └── provider.controller.js      MODIFY — add generateToken(), getAdapterStatus()
frontend/app/admin/
└── proveedores/
    └── page.js                     MODIFY — extend SystemModal + list badges
frontend/lib/api/
└── providers.js                    NEW — axios-based API client for provider endpoints
```

### Pattern 1: Backend Token Generation Endpoint

**What:** `POST /api/providers/systems/:id/generate-token` generates a cryptographically secure 64-char hex token, saves it to `ApiSystem.webhookToken`, and returns it in the response body once.

**When to use:** For both ADMIN-03 (first time) and ADMIN-04 (regeneration). The endpoint is idempotent in the sense that it always generates a new token regardless of whether one already exists.

**Example:**
```javascript
// backend/src/controllers/provider.controller.js
import crypto from 'crypto';

async generateToken(req, res) {
  try {
    const { id } = req.params;
    const token = crypto.randomBytes(32).toString('hex'); // 64 hex chars

    const system = await prisma.apiSystem.update({
      where: { id },
      data: { webhookToken: token }
    });

    logger.info(`Token generado para sistema: ${system.name} (${id})`);
    // Return the plaintext token ONCE — not retrievable again from the API
    res.json({ webhookToken: token, systemId: id });
  } catch (error) {
    logger.error('Error generando token:', error);
    res.status(500).json({ error: 'Error al generar token' });
  }
}
```

### Pattern 2: Adapter Status Endpoint

**What:** `GET /api/providers/systems/:id/adapter-status` looks up the system's slug, then checks whether `backend/src/webhooks/adapters/{slug}.adapter.js` exists using `fs.access()`.

**When to use:** Frontend calls this on page load to populate the adapter status badge (ADMIN-06).

**Example:**
```javascript
// backend/src/controllers/provider.controller.js
import { access } from 'fs/promises';
import { fileURLToPath } from 'url';
import path from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

async getAdapterStatus(req, res) {
  try {
    const { id } = req.params;
    const system = await prisma.apiSystem.findUnique({ where: { id } });
    if (!system) return res.status(404).json({ error: 'Sistema no encontrado' });

    const adapterPath = path.join(__dirname, '../webhooks/adapters', `${system.slug}.adapter.js`);
    let adapterReady = false;
    try {
      await access(adapterPath);
      adapterReady = true;
    } catch {
      adapterReady = false;
    }

    res.json({ adapterReady, slug: system.slug, mode: system.mode });
  } catch (error) {
    logger.error('Error verificando adapter:', error);
    res.status(500).json({ error: 'Error al verificar adapter' });
  }
}
```

### Pattern 3: Slug Auto-generation (Frontend)

**What:** When the admin types a provider name, the slug is auto-generated as a URL-safe lowercase string. The admin can override it before saving.

**When to use:** In the create flow for `SystemModal`. On edit, the slug field is shown pre-populated and remains editable.

**Example:**
```javascript
// Inside SystemModal in proveedores/page.js
const generateSlug = (name) =>
  name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

// On name change:
onChange={(e) => {
  const name = e.target.value;
  setFormData(prev => ({
    ...prev,
    name,
    // Only auto-generate slug if user hasn't manually edited it
    slug: prev._slugManuallyEdited ? prev.slug : generateSlug(name)
  }));
}}
```

### Pattern 4: Show-Once Token UX

**What:** When a token is generated (create or regenerate), it is displayed in a highlighted box with a copy button. A `tokenJustGenerated` state holds the plaintext. Once the modal closes or the user clicks away, the token is masked (`••••••••••••••••...` showing only last 8 chars).

**When to use:** ADMIN-03 and ADMIN-04. The existing `SystemModal` needs a new "Token de Webhook" section added below the mode selector.

**Pattern:**
```javascript
// State in SystemModal
const [tokenJustGenerated, setTokenJustGenerated] = useState(null);

// Display logic
{tokenJustGenerated ? (
  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
    <p className="text-xs text-yellow-800 font-medium mb-1">
      Copia este token ahora — no se mostrará de nuevo
    </p>
    <div className="flex items-center gap-2">
      <code className="flex-1 text-xs font-mono break-all">{tokenJustGenerated}</code>
      <button onClick={() => navigator.clipboard.writeText(tokenJustGenerated)}>
        {/* Copy icon */}
      </button>
    </div>
  </div>
) : system?.webhookToken ? (
  <p className="text-sm text-gray-500 font-mono">
    ••••••••••••••••{system.webhookToken.slice(-8)}
  </p>
) : (
  <p className="text-sm text-gray-400 italic">Sin token generado</p>
)}
```

### Pattern 5: Existing fetch() Pattern in proveedores/page.js

**What:** The existing `proveedores/page.js` uses raw `fetch()` with `localStorage.getItem('token')` and manual header construction — NOT the `axios` singleton used elsewhere.

**Why this matters:** New code added inside `proveedores/page.js` should follow the same pattern for consistency. Do NOT switch the file to axios mid-refactor (out of scope for this phase).

**Note on `API_URL`:** The file sets `const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000'`. The actual env value is `http://localhost:3001/api`, so `${API_URL}/providers/systems` resolves to `http://localhost:3001/api/providers/systems` — correct. New fetch calls should follow the same `${API_URL}/providers/...` pattern.

### Pattern 6: Badge Rendering (from existing page)

The existing page renders inline badges with Tailwind:
```jsx
<span className={`px-2 py-1 text-xs font-medium rounded ${
  config.type === 'PLANNING' 
    ? 'bg-purple-100 text-purple-700' 
    : 'bg-green-100 text-green-700'
}`}>
  {config.type}
</span>
```

**ADMIN-05 (mode badge) and ADMIN-06 (adapter badge) must follow this exact pattern.** Suggested colors:
- PULL mode: `bg-gray-100 text-gray-700`
- PUSH mode: `bg-blue-100 text-blue-700`
- Adapter Ready: `bg-green-100 text-green-700`
- Discovery mode: `bg-orange-100 text-orange-700`

### Anti-Patterns to Avoid

- **Don't import the axios singleton into proveedores/page.js** — the file uses raw fetch; mixing patterns creates confusion. New API client file (`frontend/lib/api/providers.js`) can use axios for future pages, but the existing page keeps its pattern.
- **Don't return the stored `webhookToken` in `GET /api/providers/systems`** — the field is currently returned by Prisma `findMany` (no field exclusion). The frontend should treat it as masked; never display the full token except immediately after generation. Consider omitting it in the `getAllSystems` response by adding `select` to the Prisma query.
- **Don't require slug on existing records** — the SRQ system already has a slug (`srq`) set in Phase 1. New providers must always provide a slug (required field on create). The edit flow pre-populates it.
- **Don't check adapter existence at startup** — check per-request in `getAdapterStatus`. The adapter directory is expected to be empty initially; loading at startup would break server restart if the directory doesn't exist.

---

## Don't Hand-Roll

| Problem | Don't Build | Use Instead | Why |
|---------|-------------|-------------|-----|
| Secure random token | Custom random string | `crypto.randomBytes(32).toString('hex')` | Built-in, cryptographically secure, already documented in ARCHITECTURE.md |
| Copy to clipboard | Manual DOM manipulation | `navigator.clipboard.writeText()` | Standard browser API, no library needed |
| File existence check | Custom fs module logic | `fs/promises.access()` with try/catch | Standard Node.js pattern; does not throw on success, throws `ENOENT` on missing |
| Slug from name | Complex regex | `name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '')` | Simple inline transform, no library needed |

---

## Common Pitfalls

### Pitfall 1: `webhookToken` Exposed in getAllSystems Response

**What goes wrong:** `prisma.apiSystem.findMany()` returns `webhookToken` in plain text. If the frontend renders it in the list, the token is exposed in the DOM for all providers.

**Why it happens:** Prisma returns all fields by default. No exclusion was added in Phase 1.

**How to avoid:** In `getAllSystems`, add a Prisma `select` that excludes `webhookToken`, or return `null` for it. The full token is only returned by the `generate-token` endpoint.

**Warning signs:** If the systems list response JSON contains a non-null `webhookToken` field, it will be visible in DevTools Network tab.

### Pitfall 2: `crypto` Import in ES Module Context

**What goes wrong:** Using `import crypto from 'crypto'` fails if `"crypto"` is not in Node.js's built-in list for the ES module resolver.

**Why it happens:** In some Node.js versions, built-in modules need the `node:` prefix.

**How to avoid:** Use `import crypto from 'node:crypto'` (explicit `node:` prefix) for maximum compatibility. Same for `import { access } from 'node:fs/promises'`.

**Warning signs:** `Error [ERR_MODULE_NOT_FOUND]: Cannot find package 'crypto'`

### Pitfall 3: `__dirname` Not Available in ES Modules

**What goes wrong:** `__dirname` is undefined in ES module files. Using it for the adapter path check will throw `ReferenceError`.

**Why it happens:** `__dirname` is a CommonJS global. ES modules do not have it.

**How to avoid:** Derive `__dirname` from `import.meta.url`:
```javascript
import { fileURLToPath } from 'node:url';
import path from 'node:path';
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
```
This pattern is already used in `backend/src/index.js` (line 108-109) — confirmed working.

### Pitfall 4: Slug Uniqueness Violation on Edit

**What goes wrong:** When editing a provider's slug, the `prisma.apiSystem.update()` throws a unique constraint error if the slug is changed to a value that already exists.

**Why it happens:** `slug String @unique` in schema. Prisma throws `P2002` on conflict.

**How to avoid:** Backend should catch Prisma error code `P2002` in `updateSystem` and return `400 { error: 'El slug ya está en uso' }`. Frontend should show this as a field-level error.

### Pitfall 5: Token State Leaking Between Modal Opens

**What goes wrong:** Admin opens "edit system" modal for System A, generates a token. Closes modal. Opens modal for System B — the `tokenJustGenerated` state from System A is still visible.

**Why it happens:** React state in the modal component persists across re-renders if the component is not unmounted.

**How to avoid:** Reset `tokenJustGenerated` to `null` in the modal's `useEffect` when the `system` prop changes (or when `onClose` is called). Alternatively, key the modal on `system?.id`.

### Pitfall 6: `isActive` Toggle on ApiSystem Missing From Update

**What goes wrong:** The existing `updateSystem` controller only handles `name` and `description`. Adding `isActive` without updating the controller means the toggle silently does nothing.

**Why it happens:** The controller destructures only `{ name, description }` from `req.body` (line 81 of provider.controller.js).

**How to avoid:** Update `updateSystem` to also handle `slug`, `mode`, and `isActive` from `req.body`. These are the three new fields that need updating.

---

## Code Examples

### Backend: New Routes (provider.routes.js)

```javascript
// Add after existing "Rutas especiales"
router.post('/systems/:id/generate-token', providerController.generateToken.bind(providerController));
router.get('/systems/:id/adapter-status', providerController.getAdapterStatus.bind(providerController));
```

### Backend: Updated createSystem / updateSystem

```javascript
// createSystem — add new fields to destructure and data object
async createSystem(req, res) {
  const { name, description, slug, mode, isActive } = req.body;
  if (!name || !slug) {
    return res.status(400).json({ error: 'El nombre y el slug son requeridos' });
  }
  try {
    const system = await prisma.apiSystem.create({
      data: { name, description, slug, mode: mode || 'PULL', isActive: isActive !== undefined ? isActive : true }
    });
    res.status(201).json(system);
  } catch (error) {
    if (error.code === 'P2002') {
      return res.status(400).json({ error: 'El slug ya está en uso' });
    }
    // ...
  }
}

// updateSystem — add new fields
async updateSystem(req, res) {
  const { id } = req.params;
  const { name, description, slug, mode, isActive } = req.body;
  const data = {};
  if (name !== undefined) data.name = name;
  if (description !== undefined) data.description = description;
  if (slug !== undefined) data.slug = slug;
  if (mode !== undefined) data.mode = mode;
  if (isActive !== undefined) data.isActive = isActive;
  // ... update + catch P2002
}
```

### Frontend: Fetch Pattern (matching existing proveedores page)

```javascript
// All new fetch calls in proveedores/page.js must follow this pattern:
const token = localStorage.getItem('token');
const response = await fetch(`${API_URL}/providers/systems/${id}/generate-token`, {
  method: 'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
});
const data = await response.json();
// data.webhookToken is the plaintext — show once
```

### Frontend: SystemModal Form Fields to Add

```javascript
// In SystemModal, add after "Descripción":

// 1. Slug field
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">
    Slug * <span className="text-xs text-gray-500">(URL del webhook: /api/webhooks/{slug})</span>
  </label>
  <input
    type="text"
    value={formData.slug}
    onChange={(e) => setFormData({ ...formData, slug: e.target.value, _slugManuallyEdited: true })}
    className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
    placeholder="mi-proveedor"
    required
  />
</div>

// 2. Mode selector
<div>
  <label className="block text-sm font-medium text-gray-700 mb-1">Modo</label>
  <select
    value={formData.mode}
    onChange={(e) => setFormData({ ...formData, mode: e.target.value })}
    className="w-full px-3 py-2 border border-gray-300 rounded-lg"
  >
    <option value="PULL">PULL — Este sistema consulta al proveedor</option>
    <option value="PUSH">PUSH — El proveedor envía webhooks a este sistema</option>
  </select>
</div>

// 3. isActive toggle (only on edit, system already has an ID)
// 4. Token section (only shown when mode === 'PUSH')
```

---

## State of the Art

| Old Approach | Current Approach | When Changed | Impact |
|--------------|------------------|--------------|--------|
| `ApiSystem` had only `name`, `description` | `ApiSystem` now has `slug`, `mode`, `webhookToken`, `isActive` | Phase 1 (2026-04-01) | Backend schema ready; frontend and controller not yet updated |
| `createSystem` / `updateSystem` ignores new fields | Must now accept and persist `slug`, `mode`, `isActive` | Phase 3 (this phase) | Controller update required |
| No token generation endpoint | New `POST /systems/:id/generate-token` | Phase 3 (this phase) | New route + controller method |
| No adapter status endpoint | New `GET /systems/:id/adapter-status` | Phase 3 (this phase) | New route + controller method |
| `SystemModal` shows only name/description | Must show slug, mode, token management | Phase 3 (this phase) | UI extension |

**Current state verified:**
- Schema: COMPLETE (slug, mode, webhookToken, isActive all present in ApiSystem)
- Backend endpoints for token/adapter-status: MISSING (not yet added)
- Frontend SystemModal: MISSING new fields (only name + description)
- Provider list badges: MISSING (mode and adapter status not displayed)

---

## Open Questions

1. **Should `getAllSystems` exclude `webhookToken` from the response?**
   - What we know: Prisma returns it currently; displaying a partial token (last 8 chars) is the planned UX
   - What's unclear: Whether displaying even the last 8 chars in the list is acceptable
   - Recommendation: Exclude `webhookToken` from `getAllSystems` via Prisma `select`; the masked display in the modal uses `system.webhookToken` only in the edit context (where the modal is already open for that system)

2. **SRQ system has `mode: PULL` — should the token management section be hidden for PULL providers?**
   - What we know: PULL providers don't receive webhooks; a webhook token is meaningless for them
   - What's unclear: Whether the admin might want to assign a token to a PULL provider "for future use"
   - Recommendation: Hide the token section entirely when `mode === 'PULL'`; show it only for PUSH providers

3. **Should slug be editable after creation?**
   - What we know: Changing a slug would break any existing webhook integrations pointing to `/api/webhooks/{old-slug}`
   - What's unclear: Whether the operator needs this protection
   - Recommendation: Allow slug editing (no lock-down) but add a warning tooltip: "Cambiar el slug romperá las integraciones existentes"

---

## Environment Availability

Step 2.6: SKIPPED — Phase 3 is purely code changes to existing backend and frontend. No new external services, CLIs, or runtimes are required beyond the already-running Node.js + PostgreSQL stack.

---

## Validation Architecture

### Test Framework

| Property | Value |
|----------|-------|
| Framework | Jest (ES modules mode) |
| Config file | `backend/jest.config.js` |
| Quick run command | `cd backend && npm test -- --testPathPattern=provider` |
| Full suite command | `cd backend && npm test` |

### Phase Requirements → Test Map

| Req ID | Behavior | Test Type | Automated Command | File Exists? |
|--------|----------|-----------|-------------------|-------------|
| ADMIN-01 | `createSystem` accepts and persists `mode` field | unit | `npm test -- --testPathPattern=provider.controller` | No — Wave 0 |
| ADMIN-02 | `createSystem` accepts and persists `slug` field; rejects duplicate slug with 400 | unit | `npm test -- --testPathPattern=provider.controller` | No — Wave 0 |
| ADMIN-03 | `generateToken` returns 64-char hex string; persists to DB | unit | `npm test -- --testPathPattern=provider.controller` | No — Wave 0 |
| ADMIN-04 | `generateToken` called on existing provider generates new token (overwrites) | unit | `npm test -- --testPathPattern=provider.controller` | No — Wave 0 |
| ADMIN-05 | `getAllSystems` returns `mode` field | unit | `npm test -- --testPathPattern=provider.controller` | No — Wave 0 |
| ADMIN-06 | `getAdapterStatus` returns `adapterReady: false` when no adapter file; `true` when file exists | unit | `npm test -- --testPathPattern=provider.controller` | No — Wave 0 |

Frontend behavior (ADMIN-05, ADMIN-06 badges; ADMIN-03 show-once UX) is not unit-testable with Jest — manual verification required.

### Sampling Rate

- **Per task commit:** `cd backend && npm test -- --testPathPattern=provider.controller --forceExit`
- **Per wave merge:** `cd backend && npm test`
- **Phase gate:** Full suite green before `/gsd:verify-work`

### Wave 0 Gaps

- [ ] `backend/src/controllers/__tests__/provider.controller.test.js` — covers ADMIN-01 through ADMIN-06
- [ ] Test setup: mock `prisma` singleton and `fs/promises.access` in the test file

*(Existing test infrastructure: jest.config.js present, `npm test` command works; only the test file is missing)*

---

## Sources

### Primary (HIGH confidence)

- Direct inspection: `backend/prisma/schema.prisma` lines 417-465 — ApiSystem fields `slug`, `mode`, `webhookToken`, `isActive` confirmed present
- Direct inspection: `backend/src/routes/provider.routes.js` — existing route shape and naming convention
- Direct inspection: `backend/src/controllers/provider.controller.js` — existing controller methods, what `createSystem`/`updateSystem` currently handle
- Direct inspection: `backend/src/index.js` lines 108-109 — `__dirname` from `import.meta.url` pattern in ES modules (established precedent)
- Direct inspection: `frontend/app/admin/layout.js` — "Proveedores" nav link already exists at line 63; no nav change needed
- Direct inspection: `frontend/app/admin/proveedores/page.js` — existing `SystemModal`, raw `fetch` pattern, `localStorage.getItem('token')`
- Direct inspection: `frontend/lib/api/axios.js` — axios singleton pattern for new API files
- Direct inspection: `backend/jest.config.js` — Jest ES module test infrastructure confirmed
- Direct inspection: `backend/src/webhooks/adapters/` — directory exists, currently empty

### Secondary (MEDIUM confidence)

- ARCHITECTURE.md (`.planning/research/ARCHITECTURE.md`) — confirmed `generateToken` flow and adapter-status design (this was prior research, not external)

---

## Metadata

**Confidence breakdown:**
- Standard stack: HIGH — all existing; no new dependencies
- Architecture: HIGH — direct codebase inspection of all relevant files
- Pitfalls: HIGH — identified from direct inspection of actual code patterns (ES module `__dirname`, existing controller field handling, token state management)

**Research date:** 2026-04-01
**Valid until:** 2026-05-01 (stable codebase, no fast-moving external dependencies)

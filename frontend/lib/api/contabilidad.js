// frontend/lib/api/contabilidad.js
//
// Centralized fetch wrappers for /api/contabilidad/* (Phase 13).
// Mirrors the in-tree convention used by lib/api/commissions.js:
//   - Reads accessToken from localStorage at call time
//   - Throws on non-2xx with the server-provided error message
//   - Returns the parsed JSON envelope { success, data }
//   - URLSearchParams for list endpoints with filters
//
// IMPORTANT: uploadAttachment uses FormData + OMITS the Content-Type header
// so the browser sets the multipart boundary automatically. We never trust /
// set the mimetype on the client — the server byte-validates the file (F-14).
//
// P-1: receipt downloads NEVER route through /storage/receipts/* (those are
// 401'd by the static-storage guard). Use downloadAttachmentUrl + auth-gated
// fetch+blob pattern (a direct <a href> cannot carry the Authorization header).

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

function authHeaders(extra = {}) {
  const token =
    typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  return {
    Authorization: `Bearer ${token}`,
    ...extra,
  };
}

async function jsonOrThrow(res) {
  if (!res.ok) {
    let detail = '';
    try {
      const body = await res.json();
      detail = body?.error || body?.message || JSON.stringify(body);
    } catch {
      detail = await res.text().catch(() => '');
    }
    throw new Error(`HTTP ${res.status}: ${detail}`);
  }
  return res.json();
}

function qs(params) {
  const sp = new URLSearchParams();
  for (const [k, v] of Object.entries(params || {})) {
    if (v === undefined || v === null || v === '') continue;
    sp.append(k, String(v));
  }
  const s = sp.toString();
  return s ? `?${s}` : '';
}

// ---------- Tasas (ExchangeRate) ----------

export async function fetchRates({ rateType, from, to } = {}) {
  const res = await fetch(
    `${API_URL}/contabilidad/tasas${qs({ rateType, from, to })}`,
    { headers: authHeaders() }
  );
  return jsonOrThrow(res);
}

export async function createRate(body) {
  const res = await fetch(`${API_URL}/contabilidad/tasas`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

// ---------- Asientos (AccountingEntry) ----------

export async function fetchEntries(filters = {}) {
  const res = await fetch(
    `${API_URL}/contabilidad/asientos${qs(filters)}`,
    { headers: authHeaders() }
  );
  return jsonOrThrow(res);
}

export async function createEntry(payload) {
  const res = await fetch(`${API_URL}/contabilidad/asientos`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return jsonOrThrow(res);
}

export async function fetchEntry(id) {
  const res = await fetch(`${API_URL}/contabilidad/asientos/${id}`, {
    headers: authHeaders(),
  });
  return jsonOrThrow(res);
}

export async function updateEntry(id, patch) {
  const res = await fetch(`${API_URL}/contabilidad/asientos/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(patch),
  });
  return jsonOrThrow(res);
}

export async function reverseEntry(id, reversalReason) {
  const res = await fetch(
    `${API_URL}/contabilidad/asientos/${id}/reverse`,
    {
      method: 'POST',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify({ reversalReason }),
    }
  );
  return jsonOrThrow(res);
}

// ---------- Categorías ----------

export async function fetchCategories({ appliesTo, includeInactive } = {}) {
  const res = await fetch(
    `${API_URL}/contabilidad/categorias${qs({ appliesTo, includeInactive })}`,
    { headers: authHeaders() }
  );
  return jsonOrThrow(res);
}

export async function createCategory(payload) {
  const res = await fetch(`${API_URL}/contabilidad/categorias`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(payload),
  });
  return jsonOrThrow(res);
}

export async function renameCategory(id, name) {
  const res = await fetch(`${API_URL}/contabilidad/categorias/${id}`, {
    method: 'PATCH',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify({ name }),
  });
  return jsonOrThrow(res);
}

export async function deactivateCategory(id) {
  const res = await fetch(
    `${API_URL}/contabilidad/categorias/${id}/deactivate`,
    {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
    }
  );
  return jsonOrThrow(res);
}

export async function reactivateCategory(id) {
  const res = await fetch(
    `${API_URL}/contabilidad/categorias/${id}/reactivate`,
    {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
    }
  );
  return jsonOrThrow(res);
}

// ---------- Adjuntos (receipts) ----------

export async function uploadAttachment(entryId, fileObject) {
  const fd = new FormData();
  fd.append('file', fileObject);
  // NOTE: do NOT set Content-Type — the browser must set the multipart boundary.
  const res = await fetch(
    `${API_URL}/contabilidad/asientos/${entryId}/attachments`,
    {
      method: 'POST',
      headers: authHeaders(),
      body: fd,
    }
  );
  return jsonOrThrow(res);
}

/**
 * Returns the canonical auth-gated URL for downloading a receipt. The caller
 * must fetch this URL WITH an Authorization header (a plain <a href> cannot
 * carry one) and then convert the blob into an object URL + anchor click for
 * the user.
 *
 * P-1: NEVER route receipt downloads through /storage/receipts/* — those are
 * 401'd by the static-storage guard.
 */
export function downloadAttachmentUrl(entryId, attId) {
  return `${API_URL}/contabilidad/asientos/${entryId}/attachments/${attId}`;
}

export async function deleteAttachment(entryId, attId) {
  const res = await fetch(
    `${API_URL}/contabilidad/asientos/${entryId}/attachments/${attId}`,
    {
      method: 'DELETE',
      headers: authHeaders(),
    }
  );
  return jsonOrThrow(res);
}

const contabilidadApi = {
  fetchRates,
  createRate,
  fetchEntries,
  createEntry,
  fetchEntry,
  updateEntry,
  reverseEntry,
  fetchCategories,
  createCategory,
  renameCategory,
  deactivateCategory,
  reactivateCategory,
  uploadAttachment,
  downloadAttachmentUrl,
  deleteAttachment,
};

export default contabilidadApi;

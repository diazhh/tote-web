// frontend/lib/api/commissions.js
//
// Typed-ish fetch helpers for the Plan 12-03 admin commission routes.
// Each helper reads the JWT from localStorage and attaches Authorization:
// Bearer <token>. Helpers throw on non-2xx HTTP responses so callers can
// distinguish success from failure without re-parsing.
//
// Download helpers (Excel + PDF) return a Blob — callers wrap it in
// URL.createObjectURL and trigger a browser download with <a download>.

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

// ---------- Configs ----------

export async function listConfigs(apiSystemId) {
  const res = await fetch(
    `${API_URL}/api/commissions/configs/${apiSystemId}`,
    { headers: authHeaders() }
  );
  return jsonOrThrow(res);
}

export async function createConfig(body) {
  const res = await fetch(`${API_URL}/api/commissions/configs`, {
    method: 'POST',
    headers: authHeaders({ 'Content-Type': 'application/json' }),
    body: JSON.stringify(body),
  });
  return jsonOrThrow(res);
}

// ---------- Ledger ----------

export async function getLedger({ apiSystemId, from, to } = {}) {
  const res = await fetch(
    `${API_URL}/api/commissions/ledger${qs({ apiSystemId, from, to })}`,
    { headers: authHeaders() }
  );
  return jsonOrThrow(res);
}

// ---------- Settlements ----------

export async function getSettlements({
  isoYear,
  isoWeek,
  apiSystemId,
  status,
} = {}) {
  const res = await fetch(
    `${API_URL}/api/commissions/settlements${qs({
      isoYear,
      isoWeek,
      apiSystemId,
      status,
    })}`,
    { headers: authHeaders() }
  );
  return jsonOrThrow(res);
}

export async function getSettlementDetail(id) {
  const res = await fetch(`${API_URL}/api/commissions/settlements/${id}`, {
    headers: authHeaders(),
  });
  return jsonOrThrow(res);
}

export async function confirmSettlement(id) {
  const res = await fetch(
    `${API_URL}/api/commissions/settlements/${id}/confirm`,
    {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
    }
  );
  return jsonOrThrow(res);
}

export async function adjustSettlement(id, body) {
  const res = await fetch(
    `${API_URL}/api/commissions/settlements/${id}/adjust`,
    {
      method: 'PATCH',
      headers: authHeaders({ 'Content-Type': 'application/json' }),
      body: JSON.stringify(body),
    }
  );
  return jsonOrThrow(res);
}

// ---------- Downloads (blob — caller wraps in createObjectURL) ----------

export async function downloadSettlementExcel(id) {
  const res = await fetch(
    `${API_URL}/api/commissions/settlements/${id}/excel`,
    { headers: authHeaders() }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

export async function downloadSettlementPdf(id) {
  const res = await fetch(
    `${API_URL}/api/commissions/settlements/${id}/pdf`,
    { headers: authHeaders() }
  );
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.blob();
}

const commissionsApi = {
  listConfigs,
  createConfig,
  getLedger,
  getSettlements,
  getSettlementDetail,
  confirmSettlement,
  adjustSettlement,
  downloadSettlementExcel,
  downloadSettlementPdf,
};

export default commissionsApi;

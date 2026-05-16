// frontend/lib/api/pnl.js
//
// Client SDK for the Phase 14 Weekly P&L admin endpoints.
//   GET  /api/reportes/pnl/semanal       — JSON aggregate
//   GET  /api/reportes/pnl/semanal/excel — xlsx download (SUM-formula audit cells)
//   GET  /api/reportes/pnl/semanal/pdf   — pdf download
//
// Pattern mirrors frontend/lib/api/draws.js (axios singleton + default export)
// for the JSON method; download helpers use the `responseType: 'blob'` pattern
// (same as how the rest of the codebase streams Excel/PDF blobs — see
// reportes/page.js handleDownloadPdf which uses a parallel fetch+Blob flow,
// and lib/api/commissions.js downloadSettlementExcel which returns a Blob).
//
// All three methods accept { isoYear, isoWeek, apiSystemId? }. apiSystemId
// is omitted from the query when null/undefined — matches backend validator
// which rejects empty-string UUIDs (Phase 14-03 validateWeekParams).
//
// Threat-model mitigations (T-14-04-02 / T-14-04-03):
// - Downloads go through the authenticated axios instance — auth header is
//   added by the interceptor, never embedded in the URL.
// - isoYear/isoWeek are passed as URLSearchParams values (encoded), not
//   string-concatenated, so no injection vector.

import api from './axios';

/**
 * Build URLSearchParams from a filter object, dropping null/undefined/empty.
 * @param {{isoYear: number|string, isoWeek: number|string, apiSystemId?: string|null}} params
 */
function buildParams(params = {}) {
  const sp = new URLSearchParams();
  if (params.isoYear !== undefined && params.isoYear !== null && params.isoYear !== '') {
    sp.append('isoYear', String(params.isoYear));
  }
  if (params.isoWeek !== undefined && params.isoWeek !== null && params.isoWeek !== '') {
    sp.append('isoWeek', String(params.isoWeek));
  }
  if (params.apiSystemId) {
    sp.append('apiSystemId', String(params.apiSystemId));
  }
  return sp;
}

/**
 * Trigger a browser file-download for the given blob.
 * Used by downloadPnlExcel + downloadPnlPdf.
 */
function triggerBlobDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  // Release the object URL after a tick so the click handler has time to fire.
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

const pnlAPI = {
  /**
   * Fetch the weekly P&L aggregate for a single ISO week.
   * @param {{isoYear: number, isoWeek: number, apiSystemId?: string|null}} params
   * @returns {Promise<object>} response.data (the API envelope; consumers read `.data`)
   */
  getWeeklyPnl: async (params) => {
    const sp = buildParams(params);
    const response = await api.get(`/reportes/pnl/semanal?${sp.toString()}`);
    return response.data;
  },

  /**
   * Download the weekly P&L Excel workbook (xlsx). Triggers a Blob save
   * via a transient <a download> click. Uses the authenticated axios
   * instance so the Authorization header is attached by the interceptor.
   */
  downloadPnlExcel: async (params) => {
    const sp = buildParams(params);
    const response = await api.get(`/reportes/pnl/semanal/excel?${sp.toString()}`, {
      responseType: 'blob',
    });
    const isoYear = params?.isoYear ?? 'XXXX';
    const isoWeek = String(params?.isoWeek ?? 'W').padStart(2, '0');
    const filename = `pnl-semanal-${isoYear}-W${isoWeek}.xlsx`;
    triggerBlobDownload(response.data, filename);
  },

  /**
   * Download the weekly P&L PDF report. Same auth + Blob flow as Excel.
   */
  downloadPnlPdf: async (params) => {
    const sp = buildParams(params);
    const response = await api.get(`/reportes/pnl/semanal/pdf?${sp.toString()}`, {
      responseType: 'blob',
    });
    const isoYear = params?.isoYear ?? 'XXXX';
    const isoWeek = String(params?.isoWeek ?? 'W').padStart(2, '0');
    const filename = `pnl-semanal-${isoYear}-W${isoWeek}.pdf`;
    triggerBlobDownload(response.data, filename);
  },

  /**
   * Download the per-provider PDF report (Multiloterias-branded, includes
   * bank details for payment). Requires apiSystemId.
   */
  downloadProviderPnlPdf: async (params) => {
    if (!params?.apiSystemId) {
      throw new Error('apiSystemId requerido para PDF de proveedor');
    }
    const sp = buildParams(params);
    const response = await api.get(`/reportes/pnl/semanal/proveedor/pdf?${sp.toString()}`, {
      responseType: 'blob',
    });
    const isoYear = params?.isoYear ?? 'XXXX';
    const isoWeek = String(params?.isoWeek ?? 'W').padStart(2, '0');
    const filename = `liquidacion-proveedor-${isoYear}-W${isoWeek}.pdf`;
    triggerBlobDownload(response.data, filename);
  },
};

export default pnlAPI;

'use client';

// Phase 14 (FIN-REPORT-05/06/07) — Weekly P&L admin dashboard.
//
// Surface:
//   GET /api/reportes/pnl/semanal       — JSON aggregate (Phase 14-03 service)
//   GET /api/reportes/pnl/semanal/excel — xlsx download (SUM-formula cells)
//   GET /api/reportes/pnl/semanal/pdf   — pdf download
//
// Filter bar: ISO year + ISO week (default = current ISO week via date-fns
// getISOWeek / getISOWeekYear, both already installed); optional provider
// picker sourced from GET /providers/systems.
//
// D-01: USD eq column shows the rate type + date; when no rate exists the
// USD cell shows "—" with no error (server returns rate=null gracefully).
//
// D-02: Otros ingresos renders as a separate row BELOW the main P&L; it is
// NOT netted into weekNet (the formula is income − prizes − commissions −
// expenses, per Phase 14-03 service contract).
//
// D-03: Drill-down links go to /admin/comisiones/settlements?week=YYYY-Www
// and /admin/contabilidad/asientos?week=YYYY-Www&type=EXPENSE|INCOME — the
// existing Phase 12/13 list pages already parse the `week` param.
//
// D-04: When a provider filter is active, weekExpenses + otherIncome render
// as "—" with a tooltip ("Los gastos no se atribuyen por proveedor"), and
// the per-provider breakdown section hides.
//
// Threat-model mitigations:
// - All API strings (provider names, rate type) flow through React text
//   interpolation — auto-escaped, no dangerouslySetInnerHTML anywhere.
// - Drill-down URLs are built from numeric isoYear/isoWeek constrained by
//   the input min/max attrs — no user-typed string injection.

import { useEffect, useState, useCallback, useMemo } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  TrendingUp, ChevronLeft, ChevronRight, FileSpreadsheet, FileText,
  RefreshCw, Calendar, Building2, ArrowDownToLine,
} from 'lucide-react';
import { getISOWeek, getISOWeekYear, subWeeks, addWeeks, setISOWeek, setISOWeekYear, startOfWeek, addDays, format } from 'date-fns';
import { es } from 'date-fns/locale';
import api from '@/lib/api/axios';
import pnlAPI from '@/lib/api/pnl';

// --- Helpers -----------------------------------------------------------------

const fmtMoney = (n) => {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'VES',
    minimumFractionDigits: 2,
  }).format(num);
};

const fmtUsd = (n) => {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
  }).format(num);
};

const fmtInt = (n) => {
  if (n === null || n === undefined) return '—';
  return new Intl.NumberFormat('es-VE').format(Number(n) || 0);
};

const pad2 = (n) => String(n).padStart(2, '0');

const weekToken = (isoYear, isoWeek) => `${isoYear}-W${pad2(isoWeek)}`;

/**
 * Step ISO week by +/- 1 — uses date-fns to handle year boundaries (e.g.,
 * 2026-W01 prev → 2025-W52 or 2025-W53 depending on the year).
 */
function shiftWeek(isoYear, isoWeek, delta) {
  // Build a Date for the Monday of the (isoYear, isoWeek), then add/sub weeks.
  let base = startOfWeek(new Date(isoYear, 0, 4), { weekStartsOn: 1 });
  base = setISOWeekYear(base, isoYear);
  base = setISOWeek(base, isoWeek);
  const next = delta < 0 ? subWeeks(base, -delta) : addWeeks(base, delta);
  return { isoYear: getISOWeekYear(next), isoWeek: getISOWeek(next) };
}

/** Monday + Sunday for a given ISO week. */
function isoWeekRange(isoYear, isoWeek) {
  let monday = startOfWeek(new Date(isoYear, 0, 4), { weekStartsOn: 1 });
  monday = setISOWeekYear(monday, isoYear);
  monday = setISOWeek(monday, isoWeek);
  const sunday = addDays(monday, 6);
  return { monday, sunday };
}

function fmtRangeShort(isoYear, isoWeek) {
  const { monday, sunday } = isoWeekRange(isoYear, isoWeek);
  // Si el rango cruza meses muestra los dos meses; si no, un solo mes al final.
  const sameMonth = monday.getMonth() === sunday.getMonth() && monday.getFullYear() === sunday.getFullYear();
  if (sameMonth) {
    return `${format(monday, 'd', { locale: es })} – ${format(sunday, "d 'de' MMMM yyyy", { locale: es })}`;
  }
  return `${format(monday, "d 'de' MMM", { locale: es })} – ${format(sunday, "d 'de' MMM yyyy", { locale: es })}`;
}

// --- Page --------------------------------------------------------------------

export default function PnlSemanalPage() {
  // Filters
  const now = new Date();
  const [isoYear, setIsoYear] = useState(() => getISOWeekYear(now));
  const [isoWeek, setIsoWeek] = useState(() => getISOWeek(now));
  const [apiSystemId, setApiSystemId] = useState(''); // '' === "Todos"

  // Data
  const [pnl, setPnl] = useState(null);
  const [providers, setProviders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [downloading, setDownloading] = useState({ excel: false, pdf: false });

  const providerFiltered = Boolean(apiSystemId);

  // --- Fetch providers (one-shot on mount) ---
  useEffect(() => {
    let cancelled = false;
    api
      .get('/providers/systems')
      .then((res) => {
        if (cancelled) return;
        const arr = Array.isArray(res.data) ? res.data : [];
        setProviders(arr);
      })
      .catch(() => {
        if (!cancelled) toast.error('Error cargando proveedores');
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // --- Fetch P&L on filter change ---
  const fetchPnl = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        isoYear,
        isoWeek,
        apiSystemId: apiSystemId || null,
      };
      const result = await pnlAPI.getWeeklyPnl(params);
      // Backend returns { success: true, data: {...} } OR direct object —
      // tolerate both shapes.
      const payload = result?.data ?? result;
      setPnl(payload);
    } catch (err) {
      const status = err?.response?.status;
      if (status === 400) {
        toast.error('Parámetros inválidos (revisa año / semana ISO)');
      } else {
        toast.error('Error cargando P&L semanal');
      }
      setPnl(null);
    } finally {
      setLoading(false);
    }
  }, [isoYear, isoWeek, apiSystemId]);

  useEffect(() => {
    fetchPnl();
  }, [fetchPnl]);

  // --- Handlers ---
  const handlePrev = () => {
    const next = shiftWeek(isoYear, isoWeek, -1);
    setIsoYear(next.isoYear);
    setIsoWeek(next.isoWeek);
  };
  const handleNext = () => {
    const next = shiftWeek(isoYear, isoWeek, +1);
    setIsoYear(next.isoYear);
    setIsoWeek(next.isoWeek);
  };
  const handleThisWeek = () => {
    const today = new Date();
    setIsoYear(getISOWeekYear(today));
    setIsoWeek(getISOWeek(today));
  };

  const handleDownloadExcel = async () => {
    setDownloading((d) => ({ ...d, excel: true }));
    try {
      await pnlAPI.downloadPnlExcel({ isoYear, isoWeek, apiSystemId: apiSystemId || null });
    } catch {
      toast.error('Error descargando Excel');
    } finally {
      setDownloading((d) => ({ ...d, excel: false }));
    }
  };

  const handleDownloadPdf = async () => {
    setDownloading((d) => ({ ...d, pdf: true }));
    try {
      await pnlAPI.downloadPnlPdf({ isoYear, isoWeek, apiSystemId: apiSystemId || null });
    } catch {
      toast.error('Error descargando PDF');
    } finally {
      setDownloading((d) => ({ ...d, pdf: false }));
    }
  };

  const handleDownloadProviderPdf = async (overrideApiSystemId) => {
    // Defensa: si llega un SyntheticEvent en lugar de un id, ignorarlo.
    const validOverride = typeof overrideApiSystemId === 'string' ? overrideApiSystemId : '';
    const targetId = validOverride || apiSystemId;
    if (!targetId) {
      toast.error('Selecciona un proveedor para generar el PDF');
      return;
    }
    setDownloading((d) => ({ ...d, providerPdf: targetId }));
    try {
      await pnlAPI.downloadProviderPnlPdf({ isoYear, isoWeek, apiSystemId: targetId });
    } catch (err) {
      const detail = err?.response?.data?.error || err?.message || 'desconocido';
      toast.error(`Error generando PDF del proveedor: ${detail}`);
    } finally {
      setDownloading((d) => ({ ...d, providerPdf: false }));
    }
  };

  const weekLabel = weekToken(isoYear, isoWeek);
  const weekRangeLabel = fmtRangeShort(isoYear, isoWeek);

  // --- Derived: empty-state guard (P-C downstream) ---
  const isEmpty = useMemo(() => {
    if (!pnl) return false;
    const zero = (v) => v === null || v === undefined || Number(v) === 0;
    return (
      zero(pnl.weekIncome) &&
      zero(pnl.weekPrizes) &&
      zero(pnl.weekCommissions) &&
      zero(pnl.weekExpenses) &&
      zero(pnl.otherIncome) &&
      (!pnl.byProvider || pnl.byProvider.length === 0)
    );
  }, [pnl]);

  // Rate label (D-01): "USD eq @ 36.50 BCV de 2026-05-13" or "—".
  const rateLabel = useMemo(() => {
    const rate = pnl?.rate;
    if (!rate || rate.rateBsPerUsd === null || rate.rateBsPerUsd === undefined) {
      return '—';
    }
    return `USD eq @ ${rate.rateBsPerUsd} ${rate.rateType ?? ''} de ${rate.date ?? ''}`.trim();
  }, [pnl]);

  const providerTooltip = 'Los gastos no se atribuyen por proveedor';

  // Drill-down URLs (D-03)
  const drillCommissions = apiSystemId
    ? `/admin/comisiones?week=${weekLabel}&apiSystemId=${apiSystemId}`
    : `/admin/comisiones?week=${weekLabel}`;
  const drillExpenses    = `/admin/contabilidad/asientos?week=${weekLabel}&type=EXPENSE`;
  const drillIncomeOther = `/admin/contabilidad/asientos?week=${weekLabel}&type=INCOME`;

  // --- Render ---

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-blue-600" />
            P&amp;L Semanal
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            Estado de resultados semanal — ISO {weekLabel}
            <span className="text-gray-400"> · {weekRangeLabel}</span>
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={fetchPnl}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Filter bar */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 sm:gap-4 items-end">
          {/* ISO Year */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Calendar className="w-3.5 h-3.5 inline mr-1" /> Año ISO
            </label>
            <input
              type="number"
              min={2020}
              max={2099}
              value={isoYear}
              onChange={(e) => setIsoYear(Math.max(2020, Math.min(2099, Number(e.target.value) || 0)))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* ISO Week */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Semana ISO</label>
            <input
              type="number"
              min={1}
              max={53}
              value={isoWeek}
              onChange={(e) => setIsoWeek(Math.max(1, Math.min(53, Number(e.target.value) || 1)))}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            />
          </div>

          {/* Provider */}
          <div className="sm:col-span-2">
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Building2 className="w-3.5 h-3.5 inline mr-1" /> Proveedor
            </label>
            <select
              value={apiSystemId}
              onChange={(e) => setApiSystemId(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos</option>
              {providers.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
          </div>

          {/* Prev / This / Next */}
          <div className="flex gap-1">
            <button
              type="button"
              onClick={handlePrev}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 border border-gray-300 rounded-lg text-xs text-gray-700 hover:bg-gray-50"
              title="Semana anterior"
            >
              <ChevronLeft className="w-3.5 h-3.5" /> Prev
            </button>
            <button
              type="button"
              onClick={handleThisWeek}
              className="flex-1 px-2 py-2 border border-gray-300 rounded-lg text-xs text-gray-700 hover:bg-gray-50"
              title="Semana actual"
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={handleNext}
              className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-2 border border-gray-300 rounded-lg text-xs text-gray-700 hover:bg-gray-50"
              title="Semana siguiente"
            >
              Next <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Loading / Empty / Data */}
      {loading && !pnl ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : isEmpty ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center text-gray-500">
          Sin actividad esta semana
        </div>
      ) : pnl ? (
        <>
          {/* Main P&L card */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-semibold text-gray-700">
                Estado de resultados — ISO {weekLabel}
                <span className="ml-2 text-xs font-normal text-gray-400">
                  ({weekRangeLabel})
                </span>
                {providerFiltered && (
                  <span className="ml-2 text-xs font-normal text-gray-500">
                    · filtrado por proveedor
                  </span>
                )}
              </h2>
              <div className="text-xs text-gray-500">{rateLabel}</div>
            </div>
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Concepto</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">BsF</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">USD eq</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                <tr>
                  <td className="px-4 py-2 text-gray-800">Ingresos</td>
                  <td className="px-4 py-2 text-right text-gray-800">{fmtMoney(pnl.weekIncome)}</td>
                  <td className="px-4 py-2 text-right text-gray-500">—</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-gray-800">Premios</td>
                  <td className="px-4 py-2 text-right text-red-600">{fmtMoney(pnl.weekPrizes)}</td>
                  <td className="px-4 py-2 text-right text-gray-500">—</td>
                </tr>
                <tr className="bg-gray-50/50">
                  <td className="px-4 py-2 font-medium text-gray-900">Utilidad bruta</td>
                  <td className="px-4 py-2 text-right font-medium text-gray-900">
                    {fmtMoney(pnl.weekGrossUtility)}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-500">—</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-gray-800">Comisiones</td>
                  <td className="px-4 py-2 text-right text-red-600">{fmtMoney(pnl.weekCommissions)}</td>
                  <td className="px-4 py-2 text-right text-gray-500">—</td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-gray-800">Gastos</td>
                  <td className="px-4 py-2 text-right text-red-600" title={providerFiltered ? providerTooltip : undefined}>
                    {providerFiltered ? '—' : fmtMoney(pnl.weekExpenses)}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-500">—</td>
                </tr>
                <tr className="bg-blue-50/40 border-t-2 border-blue-200">
                  <td className="px-4 py-2 font-bold text-gray-900">Neto</td>
                  <td className={`px-4 py-2 text-right font-bold ${Number(pnl.weekNet) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                    {fmtMoney(pnl.weekNet)}
                  </td>
                  <td className="px-4 py-2 text-right font-medium text-gray-700">
                    {pnl.usdEquivalent !== null && pnl.usdEquivalent !== undefined
                      ? fmtUsd(pnl.usdEquivalent)
                      : '—'}
                  </td>
                </tr>
                {/* D-02 — Otros ingresos rendered BELOW the main row, NOT netted */}
                <tr>
                  <td className="px-4 py-2"></td>
                  <td className="px-4 py-2"></td>
                  <td className="px-4 py-2"></td>
                </tr>
                <tr>
                  <td className="px-4 py-2 text-gray-700 italic">Otros ingresos (no netto)</td>
                  <td className="px-4 py-2 text-right text-gray-700 italic" title={providerFiltered ? providerTooltip : undefined}>
                    {providerFiltered ? '—' : fmtMoney(pnl.otherIncome)}
                  </td>
                  <td className="px-4 py-2 text-right text-gray-500">—</td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Drill-down + export buttons */}
          <div className="flex flex-wrap items-center justify-between gap-3 bg-white rounded-xl shadow-sm border border-gray-100 p-4">
            <div className="flex flex-wrap gap-2">
              <Link
                href={drillCommissions}
                className="inline-flex items-center gap-1 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 rounded-lg text-sm transition"
              >
                Ver comisiones
              </Link>
              <Link
                href={drillExpenses}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition ${
                  providerFiltered
                    ? 'bg-gray-50 text-gray-400 pointer-events-none'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
                title={providerFiltered ? providerTooltip : undefined}
              >
                Ver gastos
              </Link>
              <Link
                href={drillIncomeOther}
                className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm transition ${
                  providerFiltered
                    ? 'bg-gray-50 text-gray-400 pointer-events-none'
                    : 'bg-gray-100 hover:bg-gray-200 text-gray-700'
                }`}
                title={providerFiltered ? providerTooltip : undefined}
              >
                Ver ingresos otros
              </Link>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleDownloadExcel}
                disabled={downloading.excel}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm hover:bg-green-700 disabled:opacity-50"
              >
                <FileSpreadsheet className={`w-4 h-4 ${downloading.excel ? 'animate-bounce' : ''}`} />
                {downloading.excel ? 'Generando...' : 'Excel'}
              </button>
              <button
                onClick={handleDownloadPdf}
                disabled={downloading.pdf}
                className="inline-flex items-center gap-2 px-3 py-1.5 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 disabled:opacity-50"
              >
                <ArrowDownToLine className={`w-4 h-4 ${downloading.pdf ? 'animate-bounce' : ''}`} />
                {downloading.pdf ? 'Generando...' : 'PDF'}
              </button>
              {providerFiltered && (
                <button
                  onClick={() => handleDownloadProviderPdf(apiSystemId)}
                  disabled={!!downloading.providerPdf}
                  className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-700 text-white rounded-lg text-sm hover:bg-blue-800 disabled:opacity-50"
                  title="PDF profesional para enviar al proveedor"
                >
                  <FileText className={`w-4 h-4 ${downloading.providerPdf ? 'animate-bounce' : ''}`} />
                  {downloading.providerPdf ? 'Generando...' : 'PDF Proveedor'}
                </button>
              )}
            </div>
          </div>

          {/* Per-provider breakdown (only when no provider filter) */}
          {!providerFiltered && pnl.byProvider?.length > 0 && (
            <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
              <div className="px-4 py-3 border-b border-gray-100 flex items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-gray-700">Detalle por proveedor</h3>
                <span className="text-xs text-gray-400">Descarga el PDF de liquidación por proveedor →</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2 text-left text-xs font-medium text-gray-500">Proveedor</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Ventas</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Premios</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Comisiones</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500">Neto</th>
                      <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 w-24">PDF</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {pnl.byProvider.map((row) => {
                      const label = row.apiSystemName ?? row.apiSystem?.name ?? row.providerName ?? 'Taquilla / Online';
                      const key = row.apiSystemId ?? 'taquilla-online';
                      const rowDownloading = downloading.providerPdf === row.apiSystemId;
                      return (
                        <tr key={key}>
                          <td className="px-4 py-2 text-gray-800">{label}</td>
                          <td className="px-4 py-2 text-right text-gray-700">{fmtMoney(row.totalSales ?? row.weekIncome)}</td>
                          <td className="px-4 py-2 text-right text-red-600">{fmtMoney(row.totalPrize ?? row.weekPrizes)}</td>
                          <td className="px-4 py-2 text-right text-red-600">{fmtMoney(row.weekCommissions ?? row.commissions)}</td>
                          <td className={`px-4 py-2 text-right font-medium ${Number(row.weekNet ?? row.net) >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                            {fmtMoney(row.weekNet ?? row.net)}
                          </td>
                          <td className="px-4 py-2 text-right">
                            {row.apiSystemId ? (
                              <button
                                onClick={() => handleDownloadProviderPdf(row.apiSystemId)}
                                disabled={!!downloading.providerPdf}
                                title={`Descargar PDF de liquidación para ${label}`}
                                className="inline-flex items-center gap-1 px-2 py-1 bg-blue-700 text-white rounded-md text-xs hover:bg-blue-800 disabled:opacity-50"
                              >
                                <FileText className={`w-3.5 h-3.5 ${rowDownloading ? 'animate-bounce' : ''}`} />
                                {rowDownloading ? '...' : 'PDF'}
                              </button>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-10 text-center text-gray-400">
          No se pudieron cargar los datos. Reintenta con el botón Actualizar.
        </div>
      )}
    </div>
  );
}

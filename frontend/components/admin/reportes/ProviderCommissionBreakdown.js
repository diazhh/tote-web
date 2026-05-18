'use client';

import { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { AlertTriangle, Percent } from 'lucide-react';
import pnlAPI from '@/lib/api/pnl';

const fmtMoney = (n) => {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return new Intl.NumberFormat('es-VE', {
    style: 'currency', currency: 'VES', minimumFractionDigits: 2,
  }).format(num);
};

const fmtPct = (n) => {
  if (n === null || n === undefined || n === '') return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return '—';
  return `${num.toFixed(2)}%`;
};

function formulaLabel(formulaType, salesRate, utilityRate) {
  switch (formulaType) {
    case 'SALES_PCT':
      return `${fmtPct(salesRate)} sobre ventas`;
    case 'UTILITY_PCT':
      return `${fmtPct(utilityRate)} sobre utilidad`;
    case 'SALES_AND_UTILITY_PCT':
      return `${fmtPct(salesRate)} sobre ventas + ${fmtPct(utilityRate)} sobre utilidad`;
    case 'TIERED':
      return 'Por tramos de ventas (TIERED)';
    default:
      return formulaType ?? '—';
  }
}

export default function ProviderCommissionBreakdown({ isoYear, isoWeek, apiSystemId, apiSystemName }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!apiSystemId) return;
    let cancelled = false;
    setLoading(true);
    pnlAPI.getProviderBreakdown({ isoYear, isoWeek, apiSystemId })
      .then((result) => {
        if (cancelled) return;
        // Server envelope: { success, data: {...} } — unwrap.
        const payload = result?.data ?? result;
        setData(payload);
      })
      .catch(() => {
        if (!cancelled) {
          toast.error('Error cargando desglose de comisión');
          setData(null);
        }
      })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [isoYear, isoWeek, apiSystemId]);

  if (!apiSystemId) return null;

  if (loading && !data) {
    return (
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6 flex justify-center">
        <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (!data || !data.byGame || data.byGame.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
      <div className="px-4 py-3 border-b border-gray-100">
        <h3 className="text-sm font-semibold text-gray-700 flex items-center gap-2">
          <Percent className="w-4 h-4 text-blue-600" />
          Desglose de comisión — {apiSystemName ?? data.apiSystemName}
        </h3>
      </div>

      {/* Sub-bloque A — Configs vigentes */}
      {data.configs && data.configs.length > 0 && (
        <div className="px-4 py-3 bg-gray-50/50 border-b border-gray-100 text-xs text-gray-700 space-y-1">
          <div className="font-medium text-gray-600 mb-1">Configuración vigente:</div>
          {data.configs.map((cfg, idx) => (
            <div key={idx}>
              • <span className="font-medium">{cfg.gameNames.join(', ')}</span>
              {' → '}
              {formulaLabel(cfg.formulaType, cfg.salesRate, cfg.utilityRate)}
              <span className="text-gray-400"> (desde {cfg.effectiveFrom})</span>
            </div>
          ))}
        </div>
      )}

      {/* Sub-bloque B — Tabla por juego */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Juego</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Ventas</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Premios</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Bruto</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">%V</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Com. ventas</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">%U</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Com. utilidad</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Comisión proveedor</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500">Neto a casa</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {data.byGame.map((row) => {
              const grossNeg = Number(row.gross) < 0;
              const netNeg = Number(row.netToHouse) < 0;
              return (
                <tr key={row.gameId} className="hover:bg-gray-50/40">
                  <td className="px-3 py-2 text-gray-800">{row.gameName}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{fmtMoney(row.sales)}</td>
                  <td className="px-3 py-2 text-right text-red-600">{fmtMoney(row.prizes)}</td>
                  <td className={`px-3 py-2 text-right ${grossNeg ? 'text-red-600' : 'text-gray-800'}`}>
                    {fmtMoney(row.gross)}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-500">
                    {row.tierLabel ? row.tierLabel : fmtPct(row.salesRate)}
                  </td>
                  <td className="px-3 py-2 text-right text-gray-700">{fmtMoney(row.salesCommission)}</td>
                  <td className="px-3 py-2 text-right text-gray-500">{fmtPct(row.utilityRate)}</td>
                  <td className="px-3 py-2 text-right text-gray-700">{fmtMoney(row.utilityCommission)}</td>
                  <td className="px-3 py-2 text-right text-red-700 font-medium">{fmtMoney(row.totalCommission)}</td>
                  <td className={`px-3 py-2 text-right font-medium ${netNeg ? 'text-red-700' : 'text-green-700'}`}>
                    {fmtMoney(row.netToHouse)}
                  </td>
                </tr>
              );
            })}
            <tr className="bg-blue-50/40 border-t-2 border-blue-200 font-bold">
              <td className="px-3 py-2 text-gray-900">TOTAL</td>
              <td className="px-3 py-2 text-right text-gray-900">{fmtMoney(data.totals.sales)}</td>
              <td className="px-3 py-2 text-right text-red-700">{fmtMoney(data.totals.prizes)}</td>
              <td className={`px-3 py-2 text-right ${Number(data.totals.gross) < 0 ? 'text-red-700' : 'text-gray-900'}`}>
                {fmtMoney(data.totals.gross)}
              </td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-right text-gray-900">{fmtMoney(data.totals.salesCommission)}</td>
              <td className="px-3 py-2"></td>
              <td className="px-3 py-2 text-right text-gray-900">{fmtMoney(data.totals.utilityCommission)}</td>
              <td className="px-3 py-2 text-right text-red-700">{fmtMoney(data.totals.totalCommission)}</td>
              <td className={`px-3 py-2 text-right ${Number(data.totals.netToHouse) < 0 ? 'text-red-700' : 'text-green-700'}`}>
                {fmtMoney(data.totals.netToHouse)}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Sub-bloque C — Warnings */}
      {data.warnings && data.warnings.length > 0 && (
        <div className="px-4 py-3 bg-amber-50 border-t border-amber-200 text-xs text-amber-800 space-y-1">
          {data.warnings.map((w, idx) => (
            <div key={idx} className="flex items-start gap-2">
              <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
              <span>{w}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { fetchAccounts, fetchCashFlow, cashFlowExcelUrl, cashFlowPdfUrl } from '@/lib/api/contabilidad';
import { formatBsF } from '@/components/contabilidad/MoneyBadge';
import ContabilidadTabs from '@/components/contabilidad/ContabilidadTabs';

function isoDate(d) { return new Date(d).toISOString().slice(0, 10); }

function isoWeekRange(d) {
  const date = new Date(d);
  const day = date.getDay() || 7;
  if (day !== 1) date.setDate(date.getDate() - (day - 1));
  const sunday = new Date(date);
  sunday.setDate(date.getDate() + 6);
  return { from: isoDate(date), to: isoDate(sunday) };
}

function monthRange(d) {
  const date = new Date(d);
  const from = new Date(date.getFullYear(), date.getMonth(), 1);
  const to = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  return { from: isoDate(from), to: isoDate(to) };
}

export default function ReportesPage() {
  const [view, setView] = useState('semanal');
  const [range, setRange] = useState(() => isoWeekRange(new Date()));
  const [accountId, setAccountId] = useState('');
  const [accounts, setAccounts] = useState([]);
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAccounts({ includeInactive: true }).then((r) => setAccounts(r?.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchCashFlow({ from: range.from, to: range.to, accountId: accountId || undefined })
      .then((r) => setReport(r.data))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [range.from, range.to, accountId]);

  function selectView(v) {
    setView(v);
    const today = new Date();
    if (v === 'semanal') setRange(isoWeekRange(today));
    else if (v === 'mensual') setRange(monthRange(today));
    else if (v === 'diario') setRange({ from: isoDate(today), to: isoDate(today) });
    // 'rango' deja al usuario seteando los inputs
  }

  function dlExcel() {
    const token = localStorage.getItem('accessToken');
    fetch(cashFlowExcelUrl({ from: range.from, to: range.to, accountId: accountId || undefined }),
      { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `flujo-caja-${range.from}-${range.to}.xlsx`; a.click();
        URL.revokeObjectURL(url);
      });
  }

  function dlPdf() {
    const token = localStorage.getItem('accessToken');
    fetch(cashFlowPdfUrl({ from: range.from, to: range.to, accountId: accountId || undefined }),
      { headers: { Authorization: `Bearer ${token}` } })
      .then((r) => r.blob())
      .then((blob) => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = `flujo-caja-${range.from}-${range.to}.pdf`; a.click();
        URL.revokeObjectURL(url);
      });
  }

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold text-gray-900">Reportes de flujo de caja</h1>

      <ContabilidadTabs active="reportes" />

      <div className="bg-white shadow rounded-lg p-4 space-y-3">
        <div className="flex gap-2 overflow-x-auto">
          {['semanal', 'mensual', 'diario', 'rango'].map((v) => (
            <button key={v} onClick={() => selectView(v)}
              className={`min-h-11 px-4 py-2 text-sm font-medium rounded-md whitespace-nowrap ${
                view === v ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}>{v.charAt(0).toUpperCase() + v.slice(1)}</button>
          ))}
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Desde</label>
            <input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })}
              className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Hasta</label>
            <input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })}
              className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Cuenta</label>
            <select value={accountId} onChange={(e) => setAccountId(e.target.value)}
              className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md">
              <option value="">Todas (consolidado)</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
          </div>
        </div>
        <div className="flex gap-2 justify-end">
          <button onClick={dlExcel} className="min-h-11 px-3 py-2 text-sm text-white bg-green-600 rounded-md hover:bg-green-700">Descargar Excel</button>
          <button onClick={dlPdf} className="min-h-11 px-3 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700">Descargar PDF</button>
        </div>
      </div>

      {loading && <p className="text-sm text-gray-500">Cargando reporte…</p>}

      {report && !loading && (
        <div className="space-y-3">
          {Object.entries(report.byCurrency).map(([currency, b]) => (
            <div key={currency} className="bg-white shadow rounded-lg p-4 space-y-2">
              <h2 className="text-lg font-bold text-gray-900">Moneda: {currency}</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div><span className="text-gray-500">Saldo inicial:</span> <span className="font-mono">{formatBsF(b.openingBalance)}</span></div>
                <div><span className="text-gray-500">Saldo final:</span> <span className="font-mono font-bold">{formatBsF(b.closingBalance)}</span></div>
                <div className="text-green-700"><span className="text-gray-500">Entradas:</span> <span className="font-mono">+{formatBsF(b.entradas)}</span></div>
                <div className="text-red-700"><span className="text-gray-500">Salidas:</span> <span className="font-mono">−{formatBsF(b.salidas)}</span></div>
                <div className="col-span-2"><span className="text-gray-500">Neto:</span> <span className="font-mono font-bold">{Number(b.neto) >= 0 ? '+' : ''}{formatBsF(b.neto)}</span></div>
              </div>
              {b.categoriesIn.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-gray-700">Entradas por categoría</summary>
                  <ul className="mt-2 space-y-1 text-sm">
                    {b.categoriesIn.map((c) => (
                      <li key={c.categoryId} className="flex justify-between">
                        <span>{c.name}</span><span className="font-mono">{formatBsF(c.total)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
              {b.categoriesOut.length > 0 && (
                <details className="mt-2">
                  <summary className="cursor-pointer text-sm text-gray-700">Salidas por categoría</summary>
                  <ul className="mt-2 space-y-1 text-sm">
                    {b.categoriesOut.map((c) => (
                      <li key={c.categoryId} className="flex justify-between">
                        <span>{c.name}</span><span className="font-mono">{formatBsF(c.total)}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              )}
            </div>
          ))}

          {report.transfers.length > 0 && (
            <div className="bg-white shadow rounded-lg p-4">
              <h2 className="text-base font-semibold text-gray-900 mb-2">Transferencias internas en el período</h2>
              <ul className="space-y-2 text-sm">
                {report.transfers.map((t) => (
                  <li key={t.id} className="flex justify-between gap-2">
                    <span>{String(t.transferDate).slice(0, 10)} · {t.fromAccount.name} → {t.toAccount.name}</span>
                    <span className="font-mono">{formatBsF(t.amountFrom)} {t.fromAccount.currency}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

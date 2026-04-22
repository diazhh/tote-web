// frontend/components/admin/conciliacion/ConciliacionTable.js
'use client';

import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

function fmt(n) {
  return Number(n || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function UtilidadCell({ utilidad }) {
  const isPositive = utilidad >= 0;
  return (
    <td className={`px-4 py-2 text-right text-sm font-medium ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
      {isPositive ? '' : '-'}{fmt(Math.abs(utilidad))}
    </td>
  );
}

function ComercialRows({ comerciales }) {
  return (
    <>
      {comerciales.map((c, i) => (
        <tr key={i} className="bg-gray-50 border-t border-gray-100">
          <td className="px-4 py-1.5 pl-20 text-xs text-gray-500">{c.comercialName}</td>
          <td className="px-4 py-1.5 text-right text-xs text-gray-600">{fmt(c.venta)}</td>
          <td className="px-4 py-1.5 text-right text-xs text-gray-600">{fmt(c.premio)}</td>
          <UtilidadCell utilidad={c.utilidad} />
        </tr>
      ))}
    </>
  );
}

function ProviderRow({ provider }) {
  const [open, setOpen] = useState(false);
  const hasCom = provider.comerciales?.length > 0;

  return (
    <>
      <tr className="border-t border-gray-100 bg-blue-50/30">
        <td className="px-4 py-2 pl-10 text-sm text-gray-700">
          <div className="flex items-center gap-1">
            {hasCom ? (
              <button onClick={() => setOpen(v => !v)} className="p-0.5 rounded hover:bg-blue-100">
                {open ? <ChevronDown className="w-3 h-3 text-gray-500" /> : <ChevronRight className="w-3 h-3 text-gray-500" />}
              </button>
            ) : (
              <span className="w-4 inline-block" />
            )}
            {provider.providerName}
          </div>
        </td>
        <td className="px-4 py-2 text-right text-sm text-gray-700">{fmt(provider.venta)}</td>
        <td className="px-4 py-2 text-right text-sm text-gray-700">{fmt(provider.premio)}</td>
        <UtilidadCell utilidad={provider.utilidad} />
      </tr>
      {open && hasCom && <ComercialRows comerciales={provider.comerciales} />}
    </>
  );
}

function GameRow({ row }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <tr
        className="cursor-pointer hover:bg-gray-50 border-b border-gray-200"
        onClick={() => setOpen(v => !v)}
      >
        <td className="px-4 py-3 text-sm font-semibold text-gray-900">
          <div className="flex items-center gap-2">
            {open ? <ChevronDown className="w-4 h-4 text-gray-500" /> : <ChevronRight className="w-4 h-4 text-gray-500" />}
            {row.gameName}
          </div>
        </td>
        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{fmt(row.venta)}</td>
        <td className="px-4 py-3 text-right text-sm font-semibold text-gray-900">{fmt(row.premio)}</td>
        <UtilidadCell utilidad={row.utilidad} />
      </tr>
      {open && row.providers.map((p, i) => (
        <ProviderRow key={p.apiSystemId || p.providerName || i} provider={p} />
      ))}
    </>
  );
}

export default function ConciliacionTable({ data }) {
  if (!data || data.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center text-gray-500 text-sm">
        Sin resultados para el período seleccionado.
      </div>
    );
  }

  const totals = data.reduce(
    (acc, row) => ({ venta: acc.venta + row.venta, premio: acc.premio + row.premio, utilidad: acc.utilidad + row.utilidad }),
    { venta: 0, premio: 0, utilidad: 0 }
  );

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <table className="w-full">
        <thead className="bg-gray-50 border-b border-gray-200">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase tracking-wider">Juego / Proveedor</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Venta</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Premio</th>
            <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase tracking-wider">Utilidad</th>
          </tr>
        </thead>
        <tbody>
          {data.map(row => (
            <GameRow key={row.gameId} row={row} />
          ))}
        </tbody>
        <tfoot className="bg-gray-50 border-t-2 border-gray-300">
          <tr>
            <td className="px-4 py-3 text-sm font-bold text-gray-900">TOTAL</td>
            <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{fmt(totals.venta)}</td>
            <td className="px-4 py-3 text-right text-sm font-bold text-gray-900">{fmt(totals.premio)}</td>
            <UtilidadCell utilidad={totals.utilidad} />
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

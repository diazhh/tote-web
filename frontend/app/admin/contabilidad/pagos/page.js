'use client';

// /admin/contabilidad/pagos — D-05 tab 4: PAYMENT entries linked to settlements.
//
// Top: settlement picker for pending payments (status IN ('CONFIRMED','ADJUSTED'))
// → clicking "Marcar pagado" navigates to
//   /admin/contabilidad/asientos/nueva?type=PAYMENT&settlementId=<id>
// (planner pre-decision O3 — query-string-pre-populated form).
//
// Bottom: filtered list of existing PAYMENT entries with settlement summary.

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { fetchEntries } from '@/lib/api/contabilidad';
import { getSettlements } from '@/lib/api/commissions';

const TABS = [
  { key: 'home',           label: 'Resumen',        href: '/admin/contabilidad' },
  { key: 'asientos',       label: 'Asientos',       href: '/admin/contabilidad/asientos' },
  { key: 'transferencias', label: 'Transferencias', href: '/admin/contabilidad/transferencias' },
  { key: 'pagos',          label: 'Pagos',          href: '/admin/contabilidad/pagos' },
  { key: 'tasas',          label: 'Tasas',          href: '/admin/contabilidad/tasas' },
  { key: 'categorias',     label: 'Categorías',     href: '/admin/contabilidad/categorias' },
  { key: 'cuentas',        label: 'Cuentas',        href: '/admin/contabilidad/cuentas' },
  { key: 'reportes',       label: 'Reportes',       href: '/admin/contabilidad/reportes' },
];

function formatAmount(value) {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

export default function PagosPage() {
  const router = useRouter();
  const [paymentEntries, setPaymentEntries] = useState([]);
  const [settlements, setSettlements] = useState([]);
  const [pickedSettlement, setPickedSettlement] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingSettlements, setLoadingSettlements] = useState(false);

  const loadSettlements = useCallback(async () => {
    setLoadingSettlements(true);
    try {
      // Fetch CONFIRMED and ADJUSTED in parallel — controller accepts a single
      // status value per request, so we union the two lists client-side.
      const [confirmed, adjusted] = await Promise.all([
        getSettlements({ status: 'CONFIRMED' }),
        getSettlements({ status: 'ADJUSTED' }),
      ]);
      const all = [
        ...(Array.isArray(confirmed?.data) ? confirmed.data : []),
        ...(Array.isArray(adjusted?.data) ? adjusted.data : []),
      ];
      setSettlements(all);
    } catch (err) {
      toast.error(err.message || 'Error cargando liquidaciones');
    } finally {
      setLoadingSettlements(false);
    }
  }, []);

  const loadEntries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchEntries({ type: 'PAYMENT' });
      setPaymentEntries(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      toast.error(err.message || 'Error cargando pagos');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSettlements();
    loadEntries();
  }, [loadSettlements, loadEntries]);

  const handleMarcarPagado = () => {
    if (!pickedSettlement) {
      toast.error('Selecciona una liquidación');
      return;
    }
    // Navigate to the create-entry form pre-populated via query string.
    router.push(
      `/admin/contabilidad/asientos/nueva?type=PAYMENT&settlementId=${pickedSettlement}`
    );
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Contabilidad</h1>
        <p className="text-sm text-gray-500">Pagos a proveedores (PAYMENT)</p>
      </div>

      <nav className="flex gap-2 border-b border-gray-200 overflow-x-auto whitespace-nowrap">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              tab.key === 'pagos'
                ? 'text-blue-700 border-blue-600'
                : 'text-gray-600 border-transparent hover:text-blue-700'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {/* Settlement picker — "Marcar pagado" quick action (D-03 + D-05) */}
      <section className="bg-white shadow rounded-lg p-4 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">
          Marcar pagado para una liquidación pendiente
        </h2>
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex-1 min-w-[260px]">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Liquidación (Confirmada / Ajustada)
            </label>
            <select
              value={pickedSettlement}
              onChange={(e) => setPickedSettlement(e.target.value)}
              className="w-full min-h-11 px-2 py-1.5 text-sm border border-gray-300 rounded-md"
              disabled={loadingSettlements}
            >
              <option value="">
                {loadingSettlements ? 'Cargando…' : '— Selecciona —'}
              </option>
              {settlements.map((s) => {
                const statusLabel =
                  s.status === 'CONFIRMED'
                    ? 'Confirmada'
                    : s.status === 'ADJUSTED'
                    ? 'Ajustada'
                    : s.status;
                return (
                  <option key={s.id} value={s.id}>
                    {s.isoYear}-W{s.isoWeek} · {s.apiSystem?.name || s.apiSystemId} · {statusLabel}
                    {' · '}
                    Total: {formatAmount(s.amount)}
                  </option>
                );
              })}
            </select>
          </div>
          <button
            onClick={handleMarcarPagado}
            disabled={!pickedSettlement}
            className="min-h-11 px-4 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            Marcar pagado
          </button>
        </div>
        <p className="text-xs text-gray-500">
          Navega a la pantalla de nuevo asiento con el campo de liquidación pre-cargado:
          <code className="text-xs ml-1">
            /admin/contabilidad/asientos/nueva?type=PAYMENT&amp;settlementId=…
          </code>
        </p>
      </section>

      {/* Existing PAYMENT entries */}
      <section className="space-y-2">
        <h2 className="text-base font-semibold text-gray-900">
          Pagos registrados
        </h2>

        {loading && (
          <p className="text-sm text-gray-500 px-1">Cargando…</p>
        )}
        {!loading && paymentEntries.length === 0 && (
          <p className="text-sm text-gray-400 px-1">Sin pagos registrados</p>
        )}

        {/* Cards en móvil */}
        <div className="md:hidden space-y-2">
          {!loading &&
            paymentEntries.map((entry) => (
              <div
                key={entry.id}
                onClick={() =>
                  router.push(`/admin/contabilidad/asientos/${entry.id}`)
                }
                className="bg-white shadow rounded-lg p-4 cursor-pointer"
              >
                <p className="text-xs text-gray-500">
                  {String(entry.entryDate).slice(0, 10)}
                </p>
                <p className="text-2xl font-mono font-bold mt-1">
                  {formatAmount(entry.amountBsF)}
                </p>
                <p className="text-sm text-gray-700 mt-1 line-clamp-2">
                  {entry.description || '—'}
                </p>
                <div className="flex items-center justify-between mt-2">
                  <p className="text-xs text-gray-500">
                    Liq:{' '}
                    {entry.settlement
                      ? `${entry.settlement.isoYear}-W${entry.settlement.isoWeek}`
                      : '—'}
                  </p>
                  {entry.reversedById ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                      Reversado
                    </span>
                  ) : entry.reversesId ? (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                      Reverso
                    </span>
                  ) : (
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                      Activo
                    </span>
                  )}
                </div>
              </div>
            ))}
        </div>

        {/* Tabla en desktop */}
        <div className="hidden md:block bg-white shadow rounded-lg overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Fecha
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Descripción
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Liquidación
                </th>
                <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                  Monto BsF
                </th>
                <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                  Estado
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-100">
              {!loading &&
                paymentEntries.map((entry) => (
                  <tr
                    key={entry.id}
                    className="hover:bg-gray-50 cursor-pointer"
                    onClick={() =>
                      router.push(`/admin/contabilidad/asientos/${entry.id}`)
                    }
                  >
                    <td className="px-4 py-2 text-sm text-gray-900">
                      {String(entry.entryDate).slice(0, 10)}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-700">
                      {entry.description || '—'}
                    </td>
                    <td className="px-4 py-2 text-sm text-gray-600">
                      {entry.settlement
                        ? `${entry.settlement.isoYear}-W${entry.settlement.isoWeek}`
                        : entry.settlementId
                        ? entry.settlementId.slice(0, 8) + '…'
                        : '—'}
                    </td>
                    <td className="px-4 py-2 text-sm text-right font-mono text-gray-900">
                      {Number(entry.amountBsF).toFixed(8)}
                    </td>
                    <td className="px-4 py-2 text-sm">
                      {entry.reversedById ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Reversado
                        </span>
                      ) : entry.reversesId ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          Reverso
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Activo
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

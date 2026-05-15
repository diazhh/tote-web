'use client';

// /admin/contabilidad/asientos — entry list with filters + per-row detail link.
//
// Filters: type, dateRange (from/to), categoryId, settlementId, providerId,
// includeReversed. Renders the historical USD equivalent per F-7
// (amountBsF / exchangeRate.rateBsPerUsd — never reconverted).

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { fetchEntries, fetchCategories } from '@/lib/api/contabilidad';

const TABS = [
  { key: 'asientos',   label: 'Asientos',   href: '/admin/contabilidad/asientos' },
  { key: 'tasas',      label: 'Tasas',      href: '/admin/contabilidad/tasas' },
  { key: 'categorias', label: 'Categorías', href: '/admin/contabilidad/categorias' },
  { key: 'pagos',      label: 'Pagos',      href: '/admin/contabilidad/pagos' },
];

function formatBsF(value) {
  if (value === null || value === undefined) return '—';
  return Number(value).toFixed(8);
}

// F-7: USD historical equivalent = amountBsF / exchangeRate.rateBsPerUsd.
// NEVER reconvert using a current rate. Returns null when no rate is locked
// to the entry (BsF-only entries).
function usdEquivalent(entry) {
  if (!entry?.exchangeRate?.rateBsPerUsd) return null;
  const rate = Number(entry.exchangeRate.rateBsPerUsd);
  if (!(rate > 0)) return null;
  return (Number(entry.amountBsF) / rate).toFixed(2);
}

export default function AsientosListPage() {
  const router = useRouter();
  const [entries, setEntries] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filters, setFilters] = useState({
    type: '',
    from: '',
    to: '',
    categoryId: '',
    settlementId: '',
    providerId: '',
    includeReversed: false,
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filters.type) params.type = filters.type;
      if (filters.from) params.from = filters.from;
      if (filters.to) params.to = filters.to;
      if (filters.categoryId) params.categoryId = filters.categoryId;
      if (filters.settlementId) params.settlementId = filters.settlementId;
      if (filters.providerId) params.providerId = filters.providerId;
      if (filters.includeReversed) params.includeReversed = 'true';
      const res = await fetchEntries(params);
      setEntries(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      toast.error(err.message || 'Error cargando asientos');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    fetchCategories({ includeInactive: 'true' })
      .then((res) => setCategories(Array.isArray(res?.data) ? res.data : []))
      .catch(() => {});
  }, []);

  // When the type filter changes, narrow the categoryId filter.
  const categoryOptions = filters.type
    ? categories.filter((c) => c.appliesTo === filters.type)
    : categories;

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Contabilidad</h1>
          <p className="text-sm text-gray-500">Asientos contables</p>
        </div>
        <Link
          href="/admin/contabilidad/asientos/nueva"
          className="px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
        >
          + Nuevo asiento
        </Link>
      </div>

      <nav className="flex gap-2 border-b border-gray-200">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              tab.key === 'asientos'
                ? 'text-blue-700 border-blue-600'
                : 'text-gray-600 border-transparent hover:text-blue-700'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {/* Filters */}
      <div className="bg-white shadow rounded-lg p-4 grid grid-cols-1 md:grid-cols-6 gap-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
          <select
            value={filters.type}
            onChange={(e) =>
              setFilters({ ...filters, type: e.target.value, categoryId: '' })
            }
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
          >
            <option value="">Todos</option>
            <option value="INCOME">INCOME</option>
            <option value="EXPENSE">EXPENSE</option>
            <option value="PAYMENT">PAYMENT</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Desde</label>
          <input
            type="date"
            value={filters.from}
            onChange={(e) => setFilters({ ...filters, from: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Hasta</label>
          <input
            type="date"
            value={filters.to}
            onChange={(e) => setFilters({ ...filters, to: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Categoría</label>
          <select
            value={filters.categoryId}
            onChange={(e) => setFilters({ ...filters, categoryId: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
          >
            <option value="">Todas</option>
            {categoryOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} ({c.appliesTo})
              </option>
            ))}
          </select>
        </div>
        <div className="md:col-span-2 flex items-end">
          <label className="text-sm text-gray-700 flex items-center gap-2">
            <input
              type="checkbox"
              checked={filters.includeReversed}
              onChange={(e) =>
                setFilters({ ...filters, includeReversed: e.target.checked })
              }
              className="rounded"
            />
            Incluir reversados
          </label>
        </div>
      </div>

      <div className="bg-white shadow rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Categoría</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">BsF</th>
              <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">USD eq</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Liq.</th>
              <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-gray-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && entries.length === 0 && (
              <tr>
                <td colSpan={8} className="px-3 py-6 text-center text-sm text-gray-400">
                  Sin asientos
                </td>
              </tr>
            )}
            {!loading &&
              entries.map((e) => {
                const usd = usdEquivalent(e);
                return (
                  <tr
                    key={e.id}
                    onClick={() =>
                      router.push(`/admin/contabilidad/asientos/${e.id}`)
                    }
                    className="hover:bg-gray-50 cursor-pointer"
                  >
                    <td className="px-3 py-2 text-sm text-gray-900">
                      {String(e.entryDate).slice(0, 10)}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                        {e.type}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-700">
                      {e.category?.name || e.categoryId?.slice(0, 8) + '…'}
                    </td>
                    <td className="px-3 py-2 text-sm text-gray-700 max-w-xs truncate">
                      {e.description || '—'}
                    </td>
                    <td className="px-3 py-2 text-sm text-right font-mono text-gray-900">
                      {formatBsF(e.amountBsF)}
                    </td>
                    <td className="px-3 py-2 text-sm text-right font-mono text-gray-700">
                      {usd !== null ? usd : '—'}
                    </td>
                    <td className="px-3 py-2 text-xs font-mono text-gray-500">
                      {e.settlementId ? e.settlementId.slice(0, 8) + '…' : '—'}
                    </td>
                    <td className="px-3 py-2 text-sm">
                      {e.reversedById ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                          Reversado
                        </span>
                      ) : e.reversesId ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          Reversal de #{e.reversesId.slice(0, 6)}
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Activo
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { getLedger } from '@/lib/api/commissions';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

function fmtAmount(n) {
  if (n === null || n === undefined) return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  return num.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-VE');
  } catch {
    return String(iso);
  }
}

export default function LedgerTab() {
  const [systems, setSystems] = useState([]);
  const [filters, setFilters] = useState({
    apiSystemId: '',
    from: '',
    to: '',
  });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const token =
      typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    fetch(`${API_URL}/providers/systems`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => setSystems(Array.isArray(data) ? data : []))
      .catch(() => setSystems([]));
  }, []);

  const fetchRows = async () => {
    setLoading(true);
    setError('');
    try {
      const data = await getLedger({
        apiSystemId: filters.apiSystemId || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
      });
      const list = Array.isArray(data) ? data : data?.data || [];
      setRows(list);
    } catch (err) {
      setError(err.message || 'Error cargando ledger');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.apiSystemId, filters.from, filters.to]);

  return (
    <div className="space-y-4">
      <details open className="bg-white shadow rounded-lg group">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700 list-none flex items-center justify-between">
          <span>Filtros</span>
          <span className="text-xs text-gray-500 group-open:rotate-180 transition">▼</span>
        </summary>
        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Proveedor
            </label>
            <select
              value={filters.apiSystemId}
              onChange={(e) =>
                setFilters((f) => ({ ...f, apiSystemId: e.target.value }))
              }
              className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
            >
              <option value="">Todos</option>
              {systems.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Desde
            </label>
            <input
              type="date"
              value={filters.from}
              onChange={(e) =>
                setFilters((f) => ({ ...f, from: e.target.value }))
              }
              className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Hasta
            </label>
            <input
              type="date"
              value={filters.to}
              onChange={(e) =>
                setFilters((f) => ({ ...f, to: e.target.value }))
              }
              className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
            />
          </div>
          {(filters.apiSystemId || filters.from || filters.to) && (
            <div className="md:col-span-3">
              <button
                onClick={() =>
                  setFilters({ apiSystemId: '', from: '', to: '' })
                }
                className="text-sm text-gray-500 hover:text-gray-700 underline"
              >
                Limpiar
              </button>
            </div>
          )}
        </div>
      </details>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-600 text-sm">{error}</div>
        ) : rows.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-lg font-medium">Sin filas en el ledger</p>
            <p className="text-sm mt-1">
              Las filas aparecen automáticamente al totalizarse cada sorteo.
            </p>
          </div>
        ) : (
          <>
            {/* Cards en móvil */}
            <div className="md:hidden p-3 space-y-2">
              {rows.map((row) => (
                <div
                  key={row.id}
                  className="bg-white border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {row.apiSystem?.name || row.apiSystemId}
                    </span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {fmtDate(row.draw?.drawnAt || row.createdAt)}
                    </span>
                  </div>
                  <p className="text-2xl font-mono font-bold text-gray-900">
                    {fmtAmount(row.amount)}
                  </p>
                  <p className="text-xs text-gray-500">Comisión</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Ventas</p>
                      <p className="font-mono text-gray-700">
                        {fmtAmount(row.salesBase)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Utilidad</p>
                      <p className="font-mono text-gray-700">
                        {fmtAmount(row.utilityBase)}
                      </p>
                    </div>
                  </div>
                  <p className="text-xs font-mono text-gray-500 mt-2">
                    Sorteo {row.drawId?.slice(0, 8) || '—'}
                  </p>
                </div>
              ))}
            </div>

            {/* Tabla en desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sorteo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Proveedor
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ventas
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Utilidad
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Comisión
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fecha
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-gray-700">
                        {row.drawId?.slice(0, 8) || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                        {row.apiSystem?.name || row.apiSystemId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono">
                        {fmtAmount(row.salesBase)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono">
                        {fmtAmount(row.utilityBase)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono font-semibold">
                        {fmtAmount(row.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                        {fmtDate(row.draw?.drawnAt || row.createdAt)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

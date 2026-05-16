'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { getSettlements } from '@/lib/api/commissions';
import StatusBadge from './StatusBadge';

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

function settlementTag(s) {
  return `${s.isoYear}-W${String(s.isoWeek).padStart(2, '0')}`;
}

/** Parse a "YYYY-Www" token (e.g. "2026-W20") → { isoYear, isoWeek } or null. */
function parseWeekToken(token) {
  if (!token) return null;
  const m = /^(\d{4})-W(\d{1,2})$/.exec(token);
  if (!m) return null;
  const isoYear = parseInt(m[1], 10);
  const isoWeek = parseInt(m[2], 10);
  if (!Number.isInteger(isoYear) || !Number.isInteger(isoWeek)) return null;
  if (isoWeek < 1 || isoWeek > 53) return null;
  return { isoYear: String(isoYear), isoWeek: String(isoWeek) };
}

export default function SettlementsTab() {
  const searchParams = useSearchParams();
  const [systems, setSystems] = useState([]);
  // Pre-fill from query string: ?week=YYYY-Www&apiSystemId=...
  const [filters, setFilters] = useState(() => {
    const weekToken = searchParams?.get('week');
    const apiSystemId = searchParams?.get('apiSystemId') || '';
    const parsed = parseWeekToken(weekToken);
    return {
      isoYear: parsed?.isoYear || '',
      isoWeek: parsed?.isoWeek || '',
      apiSystemId,
      status: '',
    };
  });
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Load providers for the filter dropdown.
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
      const data = await getSettlements({
        isoYear: filters.isoYear || undefined,
        isoWeek: filters.isoWeek || undefined,
        apiSystemId: filters.apiSystemId || undefined,
        status: filters.status || undefined,
      });
      // Controller returns { success, data } or array — accept both shapes.
      const list = Array.isArray(data) ? data : data?.data || [];
      setRows(list);
    } catch (err) {
      setError(err.message || 'Error cargando liquidaciones');
      setRows([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchRows();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters.isoYear, filters.isoWeek, filters.apiSystemId, filters.status]);

  return (
    <div className="space-y-4">
      <details open className="bg-white shadow rounded-lg group">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700 list-none flex items-center justify-between">
          <span>Filtros</span>
          <span className="text-xs text-gray-500 group-open:rotate-180 transition">▼</span>
        </summary>
        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-4 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Año ISO
            </label>
            <input
              type="number"
              value={filters.isoYear}
              onChange={(e) =>
                setFilters((f) => ({ ...f, isoYear: e.target.value }))
              }
              className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
              placeholder="2026"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Semana ISO
            </label>
            <input
              type="number"
              min="1"
              max="53"
              value={filters.isoWeek}
              onChange={(e) =>
                setFilters((f) => ({ ...f, isoWeek: e.target.value }))
              }
              className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
              placeholder="19"
            />
          </div>
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
              Estado
            </label>
            <select
              value={filters.status}
              onChange={(e) =>
                setFilters((f) => ({ ...f, status: e.target.value }))
              }
              className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
            >
              <option value="">Todos</option>
              <option value="DRAFT">Borrador</option>
              <option value="CONFIRMED">Confirmada</option>
              <option value="ADJUSTED">Ajustada</option>
            </select>
          </div>
          {(filters.isoYear ||
            filters.isoWeek ||
            filters.apiSystemId ||
            filters.status) && (
            <div className="md:col-span-4">
              <button
                onClick={() =>
                  setFilters({
                    isoYear: '',
                    isoWeek: '',
                    apiSystemId: '',
                    status: '',
                  })
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
            <p className="text-lg font-medium">No hay liquidaciones</p>
            <p className="text-sm mt-1">
              Las liquidaciones semanales aparecerán aquí cada lunes 06:00 VE.
            </p>
          </div>
        ) : (
          <>
            {/* Cards en móvil */}
            <div className="md:hidden p-3 space-y-2">
              {rows.map((row) => (
                <Link
                  key={row.id}
                  href={`/admin/comisiones/settlements/${row.id}`}
                  className="block bg-white border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-sm font-medium text-gray-900 truncate">
                      {row.apiSystem?.name || row.apiSystemId}
                    </span>
                    <StatusBadge status={row.status} />
                  </div>
                  <p className="text-2xl font-mono font-bold text-gray-900">
                    {fmtAmount(row.amount)}
                  </p>
                  <div className="mt-2 flex items-center justify-between text-sm text-gray-600">
                    <span className="font-mono">{settlementTag(row)}</span>
                    <span>
                      Líneas:{' '}
                      {row.ledgerRowCount ?? row._count?.ledgerRows ?? '—'}
                    </span>
                  </div>
                </Link>
              ))}
            </div>

            {/* Tabla en desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Proveedor
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Semana
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Estado
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Monto
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Líneas
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Acciones
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {rows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                        {row.apiSystem?.name || row.apiSystemId}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700 font-mono">
                        {settlementTag(row)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap">
                        <StatusBadge status={row.status} />
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono">
                        {fmtAmount(row.amount)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-700">
                        {row.ledgerRowCount ?? row._count?.ledgerRows ?? '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                        <Link
                          href={`/admin/comisiones/settlements/${row.id}`}
                          className="text-blue-600 hover:text-blue-800 underline"
                        >
                          Ver detalle
                        </Link>
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

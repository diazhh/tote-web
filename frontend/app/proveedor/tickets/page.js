'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { portalFetch } from '@/lib/portal-api';

function todayISO(offsetDays = 0) {
  const d = new Date(Date.now() + offsetDays * 86400000);
  return d.toISOString().slice(0, 10);
}

const STATUS_BADGE = {
  ACTIVE: 'bg-blue-100 text-blue-700',
  WON: 'bg-green-100 text-green-700',
  LOST: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-700',
};

export default function TicketsPage() {
  const router = useRouter();
  const sp = useSearchParams();
  const [data, setData] = useState({ rows: [], total: 0, page: 1, pageSize: 25 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const filters = {
    dateFrom: sp.get('dateFrom') ?? todayISO(-7),
    dateTo: sp.get('dateTo') ?? todayISO(0),
    gameId: sp.get('gameId') ?? '',
    status: sp.get('status') ?? '',
    page: sp.get('page') ?? '1',
    pageSize: '25',
  };

  useEffect(() => {
    setLoading(true);
    setError(null);
    portalFetch('/api/portal/tickets', { params: filters })
      .then(setData)
      .catch(e => setError(e.message))
      .finally(() => setLoading(false));
  }, [filters.dateFrom, filters.dateTo, filters.gameId, filters.status, filters.page]);

  const setFilter = (k, v) => {
    const next = new URLSearchParams(sp);
    if (v) next.set(k, v); else next.delete(k);
    if (k !== 'page') next.set('page', '1');
    router.replace(`/proveedor/tickets?${next.toString()}`);
  };

  const totalPages = Math.max(1, Math.ceil(data.total / data.pageSize));

  return (
    <div>
      <h1 className="text-2xl font-bold mb-4 text-gray-900">Tickets</h1>
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <label className="text-sm text-gray-700">Desde
          <input type="date" value={filters.dateFrom}
            onChange={e => setFilter('dateFrom', e.target.value)}
            className="block border border-gray-300 rounded px-2 py-1 mt-0.5" />
        </label>
        <label className="text-sm text-gray-700">Hasta
          <input type="date" value={filters.dateTo}
            onChange={e => setFilter('dateTo', e.target.value)}
            className="block border border-gray-300 rounded px-2 py-1 mt-0.5" />
        </label>
        <label className="text-sm text-gray-700">Estado
          <select value={filters.status}
            onChange={e => setFilter('status', e.target.value)}
            className="block border border-gray-300 rounded px-2 py-1 mt-0.5">
            <option value="">Todos</option>
            <option value="ACTIVE">Activo</option>
            <option value="WON">Ganador</option>
            <option value="LOST">Perdedor</option>
            <option value="CANCELLED">Cancelado</option>
          </select>
        </label>
      </div>

      {error && <div className="text-red-600 bg-red-50 border border-red-200 rounded p-3 mb-4">{error}</div>}

      {loading ? <div className="text-gray-500">Cargando...</div> : (
        <>
          <div className="bg-white border border-gray-200 rounded shadow-sm overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Fecha</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">ID Externo</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Juego</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Monto</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700">Estado</th>
                  <th className="text-left px-3 py-2 font-semibold text-gray-700"># Jugadas</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map(t => (
                  <tr key={t.id} className="border-t hover:bg-gray-50">
                    <td className="px-3 py-2 text-gray-700">
                      {new Date(t.createdAt).toLocaleString('es-VE')}
                    </td>
                    <td className="px-3 py-2">
                      <Link className="text-blue-600 hover:underline font-mono text-xs"
                        href={`/proveedor/tickets/${t.id}`}>
                        {t.externalTicketId || t.id.slice(0, 8)}
                      </Link>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{t.draw?.game?.name ?? '-'}</td>
                    <td className="px-3 py-2 text-gray-900">
                      {Number(t.totalAmount).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                    </td>
                    <td className="px-3 py-2">
                      <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[t.status] || 'bg-gray-100'}`}>
                        {t.status}
                      </span>
                    </td>
                    <td className="px-3 py-2 text-gray-700">{t.details?.length ?? 0}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr><td colSpan={6} className="px-3 py-8 text-center text-gray-400">Sin resultados</td></tr>
                )}
              </tbody>
            </table>
          </div>
          <div className="flex justify-between items-center mt-4 text-sm text-gray-700">
            <div>Total: <strong>{data.total}</strong></div>
            <div className="flex gap-2 items-center">
              <button disabled={data.page <= 1}
                onClick={() => setFilter('page', String(Number(filters.page) - 1))}
                className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50">Anterior</button>
              <span>Página {data.page} / {totalPages}</span>
              <button disabled={data.page >= totalPages}
                onClick={() => setFilter('page', String(Number(filters.page) + 1))}
                className="px-3 py-1 border border-gray-300 rounded disabled:opacity-50 hover:bg-gray-50">Siguiente</button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

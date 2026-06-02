'use client';

import { useState, useEffect, useCallback } from 'react';
import { Calendar, Gamepad2, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import visorApi from '@/lib/api/visor';
import { todayInCaracas, formatCaracasDate } from '@/lib/utils/dateUtils';

const fmt = (n) =>
  new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'VES',
    minimumFractionDigits: 2,
  }).format(n ?? 0);

export default function VisorPage() {
  const [scopeLoading, setScopeLoading] = useState(true);
  const [scope, setScope] = useState({ games: [] });

  const [dateFrom, setDateFrom] = useState(todayInCaracas());
  const [dateTo, setDateTo] = useState(todayInCaracas());
  const [selectedGameIds, setSelectedGameIds] = useState([]);

  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);

  // Carga inicial del scope permitido (juegos visibles).
  useEffect(() => {
    (async () => {
      try {
        const res = await visorApi.getScope();
        if (res?.success) setScope(res.data);
      } catch (err) {
        toast.error('Error cargando filtros');
      } finally {
        setScopeLoading(false);
      }
    })();
  }, []);

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await visorApi.getReport({
        dateFrom,
        dateTo,
        gameIds: selectedGameIds,
      });
      if (res?.success) setReport(res.data);
      else toast.error('Error en la respuesta del servidor');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error cargando reporte');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, selectedGameIds]);

  // Fetch inicial al cargar el scope.
  useEffect(() => {
    if (!scopeLoading) fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeLoading]);

  const toggleGame = (id) =>
    setSelectedGameIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );

  if (scopeLoading) {
    return (
      <div className="flex justify-center py-20">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reporte de Ventas</h1>
        <p className="text-sm text-gray-500 mt-0.5">Ventas del rango y juegos seleccionados.</p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Calendar className="w-3.5 h-3.5 inline mr-1" />Desde
            </label>
            <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Calendar className="w-3.5 h-3.5 inline mr-1" />Hasta
            </label>
            <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500" />
          </div>
        </div>

        {scope.games.length > 0 && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Gamepad2 className="w-3.5 h-3.5 inline mr-1" />Juegos
              <span className="text-gray-400 ml-1">
                ({selectedGameIds.length === 0 ? 'todos' : `${selectedGameIds.length} seleccionado(s)`})
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              {scope.games.map((g) => {
                const active = selectedGameIds.includes(g.id);
                return (
                  <button
                    key={g.id}
                    type="button"
                    onClick={() => toggleGame(g.id)}
                    className={`px-3 py-1 text-xs rounded-full border ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {g.name}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        <div className="flex justify-end">
          <button
            onClick={fetchReport}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            {loading ? 'Cargando...' : 'Actualizar'}
          </button>
        </div>
      </div>

      {/* Reporte */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading && !report ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : report?.rows?.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Fecha</th>
                  <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Juego</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Ventas</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {report.rows.map((r, idx) => (
                  <tr key={`${r.date}-${r.gameId}-${idx}`} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatCaracasDate(r.date)}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{r.game}</td>
                    <td className="px-4 py-2.5 text-right text-green-700 font-medium">{fmt(r.totalSales)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>TOTAL</td>
                  <td className="px-4 py-3 text-right text-green-700">{fmt(report.totals.totalSales)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        ) : (
          <p className="px-4 py-10 text-sm text-gray-400 text-center">
            {loading ? 'Cargando...' : 'Sin datos para los filtros seleccionados'}
          </p>
        )}
      </div>
    </div>
  );
}

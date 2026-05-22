'use client';

import { useState, useEffect, useCallback } from 'react';
import { Calendar, Gamepad2, Building2, RefreshCw, Filter } from 'lucide-react';
import { toast } from 'sonner';
import fiscalApi from '@/lib/api/fiscal';
import { todayInCaracas, formatCaracasDate } from '@/lib/utils/dateUtils';

const fmt = (n) =>
  new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'VES',
    minimumFractionDigits: 2,
  }).format(n ?? 0);

export default function FiscalizarPage() {
  const [scopeLoading, setScopeLoading] = useState(true);
  const [scope, setScope] = useState({ games: [], apiSystems: [], includeTaquilla: false });

  const [dateFrom, setDateFrom] = useState(todayInCaracas());
  const [dateTo, setDateTo]     = useState(todayInCaracas());
  const [selectedGameIds, setSelectedGameIds] = useState([]);
  const [selectedApiSystemIds, setSelectedApiSystemIds] = useState([]);
  const [includeTaquilla, setIncludeTaquilla] = useState(true);

  const [loading, setLoading] = useState(false);
  const [report, setReport]   = useState(null);

  // Carga inicial del scope permitido.
  useEffect(() => {
    (async () => {
      try {
        const res = await fiscalApi.getScope();
        if (res?.success) {
          setScope(res.data);
          setIncludeTaquilla(res.data.includeTaquilla);
        }
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
      const res = await fiscalApi.getReport({
        dateFrom,
        dateTo,
        gameIds: selectedGameIds,
        apiSystemIds: selectedApiSystemIds,
        includeTaquilla,
      });
      if (res?.success) setReport(res.data);
      else toast.error('Error en la respuesta del servidor');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error cargando reporte');
    } finally {
      setLoading(false);
    }
  }, [dateFrom, dateTo, selectedGameIds, selectedApiSystemIds, includeTaquilla]);

  // Fetch inicial al cargar el scope.
  useEffect(() => {
    if (!scopeLoading) fetchReport();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [scopeLoading]);

  const toggleGame = (id) =>
    setSelectedGameIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  const toggleApiSystem = (id) =>
    setSelectedApiSystemIds((prev) =>
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
        <h1 className="text-2xl font-bold text-gray-900">Reporte de Fiscalización</h1>
        <p className="text-sm text-gray-500 mt-0.5">Ventas, premios y utilidad del rango seleccionado.</p>
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

        {(scope.apiSystems.length > 0 || scope.includeTaquilla) && (
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Building2 className="w-3.5 h-3.5 inline mr-1" />Proveedores
              <span className="text-gray-400 ml-1">
                ({selectedApiSystemIds.length === 0 ? 'todos los visibles' : `${selectedApiSystemIds.length} seleccionado(s)`})
              </span>
            </label>
            <div className="flex flex-wrap gap-2">
              {scope.apiSystems.map((s) => {
                const active = selectedApiSystemIds.includes(s.id);
                return (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => toggleApiSystem(s.id)}
                    className={`px-3 py-1 text-xs rounded-full border ${
                      active
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {s.name}
                  </button>
                );
              })}
              {scope.includeTaquilla && (
                <label className="flex items-center gap-1.5 px-3 py-1 text-xs rounded-full border bg-white border-gray-300 cursor-pointer hover:bg-gray-50">
                  <input
                    type="checkbox"
                    checked={includeTaquilla}
                    onChange={(e) => setIncludeTaquilla(e.target.checked)}
                    className="w-3 h-3"
                  />
                  Taquilla Online
                </label>
              )}
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
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Premios</th>
                  <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Utilidad</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {report.rows.map((r, idx) => (
                  <tr key={`${r.date}-${r.gameId}-${idx}`} className="hover:bg-gray-50/50">
                    <td className="px-4 py-2.5 whitespace-nowrap">{formatCaracasDate(r.date)}</td>
                    <td className="px-4 py-2.5 font-medium text-gray-800">{r.game}</td>
                    <td className="px-4 py-2.5 text-right text-green-700 font-medium">{fmt(r.totalSales)}</td>
                    <td className="px-4 py-2.5 text-right text-red-700">{fmt(r.totalPrize)}</td>
                    <td className={`px-4 py-2.5 text-right font-bold ${r.utility >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                      {fmt(r.utility)}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="bg-gray-50 font-semibold">
                <tr>
                  <td className="px-4 py-3" colSpan={2}>TOTAL</td>
                  <td className="px-4 py-3 text-right text-green-700">{fmt(report.totals.totalSales)}</td>
                  <td className="px-4 py-3 text-right text-red-700">{fmt(report.totals.totalPrize)}</td>
                  <td className={`px-4 py-3 text-right ${report.totals.utility >= 0 ? 'text-blue-700' : 'text-red-700'}`}>
                    {fmt(report.totals.utility)}
                  </td>
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

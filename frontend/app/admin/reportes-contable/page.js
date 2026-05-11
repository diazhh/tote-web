'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar, Gamepad2, DollarSign, Trophy, TrendingUp, TrendingDown,
  FileSpreadsheet, RefreshCw, ChevronLeft, ChevronRight, ChevronUp, ChevronDown,
} from 'lucide-react';
import { toast } from 'sonner';
import monitorApi from '@/lib/api/monitor';
import { todayInCaracas, formatCaracasDate } from '@/lib/utils/dateUtils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';
const PAGE_SIZE = 50;

export default function ReportesContablePage() {
  // --- Filtros ---
  const [filters, setFilters] = useState({
    dateFrom: todayInCaracas(),
    dateTo:   todayInCaracas(),
    gameId:   '',
  });

  // --- Data ---
  const [report, setReport] = useState(null);
  const [games, setGames]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [xlsxLoading, setXlsxLoading] = useState(false);

  // --- Tabla ---
  const [sortDir, setSortDir] = useState('asc'); // 'asc' | 'desc'
  const [page, setPage] = useState(1);

  // --- Cargar juegos ---
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    fetch(`${API_URL}/games`, { headers: { Authorization: `Bearer ${token}` } })
      .then(r => r.json())
      .then(data => {
        setGames(Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : []);
      })
      .catch(() => toast.error('Error cargando lista de juegos'));
  }, []);

  // --- Fetch reporte ---
  const fetchReport = useCallback(async () => {
    if (!filters.dateFrom || !filters.dateTo) return;
    setLoading(true);
    setPage(1);
    try {
      const result = await monitorApi.getAccountingReport({
        dateFrom: filters.dateFrom,
        dateTo:   filters.dateTo,
        gameId:   filters.gameId || undefined,
      });
      if (result?.success) {
        setReport(result.data);
      } else {
        toast.error(result?.error || 'Error en la respuesta del servidor');
      }
    } catch (err) {
      const msg = err?.response?.data?.error || 'Error cargando reporte';
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  const setFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  const handleDownloadExcel = useCallback(() => {
    setXlsxLoading(true);
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const params = new URLSearchParams();
    if (filters.dateFrom) params.append('dateFrom', filters.dateFrom);
    if (filters.dateTo)   params.append('dateTo',   filters.dateTo);
    if (filters.gameId)   params.append('gameId',   filters.gameId);

    fetch(`${API_URL}/monitor/reporte-contable/excel?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          throw new Error(text || `HTTP ${res.status}`);
        }
        return res.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte-contable-${filters.dateFrom}-${filters.dateTo}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((err) => toast.error(err.message || 'Error generando Excel'))
      .finally(() => setXlsxLoading(false));
  }, [filters]);

  // --- Sort + paginación ---
  const sortedRows = useMemo(() => {
    if (!report?.rows) return [];
    return [...report.rows].sort((a, b) => {
      const aKey = `${a.date}|${a.game}`;
      const bKey = `${b.date}|${b.game}`;
      return sortDir === 'asc' ? aKey.localeCompare(bKey) : bKey.localeCompare(aKey);
    });
  }, [report?.rows, sortDir]);

  const totalPages = Math.max(1, Math.ceil(sortedRows.length / PAGE_SIZE));
  const paginated = sortedRows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  const fmt = (n) =>
    new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES', minimumFractionDigits: 2 }).format(n ?? 0);

  const fmtDate = (isoStr) => {
    if (!isoStr) return '—';
    return formatCaracasDate(isoStr.split('T')[0]);
  };

  const totals = report?.totals;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reporte Contable</h1>
          <p className="text-sm text-gray-500 mt-0.5">Ventas, premios y utilidad por día y juego</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <button
            onClick={handleDownloadExcel}
            disabled={xlsxLoading || loading || !report?.rows?.length}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
          >
            <FileSpreadsheet className={`w-4 h-4 ${xlsxLoading ? 'animate-pulse' : ''}`} />
            {xlsxLoading ? 'Generando...' : 'Descargar Excel'}
          </button>
          <button
            onClick={fetchReport}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2 sm:gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Calendar className="w-3.5 h-3.5 inline mr-1" /> Desde
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={e => setFilter('dateFrom', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Calendar className="w-3.5 h-3.5 inline mr-1" /> Hasta
            </label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={e => setFilter('dateTo', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Gamepad2 className="w-3.5 h-3.5 inline mr-1" /> Juego
            </label>
            <select
              value={filters.gameId}
              onChange={e => setFilter('gameId', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos los juegos</option>
              {games.map(g => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Cards de totales */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 rounded-lg shrink-0">
            <DollarSign className="w-5 h-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Ventas Totales</p>
            <p className="text-lg font-bold text-gray-900 truncate">{fmt(totals?.totalSales)}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
          <div className="p-2.5 bg-red-50 rounded-lg shrink-0">
            <Trophy className="w-5 h-5 text-red-500" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Premios Pagados</p>
            <p className="text-lg font-bold text-gray-900 truncate">{fmt(totals?.totalPrize)}</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
          <div className={`p-2.5 rounded-lg shrink-0 ${(totals?.utility ?? 0) >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            {(totals?.utility ?? 0) >= 0
              ? <TrendingUp className="w-5 h-5 text-green-600" />
              : <TrendingDown className="w-5 h-5 text-red-500" />}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Utilidad</p>
            <p className={`text-lg font-bold truncate ${(totals?.utility ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {fmt(totals?.utility)}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
          <div className="p-2.5 bg-purple-50 rounded-lg shrink-0">
            <FileSpreadsheet className="w-5 h-5 text-purple-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Tickets</p>
            <p className="text-lg font-bold text-gray-900 truncate">{totals?.ticketCount ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Tabla principal */}
      {report && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-700">
              Detalle por Día y Juego
              {sortedRows.length > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  ({sortedRows.length} filas)
                </span>
              )}
            </h3>
            <button
              onClick={() => { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); setPage(1); }}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              Fecha
              {sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {sortedRows.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Fecha</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Juego</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Ventas</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Premios</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Utilidad</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Tickets</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paginated.map((row, idx) => (
                      <tr key={`${row.date}-${row.gameId}-${idx}`} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{fmtDate(row.date)}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-800">{row.game}</td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{fmt(row.totalSales)}</td>
                        <td className="px-4 py-2.5 text-right text-red-600">{fmt(row.totalPrize)}</td>
                        <td className={`px-4 py-2.5 text-right font-medium ${row.utility >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {fmt(row.utility)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-500">{row.ticketCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Paginación */}
              {totalPages > 1 && (
                <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    Página {page} de {totalPages} ({sortedRows.length} filas)
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm"
                    >
                      Siguiente <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="px-4 py-10 text-sm text-gray-400 text-center">
              {loading ? 'Cargando...' : 'No hay datos para los filtros seleccionados'}
            </p>
          )}
        </div>
      )}

      {/* Loading inicial */}
      {loading && !report && (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}
    </div>
  );
}

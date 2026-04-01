'use client';

import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Calendar, Gamepad2, DollarSign, Trophy, TrendingUp, TrendingDown,
  FileText, RefreshCw, ChevronLeft, ChevronRight, ChevronUp, ChevronDown, Download
} from 'lucide-react';
import { toast } from 'sonner';
import monitorApi from '@/lib/api/monitor';
import { todayInCaracas, formatCaracasDate } from '@/lib/utils/dateUtils';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

const SOURCE_LABELS = {
  TAQUILLA_ONLINE: 'Online',
  EXTERNAL_API:    'SRQ / API',
  WEBHOOK_PUSH:    'Webhook',
};

const PAGE_SIZE = 25;

export default function ReportesPage() {
  // --- Filter state ---
  const [filters, setFilters] = useState({
    dateFrom:    todayInCaracas(),
    dateTo:      todayInCaracas(),
    gameId:      '',
    source:      '',
    apiSystemId: '',
  });

  // --- Data state ---
  const [report, setReport]   = useState(null);
  const [games, setGames]     = useState([]);
  const [systems, setSystems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pdfLoading, setPdfLoading] = useState(false);

  // --- Detail table state ---
  const [sortDir, setSortDir] = useState('asc');   // 'asc' | 'desc'
  const [page, setPage]       = useState(1);

  // --- Initial load: fetch games + systems for dropdowns ---
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API_URL}/games`, { headers }).then(r => r.json()),
      fetch(`${API_URL}/providers/systems`, { headers }).then(r => r.json()),
    ]).then(([gamesData, systemsData]) => {
      setGames(Array.isArray(gamesData?.data) ? gamesData.data : Array.isArray(gamesData) ? gamesData : []);
      setSystems(Array.isArray(systemsData) ? systemsData : []);
    }).catch(() => {
      toast.error('Error cargando filtros');
    });
  }, []);

  // --- Fetch report on filter change ---
  const fetchReport = useCallback(async () => {
    setLoading(true);
    setPage(1);
    try {
      const params = {
        dateFrom: filters.dateFrom || undefined,
        dateTo:   filters.dateTo   || undefined,
        gameId:   filters.gameId   || undefined,
        source:   filters.source   || undefined,
        apiSystemId: filters.apiSystemId || undefined,
      };
      const result = await monitorApi.getDailyReport(params);
      if (result?.success) {
        setReport(result.data);
      } else {
        toast.error('Error en la respuesta del servidor');
      }
    } catch (err) {
      toast.error('Error cargando reporte');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // --- Handlers ---
  const setFilter = (key, value) => {
    setFilters(prev => ({ ...prev, [key]: value }));
  };

  // When source changes, reset apiSystemId (they are mutually exclusive display-wise)
  const handleSourceChange = (value) => {
    setFilters(prev => ({ ...prev, source: value, apiSystemId: '' }));
  };

  const handleDownloadPdf = useCallback(() => {
    setPdfLoading(true);
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const params = new URLSearchParams();
    if (filters.dateFrom)    params.set('dateFrom', filters.dateFrom);
    if (filters.dateTo)      params.set('dateTo', filters.dateTo);
    if (filters.gameId)      params.set('gameId', filters.gameId);
    if (filters.source)      params.set('source', filters.source);
    if (filters.apiSystemId) params.set('apiSystemId', filters.apiSystemId);

    fetch(`${API_URL}/monitor/reporte/pdf?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(res => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reporte-${filters.dateFrom || 'hoy'}-${filters.dateTo || 'hoy'}.pdf`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch(() => toast.error('Error generando PDF'))
      .finally(() => setPdfLoading(false));
  }, [filters]);

  // --- Sorted + paginated draws ---
  const sortedDraws = useMemo(() => {
    if (!report?.draws) return [];
    return [...report.draws].sort((a, b) => {
      const aKey = `${a.drawDate}T${a.drawTime}`;
      const bKey = `${b.drawDate}T${b.drawTime}`;
      return sortDir === 'asc'
        ? aKey.localeCompare(bKey)
        : bKey.localeCompare(aKey);
    });
  }, [report?.draws, sortDir]);

  const totalPages    = Math.max(1, Math.ceil(sortedDraws.length / PAGE_SIZE));
  const paginatedDraws = sortedDraws.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  // --- Formatters ---
  const fmt = (n) =>
    new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES', minimumFractionDigits: 2 }).format(n ?? 0);

  const fmtDate = (isoStr) => {
    if (!isoStr) return '—';
    return formatCaracasDate(isoStr.split('T')[0]);
  };

  const statusBadge = (status) => {
    const map = {
      SCHEDULED: 'bg-gray-100 text-gray-700',
      CLOSED:    'bg-yellow-100 text-yellow-700',
      DRAWN:     'bg-green-100 text-green-700',
      CANCELLED: 'bg-red-100 text-red-700',
      PUBLISHED: 'bg-blue-100 text-blue-700',
    };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-700'}`}>
        {status}
      </span>
    );
  };

  const totals = report?.totals;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes de Sorteos</h1>
          <p className="text-sm text-gray-500 mt-0.5">Ventas, premios y balance por período</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <button
            onClick={handleDownloadPdf}
            disabled={pdfLoading || loading}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
          >
            <Download className={`w-4 h-4 ${pdfLoading ? 'animate-bounce' : ''}`} />
            {pdfLoading ? 'Generando...' : 'Descargar PDF'}
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

      {/* Filter bar — FILT-01 / FILT-02 / FILT-03 */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
          {/* Date from — FILT-01 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Calendar className="w-3.5 h-3.5 inline mr-1" />
              Desde
            </label>
            <input
              type="date"
              value={filters.dateFrom}
              onChange={e => setFilter('dateFrom', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Date to — FILT-01 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Calendar className="w-3.5 h-3.5 inline mr-1" />
              Hasta
            </label>
            <input
              type="date"
              value={filters.dateTo}
              onChange={e => setFilter('dateTo', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>

          {/* Game filter — FILT-02 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Gamepad2 className="w-3.5 h-3.5 inline mr-1" />
              Juego
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

          {/* Source / provider filter — FILT-03 */}
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              Fuente / Proveedor
            </label>
            {/* Source dropdown */}
            <select
              value={filters.apiSystemId ? '__provider__' : filters.source}
              onChange={e => {
                const val = e.target.value;
                if (val.startsWith('sys:')) {
                  setFilters(prev => ({ ...prev, source: '', apiSystemId: val.slice(4) }));
                } else {
                  setFilters(prev => ({ ...prev, source: val, apiSystemId: '' }));
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todas las fuentes</option>
              <option value="TAQUILLA_ONLINE">Online</option>
              <option value="EXTERNAL_API">SRQ / API</option>
              <option value="WEBHOOK_PUSH">Webhook</option>
              {systems.length > 0 && (
                <optgroup label="Proveedor específico">
                  {systems.map(s => (
                    <option key={s.id} value={`sys:${s.id}`}>{s.name}</option>
                  ))}
                </optgroup>
              )}
            </select>
          </div>
        </div>
      </div>

      {/* Summary cards — SUMM-01 / FILT-04 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-4">
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 rounded-lg shrink-0">
            <DollarSign className="w-5 h-5 text-blue-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Ventas Totales</p>
            <p className="text-lg font-bold text-gray-900 truncate">{fmt(totals?.totalSales)}</p>
            <p className="text-xs text-gray-400">{totals?.drawCount ?? 0} sorteos</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
          <div className="p-2.5 bg-red-50 rounded-lg shrink-0">
            <Trophy className="w-5 h-5 text-red-500" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Premios Pagados</p>
            <p className="text-lg font-bold text-gray-900 truncate">{fmt(totals?.totalPrize)}</p>
            <p className="text-xs text-gray-400">{totals?.totalTickets ?? 0} tickets</p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
          <div className={`p-2.5 rounded-lg shrink-0 ${(totals?.totalBalance ?? 0) >= 0 ? 'bg-green-50' : 'bg-red-50'}`}>
            {(totals?.totalBalance ?? 0) >= 0
              ? <TrendingUp className="w-5 h-5 text-green-600" />
              : <TrendingDown className="w-5 h-5 text-red-500" />}
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Balance</p>
            <p className={`text-lg font-bold truncate ${(totals?.totalBalance ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {fmt(totals?.totalBalance)}
            </p>
          </div>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4 flex items-center gap-3">
          <div className="p-2.5 bg-purple-50 rounded-lg shrink-0">
            <FileText className="w-5 h-5 text-purple-600" />
          </div>
          <div className="min-w-0">
            <p className="text-xs text-gray-500">Tickets</p>
            <p className="text-lg font-bold text-gray-900 truncate">{totals?.totalTickets ?? 0}</p>
          </div>
        </div>
      </div>

      {/* Breakdown tables — SUMM-02 / SUMM-03 */}
      {report && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-2 sm:gap-4">
          {/* By Game — SUMM-02 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Desglose por Juego</h3>
            </div>
            {report.byGame?.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Juego</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Ventas</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Premios</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Balance</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Sort.</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {report.byGame.map(row => (
                    <tr key={row.gameId} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">{row.game}</td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{fmt(row.totalSales)}</td>
                      <td className="px-4 py-2.5 text-right text-red-600">{fmt(row.totalPrize)}</td>
                      <td className={`px-4 py-2.5 text-right font-medium ${row.totalBalance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                        {fmt(row.totalBalance)}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-500">{row.drawCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-4 py-6 text-sm text-gray-400 text-center">Sin datos para el período</p>
            )}
          </div>

          {/* By Source — SUMM-03 */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100">
              <h3 className="text-sm font-semibold text-gray-700">Desglose por Fuente</h3>
            </div>
            {report.bySource?.length > 0 ? (
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Fuente</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Ventas</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Tickets</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {report.bySource.map(row => (
                    <tr key={row.source} className="hover:bg-gray-50/50">
                      <td className="px-4 py-2.5 font-medium text-gray-800">
                        {SOURCE_LABELS[row.source] ?? row.source}
                      </td>
                      <td className="px-4 py-2.5 text-right text-gray-700">{fmt(row.totalSales)}</td>
                      <td className="px-4 py-2.5 text-right text-gray-500">{row.ticketCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className="px-4 py-6 text-sm text-gray-400 text-center">Sin datos para el período</p>
            )}
          </div>
        </div>
      )}

      {/* Detail table — DETL-01 / DETL-02 / DETL-03 */}
      {report && (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-4 py-3 border-b border-gray-100 flex justify-between items-center">
            <h3 className="text-sm font-semibold text-gray-700">
              Detalle por Sorteo
              {sortedDraws.length > 0 && (
                <span className="ml-2 text-xs font-normal text-gray-400">
                  ({sortedDraws.length} sorteos)
                </span>
              )}
            </h3>
            {/* Sort toggle — DETL-03 */}
            <button
              onClick={() => { setSortDir(d => d === 'asc' ? 'desc' : 'asc'); setPage(1); }}
              className="flex items-center gap-1 text-xs text-gray-500 hover:text-gray-700"
            >
              Fecha
              {sortDir === 'asc' ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
            </button>
          </div>

          {sortedDraws.length > 0 ? (
            <>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500 whitespace-nowrap">Fecha</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Hora</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Juego</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Estado</th>
                      <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Ganador</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Ventas</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Premios</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Balance</th>
                      <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Tickets</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {paginatedDraws.map(draw => (
                      <tr key={draw.drawId} className="hover:bg-gray-50/50">
                        <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{fmtDate(draw.drawDate)}</td>
                        <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">{draw.drawTime ?? '—'}</td>
                        <td className="px-4 py-2.5 font-medium text-gray-800">{draw.game}</td>
                        <td className="px-4 py-2.5">{statusBadge(draw.status)}</td>
                        <td className="px-4 py-2.5 text-gray-700">
                          {draw.winnerItem
                            ? `${draw.winnerItem.number} — ${draw.winnerItem.name}`
                            : <span className="text-gray-300">—</span>}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-700">{fmt(draw.totalSales)}</td>
                        <td className="px-4 py-2.5 text-right text-red-600">{fmt(draw.totalPrize)}</td>
                        <td className={`px-4 py-2.5 text-right font-medium ${draw.balance >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                          {fmt(draw.balance)}
                        </td>
                        <td className="px-4 py-2.5 text-right text-gray-500">{draw.ticketCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>

              {/* Pagination — DETL-02 */}
              {totalPages > 1 && (
                <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
                  <span className="text-gray-500">
                    Página {page} de {totalPages}
                    {' '}({sortedDraws.length} sorteos)
                  </span>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setPage(p => Math.max(1, p - 1))}
                      disabled={page === 1}
                      className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                      Anterior
                    </button>
                    <button
                      onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                      disabled={page === totalPages}
                      className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-not-allowed text-xs sm:text-sm"
                    >
                      Siguiente
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <p className="px-4 py-10 text-sm text-gray-400 text-center">
              {loading ? 'Cargando...' : 'No hay sorteos para los filtros seleccionados'}
            </p>
          )}
        </div>
      )}

      {/* Full-page loading indicator */}
      {loading && !report && (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      )}
    </div>
  );
}

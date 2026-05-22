'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Calendar, Gamepad2, RefreshCw, ChevronLeft, ChevronRight, X, Eye, FileSpreadsheet, Search
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

export default function TicketsReportPage() {
  const [filters, setFilters] = useState({
    dateFrom:    todayInCaracas(),
    dateTo:      todayInCaracas(),
    gameId:      '',
    source:      '',
    apiSystemId: '',
    playerSearch: '',
  });

  // Input crudo del buscador — se debouncea hacia filters.playerSearch.
  const [playerInput, setPlayerInput] = useState('');

  const [result, setResult]     = useState(null);
  const [games, setGames]       = useState([]);
  const [systems, setSystems]   = useState([]);
  const [loading, setLoading]   = useState(false);
  const [xlsxLoading, setXlsxLoading] = useState(false);
  const [page, setPage]         = useState(1);
  const [detailModal, setDetailModal] = useState({ open: false, data: null });

  // Debounce 300ms — espera a que el usuario termine de tipear antes de re-fetch.
  useEffect(() => {
    const id = setTimeout(() => {
      setFilters(prev => prev.playerSearch === playerInput ? prev : { ...prev, playerSearch: playerInput });
    }, 300);
    return () => clearTimeout(id);
  }, [playerInput]);

  // Load filter options
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const headers = { Authorization: `Bearer ${token}` };
    Promise.all([
      fetch(`${API_URL}/games`, { headers }).then(r => r.json()),
      fetch(`${API_URL}/providers/systems`, { headers }).then(r => r.json()),
    ]).then(([gamesData, systemsData]) => {
      setGames(Array.isArray(gamesData?.data) ? gamesData.data : Array.isArray(gamesData) ? gamesData : []);
      setSystems(Array.isArray(systemsData) ? systemsData : []);
    }).catch(() => toast.error('Error cargando filtros'));
  }, []);

  // Fetch tickets
  const fetchTickets = useCallback(async (p = page) => {
    setLoading(true);
    try {
      const params = {
        dateFrom: filters.dateFrom || undefined,
        dateTo:   filters.dateTo   || undefined,
        gameId:   filters.gameId   || undefined,
        source:   filters.source   || undefined,
        apiSystemId: filters.apiSystemId || undefined,
        playerSearch: filters.playerSearch || undefined,
        page: p,
        pageSize: 50,
      };
      const res = await monitorApi.getTicketList(params);
      if (res?.success) {
        setResult(res.data);
      } else {
        toast.error('Error en la respuesta del servidor');
      }
    } catch {
      toast.error('Error cargando tickets');
    } finally {
      setLoading(false);
    }
  }, [filters, page]);

  useEffect(() => { setPage(1); }, [filters]);
  useEffect(() => { fetchTickets(page); }, [page, fetchTickets]);

  const setFilter = (key, value) => setFilters(prev => ({ ...prev, [key]: value }));

  const handleDownloadExcel = useCallback(() => {
    setXlsxLoading(true);
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    const params = new URLSearchParams();
    if (filters.dateFrom)     params.append('dateFrom',     filters.dateFrom);
    if (filters.dateTo)       params.append('dateTo',       filters.dateTo);
    if (filters.gameId)       params.append('gameId',       filters.gameId);
    if (filters.source)       params.append('source',       filters.source);
    if (filters.apiSystemId)  params.append('apiSystemId',  filters.apiSystemId);
    if (filters.playerSearch) params.append('playerSearch', filters.playerSearch);

    fetch(`${API_URL}/monitor/tickets/excel?${params.toString()}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then(async (res) => {
        if (!res.ok) {
          const text = await res.text().catch(() => '');
          try {
            const parsed = JSON.parse(text);
            throw new Error(parsed?.error || `HTTP ${res.status}`);
          } catch {
            throw new Error(text || `HTTP ${res.status}`);
          }
        }
        return res.blob();
      })
      .then(blob => {
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `tickets-${filters.dateFrom || 'hoy'}-${filters.dateTo || 'hoy'}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
      })
      .catch((err) => toast.error(err.message || 'Error generando Excel'))
      .finally(() => setXlsxLoading(false));
  }, [filters]);

  // Formatters
  const fmt = (n) =>
    new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES', minimumFractionDigits: 2 }).format(n ?? 0);

  const fmtDate = (isoStr) => {
    if (!isoStr) return '-';
    return formatCaracasDate(isoStr.split('T')[0]);
  };

  const fmtTime = (ts) => {
    if (!ts) return '-';
    return new Date(ts).toLocaleString('es-VE', {
      day: '2-digit', month: '2-digit', year: '2-digit',
      hour: '2-digit', minute: '2-digit'
    });
  };

  const statusBadge = (status) => {
    const map = {
      ACTIVE: 'bg-blue-100 text-blue-800',
      WON:    'bg-green-100 text-green-800',
      LOST:   'bg-gray-100 text-gray-700',
      CANCELLED: 'bg-red-100 text-red-800',
    };
    const labels = { ACTIVE: 'Activo', WON: 'Ganador', LOST: 'Perdedor', CANCELLED: 'Cancelado' };
    return (
      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${map[status] ?? 'bg-gray-100 text-gray-700'}`}>
        {labels[status] ?? status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap justify-between items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reporte de Tickets</h1>
          <p className="text-sm text-gray-500 mt-0.5">Lista detallada de tickets por proveedor y fecha</p>
        </div>
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          <button
            onClick={handleDownloadExcel}
            disabled={xlsxLoading || loading || !result?.tickets?.length}
            className="flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm"
          >
            <FileSpreadsheet className={`w-4 h-4 ${xlsxLoading ? 'animate-pulse' : ''}`} />
            {xlsxLoading ? 'Generando...' : 'Descargar Excel'}
          </button>
          <button
            onClick={() => fetchTickets(page)}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Actualizar
          </button>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-2 sm:gap-4">
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Calendar className="w-3.5 h-3.5 inline mr-1" />Desde
            </label>
            <input type="date" value={filters.dateFrom} onChange={e => setFilter('dateFrom', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Calendar className="w-3.5 h-3.5 inline mr-1" />Hasta
            </label>
            <input type="date" value={filters.dateTo} onChange={e => setFilter('dateTo', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Gamepad2 className="w-3.5 h-3.5 inline mr-1" />Juego
            </label>
            <select value={filters.gameId} onChange={e => setFilter('gameId', e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
              <option value="">Todos los juegos</option>
              {games.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">
              <Search className="w-3.5 h-3.5 inline mr-1" />Jugador
            </label>
            <input
              type="text"
              value={playerInput}
              onChange={e => setPlayerInput(e.target.value)}
              placeholder="usuario, email o #ticket"
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-600 mb-1">Fuente / Proveedor</label>
            <select
              value={filters.apiSystemId ? `sys:${filters.apiSystemId}` : filters.source}
              onChange={e => {
                const val = e.target.value;
                if (val.startsWith('sys:')) {
                  setFilters(prev => ({ ...prev, source: '', apiSystemId: val.slice(4) }));
                } else {
                  setFilters(prev => ({ ...prev, source: val, apiSystemId: '' }));
                }
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500">
              <option value="">Todas las fuentes</option>
              <option value="TAQUILLA_ONLINE">Online</option>
              {systems.map(s => <option key={s.id} value={`sys:${s.id}`}>{s.name}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* Summary */}
      {result && (
        <div className="text-sm text-gray-500">
          {result.total} tickets encontrados
        </div>
      )}

      {/* Tickets table */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden">
        {loading && !result ? (
          <div className="flex justify-center py-16">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
          </div>
        ) : result?.tickets?.length > 0 ? (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Ticket</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Sorteo</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Juego</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Fuente</th>
                    <th className="px-4 py-2.5 text-right text-xs font-medium text-gray-500">Monto</th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500">Estado</th>
                    <th className="px-4 py-2.5 text-left text-xs font-medium text-gray-500">Fecha</th>
                    <th className="px-4 py-2.5 text-center text-xs font-medium text-gray-500 w-10"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {result.tickets.map(ticket => (
                    <tr key={ticket.id} className="hover:bg-gray-50/50 cursor-pointer" onClick={() => setDetailModal({ open: true, data: ticket })}>
                      <td className="px-4 py-2.5">
                        <div className="font-mono font-semibold text-gray-900">
                          {ticket.externalTicketId || `#${ticket.ticketNumber}`}
                        </div>
                        {ticket.player?.username && (
                          <div className="text-xs text-gray-500 mt-0.5">{ticket.player.username}</div>
                        )}
                      </td>
                      <td className="px-4 py-2.5 text-gray-700 whitespace-nowrap">
                        {fmtDate(ticket.draw.drawDate)} {ticket.draw.drawTime}
                      </td>
                      <td className="px-4 py-2.5 font-medium text-gray-800">{ticket.draw.game}</td>
                      <td className="px-4 py-2.5 text-gray-600">
                        {ticket.provider || SOURCE_LABELS[ticket.source] || ticket.source}
                      </td>
                      <td className="px-4 py-2.5 text-right font-bold text-green-600">{fmt(ticket.totalAmount)}</td>
                      <td className="px-4 py-2.5 text-center">{statusBadge(ticket.status)}</td>
                      <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">{fmtTime(ticket.createdAt)}</td>
                      <td className="px-4 py-2.5 text-center">
                        <Eye className="w-4 h-4 text-blue-600 inline" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Pagination */}
            {result.totalPages > 1 && (
              <div className="px-4 py-3 border-t border-gray-100 flex items-center justify-between text-sm">
                <span className="text-gray-500">
                  Pagina {result.page} de {result.totalPages} ({result.total} tickets)
                </span>
                <div className="flex gap-2">
                  <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}
                    className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 text-xs sm:text-sm">
                    <ChevronLeft className="w-3.5 h-3.5" /> Anterior
                  </button>
                  <button onClick={() => setPage(p => Math.min(result.totalPages, p + 1))} disabled={page === result.totalPages}
                    className="flex items-center gap-1 px-3 py-1.5 rounded border border-gray-200 text-gray-600 hover:bg-gray-50 disabled:opacity-40 text-xs sm:text-sm">
                    Siguiente <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>
            )}
          </>
        ) : (
          <p className="px-4 py-10 text-sm text-gray-400 text-center">
            {loading ? 'Cargando...' : 'No hay tickets para los filtros seleccionados'}
          </p>
        )}
      </div>

      {/* Ticket Detail Modal */}
      {detailModal.open && detailModal.data && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[85vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Detalle del Ticket</h3>
              <button onClick={() => setDetailModal({ open: false, data: null })} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4 overflow-y-auto max-h-[65vh]">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase">Ticket ID</label>
                  <p className="font-mono text-lg font-bold">
                    {detailModal.data.externalTicketId || `#${detailModal.data.ticketNumber}`}
                  </p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Monto Total</label>
                  <p className="text-lg font-bold text-green-600">{fmt(detailModal.data.totalAmount)}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase">Fuente</label>
                  <p className="font-medium">{detailModal.data.provider || SOURCE_LABELS[detailModal.data.source] || detailModal.data.source}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Estado</label>
                  <p>{statusBadge(detailModal.data.status)}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase">Sorteo</label>
                  <p className="font-medium">{detailModal.data.draw.game} — {detailModal.data.draw.drawTime}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Fecha Sorteo</label>
                  <p className="font-medium">{fmtDate(detailModal.data.draw.drawDate)}</p>
                </div>
              </div>
              {detailModal.data.winnerItem && (
                <div className="px-3 py-2 bg-green-50 border border-green-200 rounded-lg text-sm">
                  Ganador: <span className="font-bold">{detailModal.data.winnerItem.number} — {detailModal.data.winnerItem.name}</span>
                </div>
              )}
              {detailModal.data.createdAt && (
                <div>
                  <label className="text-xs text-gray-500 uppercase">Hora de Registro</label>
                  <p className="font-medium">{fmtTime(detailModal.data.createdAt)}</p>
                </div>
              )}

              {/* Jugadas */}
              {detailModal.data.details?.length > 0 && (
                <div className="border-t pt-4">
                  <label className="text-xs text-gray-500 uppercase mb-3 block">
                    Jugadas ({detailModal.data.details.length})
                  </label>
                  <div className="space-y-2">
                    {detailModal.data.details.map((detail, idx) => (
                      <div key={idx} className={`flex items-center justify-between p-3 rounded-lg border ${
                        detail.status === 'WON' ? 'bg-green-50 border-green-300' :
                        detail.status === 'LOST' ? 'bg-gray-50 border-gray-200' :
                        'bg-white border-gray-200'
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                            detail.status === 'WON' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'
                          }`}>
                            {detail.number}
                          </div>
                          <div>
                            <p className="font-bold text-lg">{detail.name}</p>
                            {detail.game?.name && (
                              <p className="text-xs text-blue-600 font-medium flex items-center gap-1">
                                <Gamepad2 className="w-3 h-3" />
                                {detail.game.name}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600">{fmt(detail.amount)}</p>
                          {detail.status && statusBadge(detail.status)}
                          {detail.status === 'WON' && detail.prize > 0 && (
                            <p className="text-sm text-green-600 font-semibold mt-1">Premio: {fmt(detail.prize)}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t bg-gray-50 flex justify-end">
              <button onClick={() => setDetailModal({ open: false, data: null })}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300">
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useCallback } from 'react';
import { Ticket, Calendar, Hash, TrendingUp, Trophy, X, Eye, Layers, ChevronLeft, ChevronRight, Filter, Loader2 } from 'lucide-react';
import TicketDetailModal from './TicketDetailModal';
import TripletaDetailModal from '@/components/shared/TripletaDetailModal';
import playerApi from '@/lib/api/player';
import tripletaAPI from '@/lib/api/tripleta';
import { toast } from 'sonner';

const ITEMS_PER_PAGE = 15;

export default function RecentTickets() {
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [loading, setLoading] = useState(true);

  // Data
  const [tickets, setTickets] = useState([]);
  const [tripletas, setTripletas] = useState([]);
  const [ticketPagination, setTicketPagination] = useState({ total: 0, hasMore: false });
  const [tripletaPagination, setTripletaPagination] = useState({ total: 0, hasMore: false });

  // Filters
  const [filterType, setFilterType] = useState('ALL');
  const [filterStatus, setFilterStatus] = useState('ALL');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const offset = (page - 1) * ITEMS_PER_PAGE;

      const promises = [];

      // Fetch tickets
      if (filterType === 'ALL' || filterType === 'TICKET') {
        const ticketParams = {
          limit: ITEMS_PER_PAGE,
          offset,
          ...(filterStatus !== 'ALL' && { status: filterStatus }),
          ...(dateFrom && { dateFrom }),
          ...(dateTo && { dateTo }),
        };
        promises.push(playerApi.getTickets(ticketParams));
      } else {
        promises.push(Promise.resolve({ success: true, data: [], pagination: { total: 0, hasMore: false } }));
      }

      // Fetch tripletas
      if (filterType === 'ALL' || filterType === 'TRIPLETA') {
        const tripletaStatus = filterStatus === 'LOST' ? 'EXPIRED' : filterStatus;
        const tripletaParams = {
          limit: ITEMS_PER_PAGE,
          offset,
          ...(filterStatus !== 'ALL' && { status: tripletaStatus }),
          ...(dateFrom && { dateFrom }),
          ...(dateTo && { dateTo }),
        };
        promises.push(tripletaAPI.getMyBets(tripletaParams));
      } else {
        promises.push(Promise.resolve({ success: true, data: [], pagination: { total: 0, hasMore: false } }));
      }

      const [ticketRes, tripletaRes] = await Promise.all(promises);

      if (ticketRes.success) {
        setTickets(ticketRes.data || []);
        setTicketPagination(ticketRes.pagination || { total: 0, hasMore: false });
      }

      if (tripletaRes.success) {
        setTripletas(tripletaRes.data || []);
        setTripletaPagination(tripletaRes.pagination || { total: 0, hasMore: false });
      }
    } catch (error) {
      console.error('Error fetching data:', error);
      toast.error('Error al cargar las jugadas');
    } finally {
      setLoading(false);
    }
  }, [page, filterType, filterStatus, dateFrom, dateTo]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Reset page when filters change
  const handleFilterChange = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const handleViewDetail = (ticket) => {
    setSelectedTicket(ticket);
    setShowDetailModal(true);
  };

  const handleCloseModal = () => {
    setShowDetailModal(false);
    setSelectedTicket(null);
  };

  const totalResults = (ticketPagination.total || 0) + (tripletaPagination.total || 0);
  const totalPages = Math.max(1, Math.ceil(totalResults / ITEMS_PER_PAGE));

  // Combine and sort tickets and tripletas by date
  const allItems = [
    ...(tickets || []).map(t => ({ ...t, type: 'TICKET' })),
    ...(tripletas || []).map(t => ({ ...t, type: 'TRIPLETA' }))
  ].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  const getStatusBadge = (status) => {
    const styles = {
      ACTIVE: 'bg-blue-100 text-blue-700',
      WON: 'bg-green-100 text-green-700',
      LOST: 'bg-red-100 text-red-700',
      CANCELLED: 'bg-gray-100 text-gray-700'
    };
    const labels = {
      ACTIVE: 'Activo',
      WON: 'Ganador',
      LOST: 'Perdedor',
      CANCELLED: 'Cancelado'
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[status] || styles.ACTIVE}`}>
        {labels[status] || status}
      </span>
    );
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'WON':
        return <Trophy className="w-5 h-5 text-green-600" />;
      case 'LOST':
        return <X className="w-5 h-5 text-red-600" />;
      case 'ACTIVE':
        return <TrendingUp className="w-5 h-5 text-blue-600" />;
      default:
        return <Ticket className="w-5 h-5 text-gray-600" />;
    }
  };

  const getTripletaStatusBadge = (status) => {
    const styles = {
      ACTIVE: 'bg-blue-100 text-blue-700',
      WON: 'bg-green-100 text-green-700',
      LOST: 'bg-red-100 text-red-700',
      EXPIRED: 'bg-gray-100 text-gray-700'
    };
    const labels = {
      ACTIVE: 'Activa',
      WON: 'Ganadora',
      LOST: 'Perdida',
      EXPIRED: 'Expirada'
    };
    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[status] || styles.ACTIVE}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold text-gray-900">MIS JUGADAS</h2>
        <div className="flex gap-2 text-sm">
          <span className="text-gray-600">{ticketPagination.total || 0} tickets</span>
          <span className="text-gray-400">|</span>
          <span className="text-purple-600">{tripletaPagination.total || 0} tripletas</span>
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6 p-4 bg-gray-50 rounded-lg">
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-gray-500" />
        </div>
        <select
          value={filterType}
          onChange={(e) => handleFilterChange(setFilterType)(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="ALL">Todos</option>
          <option value="TICKET">Tickets</option>
          <option value="TRIPLETA">Tripletas</option>
        </select>
        <select
          value={filterStatus}
          onChange={(e) => handleFilterChange(setFilterStatus)(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
        >
          <option value="ALL">Todos</option>
          <option value="ACTIVE">Activos</option>
          <option value="WON">Ganadores</option>
          <option value="LOST">Perdedores</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => handleFilterChange(setDateFrom)(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Desde"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => handleFilterChange(setDateTo)(e.target.value)}
          className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          placeholder="Hasta"
        />
        {(filterType !== 'ALL' || filterStatus !== 'ALL' || dateFrom || dateTo) && (
          <button
            onClick={() => {
              setFilterType('ALL');
              setFilterStatus('ALL');
              setDateFrom('');
              setDateTo('');
              setPage(1);
            }}
            className="px-3 py-1.5 text-sm text-red-600 hover:text-red-700 font-medium"
          >
            Limpiar
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="text-center py-12">
          <Loader2 className="w-8 h-8 text-blue-600 animate-spin mx-auto mb-4" />
          <p className="text-gray-500">Cargando jugadas...</p>
        </div>
      ) : allItems.length === 0 ? (
        <div className="text-center py-12">
          <Ticket className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No se encontraron jugadas</p>
          <p className="text-sm text-gray-400 mt-2">Ajusta los filtros o comienza a jugar</p>
        </div>
      ) : (
        <div className="space-y-4">
          {allItems.map((item) => (
            item.type === 'TICKET' ? (
              <div
                key={`ticket-${item.id}`}
                className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
                onClick={() => handleViewDetail(item)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-gray-100 p-2 rounded-lg">
                      {getStatusIcon(item.status)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-gray-900">TICKET</p>
                        {getStatusBadge(item.status)}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                        <Hash className="w-4 h-4" />
                        <span>{item.ticketNumber}</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-gray-500">Jugado</p>
                    <p className="font-semibold text-gray-900">
                      Bs. {parseFloat(item.totalAmount || 0).toLocaleString('es-VE', {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2
                      })}
                    </p>
                  </div>
                </div>

                {item.details && (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {item.details.map((detail, idx) => (
                      <div
                        key={idx}
                        className={`px-3 py-1 rounded-lg text-sm font-semibold ${
                          detail.status === 'WON'
                            ? 'bg-green-100 text-green-700 border-2 border-green-300'
                            : detail.status === 'LOST'
                            ? 'bg-gray-100 text-gray-500'
                            : 'bg-blue-100 text-blue-700'
                        }`}
                      >
                        {detail.number}
                        {detail.status === 'WON' && (
                          <span className="ml-1">(+Bs. {parseFloat(detail.prize || 0).toFixed(2)})</span>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                <div className="flex justify-between items-center pt-3 border-t">
                  <div className="flex items-center gap-2 text-sm text-gray-500">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {new Date(item.createdAt).toLocaleDateString('es-VE', {
                        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                  </div>
                  {item.status === 'WON' && parseFloat(item.totalPrize || 0) > 0 && (
                    <div className="text-right">
                      <p className="text-sm text-green-600 font-medium">Premio</p>
                      <p className="font-bold text-green-600">
                        +Bs. {parseFloat(item.totalPrize || 0).toLocaleString('es-VE', {
                          minimumFractionDigits: 2, maximumFractionDigits: 2
                        })}
                      </p>
                    </div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleViewDetail(item); }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
                  >
                    <Eye className="w-4 h-4" />
                    Ver Detalle
                  </button>
                </div>
              </div>
            ) : (
              <div
                key={`tripleta-${item.id}`}
                className="border-2 border-purple-200 rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer bg-purple-50"
                onClick={() => handleViewDetail(item)}
              >
                <div className="flex justify-between items-start mb-3">
                  <div className="flex items-center gap-3">
                    <div className="bg-purple-100 p-2 rounded-lg">
                      <Layers className="w-5 h-5 text-purple-600" />
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-purple-900">TRIPLETA</p>
                        {getTripletaStatusBadge(item.status)}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-sm text-purple-600">
                        <span>{item.numbersWon || 0}/3 numeros</span>
                        <span className="text-purple-400">|</span>
                        <span>{item.drawsCount} sorteos</span>
                      </div>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-sm text-purple-600">Apostado</p>
                    <p className="font-semibold text-purple-900">
                      Bs. {parseFloat(item.amount || 0).toLocaleString('es-VE', {
                        minimumFractionDigits: 2, maximumFractionDigits: 2
                      })} x {parseFloat(item.multiplier || 0).toFixed(0)}
                    </p>
                  </div>
                </div>

                {/* Tripleta Numbers */}
                {item.items && item.items.length > 0 ? (
                  <div className="flex flex-wrap gap-2 mb-3">
                    {item.items.map((gi, idx) => (
                      <div
                        key={idx}
                        className={`px-3 py-1 rounded-lg text-sm font-semibold ${
                          gi.won
                            ? 'bg-green-100 text-green-700 border-2 border-green-300'
                            : 'bg-purple-100 text-purple-800 border border-purple-300'
                        }`}
                      >
                        {gi.number} - {gi.name}
                        {gi.won && <span className="ml-1">✓</span>}
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2 mb-3">
                    <div className="px-3 py-1 rounded-lg text-sm font-semibold bg-purple-100 text-purple-800 border border-purple-300">
                      3 numeros seleccionados
                    </div>
                  </div>
                )}

                <div className="flex justify-between items-center pt-3 border-t border-purple-200">
                  <div className="flex items-center gap-2 text-sm text-purple-600">
                    <Calendar className="w-4 h-4" />
                    <span>
                      {new Date(item.createdAt).toLocaleDateString('es-VE', {
                        day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
                      })}
                    </span>
                  </div>
                  {item.status === 'WON' && parseFloat(item.prize || 0) > 0 && (
                    <div className="text-right">
                      <p className="text-sm text-green-600 font-medium">Premio</p>
                      <p className="font-bold text-green-600">
                        +Bs. {parseFloat(item.prize || 0).toLocaleString('es-VE', {
                          minimumFractionDigits: 2, maximumFractionDigits: 2
                        })}
                      </p>
                    </div>
                  )}
                  <button
                    onClick={(e) => { e.stopPropagation(); handleViewDetail(item); }}
                    className="flex items-center gap-2 px-3 py-1.5 bg-purple-100 text-purple-700 rounded-lg hover:bg-purple-200 transition-colors text-sm font-medium"
                  >
                    <Eye className="w-4 h-4" />
                    Ver Detalle
                  </button>
                </div>
              </div>
            )
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalResults > 0 && (
        <div className="flex items-center justify-between pt-6 border-t mt-6">
          <p className="text-sm text-gray-600">
            Pagina {page} de {totalPages} ({totalResults} resultados)
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="flex items-center gap-1 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
              Anterior
            </button>
            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="flex items-center gap-1 px-3 py-2 border rounded-lg text-sm font-medium hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Siguiente
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {showDetailModal && selectedTicket && (
        selectedTicket.type === 'TRIPLETA' ? (
          <TripletaDetailModal
            tripleta={selectedTicket}
            onClose={handleCloseModal}
          />
        ) : (
          <TicketDetailModal
            ticket={selectedTicket}
            onClose={handleCloseModal}
          />
        )
      )}
    </div>
  );
}

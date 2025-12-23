'use client';

import { useEffect, useState } from 'react';
import drawsAPI from '@/lib/api/draws';
import publicAPI from '@/lib/api/public';
import { toast } from 'sonner';
import { Calendar, Filter, RefreshCw, Plus, Edit2, Trash2, Eye } from 'lucide-react';
import ChangeWinnerModal from '@/components/admin/ChangeWinnerModal';
import DrawDetailModal from '@/components/admin/DrawDetailModal';
import { formatCaracasDate, formatCaracasTime, todayInCaracas } from '@/lib/utils/dateUtils';

export default function SorteosPage() {
  const [draws, setDraws] = useState([]);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedDraw, setSelectedDraw] = useState(null);
  const [showChangeWinner, setShowChangeWinner] = useState(false);
  const [showDetail, setShowDetail] = useState(false);
  
  const [filters, setFilters] = useState({
    gameId: '',
    status: '',
    date: todayInCaracas(), // Default to today in Caracas timezone
    page: 1,
    pageSize: 20
  });

  const [pagination, setPagination] = useState({
    total: 0,
    totalPages: 0
  });

  useEffect(() => {
    loadGames();
  }, []);

  useEffect(() => {
    loadDraws();
  }, [filters]);

  const loadGames = async () => {
    try {
      const games = await publicAPI.getGames();
      setGames(Array.isArray(games) ? games : []);
    } catch (error) {
      console.error('Error loading games:', error);
      toast.error('Error al cargar juegos');
    }
  };

  const loadDraws = async () => {
    setLoading(true);
    try {
      // Convert date to dateFrom and dateTo for the API
      const apiFilters = { ...filters };
      if (filters.date) {
        // Send only the date string (YYYY-MM-DD) to match backend expectations
        apiFilters.startDate = filters.date;
        apiFilters.endDate = filters.date;
        delete apiFilters.date;
      }
      
      const response = await drawsAPI.list(apiFilters);
      if (response.success) {
        // El backend retorna { success: true, data: [...], count: N, total: M }
        setDraws(Array.isArray(response.data) ? response.data : []);
        setPagination({
          total: response.total || 0,
          totalPages: Math.ceil((response.total || 0) / filters.pageSize)
        });
      }
    } catch (error) {
      console.error('Error loading draws:', error);
      toast.error('Error al cargar sorteos');
    } finally {
      setLoading(false);
    }
  };

  const handleGenerateDaily = async () => {
    try {
      const response = await drawsAPI.generateDaily();
      if (response.success) {
        toast.success(`${response.data.created} sorteos generados`);
        loadDraws();
      }
    } catch (error) {
      toast.error('Error al generar sorteos');
    }
  };

  const handleChangeWinner = (draw) => {
    setSelectedDraw(draw);
    setShowChangeWinner(true);
  };

  const handleViewDetail = (draw) => {
    setSelectedDraw(draw);
    setShowDetail(true);
  };

  const handleWinnerChanged = () => {
    setShowChangeWinner(false);
    setSelectedDraw(null);
    loadDraws();
    toast.success('Ganador actualizado correctamente');
  };

  const getStatusBadge = (status) => {
    const styles = {
      SCHEDULED: 'bg-blue-100 text-blue-800',
      PENDING: 'bg-blue-100 text-blue-800',
      CLOSED: 'bg-orange-100 text-orange-800',
      DRAWN: 'bg-purple-100 text-purple-800',
      PUBLISHED: 'bg-green-100 text-green-800',
      CANCELLED: 'bg-red-100 text-red-800'
    };

    const labels = {
      SCHEDULED: 'Programado',
      PENDING: 'Pendiente',
      CLOSED: 'Cerrado',
      DRAWN: 'Sorteado',
      PUBLISHED: 'Publicado',
      CANCELLED: 'Cancelado'
    };

    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {labels[status] || status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Sorteos</h1>
          <p className="text-gray-600 mt-1">Administra los sorteos del sistema</p>
        </div>
        <button
          onClick={handleGenerateDaily}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus className="w-4 h-4 mr-2" />
          Generar Sorteos del Día
        </button>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 lg:p-6">
        <div className="flex flex-col lg:flex-row lg:items-center space-y-4 lg:space-y-0 lg:space-x-4 gap-2">
          <div className="flex items-center space-x-2">
            <Filter className="w-5 h-5 text-gray-400 flex-shrink-0" />
            <span className="text-sm font-medium text-gray-700 hidden lg:block">Filtros:</span>
          </div>
          
          <div className="flex flex-col sm:flex-row sm:items-center space-y-2 sm:space-y-0 sm:space-x-2 lg:flex-1">
            <div className="flex items-center space-x-2">
              <Calendar className="w-4 h-4 text-gray-500 flex-shrink-0" />
              <input
                type="date"
                value={filters.date}
                onChange={(e) => setFilters({ ...filters, date: e.target.value, page: 1 })}
                className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
              />
            </div>

            <select
              value={filters.gameId}
              onChange={(e) => setFilters({ ...filters, gameId: e.target.value, page: 1 })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
            >
              <option value="">Todos los juegos</option>
              {games.map(game => (
                <option key={game.id} value={game.id}>{game.name}</option>
              ))}
            </select>

            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value, page: 1 })}
              className="px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none text-sm"
            >
              <option value="">Todos los estados</option>
              <option value="SCHEDULED">Programado</option>
              <option value="PENDING">Pendiente</option>
              <option value="CLOSED">Cerrado</option>
              <option value="DRAWN">Sorteado</option>
              <option value="PUBLISHED">Publicado</option>
            </select>
          </div>

          <button
            onClick={loadDraws}
            className="flex items-center px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm"
          >
            <RefreshCw className="w-4 h-4 mr-2" />
            Actualizar
          </button>
        </div>
      </div>

      {/* Draws Table */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Cargando sorteos...</p>
            </div>
          </div>
        ) : draws.length === 0 ? (
          <div className="text-center py-12">
            <Calendar className="w-12 h-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-600">No hay sorteos para mostrar</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Juego
                  </th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Fecha/Hora
                  </th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Ganador
                  </th>
                  <th className="px-4 lg:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {draws.map((draw) => (
                  <tr key={draw.id} className="hover:bg-gray-50">
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">
                        {draw.game?.name}
                      </div>
                      <div className="text-sm text-gray-500">
                        {draw.game?.type}
                      </div>
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">
                        {formatCaracasDate(draw.scheduledAt)}
                      </div>
                      <div className="text-sm text-gray-500">
                        {formatCaracasTime(draw.scheduledAt)}
                      </div>
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(draw.status)}
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                      {draw.winnerItem ? (
                        <div>
                          <div className="text-sm font-medium text-gray-900">
                            {draw.winnerItem.number}
                          </div>
                          {draw.winnerItem.name && (
                            <div className="text-sm text-gray-500">
                              {draw.winnerItem.name}
                            </div>
                          )}
                        </div>
                      ) : draw.preselectedItem ? (
                        <div>
                          <div className="text-sm font-medium text-orange-600">
                            {draw.preselectedItem.number} (Preseleccionado)
                          </div>
                        </div>
                      ) : (
                        <span className="text-sm text-gray-400">-</span>
                      )}
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-2">
                        <button
                          onClick={() => handleViewDetail(draw)}
                          className="text-gray-600 hover:text-gray-900 p-1"
                          title="Ver detalles"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {draw.status === 'CLOSED' && (
                          <button
                            onClick={() => handleChangeWinner(draw)}
                            className="text-blue-600 hover:text-blue-900 p-1"
                            title="Cambiar ganador"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {draws.length > 0 && pagination.totalPages > 1 && (
          <div className="px-4 lg:px-6 py-4 border-t border-gray-200 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="text-sm text-gray-700">
              Mostrando página {filters.page} de {pagination.totalPages}
            </div>
            <div className="flex space-x-2">
              <button
                onClick={() => setFilters({ ...filters, page: filters.page - 1 })}
                disabled={filters.page === 1}
                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Anterior
              </button>
              <button
                onClick={() => setFilters({ ...filters, page: filters.page + 1 })}
                disabled={filters.page === pagination.totalPages}
                className="px-3 py-1 border border-gray-300 rounded hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-sm"
              >
                Siguiente
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Change Winner Modal */}
      {showChangeWinner && selectedDraw && (
        <ChangeWinnerModal
          draw={selectedDraw}
          onClose={() => {
            setShowChangeWinner(false);
            setSelectedDraw(null);
          }}
          onSuccess={handleWinnerChanged}
        />
      )}

      {/* Draw Detail Modal */}
      {showDetail && selectedDraw && (
        <DrawDetailModal
          draw={selectedDraw}
          onClose={() => {
            setShowDetail(false);
            setSelectedDraw(null);
          }}
          onUpdate={loadDraws}
        />
      )}
    </div>
  );
}

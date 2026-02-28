'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Calendar, Hash, Trophy, CreditCard, ChevronLeft, ChevronRight, Filter, Loader2, Layers, RefreshCw, Eye } from 'lucide-react';
import { toast } from 'sonner';
import playerApi from '@/lib/api/player';
import tripletaAPI from '@/lib/api/tripleta';
import TicketDetailModal from '@/components/player/TicketDetailModal';
import TripletaDetailModal from '@/components/shared/TripletaDetailModal';

const ITEMS_PER_PAGE = 20;

export default function BalanceHistoricoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [movements, setMovements] = useState([]);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [availableBalance, setAvailableBalance] = useState(0);
  const [blockedBalance, setBlockedBalance] = useState(0);
  const [user, setUser] = useState(null);
  const [pagination, setPagination] = useState({ total: 0, hasMore: false });

  // Filters
  const [filterType, setFilterType] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [page, setPage] = useState(1);

  // Detail modals
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [selectedTripleta, setSelectedTripleta] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/login');
      return;
    }

    const userObj = JSON.parse(userData);
    if (userObj.role === 'ADMIN' || userObj.role === 'OPERATOR') {
      router.push('/admin');
      return;
    }

    setUser(userObj);
  }, [router]);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const offset = (page - 1) * ITEMS_PER_PAGE;

      const [movementsRes, balanceRes] = await Promise.all([
        playerApi.getMovements({
          limit: ITEMS_PER_PAGE,
          offset,
          ...(filterType && { type: filterType }),
          ...(dateFrom && { dateFrom }),
          ...(dateTo && { dateTo }),
        }),
        playerApi.getBalance(),
      ]);

      if (movementsRes.success) {
        setMovements(movementsRes.data || []);
        setPagination(movementsRes.pagination || { total: 0, hasMore: false });
      }

      if (balanceRes.success) {
        setCurrentBalance(balanceRes.data.balance);
        setAvailableBalance(balanceRes.data.availableBalance);
        setBlockedBalance(balanceRes.data.blockedBalance);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Error al cargar el historial');
    } finally {
      setLoading(false);
    }
  }, [page, filterType, dateFrom, dateTo]);

  useEffect(() => {
    if (user) {
      loadData();
    }
  }, [user, loadData]);

  const handleFilterChange = (setter) => (value) => {
    setter(value);
    setPage(1);
  };

  const handleMovementClick = async (movement) => {
    if (!movement.referenceId) return;

    try {
      setLoadingDetail(true);
      const api = (await import('@/lib/api/axios')).default;

      if (movement.referenceType === 'TICKET') {
        const response = await api.get(`/tickets/${movement.referenceId}`);
        if (response.data?.success) {
          setSelectedTicket(response.data.data);
        }
      } else if (movement.referenceType === 'TRIPLETA') {
        const response = await tripletaAPI.getById(movement.referenceId);
        if (response.success) {
          setSelectedTripleta(response.data);
        }
      }
    } catch (error) {
      console.error('Error loading detail:', error);
    } finally {
      setLoadingDetail(false);
    }
  };

  const getTransactionIcon = (type) => {
    switch (type) {
      case 'DEPOSIT':
        return <TrendingUp className="w-5 h-5 text-green-600" />;
      case 'BET':
        return <TrendingDown className="w-5 h-5 text-red-600" />;
      case 'PRIZE':
        return <Trophy className="w-5 h-5 text-yellow-600" />;
      case 'WITHDRAWAL':
        return <CreditCard className="w-5 h-5 text-orange-600" />;
      case 'REFUND':
        return <RefreshCw className="w-5 h-5 text-blue-600" />;
      case 'ADJUSTMENT':
        return <DollarSign className="w-5 h-5 text-purple-600" />;
      default:
        return <DollarSign className="w-5 h-5 text-gray-600" />;
    }
  };

  const getTransactionLabel = (type) => {
    const labels = {
      DEPOSIT: 'Deposito',
      BET: 'Jugada',
      PRIZE: 'Premio',
      WITHDRAWAL: 'Retiro',
      REFUND: 'Reembolso',
      ADJUSTMENT: 'Ajuste'
    };
    return labels[type] || type;
  };

  const getTransactionColor = (type) => {
    switch (type) {
      case 'DEPOSIT':
      case 'PRIZE':
      case 'REFUND':
        return 'text-green-600';
      case 'BET':
      case 'WITHDRAWAL':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

  const getReferenceIcon = (refType) => {
    if (refType === 'TRIPLETA') return <Layers className="w-3 h-3" />;
    if (refType === 'TICKET') return <Hash className="w-3 h-3" />;
    return null;
  };

  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-VE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const totalPages = Math.max(1, Math.ceil((pagination.total || 0) / ITEMS_PER_PAGE));
  const isClickable = (m) => m.referenceId && (m.referenceType === 'TICKET' || m.referenceType === 'TRIPLETA');

  if (!user) return null;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Balance e Historico</h1>
              <p className="text-sm text-gray-600">Todos los movimientos de tu cuenta</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Balance Cards */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg p-6 text-white">
            <p className="text-blue-100 text-sm mb-1">Balance Total</p>
            <p className="text-3xl font-bold">
              Bs. {currentBalance.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-gradient-to-r from-green-600 to-green-700 rounded-xl shadow-lg p-6 text-white">
            <p className="text-green-100 text-sm mb-1">Disponible</p>
            <p className="text-3xl font-bold">
              Bs. {availableBalance.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
          <div className="bg-gradient-to-r from-yellow-600 to-yellow-700 rounded-xl shadow-lg p-6 text-white">
            <p className="text-yellow-100 text-sm mb-1">Bloqueado</p>
            <p className="text-3xl font-bold">
              Bs. {blockedBalance.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>

        {/* Transactions List */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-4">Historial de Movimientos</h2>

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
              <option value="">Todos</option>
              <option value="DEPOSIT">Depositos</option>
              <option value="WITHDRAWAL">Retiros</option>
              <option value="BET">Jugadas</option>
              <option value="PRIZE">Premios</option>
              <option value="REFUND">Reembolsos</option>
            </select>
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => handleFilterChange(setDateFrom)(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <input
              type="date"
              value={dateTo}
              onChange={(e) => handleFilterChange(setDateTo)(e.target.value)}
              className="px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            {(filterType || dateFrom || dateTo) && (
              <button
                onClick={() => {
                  setFilterType('');
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
              <p className="text-gray-500">Cargando movimientos...</p>
            </div>
          ) : movements.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No hay movimientos</p>
              <p className="text-sm text-gray-400 mt-2">Ajusta los filtros o comienza a jugar</p>
            </div>
          ) : (
            <div className="space-y-3">
              {movements.map((movement, index) => (
                <div
                  key={movement.id || index}
                  className={`border rounded-lg p-4 hover:shadow-md transition-shadow ${
                    isClickable(movement) ? 'cursor-pointer' : ''
                  }`}
                  onClick={() => isClickable(movement) && handleMovementClick(movement)}
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="bg-gray-100 p-3 rounded-lg flex-shrink-0">
                        {getTransactionIcon(movement.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <p className="font-semibold text-gray-900">
                            {movement.metadata?.gameName || getTransactionLabel(movement.type)}
                          </p>
                          {movement.referenceType === 'TRIPLETA' && (
                            <span className="text-xs bg-purple-100 text-purple-700 px-2 py-0.5 rounded-full font-medium">
                              TRIPLETA
                            </span>
                          )}
                          {movement.referenceType === 'TICKET' && (
                            <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-medium">
                              NORMAL
                            </span>
                          )}
                          {isClickable(movement) && (
                            <Eye className="w-3 h-3 text-blue-400" />
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                          <Calendar className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">
                            {formatDateTime(movement.createdAt)}
                            {movement.metadata?.drawTime && (
                              <span className="ml-2 text-gray-400">· sorteo {movement.metadata.drawTime.slice(0,5)}</span>
                            )}
                          </span>
                        </div>
                        {movement.description && movement.description !== 'Jugada en sorteo' && (
                          <p className="text-sm text-gray-600 mt-1 break-words">{movement.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right sm:text-right flex-shrink-0 sm:ml-4 pl-0 sm:pl-4 border-t sm:border-t-0 sm:border-l pt-3 sm:pt-0">
                      <p className={`text-xl sm:text-2xl font-bold ${getTransactionColor(movement.type)} whitespace-nowrap`}>
                        {parseFloat(movement.amount) >= 0 ? '+' : ''}
                        Bs. {Math.abs(parseFloat(movement.amount || 0)).toLocaleString('es-VE', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </p>
                      <p className="text-xs sm:text-sm text-gray-500 mt-1 whitespace-nowrap">
                        Balance: Bs. {parseFloat(movement.balanceAfter || 0).toLocaleString('es-VE', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Pagination */}
          {pagination.total > 0 && (
            <div className="flex items-center justify-between pt-6 border-t mt-6">
              <p className="text-sm text-gray-600">
                Pagina {page} de {totalPages} ({pagination.total} movimientos)
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
        </div>
      </main>

      {/* Detail Modals */}
      {selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => setSelectedTicket(null)}
        />
      )}
      {selectedTripleta && (
        <TripletaDetailModal
          tripleta={selectedTripleta}
          onClose={() => setSelectedTripleta(null)}
        />
      )}

      {/* Loading overlay for detail fetch */}
      {loadingDetail && (
        <div className="fixed inset-0 bg-black bg-opacity-20 z-40 flex items-center justify-center">
          <div className="bg-white rounded-lg p-4 shadow-lg">
            <Loader2 className="w-6 h-6 text-blue-600 animate-spin mx-auto" />
            <p className="text-sm text-gray-600 mt-2">Cargando detalle...</p>
          </div>
        </div>
      )}
    </div>
  );
}

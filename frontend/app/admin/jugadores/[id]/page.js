'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { ArrowLeft, User, DollarSign, Ticket, TrendingUp, Calendar, Clock, CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';
import TripletaDetailModal from '@/components/shared/TripletaDetailModal';

export default function PlayerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const playerId = params.id;

  const [playerData, setPlayerData] = useState(null);
  const [tickets, setTickets] = useState([]);
  const [tripletas, setTripletas] = useState([]);
  const [movements, setMovements] = useState([]);
  const [movementsTotal, setMovementsTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');
  const [ticketDetailModal, setTicketDetailModal] = useState({ open: false, data: null });
  const [tripletaDetailModal, setTripletaDetailModal] = useState({ open: false, data: null });

  useEffect(() => {
    if (playerId) {
      loadPlayerData();
    }
  }, [playerId]);

  const loadPlayerData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('accessToken');
      const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000/api';
      
      const [detailsRes, ticketsRes, tripletasRes, movementsRes] = await Promise.all([
        fetch(`${API_URL}/players/${playerId}`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_URL}/players/${playerId}/tickets?limit=100`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_URL}/players/${playerId}/tripletas?limit=100`, {
          headers: { 'Authorization': `Bearer ${token}` }
        }),
        fetch(`${API_URL}/players/${playerId}/movements?limit=50`, {
          headers: { 'Authorization': `Bearer ${token}` }
        })
      ]);

      if (detailsRes.ok) {
        const data = await detailsRes.json();
        setPlayerData(data.data);
      }

      if (ticketsRes.ok) {
        const data = await ticketsRes.json();
        setTickets(data.data.tickets || []);
      }

      if (tripletasRes.ok) {
        const data = await tripletasRes.json();
        setTripletas(data.data.tripletas || []);
      }

      if (movementsRes.ok) {
        const data = await movementsRes.json();
        setMovements(data.data.movements || []);
        setMovementsTotal(data.data.total || 0);
      }
    } catch (error) {
      console.error('Error loading player data:', error);
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: 'VES',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const formatDate = (date) => {
    return new Date(date).toLocaleString('es-VE', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    const styles = {
      ACTIVE: 'bg-blue-100 text-blue-800',
      WON: 'bg-green-100 text-green-800',
      LOST: 'bg-red-100 text-red-800',
      EXPIRED: 'bg-gray-100 text-gray-800'
    };

    const icons = {
      ACTIVE: <Clock className="w-3 h-3" />,
      WON: <CheckCircle className="w-3 h-3" />,
      LOST: <XCircle className="w-3 h-3" />,
      EXPIRED: <AlertCircle className="w-3 h-3" />
    };

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
        {icons[status]}
        {status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando datos del jugador...</p>
        </div>
      </div>
    );
  }

  if (!playerData) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600">Jugador no encontrado</p>
          <button
            onClick={() => router.push('/admin/jugadores')}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Volver a Jugadores
          </button>
        </div>
      </div>
    );
  }

  const { player, stats, recentTickets, recentTripletas } = playerData;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <button
            onClick={() => router.push('/admin/jugadores')}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4"
          >
            <ArrowLeft className="w-5 h-5" />
            Volver a Jugadores
          </button>
          
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                  <User className="w-8 h-8 text-blue-600" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900">{player.username}</h1>
                  <p className="text-gray-600">{player.email}</p>
                  {player.phone && <p className="text-gray-600">{player.phone}</p>}
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-600">Saldo Disponible</div>
                <div className="text-3xl font-bold text-green-600">
                  {formatCurrency(parseFloat(player.balance) - parseFloat(player.blockedBalance))}
                </div>
                {parseFloat(player.blockedBalance) > 0 && (
                  <div className="text-sm text-gray-500">
                    Bloqueado: {formatCurrency(player.blockedBalance)}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Stats Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Tickets</p>
                <p className="text-2xl font-bold">{stats.tickets.total}</p>
                <p className="text-xs text-green-600">{stats.tickets.won} ganadores</p>
              </div>
              <Ticket className="w-8 h-8 text-blue-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Tripletas</p>
                <p className="text-2xl font-bold">{stats.tripletas.total}</p>
                <p className="text-xs text-green-600">{stats.tripletas.won} ganadoras</p>
              </div>
              <TrendingUp className="w-8 h-8 text-purple-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Total Apostado</p>
                <p className="text-xl font-bold">{formatCurrency(stats.tickets.totalBet + stats.tripletas.totalBet)}</p>
              </div>
              <DollarSign className="w-8 h-8 text-orange-600" />
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-gray-600">Premios Ganados</p>
                <p className="text-xl font-bold text-green-600">{formatCurrency(stats.tickets.totalPrize + stats.tripletas.totalPrize)}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px">
              <button
                onClick={() => setActiveTab('overview')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'overview'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Resumen
              </button>
              <button
                onClick={() => setActiveTab('tickets')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'tickets'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Tickets ({tickets.length})
              </button>
              <button
                onClick={() => setActiveTab('tripletas')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'tripletas'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Tripletas ({tripletas.length})
              </button>
              <button
                onClick={() => setActiveTab('movements')}
                className={`px-6 py-3 text-sm font-medium border-b-2 ${
                  activeTab === 'movements'
                    ? 'border-blue-600 text-blue-600'
                    : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                }`}
              >
                Movimientos ({movementsTotal})
              </button>
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'overview' && (
              <div className="space-y-6">
                <div>
                  <h3 className="text-lg font-semibold mb-4">Últimos Tickets</h3>
                  <div className="space-y-2">
                    {recentTickets.map((ticket) => (
                      <div key={ticket.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium">{ticket.draw.game.name}</p>
                          <p className="text-sm text-gray-600">{formatDate(ticket.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{formatCurrency(ticket.totalAmount)}</p>
                          {getStatusBadge(ticket.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h3 className="text-lg font-semibold mb-4">Últimas Tripletas</h3>
                  <div className="space-y-2">
                    {recentTripletas.map((tripleta) => (
                      <div key={tripleta.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div>
                          <p className="font-medium">{tripleta.game.name}</p>
                          <p className="text-sm text-gray-600">{formatDate(tripleta.createdAt)}</p>
                        </div>
                        <div className="text-right">
                          <p className="font-medium">{formatCurrency(tripleta.amount)}</p>
                          {getStatusBadge(tripleta.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'tickets' && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Juego</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sorteo</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monto</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Premio</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {tickets.map((ticket) => (
                      <tr key={ticket.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{ticket.draw.game.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">{formatDate(ticket.draw.scheduledAt)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{formatCurrency(ticket.totalAmount)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                          {parseFloat(ticket.totalPrize || 0) > 0 ? formatCurrency(ticket.totalPrize) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(ticket.status)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => setTicketDetailModal({ open: true, data: ticket })}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'tripletas' && (
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Juego</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Números</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monto</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Premio</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {tripletas.map((tripleta) => (
                      <tr key={tripleta.id}>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{tripleta.game?.name}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {tripleta.item1?.number}, {tripleta.item2?.number}, {tripleta.item3?.number}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{formatCurrency(tripleta.amount)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                          {parseFloat(tripleta.prize) > 0 ? formatCurrency(tripleta.prize) : '-'}
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap">{getStatusBadge(tripleta.status)}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <button
                            onClick={() => setTripletaDetailModal({ open: true, data: tripleta })}
                            className="text-blue-600 hover:text-blue-800 font-medium"
                          >
                            Ver
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {activeTab === 'movements' && (
              <div className="overflow-x-auto">
                <div className="mb-4 p-4 bg-blue-50 rounded-lg">
                  <h4 className="font-semibold text-blue-900 mb-2">Historial de Movimientos</h4>
                  <p className="text-sm text-blue-700">Trazabilidad completa de todas las transacciones del jugador</p>
                </div>
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                      <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monto</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Saldo Antes</th>
                      <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Saldo Después</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {movements.map((movement) => {
                      const typeStyles = {
                        DEPOSIT: { bg: 'bg-green-100', text: 'text-green-800', label: 'Depósito' },
                        WITHDRAWAL: { bg: 'bg-red-100', text: 'text-red-800', label: 'Retiro' },
                        BET: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Jugada' },
                        PRIZE: { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Premio' },
                        REFUND: { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Reembolso' },
                        ADJUSTMENT: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Ajuste' },
                        BONUS: { bg: 'bg-pink-100', text: 'text-pink-800', label: 'Bonificación' }
                      };
                      const style = typeStyles[movement.type] || typeStyles.ADJUSTMENT;
                      const isPositive = parseFloat(movement.amount) > 0;
                      
                      return (
                        <tr key={movement.id} className="hover:bg-gray-50">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-600">
                            {formatDate(movement.createdAt)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className={`px-2 py-1 text-xs font-semibold rounded-full ${style.bg} ${style.text}`}>
                              {style.label}
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-gray-900">
                            {movement.description || '-'}
                            {movement.referenceType && (
                              <span className="text-xs text-gray-500 ml-2">
                                ({movement.referenceType})
                              </span>
                            )}
                          </td>
                          <td className={`px-6 py-4 whitespace-nowrap text-sm font-bold text-right ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                            {isPositive ? '+' : ''}{formatCurrency(movement.amount)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-600">
                            {formatCurrency(movement.balanceBefore)}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900">
                            {formatCurrency(movement.balanceAfter)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {movements.length === 0 && (
                  <div className="text-center py-8 text-gray-500">
                    No hay movimientos registrados
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Modal de Detalle de Ticket */}
      {ticketDetailModal.open && ticketDetailModal.data && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">Detalle del Ticket</h3>
              <button onClick={() => setTicketDetailModal({ open: false, data: null })} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase">Ticket ID</label>
                  <p className="font-mono text-lg font-bold">{ticketDetailModal.data.id}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Monto Total</label>
                  <p className="text-lg font-bold text-green-600">{formatCurrency(ticketDetailModal.data.totalAmount)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase">Juego</label>
                  <p className="font-medium">{ticketDetailModal.data.draw?.game?.name}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Sorteo</label>
                  <p className="font-medium">{formatDate(ticketDetailModal.data.draw?.scheduledAt)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase">Estado</label>
                  <div className="mt-1">{getStatusBadge(ticketDetailModal.data.status)}</div>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Premio</label>
                  <p className="text-lg font-bold text-green-600">
                    {parseFloat(ticketDetailModal.data.totalPrize || 0) > 0 ? formatCurrency(ticketDetailModal.data.totalPrize) : '-'}
                  </p>
                </div>
              </div>
              {ticketDetailModal.data.createdAt && (
                <div>
                  <label className="text-xs text-gray-500 uppercase">Hora de Registro</label>
                  <p className="font-medium">{formatDate(ticketDetailModal.data.createdAt)}</p>
                </div>
              )}
              
              {/* Jugadas del ticket */}
              {ticketDetailModal.data.details && ticketDetailModal.data.details.length > 0 && (
                <div className="border-t pt-4">
                  <label className="text-xs text-gray-500 uppercase mb-3 block">
                    Jugadas ({ticketDetailModal.data.details.length})
                  </label>
                  <div className="space-y-2">
                    {ticketDetailModal.data.details.map((detail, idx) => (
                      <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                        <div className="flex items-center gap-3">
                          <div className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">
                            {idx + 1}
                          </div>
                          <div>
                            <p className="font-bold text-lg">{detail.gameItem?.number}</p>
                            {detail.gameItem?.name && <p className="text-sm text-gray-600">{detail.gameItem?.name}</p>}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600">{formatCurrency(detail.amount)}</p>
                          <div className="mt-1">{getStatusBadge(detail.status)}</div>
                          {detail.status === 'WON' && (
                            <p className="text-xs text-green-600 mt-1">Premio: {formatCurrency(detail.prize)}</p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t bg-gray-50 flex justify-end">
              <button 
                onClick={() => setTicketDetailModal({ open: false, data: null })}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Detalle de Tripleta */}
      {tripletaDetailModal.open && tripletaDetailModal.data && (
        <TripletaDetailModal
          tripleta={tripletaDetailModal.data}
          onClose={() => setTripletaDetailModal({ open: false, data: null })}
        />
      )}
    </div>
  );
}

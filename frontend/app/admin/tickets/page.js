'use client';

import { useState, useEffect } from 'react';
import { Search, Ticket, DollarSign, Trophy, Filter, Eye } from 'lucide-react';
import { toast } from 'sonner';
import axios from '@/lib/api/axios';
import TicketDetailModal from '@/components/player/TicketDetailModal';
import TripletaDetailModal from '@/components/shared/TripletaDetailModal';

export default function TicketsPage() {
  const [tickets, setTickets] = useState([]);
  const [tripletas, setTripletas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [selectedTripleta, setSelectedTripleta] = useState(null);
  const [showTicketDetail, setShowTicketDetail] = useState(false);
  const [showTripletaDetail, setShowTripletaDetail] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    active: 0,
    won: 0,
    lost: 0,
    totalAmount: 0,
    totalPrizes: 0
  });

  useEffect(() => {
    fetchTickets();
  }, []);

  const fetchTickets = async () => {
    try {
      setLoading(true);
      
      // Fetch regular tickets
      const ticketsResponse = await axios.get('/admin/tickets');
      const ticketsData = ticketsResponse.data.data || [];
      setTickets(ticketsData);
      
      // Fetch tripletas
      try {
        const tripletasResponse = await axios.get('/tripleta');
        const tripletasData = tripletasResponse.data.data || [];
        setTripletas(tripletasData);
      } catch (error) {
        console.error('Error fetching tripletas:', error);
        setTripletas([]);
      }
      
      const active = ticketsData.filter(t => t.status === 'ACTIVE').length;
      const won = ticketsData.filter(t => t.status === 'WON').length;
      const lost = ticketsData.filter(t => t.status === 'LOST').length;
      const totalAmount = ticketsData.reduce((sum, t) => sum + parseFloat(t.totalAmount || 0), 0);
      const totalPrizes = ticketsData.reduce((sum, t) => sum + parseFloat(t.totalPrize || 0), 0);
      
      setStats({
        total: ticketsData.length,
        active,
        won,
        lost,
        totalAmount,
        totalPrizes
      });
    } catch (error) {
      toast.error('Error al cargar tickets');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  const handleViewTicket = (ticket) => {
    setSelectedTicket(ticket);
    setShowTicketDetail(true);
  };

  const handleViewTripleta = (tripleta) => {
    setSelectedTripleta(tripleta);
    setShowTripletaDetail(true);
  };

  const filteredTickets = tickets.filter(ticket => {
    const matchesSearch = 
      ticket.user?.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.user?.email?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      ticket.id?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'ALL' || ticket.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const filteredTripletas = tripletas.filter(tripleta => {
    const matchesSearch = 
      tripleta.user?.username?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tripleta.id?.toLowerCase().includes(searchTerm.toLowerCase());
    
    const matchesStatus = statusFilter === 'ALL' || tripleta.status === statusFilter;
    
    return matchesSearch && matchesStatus;
  });

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: 'VES',
      minimumFractionDigits: 2
    }).format(amount);
  };

  const getStatusBadge = (status) => {
    const styles = {
      ACTIVE: 'bg-blue-100 text-blue-800',
      WON: 'bg-green-100 text-green-800',
      LOST: 'bg-red-100 text-red-800',
      CANCELLED: 'bg-gray-100 text-gray-800'
    };
    
    const labels = {
      ACTIVE: 'Activo',
      WON: 'Ganador',
      LOST: 'Perdedor',
      CANCELLED: 'Cancelado'
    };
    
    return (
      <span className={`px-2 py-1 text-xs font-semibold rounded-full ${styles[status]}`}>
        {labels[status]}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Tickets de Jugadas</h1>
        <p className="text-gray-600 mt-1">Gestión de tickets de todos los jugadores</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 lg:grid-cols-6 gap-4">
        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total</p>
              <p className="text-2xl font-bold text-gray-900 mt-1">{stats.total}</p>
            </div>
            <Ticket className="w-8 h-8 text-gray-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Activos</p>
              <p className="text-2xl font-bold text-blue-600 mt-1">{stats.active}</p>
            </div>
            <Ticket className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Ganadores</p>
              <p className="text-2xl font-bold text-green-600 mt-1">{stats.won}</p>
            </div>
            <Trophy className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Perdedores</p>
              <p className="text-2xl font-bold text-red-600 mt-1">{stats.lost}</p>
            </div>
            <Ticket className="w-8 h-8 text-red-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Apostado</p>
              <p className="text-xl font-bold text-blue-600 mt-1">
                {formatCurrency(stats.totalAmount)}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Premios</p>
              <p className="text-xl font-bold text-green-600 mt-1">
                {formatCurrency(stats.totalPrizes)}
              </p>
            </div>
            <Trophy className="w-8 h-8 text-green-600" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-4 space-y-4">
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              placeholder="Buscar por usuario, email o ID..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          
          <div className="relative">
            <Filter className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="pl-10 pr-8 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 appearance-none bg-white"
            >
              <option value="ALL">Todos los estados</option>
              <option value="ACTIVE">Activos</option>
              <option value="WON">Ganadores</option>
              <option value="LOST">Perdedores</option>
              <option value="CANCELLED">Cancelados</option>
            </select>
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando tickets...</p>
        </div>
      ) : filteredTickets.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">No se encontraron tickets</p>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <table className="min-w-full divide-y divide-gray-200">
            <thead className="bg-gray-50">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Sorteo</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Monto</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Premio</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Acciones</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredTickets.map((ticket) => (
                <tr key={ticket.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-blue-100 text-blue-800">Ticket</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                    {ticket.id.substring(0, 8)}...
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{ticket.user?.username}</div>
                    <div className="text-sm text-gray-500">{ticket.user?.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{ticket.draw?.game?.name}</div>
                    <div className="text-sm text-gray-500">
                      {new Date(ticket.draw?.scheduledAt).toLocaleString('es-VE', {
                        dateStyle: 'short',
                        timeStyle: 'short'
                      })}
                    </div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                    {formatCurrency(ticket.totalAmount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                    {formatCurrency(ticket.totalPrize)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(ticket.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(ticket.createdAt).toLocaleString('es-VE', {
                      dateStyle: 'short',
                      timeStyle: 'short'
                    })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <button
                      onClick={() => handleViewTicket(ticket)}
                      className="text-blue-600 hover:text-blue-900 p-1"
                      title="Ver detalle"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
              {filteredTripletas.map((tripleta) => (
                <tr key={tripleta.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span className="px-2 py-1 text-xs font-semibold rounded-full bg-purple-100 text-purple-800">Tripleta</span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-mono text-gray-500">
                    {tripleta.id.substring(0, 8)}...
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{tripleta.user?.username}</div>
                    <div className="text-sm text-gray-500">{tripleta.user?.email}</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <div className="text-sm font-medium text-gray-900">{tripleta.game?.name || 'Tripleta'}</div>
                    <div className="text-sm text-gray-500">{tripleta.drawsCount} sorteos</div>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-blue-600">
                    {formatCurrency(tripleta.amount)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-green-600">
                    {formatCurrency(tripleta.prize || (tripleta.amount * tripleta.multiplier))}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    {getStatusBadge(tripleta.status)}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                    {new Date(tripleta.createdAt).toLocaleString('es-VE', {
                      dateStyle: 'short',
                      timeStyle: 'short'
                    })}
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                    <button
                      onClick={() => handleViewTripleta(tripleta)}
                      className="text-purple-600 hover:text-purple-900 p-1"
                      title="Ver detalle"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Ticket Detail Modal */}
      {showTicketDetail && selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={() => {
            setShowTicketDetail(false);
            setSelectedTicket(null);
          }}
        />
      )}

      {/* Tripleta Detail Modal */}
      {showTripletaDetail && selectedTripleta && (
        <TripletaDetailModal
          tripleta={selectedTripleta}
          onClose={() => {
            setShowTripletaDetail(false);
            setSelectedTripleta(null);
          }}
        />
      )}
    </div>
  );
}

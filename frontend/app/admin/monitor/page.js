'use client';

import { useState, useEffect } from 'react';
import { 
  Building2, Hash, FileText, Calendar, Gamepad2, Clock,
  DollarSign, Trophy, Ticket, AlertTriangle, ChevronRight,
  X, Eye, Layers
} from 'lucide-react';
import { toast } from 'sonner';
import monitorApi from '@/lib/api/monitor';
import axios from '@/lib/api/axios';
import TripletaDetailModal from '@/components/shared/TripletaDetailModal';
import { getTodayVenezuela } from '@/lib/dateUtils';

export default function MonitorPage() {
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('bancas');
  const [selectedDate, setSelectedDate] = useState(getTodayVenezuela());
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState('');
  const [draws, setDraws] = useState([]);
  const [selectedDraw, setSelectedDraw] = useState('');
  
  const [bancaStats, setBancaStats] = useState(null);
  const [itemStats, setItemStats] = useState(null);
  const [dailyReport, setDailyReport] = useState(null);
  
  const [ticketsModal, setTicketsModal] = useState({ open: false, data: null, type: null });
  const [tripletasModal, setTripletasModal] = useState({ open: false, data: null });
  const [ticketDetailModal, setTicketDetailModal] = useState({ open: false, data: null });
  const [tripletaDetailModal, setTripletaDetailModal] = useState({ open: false, data: null });

  useEffect(() => {
    fetchGames();
  }, []);

  useEffect(() => {
    if (selectedGame && selectedDate) {
      fetchDraws();
    }
  }, [selectedGame, selectedDate]);

  useEffect(() => {
    if (selectedDraw) {
      fetchData();
    }
  }, [selectedDraw, activeTab]);

  const fetchGames = async () => {
    try {
      const response = await axios.get('/games');
      setGames(response.data.data || []);
    } catch (error) {
      toast.error('Error cargando juegos');
    }
  };

  const fetchDraws = async () => {
    try {
      const response = await axios.get(`/draws?gameId=${selectedGame}&dateFrom=${selectedDate}&dateTo=${selectedDate}`);
      const drawsList = response.data.data || [];
      setDraws(drawsList);
      
      if (drawsList.length > 0 && !selectedDraw) {
        const now = new Date();
        
        // Sort draws by scheduledAt to find the next one chronologically
        const sortedDraws = [...drawsList].sort((a, b) => 
          new Date(a.scheduledAt) - new Date(b.scheduledAt)
        );
        
        // Find the next draw that hasn't happened yet (SCHEDULED or CLOSED status)
        let nextDraw = sortedDraws.find(draw => {
          const scheduledTime = new Date(draw.scheduledAt);
          return (draw.status === 'SCHEDULED' || draw.status === 'CLOSED') && scheduledTime >= now;
        });
        
        // If no future draw, find the most recent CLOSED draw
        if (!nextDraw) {
          nextDraw = sortedDraws.reverse().find(d => d.status === 'CLOSED');
        }
        
        // Fallback to first draw
        setSelectedDraw(nextDraw?.id || sortedDraws[0].id);
      }
    } catch (error) {
      toast.error('Error cargando sorteos');
    }
  };

  const fetchData = async () => {
    if (!selectedDraw) return;
    
    setLoading(true);
    try {
      if (activeTab === 'bancas') {
        const result = await monitorApi.getBancaStats(selectedDraw);
        setBancaStats(result.data);
      } else if (activeTab === 'numeros') {
        const result = await monitorApi.getItemStats(selectedDraw);
        setItemStats(result.data);
      } else if (activeTab === 'reporte') {
        const result = await monitorApi.getDailyReport(selectedDate, selectedGame || null);
        setDailyReport(result.data);
      }
    } catch (error) {
      toast.error('Error cargando datos');
    } finally {
      setLoading(false);
    }
  };

  const handleViewTicketsByBanca = async (bancaId) => {
    try {
      const result = await monitorApi.getTicketsByBanca(selectedDraw, bancaId);
      setTicketsModal({ open: true, data: result.data, type: 'banca' });
    } catch (error) {
      toast.error('Error cargando tickets');
    }
  };

  const handleViewTicketsByItem = async (itemId) => {
    try {
      const result = await monitorApi.getTicketsByItem(selectedDraw, itemId);
      setTicketsModal({ open: true, data: result.data, type: 'item' });
    } catch (error) {
      toast.error('Error cargando tickets');
    }
  };

  const handleViewTripletas = async (itemId) => {
    try {
      const result = await monitorApi.getTripletasByItem(selectedDraw, itemId);
      setTripletasModal({ open: true, data: result.data });
    } catch (error) {
      toast.error('Error cargando tripletas');
    }
  };

  const handleViewTicketDetail = (ticket) => {
    setTicketsModal({ open: false, data: null, type: null });
    setTicketDetailModal({ open: true, data: ticket });
  };

  const handleViewTripletaDetail = (tripleta) => {
    setTripletasModal({ open: false, data: null });
    setTripletaDetailModal({ open: true, data: tripleta });
  };

  const getDangerBadge = (level) => {
    const styles = {
      low: 'bg-green-100 text-green-800',
      medium: 'bg-yellow-100 text-yellow-800',
      high: 'bg-red-100 text-red-800'
    };
    const labels = {
      low: 'Bajo riesgo',
      medium: 'Riesgo medio',
      high: '⚠️ Alto riesgo'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[level]}`}>
        {labels[level]}
      </span>
    );
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: 'VES',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Monitor de Sorteos</h1>
        <p className="text-gray-600 mt-1">Análisis en tiempo real de ventas y premios</p>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              Fecha
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => {
                setSelectedDate(e.target.value);
                setSelectedDraw('');
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Gamepad2 className="w-4 h-4 inline mr-1" />
              Juego
            </label>
            <select
              value={selectedGame}
              onChange={(e) => {
                setSelectedGame(e.target.value);
                setSelectedDraw('');
              }}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Seleccionar juego</option>
              {games.map(game => (
                <option key={game.id} value={game.id}>{game.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Clock className="w-4 h-4 inline mr-1" />
              Sorteo
            </label>
            <select
              value={selectedDraw}
              onChange={(e) => setSelectedDraw(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              disabled={!selectedGame}
            >
              <option value="">Seleccionar sorteo</option>
              {draws.map(draw => (
                <option key={draw.id} value={draw.id}>
                  {formatTime(draw.scheduledAt)} - {draw.status}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px">
            <button
              onClick={() => setActiveTab('bancas')}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${
                activeTab === 'bancas'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Building2 className="w-4 h-4 inline mr-2" />
              Bancas
            </button>
            <button
              onClick={() => setActiveTab('numeros')}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${
                activeTab === 'numeros'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <Hash className="w-4 h-4 inline mr-2" />
              Números
            </button>
            <button
              onClick={() => setActiveTab('reporte')}
              className={`px-6 py-3 text-sm font-medium border-b-2 ${
                activeTab === 'reporte'
                  ? 'border-blue-500 text-blue-600'
                  : 'border-transparent text-gray-500 hover:text-gray-700'
              }`}
            >
              <FileText className="w-4 h-4 inline mr-2" />
              Reporte
            </button>
          </nav>
        </div>

        <div className="p-4">
          {loading ? (
            <div className="text-center py-12">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Cargando datos...</p>
            </div>
          ) : !selectedDraw && activeTab !== 'reporte' ? (
            <div className="text-center py-12 text-gray-500">
              Selecciona un juego y sorteo para ver los datos
            </div>
          ) : (
            <>
              {/* Tab Bancas */}
              {activeTab === 'bancas' && bancaStats && (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <span className="text-lg font-semibold">{bancaStats.game}</span>
                      <span className="ml-2 text-gray-500">{formatTime(bancaStats.scheduledAt)}</span>
                    </div>
                    {bancaStats.winnerItem && (
                      <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">
                        Ganador: {bancaStats.winnerItem.number} - {bancaStats.winnerItem.name}
                      </div>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID Banca</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monto Jugado</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Premio</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tickets</th>
                          <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {bancaStats.bancas.map((banca, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{banca.externalId}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{banca.name || '-'}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900">{formatCurrency(banca.totalAmount)}</td>
                            <td className="px-4 py-3 text-sm text-right text-green-600">{formatCurrency(banca.totalPrize)}</td>
                            <td className="px-4 py-3 text-sm text-right text-gray-500">{banca.ticketCount}</td>
                            <td className="px-4 py-3 text-center">
                              <button
                                onClick={() => handleViewTicketsByBanca(banca.externalId)}
                                className="text-blue-600 hover:text-blue-800"
                              >
                                <Eye className="w-4 h-4" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab Números */}
              {activeTab === 'numeros' && itemStats && (
                <div>
                  <div className="mb-4 flex items-center justify-between">
                    <div>
                      <span className="text-lg font-semibold">{itemStats.game}</span>
                      <span className="ml-2 text-gray-500">{formatTime(itemStats.scheduledAt)}</span>
                      <span className="ml-4 text-sm text-gray-600">
                        Total vendido: {formatCurrency(itemStats.totalSales)}
                      </span>
                    </div>
                    {itemStats.winnerItem && (
                      <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">
                        Ganador: {itemStats.winnerItem.number} - {itemStats.winnerItem.name}
                      </div>
                    )}
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                          <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                          <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Apostado</th>
                          <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tickets</th>
                          <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Premio Pot.</th>
                          <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">% Venta</th>
                          <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tripletas</th>
                          <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Premio Trip.</th>
                          <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Premio</th>
                          <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {itemStats.items.map((item, idx) => {
                          const isDangerous = item.totalPotentialPrize > itemStats.totalSales * 0.7;
                          return (
                            <tr key={idx} className={`hover:bg-gray-50 ${isDangerous ? 'bg-red-50' : ''}`}>
                              <td className="px-3 py-2 text-sm font-bold text-gray-900">{item.number}</td>
                              <td className="px-3 py-2 text-sm text-gray-500">{item.name}</td>
                              <td className="px-3 py-2 text-sm text-right text-gray-900">{formatCurrency(item.totalAmount)}</td>
                              <td className="px-3 py-2 text-sm text-right text-gray-500">{item.ticketCount}</td>
                              <td className="px-3 py-2 text-sm text-right text-blue-600">{formatCurrency(item.potentialPrize)}</td>
                              <td className="px-3 py-2 text-sm text-right text-gray-500">{item.percentageOfSales}%</td>
                              <td className="px-3 py-2 text-sm text-right">
                                {item.tripletaCount > 0 ? (
                                  <span className="text-purple-600 font-medium">{item.tripletaCount}</span>
                                ) : (
                                  <span className="text-gray-400">0</span>
                                )}
                              </td>
                              <td className="px-3 py-2 text-sm text-right text-purple-600">{formatCurrency(item.tripletaPrize)}</td>
                              <td className={`px-3 py-2 text-sm text-right font-bold ${isDangerous ? 'text-red-600' : 'text-gray-900'}`}>
                                {formatCurrency(item.totalPotentialPrize)}
                                {isDangerous && <AlertTriangle className="w-4 h-4 inline ml-1" />}
                              </td>
                              <td className="px-3 py-2 text-center">
                                <div className="flex items-center justify-center gap-2">
                                  <button
                                    onClick={() => handleViewTicketsByItem(item.itemId)}
                                    className="text-blue-600 hover:text-blue-800"
                                    title="Ver tickets"
                                  >
                                    <Eye className="w-4 h-4" />
                                  </button>
                                  {item.tripletaCount > 0 && (
                                    <button
                                      onClick={() => handleViewTripletas(item.itemId)}
                                      className="text-purple-600 hover:text-purple-800"
                                      title="Ver tripletas"
                                    >
                                      <Layers className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Tab Reporte */}
              {activeTab === 'reporte' && dailyReport && (
                <div>
                  <div className="mb-4 grid grid-cols-2 md:grid-cols-5 gap-4">
                    <div className="bg-blue-50 rounded-lg p-4">
                      <p className="text-sm text-blue-600">Total Vendido</p>
                      <p className="text-xl font-bold text-blue-800">{formatCurrency(dailyReport.totals.totalSales)}</p>
                    </div>
                    <div className="bg-green-50 rounded-lg p-4">
                      <p className="text-sm text-green-600">Total Premios</p>
                      <p className="text-xl font-bold text-green-800">{formatCurrency(dailyReport.totals.totalPrize)}</p>
                    </div>
                    <div className={`rounded-lg p-4 ${dailyReport.totals.totalBalance >= 0 ? 'bg-emerald-50' : 'bg-red-50'}`}>
                      <p className={`text-sm ${dailyReport.totals.totalBalance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>Balance</p>
                      <p className={`text-xl font-bold ${dailyReport.totals.totalBalance >= 0 ? 'text-emerald-800' : 'text-red-800'}`}>
                        {formatCurrency(dailyReport.totals.totalBalance)}
                      </p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm text-gray-600">Sorteos</p>
                      <p className="text-xl font-bold text-gray-800">{dailyReport.totals.drawCount}</p>
                    </div>
                    <div className="bg-gray-50 rounded-lg p-4">
                      <p className="text-sm text-gray-600">Tickets</p>
                      <p className="text-xl font-bold text-gray-800">{dailyReport.totals.totalTickets}</p>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="min-w-full divide-y divide-gray-200">
                      <thead className="bg-gray-50">
                        <tr>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hora</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Juego</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                          <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ganador</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Jugado</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Premio</th>
                          <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white divide-y divide-gray-200">
                        {dailyReport.draws.map((draw, idx) => (
                          <tr key={idx} className="hover:bg-gray-50">
                            <td className="px-4 py-3 text-sm font-medium text-gray-900">{formatTime(draw.scheduledAt)}</td>
                            <td className="px-4 py-3 text-sm text-gray-500">{draw.game}</td>
                            <td className="px-4 py-3 text-sm">
                              <span className={`px-2 py-1 rounded-full text-xs ${
                                draw.status === 'PUBLISHED' ? 'bg-green-100 text-green-800' :
                                draw.status === 'DRAWN' ? 'bg-blue-100 text-blue-800' :
                                draw.status === 'CLOSED' ? 'bg-yellow-100 text-yellow-800' :
                                'bg-gray-100 text-gray-800'
                              }`}>
                                {draw.status}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-sm text-gray-900">
                              {draw.winnerItem ? `${draw.winnerItem.number} - ${draw.winnerItem.name}` : '-'}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-gray-900">{formatCurrency(draw.totalSales)}</td>
                            <td className="px-4 py-3 text-sm text-right text-green-600">{formatCurrency(draw.totalPrize)}</td>
                            <td className={`px-4 py-3 text-sm text-right font-medium ${draw.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                              {formatCurrency(draw.balance)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modal de Tickets */}
      {ticketsModal.open && ticketsModal.data && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">
                {ticketsModal.type === 'banca' 
                  ? `Tickets de Banca ${ticketsModal.data.bancaExternalId}`
                  : `Tickets de ${ticketsModal.data.item?.number} - ${ticketsModal.data.item?.name}`
                }
              </h3>
              <button onClick={() => setTicketsModal({ open: false, data: null, type: null })} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="mb-4 text-sm text-gray-600">
                Total: {ticketsModal.data.ticketCount} tickets | {formatCurrency(ticketsModal.data.totalAmount)}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ticket</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monto</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario/Taquilla</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha/Hora</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {ticketsModal.data.tickets.map((ticket, idx) => (
                      <tr key={idx} className="hover:bg-gray-50">
                        <td className="px-4 py-3 text-sm">
                          <span className="font-mono font-semibold text-gray-900">
                            {ticket.externalTicketId || ticket.id?.slice(0, 8)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-green-600">
                          {formatCurrency(ticket.totalAmount)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {ticket.taquillaId ? `Taquilla ${ticket.taquillaId}` : ticket.bancaId ? `Banca ${ticket.bancaId}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('es-VE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          }) : '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleViewTicketDetail(ticket)}
                            className="text-blue-600 hover:text-blue-800"
                            title="Ver detalle"
                          >
                            <Eye className="w-4 h-4 inline" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal de Tripletas */}
      {tripletasModal.open && tripletasModal.data && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-5xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">
                Tripletas con {tripletasModal.data.item?.number} - {tripletasModal.data.item?.name}
              </h3>
              <button onClick={() => setTripletasModal({ open: false, data: null })} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              <div className="mb-4 text-sm text-gray-600">
                Total: {tripletasModal.data.tripletaCount} tripletas | Premio potencial: {formatCurrency(tripletasModal.data.totalPotentialPrize)}
              </div>
              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">ID</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Monto</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Fecha/Hora</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
                      <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acción</th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {tripletasModal.data.tripletas.map((tripleta, idx) => (
                      <tr key={idx} className={`hover:bg-gray-50 ${
                        tripleta.dangerLevel === 'high' ? 'bg-red-50' : 
                        tripleta.dangerLevel === 'medium' ? 'bg-yellow-50' : ''
                      }`}>
                        <td className="px-4 py-3 text-sm">
                          <span className="font-mono font-semibold text-gray-900">
                            {tripleta.id.substring(0, 8)}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-sm text-right font-bold text-purple-600">
                          {formatCurrency(tripleta.amount)} × {tripleta.multiplier}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {tripleta.username || '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {tripleta.createdAt ? new Date(tripleta.createdAt).toLocaleString('es-VE', {
                            day: '2-digit',
                            month: '2-digit',
                            year: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit'
                          }) : '-'}
                        </td>
                        <td className="px-4 py-3 text-center">
                          <span className={`text-xs font-medium ${
                            tripleta.numbersRemaining === 0 ? 'text-green-600' : 
                            tripleta.numbersRemaining === 1 ? 'text-red-600' : 
                            'text-gray-600'
                          }`}>
                            {tripleta.numbersRemaining === 0 ? '🏆 Completa' : 
                             tripleta.numbersRemaining === 1 ? '⚠️ Falta 1' : 
                             `Faltan ${tripleta.numbersRemaining}`}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-center">
                          <button
                            onClick={() => handleViewTripletaDetail(tripleta)}
                            className="text-purple-600 hover:text-purple-800"
                            title="Ver detalle"
                          >
                            <Eye className="w-4 h-4 inline" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </div>
      )}

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
                  <p className="font-mono text-lg font-bold">{ticketDetailModal.data.externalTicketId || ticketDetailModal.data.id}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Monto Total</label>
                  <p className="text-lg font-bold text-green-600">{formatCurrency(ticketDetailModal.data.totalAmount)}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase">Comercial</label>
                  <p className="font-medium">{ticketDetailModal.data.comercialId}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Banca</label>
                  <p className="font-medium">{ticketDetailModal.data.bancaId}</p>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase">Grupo</label>
                  <p className="font-medium">{ticketDetailModal.data.grupoId}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Taquilla</label>
                  <p className="font-medium">{ticketDetailModal.data.taquillaId}</p>
                </div>
              </div>
              {ticketDetailModal.data.createdAt && (
                <div>
                  <label className="text-xs text-gray-500 uppercase">Hora de Registro</label>
                  <p className="font-medium">{formatTime(ticketDetailModal.data.createdAt)}</p>
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
                            <p className="font-bold text-lg">{detail.number}</p>
                            {detail.name && <p className="text-sm text-gray-600">{detail.name}</p>}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600">{formatCurrency(detail.amount)}</p>
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

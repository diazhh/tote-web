'use client';

import { useState, useEffect } from 'react';
import { 
  Building2, Hash, FileText, Calendar, Gamepad2, Clock,
  DollarSign, Trophy, Ticket, AlertTriangle, ChevronRight,
  X, Eye, Layers
} from 'lucide-react';
import ResponsiveTable from '@/components/common/ResponsiveTable';
import ResponsiveTabs from '@/components/common/ResponsiveTabs';
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
        <ResponsiveTabs
          tabs={[
            { key: 'bancas', label: 'Bancas', icon: <Building2 className="w-4 h-4" /> },
            { key: 'numeros', label: 'Números', icon: <Hash className="w-4 h-4" /> },
            { key: 'reporte', label: 'Reporte', icon: <FileText className="w-4 h-4" /> }
          ]}
          activeTab={activeTab}
          onChange={setActiveTab}
        />

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
                  <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
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
                  <ResponsiveTable
                    data={bancaStats.bancas}
                    columns={[
                      { key: 'externalId', label: 'ID Banca', primary: true, render: (b) => <span className="font-medium">{b.externalId}</span> },
                      { key: 'name', label: 'Nombre', render: (b) => b.name || '-' },
                      { key: 'totalAmount', label: 'Monto Jugado', align: 'right', render: (b) => formatCurrency(b.totalAmount) },
                      { key: 'totalPrize', label: 'Premio', align: 'right', render: (b) => <span className="text-green-600">{formatCurrency(b.totalPrize)}</span> },
                      { key: 'ticketCount', label: 'Tickets', align: 'right' }
                    ]}
                    actions={(banca) => (
                      <button
                        onClick={() => handleViewTicketsByBanca(banca.externalId)}
                        className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg"
                        title="Ver tickets"
                      >
                        <Eye className="w-4 h-4" />
                      </button>
                    )}
                    emptyMessage="No hay datos de bancas"
                  />
                </div>
              )}

              {/* Tab Números */}
              {activeTab === 'numeros' && itemStats && (
                <div>
                  <div className="mb-4 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <div>
                      <span className="text-lg font-semibold">{itemStats.game}</span>
                      <span className="ml-2 text-gray-500">{formatTime(itemStats.scheduledAt)}</span>
                      <span className="ml-4 text-sm text-gray-600">
                        Total: {formatCurrency(itemStats.totalSales)}
                      </span>
                    </div>
                    {itemStats.winnerItem && (
                      <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">
                        Ganador: {itemStats.winnerItem.number} - {itemStats.winnerItem.name}
                      </div>
                    )}
                  </div>

                  {/* Alerta de tripletas que se completarían */}
                  {itemStats.items.some(i => i.tripletaCount > 0 && i.wouldCompleteTripletaCount > 0) && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4 mb-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-red-800">¡Atención! Hay tripletas que se completarían</p>
                          <p className="text-sm text-red-700 mt-1">
                            Los siguientes números completarían tripletas si salen como ganadores:
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {itemStats.items
                              .filter(i => i.wouldCompleteTripletaCount > 0)
                              .sort((a, b) => b.tripletaPrize - a.tripletaPrize)
                              .map((item, idx) => (
                                <span key={idx} className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                                  {item.number} - {item.name} ({item.wouldCompleteTripletaCount} tripletas = {formatCurrency(item.tripletaPrize)})
                                </span>
                              ))
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Alerta alternativa si hay tripletas con alto riesgo (premio > 70% de ventas) */}
                  {!itemStats.items.some(i => i.wouldCompleteTripletaCount > 0) && 
                   itemStats.items.some(i => i.tripletaCount > 0 && i.tripletaPrize > itemStats.totalSales * 0.5) && (
                    <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-4">
                      <div className="flex items-start gap-3">
                        <AlertTriangle className="w-6 h-6 text-yellow-600 flex-shrink-0 mt-0.5" />
                        <div>
                          <p className="font-bold text-yellow-800">⚠️ Números con alto riesgo de tripletas</p>
                          <p className="text-sm text-yellow-700 mt-1">
                            Los siguientes números tienen tripletas con premios significativos:
                          </p>
                          <div className="flex flex-wrap gap-2 mt-2">
                            {itemStats.items
                              .filter(i => i.tripletaCount > 0 && i.tripletaPrize > itemStats.totalSales * 0.5)
                              .sort((a, b) => b.tripletaPrize - a.tripletaPrize)
                              .map((item, idx) => (
                                <span key={idx} className="px-3 py-1 bg-yellow-100 text-yellow-800 rounded-full text-sm font-medium">
                                  {item.number} - {item.name} ({item.tripletaCount} tripletas = {formatCurrency(item.tripletaPrize)})
                                </span>
                              ))
                            }
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  <ResponsiveTable
                    data={[...itemStats.items].sort((a, b) => parseInt(a.number) - parseInt(b.number))}
                    rowClassName={(item) => item.totalPotentialPrize > itemStats.totalSales * 0.7 ? 'bg-red-50' : ''}
                    cardClassName={(item) => item.totalPotentialPrize > itemStats.totalSales * 0.7 ? 'border-red-300 bg-red-50' : ''}
                    columns={[
                      { key: 'number', label: '#', primary: true, render: (i) => <span className="font-bold">{i.number}</span> },
                      { key: 'name', label: 'Nombre' },
                      { key: 'totalAmount', label: 'Apostado', align: 'right', render: (i) => formatCurrency(i.totalAmount) },
                      { key: 'ticketCount', label: 'Tickets', align: 'right' },
                      { key: 'potentialPrize', label: 'Premio Pot.', align: 'right', render: (i) => <span className="text-blue-600">{formatCurrency(i.potentialPrize)}</span> },
                      { key: 'percentageOfSales', label: '% Venta', align: 'right', render: (i) => `${i.percentageOfSales}%` },
                      { key: 'tripletaCount', label: 'Tripletas', align: 'right', render: (i) => i.tripletaCount > 0 ? <span className="text-purple-600 font-medium">{i.tripletaCount}</span> : <span className="text-gray-400">0</span> },
                      { key: 'tripletaPrize', label: 'Premio Trip.', align: 'right', render: (i) => <span className="text-purple-600">{formatCurrency(i.tripletaPrize)}</span> },
                      { 
                        key: 'totalPotentialPrize', 
                        label: 'Total Premio', 
                        align: 'right', 
                        render: (i) => {
                          const isDangerous = i.totalPotentialPrize > itemStats.totalSales * 0.7;
                          return (
                            <span className={`font-bold ${isDangerous ? 'text-red-600' : 'text-gray-900'}`}>
                              {formatCurrency(i.totalPotentialPrize)}
                              {isDangerous && <AlertTriangle className="w-4 h-4 inline ml-1" />}
                            </span>
                          );
                        }
                      }
                    ]}
                    actions={(item) => (
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => handleViewTicketsByItem(item.itemId)}
                          className="p-2 text-blue-600 hover:text-blue-800 hover:bg-blue-50 rounded-lg"
                          title="Ver tickets"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        {item.tripletaCount > 0 && (
                          <button
                            onClick={() => handleViewTripletas(item.itemId)}
                            className="p-2 text-purple-600 hover:text-purple-800 hover:bg-purple-50 rounded-lg"
                            title="Ver tripletas"
                          >
                            <Layers className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                    emptyMessage="No hay datos de números"
                  />
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
                  <ResponsiveTable
                    data={dailyReport.draws}
                    columns={[
                      { key: 'scheduledAt', label: 'Hora', primary: true, render: (d) => <span className="font-medium">{formatTime(d.scheduledAt)}</span> },
                      { key: 'game', label: 'Juego' },
                      { 
                        key: 'status', 
                        label: 'Estado', 
                        render: (d) => (
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            d.status === 'PUBLISHED' ? 'bg-green-100 text-green-800' :
                            d.status === 'DRAWN' ? 'bg-blue-100 text-blue-800' :
                            d.status === 'CLOSED' ? 'bg-yellow-100 text-yellow-800' :
                            'bg-gray-100 text-gray-800'
                          }`}>
                            {d.status}
                          </span>
                        )
                      },
                      { key: 'winnerItem', label: 'Ganador', render: (d) => d.winnerItem ? `${d.winnerItem.number} - ${d.winnerItem.name}` : '-' },
                      { key: 'totalSales', label: 'Jugado', align: 'right', render: (d) => formatCurrency(d.totalSales) },
                      { key: 'totalPrize', label: 'Premio', align: 'right', render: (d) => <span className="text-green-600">{formatCurrency(d.totalPrize)}</span> },
                      { 
                        key: 'balance', 
                        label: 'Balance', 
                        align: 'right', 
                        render: (d) => (
                          <span className={`font-medium ${d.balance >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                            {formatCurrency(d.balance)}
                          </span>
                        )
                      }
                    ]}
                    emptyMessage="No hay datos del reporte"
                  />
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
                      <div key={idx} className={`flex items-center justify-between p-3 rounded-lg border ${
                        detail.status === 'WON' ? 'bg-green-50 border-green-300' : 
                        detail.status === 'LOST' ? 'bg-gray-50 border-gray-200' : 
                        'bg-white border-gray-200'
                      }`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-10 h-10 rounded-full flex items-center justify-center font-bold text-lg ${
                            detail.status === 'WON' ? 'bg-green-600 text-white' : 'bg-blue-600 text-white'
                          }`}>
                            {detail.number || detail.gameItem?.number}
                          </div>
                          <div>
                            <p className="font-bold text-lg">{detail.name || detail.gameItem?.name || ''}</p>
                            {/* Mostrar juego si está disponible */}
                            {detail.game?.name && (
                              <p className="text-xs text-blue-600 font-medium flex items-center gap-1">
                                <Gamepad2 className="w-3 h-3" />
                                {detail.game.name}
                              </p>
                            )}
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-bold text-green-600">{formatCurrency(detail.amount)}</p>
                          {detail.status && (
                            <span className={`text-xs px-2 py-0.5 rounded-full ${
                              detail.status === 'WON' ? 'bg-green-100 text-green-800' :
                              detail.status === 'LOST' ? 'bg-red-100 text-red-800' :
                              'bg-blue-100 text-blue-800'
                            }`}>
                              {detail.status === 'WON' ? 'Ganador' : detail.status === 'LOST' ? 'Perdedor' : 'Activo'}
                            </span>
                          )}
                          {detail.status === 'WON' && detail.prize && (
                            <p className="text-sm text-green-600 font-semibold mt-1">Premio: {formatCurrency(detail.prize)}</p>
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

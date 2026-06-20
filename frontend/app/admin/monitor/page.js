'use client';

import { useState, useEffect, useMemo } from 'react';
import {
  Building2, Hash, FileText, Calendar, Gamepad2, Clock,
  DollarSign, Trophy, Ticket, AlertTriangle, ChevronRight,
  X, Eye, Layers, Shield, Search, ArrowUp, ArrowDown, ChevronDown,
  Filter
} from 'lucide-react';
import ResponsiveTable from '@/components/common/ResponsiveTable';
import ResponsiveTabs from '@/components/common/ResponsiveTabs';
import { toast } from 'sonner';
import monitorApi from '@/lib/api/monitor';
import numberHistoryApi from '@/lib/api/number-history';
import axios from '@/lib/api/axios';
import quotaApi from '@/lib/api/quota';
import QuotaModal from './QuotaModal';
import BlockItemModal from './BlockItemModal';
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
  const [numberHistoryModal, setNumberHistoryModal] = useState({ open: false, number: null, history: null, loading: false });
  const [lastSeenData, setLastSeenData] = useState({});
  const [caidaInfo, setCaidaInfo] = useState(null);
  const [quotas, setQuotas] = useState([]);
  const [quotaModal, setQuotaModal] = useState({ open: false, item: null });
  const [blockItemModalOpen, setBlockItemModalOpen] = useState(false);

  // Mobile UI state for Números tab
  const [numbersSearch, setNumbersSearch] = useState('');
  const [numbersFilter, setNumbersFilter] = useState('all'); // 'all' | 'with-tickets' | 'high-risk'
  const [numbersSortBy, setNumbersSortBy] = useState('number'); // number | amount | prize | tripletas | lastSeen
  const [numbersSortDir, setNumbersSortDir] = useState('asc');
  const [expandedItemId, setExpandedItemId] = useState(null);

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

  // Auto-refresh cada 90s para que los admins vean las jugadas
  // sin tener que recargar manualmente. Solo aplica si hay un sorteo
  // seleccionado y la pestaña no es 'reporte' (que tiene su propia recarga).
  useEffect(() => {
    if (!selectedDraw || activeTab === 'reporte') return;
    const id = setInterval(() => { fetchData(); }, 90_000);
    return () => clearInterval(id);
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
        // Sort draws by drawDate and drawTime
        const sortedDraws = [...drawsList].sort((a, b) => {
          if (a.drawDate !== b.drawDate) {
            return new Date(a.drawDate) - new Date(b.drawDate);
          }
          return a.drawTime.localeCompare(b.drawTime);
        });
        
        // Get current time in Venezuela
        const now = new Date();
        const currentHours = now.getHours();
        const currentMinutes = now.getMinutes();
        const currentTime = `${String(currentHours).padStart(2, '0')}:${String(currentMinutes).padStart(2, '0')}:00`;
        
        // Find the next draw that hasn't happened yet (SCHEDULED or CLOSED status)
        let nextDraw = sortedDraws.find(draw => {
          return (draw.status === 'SCHEDULED' || draw.status === 'CLOSED') && draw.drawTime >= currentTime;
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
        setCaidaInfo(null);
        const [statsResult, quotasResult] = await Promise.all([
          monitorApi.getItemStats(selectedDraw),
          quotaApi.getDrawQuotas(selectedDraw).catch(() => ({ data: [] })),
        ]);
        setItemStats(statsResult.data);
        setQuotas(quotasResult.data || []);

        // Fetch last seen data for all numbers
        if (selectedGame) {
          try {
            const lastSeenResult = await numberHistoryApi.getAllLastSeen(selectedGame);
            setLastSeenData(lastSeenResult.data || {});
          } catch (error) {
            console.error('Error loading last seen data:', error);
          }
        }

        try {
          const caidaRes = await monitorApi.getCaidas(selectedDraw);
          setCaidaInfo(caidaRes?.data || null);
        } catch {
          setCaidaInfo(null);
        }
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

  const handleViewNumberHistory = async (number) => {
    setNumberHistoryModal({ open: true, number, history: null, loading: true });
    try {
      const result = await numberHistoryApi.getHistory(selectedGame, number, 10);
      setNumberHistoryModal({ open: true, number, history: result.data, loading: false });
    } catch (error) {
      toast.error('Error cargando historial');
      setNumberHistoryModal({ open: false, number: null, history: null, loading: false });
    }
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

  const formatTime = (timeStr) => {
    // timeStr ya viene en formato "HH:MM:SS", solo extraer HH:MM
    if (!timeStr) return '-';
    const [hours, minutes] = timeStr.split(':');
    return `${hours}:${minutes}`;
  };

  const quotaByItem = useMemo(
    () => new Map(quotas.map((q) => [q.gameItemId, q])),
    [quotas]
  );
  const getQuota = (itemId) => quotaByItem.get(itemId) || null;

  const currentDraw = draws.find((d) => d.id === selectedDraw);
  const canEditQuota = currentDraw && (currentDraw.status === 'SCHEDULED' || currentDraw.status === 'CLOSED');

  const caidaByNumber = useMemo(() => {
    const m = new Map();
    if (caidaInfo?.caidas) for (const c of caidaInfo.caidas) m.set(c.number, c);
    return m;
  }, [caidaInfo]);

  // Lista de items a mostrar = ventas reales + filas sintéticas (en cero) para
  // las caídas sin apuestas, para que TODAS las caídas se vean en la tabla.
  const displayItems = useMemo(() => {
    const base = itemStats?.items || [];
    if (!caidaInfo?.caidas?.length) return base;
    const present = new Set(base.map((i) => i.number));
    const extra = caidaInfo.caidas
      .filter((c) => !present.has(c.number))
      .map((c) => ({
        itemId: c.itemId || `caida-${c.number}`,
        number: c.number,
        name: c.name,
        multiplier: c.multiplier ?? 0,
        totalAmount: 0,
        ticketCount: 0,
        potentialPrize: 0,
        totalPotentialPrize: 0,
        percentageOfSales: 0,
        tripletaCount: 0,
        tripletaPrize: 0,
        wouldCompleteTripletaCount: 0,
      }));
    return extra.length ? [...base, ...extra] : base;
  }, [itemStats, caidaInfo]);

  // Filtered + sorted items for the mobile Números view
  const filteredSortedItems = useMemo(() => {
    if (!displayItems.length) return [];
    let arr = displayItems;
    const totalSales = itemStats.totalSales || 0;
    const dangerThreshold = totalSales * 0.7;

    if (numbersSearch.trim()) {
      const q = numbersSearch.trim().toLowerCase();
      arr = arr.filter((i) =>
        String(i.number).toLowerCase().includes(q) ||
        (i.name || '').toLowerCase().includes(q)
      );
    }
    if (numbersFilter === 'with-tickets') {
      arr = arr.filter((i) => (i.ticketCount || 0) > 0);
    } else if (numbersFilter === 'high-risk') {
      arr = arr.filter((i) => {
        const q = quotaByItem.get(i.itemId);
        return q?.exceeded || i.totalPotentialPrize > dangerThreshold;
      });
    }

    const dir = numbersSortDir === 'asc' ? 1 : -1;
    const sorted = [...arr].sort((a, b) => {
      switch (numbersSortBy) {
        case 'amount':
          return ((a.totalAmount || 0) - (b.totalAmount || 0)) * dir;
        case 'prize':
          return ((a.totalPotentialPrize || 0) - (b.totalPotentialPrize || 0)) * dir;
        case 'tripletas':
          return ((a.tripletaCount || 0) - (b.tripletaCount || 0)) * dir;
        case 'lastSeen': {
          const la = lastSeenData[a.number];
          const lb = lastSeenData[b.number];
          const da = la?.neverSeen ? Number.POSITIVE_INFINITY : (la?.daysAgo ?? -1);
          const db = lb?.neverSeen ? Number.POSITIVE_INFINITY : (lb?.daysAgo ?? -1);
          return (da - db) * dir;
        }
        case 'number':
        default: {
          const na = parseInt(a.number, 10);
          const nb = parseInt(b.number, 10);
          if (Number.isFinite(na) && Number.isFinite(nb)) return (na - nb) * dir;
          return String(a.number).localeCompare(String(b.number)) * dir;
        }
      }
    });
    return sorted;
  }, [displayItems, itemStats, numbersSearch, numbersFilter, numbersSortBy, numbersSortDir, lastSeenData, quotaByItem]);

  const toggleNumberSort = (field) => {
    if (numbersSortBy === field) {
      setNumbersSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setNumbersSortBy(field);
      setNumbersSortDir(field === 'number' ? 'asc' : 'desc');
    }
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
                  {formatTime(draw.drawTime)} - {draw.status}
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
                      <span className="ml-2 text-gray-500">{formatTime(bancaStats.drawTime)}</span>
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
                      <span className="ml-2 text-gray-500">{formatTime(itemStats.drawTime)}</span>
                      <span className="ml-4 text-sm text-gray-600">
                        Total: {formatCurrency(itemStats.totalSales)}
                      </span>
                    </div>
                    <div className="flex items-center gap-2">
                      {canEditQuota && (
                        <button
                          onClick={() => setBlockItemModalOpen(true)}
                          className="px-3 py-1.5 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 text-sm flex items-center gap-1.5"
                          title="Bloquear o establecer cupo para cualquier número del juego"
                        >
                          <Shield className="w-4 h-4" />
                          Bloquear número
                        </button>
                      )}
                      {itemStats.winnerItem && (
                        <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm">
                          Ganador: {itemStats.winnerItem.number} - {itemStats.winnerItem.name}
                        </div>
                      )}
                    </div>
                  </div>

                  {caidaInfo?.previousDraw?.winner && (
                    <div className="mb-4 text-sm text-purple-700 bg-purple-50 border border-purple-200 rounded-lg px-3 py-2">
                      🔮 Caídas de <b>{caidaInfo.previousDraw.winner.name} ({caidaInfo.previousDraw.winner.number})</b> — marcadas en la tabla
                      {caidaInfo.preselectedEnCaidas && <span className="ml-2 text-green-700">✅ el ganador/preseleccionado coincide</span>}
                    </div>
                  )}

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

                  {/* Mobile UI: compact expandable cards with search, filters, sort */}
                  <div className="md:hidden space-y-3">
                    {/* Search */}
                    <div className="relative">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 pointer-events-none" />
                      <input
                        type="text"
                        value={numbersSearch}
                        onChange={(e) => setNumbersSearch(e.target.value)}
                        placeholder="Buscar número o nombre..."
                        className="w-full pl-9 pr-9 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500"
                      />
                      {numbersSearch && (
                        <button
                          type="button"
                          onClick={() => setNumbersSearch('')}
                          className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-gray-600"
                          aria-label="Limpiar búsqueda"
                        >
                          <X className="w-4 h-4" />
                        </button>
                      )}
                    </div>

                    {/* Filter chips */}
                    <div className="flex flex-wrap gap-2 items-center">
                      <Filter className="w-3.5 h-3.5 text-gray-400" />
                      {[
                        { v: 'all', l: 'Todos' },
                        { v: 'with-tickets', l: 'Con tickets' },
                        { v: 'high-risk', l: 'Alto riesgo' },
                      ].map(({ v, l }) => {
                        const active = numbersFilter === v;
                        return (
                          <button
                            key={v}
                            type="button"
                            onClick={() => setNumbersFilter(v)}
                            className={`px-2.5 py-1 rounded-full text-xs font-medium border transition ${
                              active
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-700 border-gray-300'
                            }`}
                          >
                            {l}
                          </button>
                        );
                      })}
                    </div>

                    {/* Sort buttons (horizontal scroll if needed) */}
                    <div className="flex gap-1.5 items-center overflow-x-auto pb-1 -mx-1 px-1">
                      <span className="text-[10px] font-semibold text-gray-500 uppercase shrink-0">Orden:</span>
                      {[
                        { f: 'number', l: '#' },
                        { f: 'amount', l: 'Apostado' },
                        { f: 'prize', l: 'Premio' },
                        { f: 'tripletas', l: 'Tripletas' },
                        { f: 'lastSeen', l: 'Último' },
                      ].map(({ f, l }) => {
                        const active = numbersSortBy === f;
                        return (
                          <button
                            key={f}
                            type="button"
                            onClick={() => toggleNumberSort(f)}
                            className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-md text-xs border shrink-0 transition ${
                              active
                                ? 'bg-blue-600 text-white border-blue-600'
                                : 'bg-white text-gray-700 border-gray-300'
                            }`}
                          >
                            {l}
                            {active && (numbersSortDir === 'asc'
                              ? <ArrowUp className="w-3 h-3" />
                              : <ArrowDown className="w-3 h-3" />)}
                          </button>
                        );
                      })}
                    </div>

                    {/* Count summary */}
                    <div className="text-xs text-gray-500 px-1">
                      {filteredSortedItems.length} de {itemStats.items.length} números
                      {(numbersSearch || numbersFilter !== 'all') && (
                        <button
                          type="button"
                          onClick={() => { setNumbersSearch(''); setNumbersFilter('all'); }}
                          className="ml-2 text-blue-600 hover:underline"
                        >
                          Limpiar
                        </button>
                      )}
                    </div>

                    {/* Cards */}
                    {filteredSortedItems.length === 0 ? (
                      <div className="text-center py-10 text-gray-500 bg-white rounded-lg border text-sm">
                        No hay números que coincidan
                      </div>
                    ) : (
                      <ul className="space-y-2">
                        {filteredSortedItems.map((item) => {
                          const q = getQuota(item.itemId);
                          const isDangerous = item.totalPotentialPrize > itemStats.totalSales * 0.7;
                          const exceeded = q?.exceeded;
                          const expanded = expandedItemId === item.itemId;
                          const lastSeen = lastSeenData[item.number];
                          const isWinner = itemStats.winnerItem?.number === item.number;
                          const caida = caidaByNumber.get(item.number);
                          return (
                            <li
                              key={item.itemId}
                              className={`bg-white rounded-lg border overflow-hidden ${
                                isWinner ? 'border-green-400 bg-green-50' :
                                exceeded ? 'border-red-400 bg-red-50' :
                                isDangerous ? 'border-red-200 bg-red-50/50' :
                                'border-gray-200'
                              }`}
                            >
                              <button
                                type="button"
                                onClick={() => setExpandedItemId(expanded ? null : item.itemId)}
                                className="w-full px-3 py-2.5 flex items-center gap-3 text-left active:bg-gray-50 transition"
                              >
                                <div className={`shrink-0 w-11 h-11 rounded-md flex items-center justify-center ${
                                  isWinner ? 'bg-green-600 text-white' : 'bg-gray-100 text-gray-900'
                                }`}>
                                  <span className="font-mono font-bold text-base">{item.number}</span>
                                </div>
                                <div className="min-w-0 flex-1">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-sm font-semibold text-gray-800 truncate">{item.name}</span>
                                    {isWinner && <Trophy className="w-3.5 h-3.5 text-green-600 shrink-0" />}
                                    {caida && (
                                      <span
                                        title={`Caída de ${caidaInfo?.previousDraw?.winner?.name} · ${caida.reason} · riesgo ${caida.riesgo}`}
                                        className="text-[11px] shrink-0"
                                      >
                                        🔮{caida.riesgo === 'ALTO' ? '🔴' : caida.riesgo === 'MEDIO' ? '🟡' : '🟢'}
                                      </span>
                                    )}
                                    {exceeded && (
                                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-red-600 text-white shrink-0 font-semibold">EXC</span>
                                    )}
                                    {!exceeded && isDangerous && (
                                      <AlertTriangle className="w-3.5 h-3.5 text-red-600 shrink-0" />
                                    )}
                                  </div>
                                  <div className="text-xs text-gray-500 mt-0.5 truncate">
                                    Apost. <span className="font-medium text-gray-800">{formatCurrency(item.totalAmount)}</span>
                                    {' · '}
                                    Premio <span className={`font-semibold ${isDangerous ? 'text-red-600' : 'text-gray-800'}`}>
                                      {formatCurrency(item.totalPotentialPrize)}
                                    </span>
                                  </div>
                                </div>
                                <ChevronDown className={`w-4 h-4 text-gray-400 shrink-0 transition-transform ${expanded ? 'rotate-180' : ''}`} />
                              </button>

                              {expanded && (
                                <div className="px-3 pb-3 border-t border-gray-100 pt-2.5 space-y-2.5 text-xs">
                                  <div className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                                    <div className="flex justify-between gap-2">
                                      <span className="text-gray-500">Tickets</span>
                                      <span className="font-medium text-gray-900">{item.ticketCount}</span>
                                    </div>
                                    <div className="flex justify-between gap-2">
                                      <span className="text-gray-500">% Venta</span>
                                      <span className="font-medium text-gray-900">{item.percentageOfSales}%</span>
                                    </div>
                                    <div className="flex justify-between gap-2">
                                      <span className="text-gray-500">Premio Pot.</span>
                                      <span className="font-medium text-blue-700">{formatCurrency(item.potentialPrize)}</span>
                                    </div>
                                    <div className="flex justify-between gap-2">
                                      <span className="text-gray-500">Tripletas</span>
                                      <span className={`font-medium ${item.tripletaCount > 0 ? 'text-purple-600' : 'text-gray-400'}`}>
                                        {item.tripletaCount}
                                      </span>
                                    </div>
                                    {item.tripletaCount > 0 && (
                                      <div className="flex justify-between gap-2 col-span-2">
                                        <span className="text-gray-500">Premio Trip.</span>
                                        <span className="font-medium text-purple-600">{formatCurrency(item.tripletaPrize)}</span>
                                      </div>
                                    )}
                                    <div className="flex justify-between gap-2">
                                      <span className="text-gray-500">Último</span>
                                      <span>
                                        {!lastSeen ? <span className="text-gray-400">—</span>
                                          : lastSeen.neverSeen ? <span className="text-gray-400">Nunca</span>
                                          : (
                                            <button
                                              type="button"
                                              onClick={(e) => { e.stopPropagation(); handleViewNumberHistory(item.number); }}
                                              className="text-blue-600 hover:underline font-medium"
                                            >
                                              {lastSeen.daysAgo === 0 ? 'Hoy' : lastSeen.daysAgo === 1 ? 'Ayer' : `${lastSeen.daysAgo}d`}
                                            </button>
                                          )}
                                      </span>
                                    </div>
                                    {q && q.maxAmount != null && (
                                      <>
                                        <div className="flex justify-between gap-2">
                                          <span className="text-gray-500">Cupo</span>
                                          <span className="font-medium text-gray-900">{formatCurrency(q.maxAmount)}</span>
                                        </div>
                                        <div className="flex justify-between gap-2 col-span-2">
                                          <span className="text-gray-500">Disponible</span>
                                          {q.exceeded ? (
                                            <span className="font-bold text-red-700">Excedido</span>
                                          ) : (
                                            <span className={`font-medium ${
                                              q.maxAmount > 0 && (q.availableAmount / q.maxAmount) > 0.2
                                                ? 'text-green-600'
                                                : 'text-yellow-600'
                                            }`}>
                                              {formatCurrency(q.availableAmount)}
                                            </span>
                                          )}
                                        </div>
                                      </>
                                    )}
                                    {caida && (
                                      <div className="flex justify-between gap-2 col-span-2">
                                        <span className="text-gray-500">Caída</span>
                                        <span className="font-medium text-purple-700">
                                          {caida.reason} · {caida.sorteosSinSalir == null ? 's/registro' : `${caida.sorteosSinSalir} sorteos`} · {caida.riesgo}
                                        </span>
                                      </div>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-1.5 pt-2 border-t border-gray-100">
                                    <button
                                      type="button"
                                      onClick={(e) => { e.stopPropagation(); handleViewTicketsByItem(item.itemId); }}
                                      className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-blue-200 bg-blue-50 text-blue-700 text-xs font-medium"
                                    >
                                      <Eye className="w-3.5 h-3.5" /> Tickets
                                    </button>
                                    {item.tripletaCount > 0 && (
                                      <button
                                        type="button"
                                        onClick={(e) => { e.stopPropagation(); handleViewTripletas(item.itemId); }}
                                        className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-purple-200 bg-purple-50 text-purple-700 text-xs font-medium"
                                      >
                                        <Layers className="w-3.5 h-3.5" /> Tripletas
                                      </button>
                                    )}
                                    {canEditQuota && (
                                      <button
                                        type="button"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          setQuotaModal({
                                            open: true,
                                            item: {
                                              gameItemId: item.itemId,
                                              number: item.number,
                                              name: item.name,
                                              maxAmount: q?.maxAmount ?? null,
                                              soldAmount: q?.soldAmount ?? item.totalAmount ?? 0,
                                            },
                                          });
                                        }}
                                        className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 rounded-md border border-indigo-200 bg-indigo-50 text-indigo-700 text-xs font-medium"
                                      >
                                        <Shield className="w-3.5 h-3.5" /> Cupo
                                      </button>
                                    )}
                                  </div>
                                </div>
                              )}
                            </li>
                          );
                        })}
                      </ul>
                    )}
                  </div>

                  {/* Desktop UI: original ResponsiveTable */}
                  <div className="hidden md:block">
                  <ResponsiveTable
                    data={[...displayItems].sort((a, b) => parseInt(a.number) - parseInt(b.number))}
                    rowClassName={(item) => {
                      const q = getQuota(item.itemId);
                      if (q?.exceeded) return 'bg-red-50';
                      if (item.totalPotentialPrize > itemStats.totalSales * 0.7) return 'bg-red-50';
                      if (caidaByNumber.has(item.number)) return 'bg-purple-50';
                      return '';
                    }}
                    cardClassName={(item) => {
                      const q = getQuota(item.itemId);
                      if (q?.exceeded) return 'border-red-300 bg-red-50';
                      if (item.totalPotentialPrize > itemStats.totalSales * 0.7) return 'border-red-300 bg-red-50';
                      if (caidaByNumber.has(item.number)) return 'border-purple-300 bg-purple-50';
                      return '';
                    }}
                    columns={[
                      { key: 'number', label: '#', primary: true, render: (i) => <span className="font-bold">{i.number}</span> },
                      { key: 'name', label: 'Nombre', render: (i) => {
                        const caida = caidaByNumber.get(i.number);
                        return (
                          <span className="inline-flex items-center gap-1">
                            {i.name}
                            {caida && (
                              <span title={`Caída de ${caidaInfo?.previousDraw?.winner?.name} · ${caida.reason} · riesgo ${caida.riesgo}`}>
                                🔮{caida.riesgo === 'ALTO' ? '🔴' : caida.riesgo === 'MEDIO' ? '🟡' : '🟢'}
                              </span>
                            )}
                          </span>
                        );
                      } },
                      { key: 'totalAmount', label: 'Apostado', align: 'right', render: (i) => formatCurrency(i.totalAmount) },
                      { key: 'ticketCount', label: 'Tickets', align: 'right' },
                      { key: 'potentialPrize', label: 'Premio Pot.', align: 'right', render: (i) => <span className="text-blue-600">{formatCurrency(i.potentialPrize)}</span> },
                      { key: 'percentageOfSales', label: '% Venta', align: 'right', render: (i) => `${i.percentageOfSales}%` },
                      { 
                        key: 'lastSeen', 
                        label: 'Último', 
                        align: 'right', 
                        render: (i) => {
                          const lastSeen = lastSeenData[i.number];
                          if (!lastSeen) return <span className="text-gray-400">-</span>;
                          if (lastSeen.neverSeen) return <span className="text-gray-400">Nunca</span>;
                          return (
                            <button
                              onClick={(e) => { e.stopPropagation(); handleViewNumberHistory(i.number); }}
                              className="text-blue-600 hover:text-blue-800 hover:underline"
                              title="Ver historial"
                            >
                              {lastSeen.daysAgo === 0 ? 'Hoy' : lastSeen.daysAgo === 1 ? 'Ayer' : `${lastSeen.daysAgo}d`}
                            </button>
                          );
                        }
                      },
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
                      },
                      {
                        key: 'cupo',
                        label: 'Cupo',
                        align: 'right',
                        render: (i) => {
                          const q = getQuota(i.itemId);
                          if (!q || q.maxAmount === null) return <span className="text-gray-400">—</span>;
                          return <span className="font-medium text-gray-900">{formatCurrency(q.maxAmount)}</span>;
                        },
                      },
                      {
                        key: 'disponible',
                        label: 'Disponible',
                        align: 'right',
                        render: (i) => {
                          const q = getQuota(i.itemId);
                          if (!q || q.maxAmount === null) return <span className="text-gray-400">—</span>;
                          if (q.exceeded) {
                            return (
                              <span className="inline-flex items-center gap-1 text-red-700 font-bold">
                                Excedido
                              </span>
                            );
                          }
                          const pct = q.maxAmount > 0 ? q.availableAmount / q.maxAmount : 0;
                          const color = pct > 0.2 ? 'text-green-600' : 'text-yellow-600';
                          return <span className={`font-medium ${color}`}>{formatCurrency(q.availableAmount)}</span>;
                        },
                      },
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
                        {canEditQuota && (
                          <button
                            onClick={() => {
                              const q = getQuota(item.itemId);
                              setQuotaModal({
                                open: true,
                                item: {
                                  gameItemId: item.itemId,
                                  number: item.number,
                                  name: item.name,
                                  maxAmount: q?.maxAmount ?? null,
                                  soldAmount: q?.soldAmount ?? item.totalAmount ?? 0,
                                },
                              });
                            }}
                            className="p-2 text-indigo-600 hover:text-indigo-800 hover:bg-indigo-50 rounded-lg"
                            title="Configurar cupo"
                          >
                            <Shield className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                    emptyMessage="No hay datos de números"
                  />
                  </div>
                </div>
              )}

              {/* Tab Reporte */}
              {activeTab === 'reporte' && dailyReport && (
                <div>
                  <div className="mb-4 grid grid-cols-1 sm:grid-cols-2 md:grid-cols-5 gap-2 sm:gap-4">
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
                      { key: 'drawTime', label: 'Hora', primary: true, render: (d) => <span className="font-medium">{formatTime(d.drawTime)}</span> },
                      { key: 'game', label: 'Juego' },
                      { 
                        key: 'status', 
                        label: 'Estado', 
                        render: (d) => (
                          <span className={`px-2 py-1 rounded-full text-xs ${
                            d.status === 'DRAWN' ? 'bg-green-100 text-green-800' :
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
          <div className="bg-white rounded-lg shadow-xl max-w-6xl w-full mx-2 sm:mx-4 max-h-[85vh] overflow-hidden flex flex-col">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-base sm:text-lg font-semibold truncate pr-2">
                {ticketsModal.type === 'banca'
                  ? `Tickets de Banca ${ticketsModal.data.bancaExternalId}`
                  : `Tickets de ${ticketsModal.data.item?.number} - ${ticketsModal.data.item?.name}`
                }
              </h3>
              <button onClick={() => setTicketsModal({ open: false, data: null, type: null })} className="text-gray-500 hover:text-gray-700 flex-shrink-0">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Resumen — en mobile más compacto */}
            <div className="px-4 py-3 border-b bg-gray-50 text-sm">
              {ticketsModal.type === 'item' ? (
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-1">
                  <span className="text-gray-600">{ticketsModal.data.ticketCount} ticket(s)</span>
                  <span className="font-semibold text-gray-900">
                    Venta al número: <span className="text-green-700">{formatCurrency(ticketsModal.data.totalAmount)}</span>
                  </span>
                </div>
              ) : (
                <div className="text-gray-600">
                  Total: {ticketsModal.data.ticketCount} tickets | <span className="font-semibold text-gray-900">{formatCurrency(ticketsModal.data.totalAmount)}</span>
                </div>
              )}
            </div>

            <div className="flex-1 overflow-y-auto">
              {/* Desktop — tabla */}
              <div className="hidden md:block">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ticket</th>
                      {ticketsModal.type === 'item' && (
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Venta al # </th>
                      )}
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                        {ticketsModal.type === 'item' ? 'Total ticket' : 'Monto'}
                      </th>
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
                        {ticketsModal.type === 'item' && (
                          <td className="px-4 py-3 text-sm text-right font-bold text-green-600">
                            {formatCurrency(ticket.itemAmount ?? 0)}
                          </td>
                        )}
                        <td className={`px-4 py-3 text-sm text-right ${ticketsModal.type === 'item' ? 'text-gray-500' : 'font-bold text-green-600'}`}>
                          {formatCurrency(ticket.totalAmount)}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-600">
                          {ticket.taquillaId ? `Taquilla ${ticket.taquillaId}` : ticket.bancaId ? `Banca ${ticket.bancaId}` : '-'}
                        </td>
                        <td className="px-4 py-3 text-sm text-gray-500">
                          {ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('es-VE', {
                            day: '2-digit', month: '2-digit', year: '2-digit',
                            hour: '2-digit', minute: '2-digit'
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

              {/* Mobile — cards */}
              <ul className="md:hidden divide-y divide-gray-100">
                {ticketsModal.data.tickets.map((ticket, idx) => (
                  <li
                    key={idx}
                    className="px-4 py-3 active:bg-gray-50 cursor-pointer"
                    onClick={() => handleViewTicketDetail(ticket)}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <p className="font-mono text-sm font-semibold text-gray-900 truncate">
                          {ticket.externalTicketId || ticket.id?.slice(0, 8)}
                        </p>
                        <p className="text-xs text-gray-500 mt-0.5 truncate">
                          {ticket.taquillaId ? `Taquilla ${ticket.taquillaId}` : ticket.bancaId ? `Banca ${ticket.bancaId}` : '—'}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5">
                          {ticket.createdAt ? new Date(ticket.createdAt).toLocaleString('es-VE', {
                            day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit',
                          }) : '-'}
                        </p>
                      </div>
                      <div className="text-right flex-shrink-0">
                        {ticketsModal.type === 'item' ? (
                          <>
                            <p className="text-base font-bold text-green-600 whitespace-nowrap">
                              {formatCurrency(ticket.itemAmount ?? 0)}
                            </p>
                            <p className="text-xs text-gray-400 mt-0.5 whitespace-nowrap">
                              Total: {formatCurrency(ticket.totalAmount)}
                            </p>
                          </>
                        ) : (
                          <p className="text-base font-bold text-green-600 whitespace-nowrap">
                            {formatCurrency(ticket.totalAmount)}
                          </p>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
                {ticketsModal.data.tickets.length === 0 && (
                  <li className="px-4 py-8 text-center text-sm text-gray-400">Sin tickets</li>
                )}
              </ul>
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
                            {String(tripleta.id)}
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
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase">Ticket ID</label>
                  <p className="font-mono text-lg font-bold">{ticketDetailModal.data.externalTicketId || ticketDetailModal.data.id}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Monto Total</label>
                  <p className="text-lg font-bold text-green-600">{formatCurrency(ticketDetailModal.data.totalAmount)}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
                <div>
                  <label className="text-xs text-gray-500 uppercase">Comercial</label>
                  <p className="font-medium">{ticketDetailModal.data.comercialId}</p>
                </div>
                <div>
                  <label className="text-xs text-gray-500 uppercase">Banca</label>
                  <p className="font-medium">{ticketDetailModal.data.bancaId}</p>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4">
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

      {/* Modal de Cupo */}
      {quotaModal.open && quotaModal.item && currentDraw && (
        <QuotaModal
          draw={{
            id: currentDraw.id,
            drawTime: currentDraw.drawTime,
            game: itemStats?.game,
            status: currentDraw.status,
          }}
          item={quotaModal.item}
          onClose={() => setQuotaModal({ open: false, item: null })}
          onSaved={() => fetchData()}
        />
      )}

      {/* Modal de Bloqueo de Número (incluye items aún sin jugadas) */}
      {blockItemModalOpen && currentDraw && (
        <BlockItemModal
          draw={{
            id: currentDraw.id,
            drawTime: currentDraw.drawTime,
            game: itemStats?.game || games.find(g => g.id === selectedGame)?.name,
          }}
          gameId={selectedGame}
          quotas={quotas}
          onClose={() => setBlockItemModalOpen(false)}
          onSaved={() => fetchData()}
        />
      )}

      {/* Modal de Historial de Número */}
      {numberHistoryModal.open && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-hidden">
            <div className="flex items-center justify-between p-4 border-b">
              <h3 className="text-lg font-semibold">
                Historial del Número {numberHistoryModal.number}
              </h3>
              <button onClick={() => setNumberHistoryModal({ open: false, number: null, history: null, loading: false })} className="text-gray-500 hover:text-gray-700">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 overflow-y-auto max-h-[60vh]">
              {numberHistoryModal.loading ? (
                <div className="text-center py-12">
                  <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                  <p className="mt-4 text-gray-600">Cargando historial...</p>
                </div>
              ) : !numberHistoryModal.history || numberHistoryModal.history.length === 0 ? (
                <div className="text-center py-12 text-gray-500">
                  Este número nunca ha salido ganador
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm text-gray-600 mb-4">
                    Últimas {numberHistoryModal.history.length} veces que salió este número:
                  </p>
                  {numberHistoryModal.history.map((entry, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg hover:bg-gray-100">
                      <div className="flex items-center gap-3">
                        <span className="w-8 h-8 bg-blue-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                          {idx + 1}
                        </span>
                        <div>
                          <p className="font-medium">{entry.number} - {entry.name}</p>
                          <p className="text-sm text-gray-500">
                            {new Date(entry.drawDate).toLocaleDateString('es-VE', {
                              day: '2-digit',
                              month: '2-digit',
                              year: 'numeric'
                            })}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-medium text-blue-600">{formatTime(entry.drawTime)}</p>
                        <p className="text-xs text-gray-500">
                          {Math.floor((new Date() - new Date(entry.drawDate)) / (1000 * 60 * 60 * 24))} días atrás
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
            <div className="p-4 border-t bg-gray-50 flex justify-end">
              <button 
                onClick={() => setNumberHistoryModal({ open: false, number: null, history: null, loading: false })}
                className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

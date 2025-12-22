'use client';

import { useState, useEffect } from 'react';
import { 
  Calendar, Gamepad2, Clock, DollarSign, Trophy, AlertTriangle,
  CheckCircle, XCircle, TrendingUp, TrendingDown, Target, Info, 
  Layers, Eye, ChevronDown, ChevronUp
} from 'lucide-react';
import { toast } from 'sonner';
import analysisApi from '@/lib/api/analysis';
import axios from '@/lib/api/axios';

export default function AnalisisSorteoPage() {
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState('');
  const [draws, setDraws] = useState([]);
  const [selectedDraw, setSelectedDraw] = useState('');
  const [analysis, setAnalysis] = useState(null);
  const [expandedItem, setExpandedItem] = useState(null);

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
      fetchAnalysis();
    }
  }, [selectedDraw]);

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
      const response = await axios.get(`/draws?gameId=${selectedGame}&date=${selectedDate}`);
      const drawsList = response.data.data || [];
      setDraws(drawsList);
      if (drawsList.length > 0 && !selectedDraw) {
        setSelectedDraw(drawsList[0].id);
      }
    } catch (error) {
      toast.error('Error cargando sorteos');
    }
  };

  const fetchAnalysis = async () => {
    if (!selectedDraw) return;
    
    setLoading(true);
    try {
      const result = await analysisApi.analyzeDrawWinnerImpact(selectedDraw);
      setAnalysis(result.data);
    } catch (error) {
      toast.error('Error cargando análisis');
    } finally {
      setLoading(false);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-VE', {
      style: 'currency',
      currency: 'VES',
      minimumFractionDigits: 2
    }).format(amount || 0);
  };

  const formatTime = (dateStr) => {
    return new Date(dateStr).toLocaleTimeString('es-VE', {
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'America/Caracas'
    });
  };

  const getRiskBadge = (recommendation, riskLevel) => {
    const styles = {
      RECOMENDADO: 'bg-green-100 text-green-800 border-green-200',
      ACEPTABLE: 'bg-yellow-100 text-yellow-800 border-yellow-200',
      RIESGOSO: 'bg-orange-100 text-orange-800 border-orange-200',
      PELIGROSO: 'bg-red-100 text-red-800 border-red-200'
    };

    const icons = {
      RECOMENDADO: <CheckCircle className="w-4 h-4" />,
      ACEPTABLE: <Info className="w-4 h-4" />,
      RIESGOSO: <AlertTriangle className="w-4 h-4" />,
      PELIGROSO: <XCircle className="w-4 h-4" />
    };

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium border ${styles[recommendation]}`}>
        {icons[recommendation]}
        {recommendation}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Análisis de Sorteo</h1>
        <p className="text-gray-600 mt-1">Herramienta para selección óptima de ganador</p>
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
                setAnalysis(null);
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
                setAnalysis(null);
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
              onChange={(e) => {
                setSelectedDraw(e.target.value);
                setAnalysis(null);
              }}
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

      {loading ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Analizando sorteo...</p>
        </div>
      ) : !analysis ? (
        <div className="bg-white rounded-lg shadow p-12 text-center text-gray-500">
          Selecciona un juego y sorteo para ver el análisis
        </div>
      ) : (
        <>
          {/* Resumen */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <Target className="w-5 h-5 text-blue-600" />
              Resumen del Sorteo
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
              <div className="bg-blue-50 rounded-lg p-4">
                <p className="text-sm text-blue-600">Total Vendido</p>
                <p className="text-xl font-bold text-blue-800">{formatCurrency(analysis.summary.totalSales)}</p>
              </div>
              <div className="bg-green-50 rounded-lg p-4">
                <p className="text-sm text-green-600">Máximo a Pagar ({analysis.summary.percentageToDistribute}%)</p>
                <p className="text-xl font-bold text-green-800">{formatCurrency(analysis.summary.maxPayout)}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Total Tickets</p>
                <p className="text-xl font-bold text-gray-800">{analysis.summary.totalTickets}</p>
              </div>
              <div className="bg-purple-50 rounded-lg p-4">
                <p className="text-sm text-purple-600">Tripletas Activas</p>
                <p className="text-xl font-bold text-purple-800">{analysis.summary.activeTripletas}</p>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600">Items con Ventas</p>
                <p className="text-xl font-bold text-gray-800">{analysis.summary.itemsWithSales}</p>
              </div>
            </div>

            {analysis.currentWinner && (
              <div className="mt-4 p-3 bg-green-100 rounded-lg">
                <span className="text-green-800 font-medium">
                  Ganador actual: {analysis.currentWinner.number} - {analysis.currentWinner.name}
                </span>
              </div>
            )}

            {analysis.preselectedItem && !analysis.currentWinner && (
              <div className="mt-4 p-3 bg-yellow-100 rounded-lg">
                <span className="text-yellow-800 font-medium">
                  Pre-seleccionado: {analysis.preselectedItem.number} - {analysis.preselectedItem.name}
                </span>
              </div>
            )}
          </div>

          {/* Panorama del Sorteo */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              Panorama de Riesgo
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-4">
              <div className="text-center p-4 bg-green-50 rounded-lg border-2 border-green-200">
                <p className="text-3xl font-bold text-green-700">{analysis.recommendations.best.length}</p>
                <p className="text-sm text-green-600">Recomendados</p>
              </div>
              <div className="text-center p-4 bg-yellow-50 rounded-lg border-2 border-yellow-200">
                <p className="text-3xl font-bold text-yellow-700">{analysis.recommendations.acceptable.length}</p>
                <p className="text-sm text-yellow-600">Aceptables</p>
              </div>
              <div className="text-center p-4 bg-orange-50 rounded-lg border-2 border-orange-200">
                <p className="text-3xl font-bold text-orange-700">{analysis.recommendations.risky.length}</p>
                <p className="text-sm text-orange-600">Riesgosos</p>
              </div>
              <div className="text-center p-4 bg-red-50 rounded-lg border-2 border-red-200">
                <p className="text-3xl font-bold text-red-700">{analysis.recommendations.dangerous.length}</p>
                <p className="text-sm text-red-600">Peligrosos</p>
              </div>
            </div>
            
            {/* Alerta de tripletas peligrosas */}
            {analysis.analysis.some(a => a.tripleta.completedCount > 0) && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4 mt-4">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold text-red-800">¡Atención! Hay tripletas que se completarían</p>
                    <p className="text-sm text-red-700 mt-1">
                      Los siguientes números completarían tripletas si salen como ganadores:
                    </p>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {analysis.analysis
                        .filter(a => a.tripleta.completedCount > 0)
                        .map((item, idx) => (
                          <span key={idx} className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                            {item.number} - {item.name} ({item.tripleta.completedCount} tripletas = {formatCurrency(item.tripleta.totalPrize)})
                          </span>
                        ))
                      }
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Sección de Riesgo de Tripletas Detallado */}
          {analysis.summary.activeTripletas > 0 && (
            <div className="bg-white rounded-lg shadow p-6">
              <h2 className="text-lg font-semibold mb-4 flex items-center gap-2">
                <Layers className="w-5 h-5 text-purple-600" />
                Riesgo de Tripletas Activas
              </h2>
              
              <div className="mb-4 p-4 bg-purple-50 rounded-lg border border-purple-200">
                <div className="flex items-start gap-3">
                  <Eye className="w-5 h-5 text-purple-600 flex-shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium text-purple-800">¿Qué es el riesgo de tripletas?</p>
                    <p className="text-sm text-purple-700 mt-1">
                      Las tripletas son apuestas que involucran 3 números en múltiples sorteos. Si los 3 números salen ganadores 
                      en sus respectivos sorteos, se paga un premio multiplicado. El riesgo aumenta cuando 2 de los 3 números 
                      ya han salido y solo falta 1 para completar la tripleta.
                    </p>
                  </div>
                </div>
              </div>

              {/* Resumen de riesgo por nivel */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
                <div className="p-4 bg-red-50 rounded-lg border border-red-200">
                  <div className="flex items-center gap-2 mb-2">
                    <AlertTriangle className="w-5 h-5 text-red-600" />
                    <span className="font-bold text-red-800">Alto Riesgo</span>
                  </div>
                  <p className="text-2xl font-bold text-red-700">
                    {analysis.analysis.filter(a => a.tripleta.completedCount > 0).length}
                  </p>
                  <p className="text-sm text-red-600">Números que completarían tripletas</p>
                  <p className="text-xs text-red-500 mt-1">
                    Pago potencial: {formatCurrency(
                      analysis.analysis
                        .filter(a => a.tripleta.completedCount > 0)
                        .reduce((sum, a) => sum + a.tripleta.totalPrize, 0)
                    )}
                  </p>
                </div>
                
                <div className="p-4 bg-yellow-50 rounded-lg border border-yellow-200">
                  <div className="flex items-center gap-2 mb-2">
                    <Info className="w-5 h-5 text-yellow-600" />
                    <span className="font-bold text-yellow-800">Riesgo Medio</span>
                  </div>
                  <p className="text-2xl font-bold text-yellow-700">
                    {analysis.analysis.filter(a => a.tripleta.count > 0 && a.tripleta.completedCount === 0).length}
                  </p>
                  <p className="text-sm text-yellow-600">Números en tripletas activas</p>
                  <p className="text-xs text-yellow-500 mt-1">
                    (Aún no se completarían)
                  </p>
                </div>
                
                <div className="p-4 bg-green-50 rounded-lg border border-green-200">
                  <div className="flex items-center gap-2 mb-2">
                    <CheckCircle className="w-5 h-5 text-green-600" />
                    <span className="font-bold text-green-800">Sin Riesgo</span>
                  </div>
                  <p className="text-2xl font-bold text-green-700">
                    {analysis.analysis.filter(a => a.tripleta.count === 0).length}
                  </p>
                  <p className="text-sm text-green-600">Números sin tripletas</p>
                  <p className="text-xs text-green-500 mt-1">
                    Opciones más seguras
                  </p>
                </div>
              </div>

              {/* Lista detallada de tripletas de alto riesgo */}
              {analysis.analysis.filter(a => a.tripleta.completedCount > 0).length > 0 && (
                <div className="mt-4">
                  <h3 className="font-semibold text-red-800 mb-3 flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4" />
                    Detalle de Tripletas de Alto Riesgo
                  </h3>
                  <div className="space-y-4">
                    {analysis.analysis
                      .filter(a => a.tripleta.completedCount > 0)
                      .map((item, idx) => (
                        <div key={idx} className="border border-red-200 rounded-lg overflow-hidden">
                          <div 
                            className="bg-red-100 p-3 flex items-center justify-between cursor-pointer hover:bg-red-150"
                            onClick={() => setExpandedItem(expandedItem === item.itemId ? null : item.itemId)}
                          >
                            <div className="flex items-center gap-3">
                              <span className="w-10 h-10 bg-red-600 text-white rounded-full flex items-center justify-center font-bold">
                                {item.number}
                              </span>
                              <div>
                                <p className="font-bold text-red-800">{item.name}</p>
                                <p className="text-sm text-red-600">
                                  {item.tripleta.completedCount} tripleta(s) se completarían
                                </p>
                              </div>
                            </div>
                            <div className="flex items-center gap-4">
                              <div className="text-right">
                                <p className="font-bold text-red-700">{formatCurrency(item.tripleta.totalPrize)}</p>
                                <p className="text-xs text-red-500">Premio tripletas</p>
                              </div>
                              {expandedItem === item.itemId ? (
                                <ChevronUp className="w-5 h-5 text-red-600" />
                              ) : (
                                <ChevronDown className="w-5 h-5 text-red-600" />
                              )}
                            </div>
                          </div>
                          
                          {expandedItem === item.itemId && (
                            <div className="p-4 bg-white border-t border-red-200">
                              <p className="text-sm text-gray-600 mb-3">
                                Sorteos involucrados en las tripletas:
                              </p>
                              <div className="space-y-3">
                                {item.tripleta.details.filter(t => t.wouldComplete).map((t, tIdx) => (
                                  <div key={tIdx} className="bg-red-50 rounded-lg p-3 border border-red-100">
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-xs text-gray-500">Tripleta ID: {t.tripletaId.slice(0, 8)}...</span>
                                      <span className="px-2 py-0.5 bg-red-200 text-red-800 rounded text-xs font-medium">
                                        ¡Se completaría!
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-2 flex-wrap">
                                      {t.items.map((ti, i) => (
                                        <div key={i} className="flex items-center gap-1">
                                          <span className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1 ${
                                            ti.won ? 'bg-green-100 text-green-800 border border-green-300' : 
                                            ti.isTarget ? 'bg-blue-100 text-blue-800 border-2 border-blue-400' :
                                            'bg-gray-100 text-gray-800 border border-gray-300'
                                          }`}>
                                            <span className="font-bold">{ti.number}</span>
                                            <span className="text-xs opacity-75">{ti.name?.substring(0, 8)}</span>
                                            {ti.won && <CheckCircle className="w-3 h-3 ml-1" />}
                                            {ti.isTarget && <Target className="w-3 h-3 ml-1" />}
                                          </span>
                                          {i < t.items.length - 1 && (
                                            <span className="text-gray-400 mx-1">→</span>
                                          )}
                                        </div>
                                      ))}
                                    </div>
                                    <div className="mt-2 flex items-center justify-between text-sm">
                                      <span className="text-gray-600">
                                        Apuesta: {formatCurrency(t.amount)} × {t.multiplier}
                                      </span>
                                      <span className="font-bold text-purple-700">
                                        Premio: {formatCurrency(t.prize)}
                                      </span>
                                    </div>
                                    <div className="mt-2 text-xs text-gray-500">
                                      <span className="inline-flex items-center gap-1">
                                        <CheckCircle className="w-3 h-3 text-green-600" /> Ya salió
                                      </span>
                                      <span className="inline-flex items-center gap-1 ml-3">
                                        <Target className="w-3 h-3 text-blue-600" /> Falta (este sorteo)
                                      </span>
                                    </div>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      ))
                    }
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Recomendaciones rápidas */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Mejores opciones */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-green-700">
                <TrendingUp className="w-5 h-5" />
                Top 5 Recomendados
              </h3>
              <div className="space-y-2">
                {analysis.recommendations.best.slice(0, 5).map((item, idx) => (
                  <div key={idx} className="flex items-center justify-between p-3 bg-green-50 rounded-lg hover:bg-green-100 cursor-pointer" onClick={() => setExpandedItem(item.itemId)}>
                    <div className="flex items-center gap-3">
                      <span className="w-8 h-8 bg-green-600 text-white rounded-full flex items-center justify-center text-sm font-bold">
                        {idx + 1}
                      </span>
                      <div>
                        <span className="font-bold">{item.number}</span>
                        <span className="text-gray-500 ml-2">{item.name}</span>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-bold text-green-700">{formatCurrency(item.balance)}</p>
                      <p className="text-xs text-gray-500">{item.profitPercentage}% ganancia</p>
                    </div>
                  </div>
                ))}
                {analysis.recommendations.best.length === 0 && (
                  <p className="text-gray-500 text-center py-4">No hay items recomendados</p>
                )}
              </div>
            </div>

            {/* Items peligrosos */}
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4 flex items-center gap-2 text-red-700">
                <TrendingDown className="w-5 h-5" />
                Items Peligrosos (Evitar)
              </h3>
              {analysis.recommendations.dangerous.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No hay items peligrosos</p>
              ) : (
                <div className="space-y-2">
                  {analysis.recommendations.dangerous.slice(0, 5).map((item, idx) => (
                    <div key={idx} className="flex items-center justify-between p-3 bg-red-50 rounded-lg hover:bg-red-100 cursor-pointer" onClick={() => setExpandedItem(item.itemId)}>
                      <div className="flex items-center gap-3">
                        <AlertTriangle className="w-5 h-5 text-red-600" />
                        <div>
                          <span className="font-bold">{item.number}</span>
                          <span className="text-gray-500 ml-2">{item.name}</span>
                          {item.tripleta.completedCount > 0 && (
                            <span className="ml-2 px-2 py-0.5 bg-red-200 text-red-800 rounded text-xs">
                              {item.tripleta.completedCount} tripleta(s)
                            </span>
                          )}
                        </div>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-red-700">{formatCurrency(item.totalPrize)}</p>
                        <p className="text-xs text-red-500">
                          Pérdida: {formatCurrency(Math.abs(item.balance))}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>

          {/* Tabla completa de análisis */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="p-4 border-b">
              <h3 className="text-lg font-semibold">Análisis Completo por Número</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Rank</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">#</th>
                    <th className="px-3 py-3 text-left text-xs font-medium text-gray-500 uppercase">Nombre</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Vendido</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Premio Directo</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tripletas</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Premio Trip.</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Total Premio</th>
                    <th className="px-3 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                    <th className="px-3 py-3 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {analysis.analysis.filter(item => item.sales.amount > 0 || item.tripleta.count > 0).map((item, idx) => (
                    <tr 
                      key={idx} 
                      className={`hover:bg-gray-50 cursor-pointer ${
                        item.riskLevel === 'high' ? 'bg-red-50' : 
                        item.riskLevel === 'medium' ? 'bg-yellow-50' : ''
                      }`}
                      onClick={() => setExpandedItem(expandedItem === item.itemId ? null : item.itemId)}
                    >
                      <td className="px-3 py-3 text-sm">
                        <span className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                          item.rank <= 3 ? 'bg-green-600 text-white' :
                          item.rank <= 10 ? 'bg-blue-600 text-white' :
                          'bg-gray-300 text-gray-700'
                        }`}>
                          {item.rank}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-sm font-bold">{item.number}</td>
                      <td className="px-3 py-3 text-sm text-gray-500">{item.name}</td>
                      <td className="px-3 py-3 text-sm text-right">{formatCurrency(item.sales.amount)}</td>
                      <td className="px-3 py-3 text-sm text-right text-blue-600">{formatCurrency(item.directPrize)}</td>
                      <td className="px-3 py-3 text-sm text-right">
                        {item.tripleta.completedCount > 0 ? (
                          <span className="text-purple-600 font-medium">
                            {item.tripleta.completedCount}/{item.tripleta.count}
                          </span>
                        ) : item.tripleta.count > 0 ? (
                          <span className="text-gray-400">{item.tripleta.count}</span>
                        ) : '-'}
                      </td>
                      <td className="px-3 py-3 text-sm text-right text-purple-600">
                        {item.tripleta.totalPrize > 0 ? formatCurrency(item.tripleta.totalPrize) : '-'}
                      </td>
                      <td className="px-3 py-3 text-sm text-right font-bold">
                        {formatCurrency(item.totalPrize)}
                      </td>
                      <td className={`px-3 py-3 text-sm text-right font-bold ${
                        item.balance >= 0 ? 'text-green-600' : 'text-red-600'
                      }`}>
                        {formatCurrency(item.balance)}
                      </td>
                      <td className="px-3 py-3 text-center">
                        {getRiskBadge(item.recommendation, item.riskLevel)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Detalle expandido de tripletas */}
          {expandedItem && (
            <div className="bg-white rounded-lg shadow p-6">
              <h3 className="text-lg font-semibold mb-4">
                Detalle de Tripletas para {analysis.analysis.find(a => a.itemId === expandedItem)?.number}
              </h3>
              {(() => {
                const item = analysis.analysis.find(a => a.itemId === expandedItem);
                if (!item || item.tripleta.details.length === 0) {
                  return <p className="text-gray-500">No hay tripletas asociadas a este número</p>;
                }
                return (
                  <div className="space-y-3">
                    {item.tripleta.details.map((t, idx) => (
                      <div key={idx} className={`border rounded-lg p-4 ${t.wouldComplete ? 'border-red-300 bg-red-50' : 'border-gray-200'}`}>
                        <div className="flex items-center justify-between mb-2">
                          <span className="text-sm text-gray-500">ID: {t.tripletaId.slice(0, 8)}...</span>
                          {t.wouldComplete && (
                            <span className="text-red-600 font-medium text-sm">⚠️ Se completaría!</span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mb-2">
                          {t.items.map((ti, i) => (
                            <span key={i} className={`px-3 py-1 rounded-full text-sm font-medium ${
                              ti.won ? 'bg-green-100 text-green-800' : 
                              ti.isTarget ? 'bg-blue-100 text-blue-800 ring-2 ring-blue-400' :
                              'bg-gray-100 text-gray-800'
                            }`}>
                              {ti.number} {ti.won && '✓'}
                            </span>
                          ))}
                        </div>
                        <div className="flex items-center justify-between text-sm">
                          <span>Apostado: {formatCurrency(t.amount)} × {t.multiplier}</span>
                          <span className="font-bold text-purple-600">Premio: {formatCurrency(t.prize)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                );
              })()}
            </div>
          )}
        </>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { 
  Calendar, Gamepad2, DollarSign, Trophy, TrendingUp, TrendingDown,
  FileText, Download, RefreshCw
} from 'lucide-react';
import { toast } from 'sonner';
import monitorApi from '@/lib/api/monitor';
import axios from '@/lib/api/axios';

export default function ReportesPage() {
  const [loading, setLoading] = useState(false);
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [games, setGames] = useState([]);
  const [selectedGame, setSelectedGame] = useState('');
  const [report, setReport] = useState(null);

  useEffect(() => {
    fetchGames();
  }, []);

  useEffect(() => {
    if (selectedDate) {
      fetchReport();
    }
  }, [selectedDate, selectedGame]);

  const fetchGames = async () => {
    try {
      const response = await axios.get('/games');
      setGames(response.data.data || []);
    } catch (error) {
      toast.error('Error cargando juegos');
    }
  };

  const fetchReport = async () => {
    setLoading(true);
    try {
      const result = await monitorApi.getDailyReport(selectedDate, selectedGame || null);
      setReport(result.data);
    } catch (error) {
      toast.error('Error cargando reporte');
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

  const getStatusBadge = (status) => {
    const styles = {
      SCHEDULED: 'bg-gray-100 text-gray-800',
      CLOSED: 'bg-yellow-100 text-yellow-800',
      DRAWN: 'bg-blue-100 text-blue-800',
      PUBLISHED: 'bg-green-100 text-green-800',
      CANCELLED: 'bg-red-100 text-red-800'
    };
    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100'}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Reportes de Sorteos</h1>
          <p className="text-gray-600 mt-1">Resumen diario de ventas y premios</p>
        </div>
        <button
          onClick={fetchReport}
          disabled={loading}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Actualizar
        </button>
      </div>

      {/* Filtros */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Calendar className="w-4 h-4 inline mr-1" />
              Fecha
            </label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              <Gamepad2 className="w-4 h-4 inline mr-1" />
              Juego (opcional)
            </label>
            <select
              value={selectedGame}
              onChange={(e) => setSelectedGame(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            >
              <option value="">Todos los juegos</option>
              {games.map((game) => (
                <option key={game.id} value={game.id}>
                  {game.name}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Resumen */}
      {report && (
        <>
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-blue-100 rounded-lg">
                  <DollarSign className="w-6 h-6 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Ventas Totales</p>
                  <p className="text-xl font-bold text-gray-900">{formatCurrency(report.totals.totalSales)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-red-100 rounded-lg">
                  <Trophy className="w-6 h-6 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Premios Pagados</p>
                  <p className="text-xl font-bold text-gray-900">{formatCurrency(report.totals.totalPrize)}</p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className={`p-3 rounded-lg ${report.totals.totalBalance >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                  {report.totals.totalBalance >= 0 ? (
                    <TrendingUp className="w-6 h-6 text-green-600" />
                  ) : (
                    <TrendingDown className="w-6 h-6 text-red-600" />
                  )}
                </div>
                <div>
                  <p className="text-sm text-gray-600">Balance</p>
                  <p className={`text-xl font-bold ${report.totals.totalBalance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {formatCurrency(report.totals.totalBalance)}
                  </p>
                </div>
              </div>
            </div>
            <div className="bg-white rounded-lg shadow p-4">
              <div className="flex items-center gap-3">
                <div className="p-3 bg-purple-100 rounded-lg">
                  <FileText className="w-6 h-6 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-600">Sorteos / Tickets</p>
                  <p className="text-xl font-bold text-gray-900">
                    {report.totals.drawCount} / {report.totals.totalTickets}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Tabla de sorteos */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-200">
              <h3 className="text-lg font-medium text-gray-900">Detalle por Sorteo</h3>
            </div>
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Hora</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Juego</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Estado</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Ganador</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Ventas</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Premios</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Tickets</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {report.draws.map((draw) => (
                    <tr key={draw.drawId} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {formatTime(draw.scheduledAt)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {draw.game}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {getStatusBadge(draw.status)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {draw.winnerItem ? (
                          <span className="font-medium">
                            {draw.winnerItem.number} - {draw.winnerItem.name}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                        {formatCurrency(draw.totalSales)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-red-600">
                        {formatCurrency(draw.totalPrize)}
                      </td>
                      <td className={`px-4 py-3 whitespace-nowrap text-sm text-right font-medium ${draw.balance >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {formatCurrency(draw.balance)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-right text-gray-900">
                        {draw.ticketCount}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
        </div>
      )}
    </div>
  );
}

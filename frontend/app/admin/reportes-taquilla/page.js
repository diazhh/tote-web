'use client';

import { useState, useEffect } from 'react';
import { DollarSign, TrendingUp, TrendingDown, Users, Ticket, Trophy, Calendar } from 'lucide-react';
import { toast } from 'sonner';
import axios from '@/lib/api/axios';
import { getTodayVenezuela } from '@/lib/dateUtils';

export default function ReportesTaquillaPage() {
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState(() => {
    const today = getTodayVenezuela();
    const thirtyDaysAgo = new Date(new Date(today).getTime() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0];
    return {
      startDate: thirtyDaysAgo,
      endDate: today
    };
  });
  const [reportData, setReportData] = useState({
    financial: {
      totalDeposits: 0,
      approvedDeposits: 0,
      pendingDeposits: 0,
      totalWithdrawals: 0,
      completedWithdrawals: 0,
      pendingWithdrawals: 0,
      netFlow: 0
    },
    tickets: {
      total: 0,
      active: 0,
      won: 0,
      lost: 0,
      totalAmount: 0,
      totalPrizes: 0,
      netRevenue: 0
    },
    players: {
      total: 0,
      active: 0,
      totalBalance: 0,
      totalBlocked: 0
    }
  });

  useEffect(() => {
    fetchReports();
  }, [dateRange]);

  const fetchReports = async () => {
    try {
      setLoading(true);
      
      const [depositsRes, withdrawalsRes, ticketsRes, playersRes] = await Promise.all([
        axios.get('/admin/deposits'),
        axios.get('/admin/withdrawals'),
        axios.get('/admin/tickets'),
        axios.get('/admin/players')
      ]);

      const deposits = depositsRes.data.data || [];
      const withdrawals = withdrawalsRes.data.data || [];
      const tickets = ticketsRes.data.data || [];
      const players = playersRes.data.data || [];

      const startDate = new Date(dateRange.startDate);
      const endDate = new Date(dateRange.endDate);
      endDate.setHours(23, 59, 59, 999);

      const filteredDeposits = deposits.filter(d => {
        const date = new Date(d.createdAt);
        return date >= startDate && date <= endDate;
      });

      const filteredWithdrawals = withdrawals.filter(w => {
        const date = new Date(w.createdAt);
        return date >= startDate && date <= endDate;
      });

      const filteredTickets = tickets.filter(t => {
        const date = new Date(t.createdAt);
        return date >= startDate && date <= endDate;
      });

      const totalDeposits = filteredDeposits.reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);
      const approvedDeposits = filteredDeposits
        .filter(d => d.status === 'APPROVED')
        .reduce((sum, d) => sum + parseFloat(d.amount || 0), 0);
      const pendingDeposits = filteredDeposits.filter(d => d.status === 'PENDING').length;

      const totalWithdrawals = filteredWithdrawals.reduce((sum, w) => sum + parseFloat(w.amount || 0), 0);
      const completedWithdrawals = filteredWithdrawals
        .filter(w => w.status === 'COMPLETED')
        .reduce((sum, w) => sum + parseFloat(w.amount || 0), 0);
      const pendingWithdrawals = filteredWithdrawals.filter(w => w.status === 'PENDING').length;

      const totalTicketAmount = filteredTickets.reduce((sum, t) => sum + parseFloat(t.totalAmount || 0), 0);
      const totalPrizes = filteredTickets.reduce((sum, t) => sum + parseFloat(t.totalPrize || 0), 0);

      setReportData({
        financial: {
          totalDeposits,
          approvedDeposits,
          pendingDeposits,
          totalWithdrawals,
          completedWithdrawals,
          pendingWithdrawals,
          netFlow: approvedDeposits - completedWithdrawals
        },
        tickets: {
          total: filteredTickets.length,
          active: filteredTickets.filter(t => t.status === 'ACTIVE').length,
          won: filteredTickets.filter(t => t.status === 'WON').length,
          lost: filteredTickets.filter(t => t.status === 'LOST').length,
          totalAmount: totalTicketAmount,
          totalPrizes,
          netRevenue: totalTicketAmount - totalPrizes
        },
        players: {
          total: players.length,
          active: players.filter(p => p.isActive).length,
          totalBalance: players.reduce((sum, p) => sum + parseFloat(p.balance || 0), 0),
          totalBlocked: players.reduce((sum, p) => sum + parseFloat(p.blockedBalance || 0), 0)
        }
      });
    } catch (error) {
      toast.error('Error al cargar reportes');
      console.error(error);
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

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Reportes de Taquilla</h1>
        <p className="text-gray-600 mt-1">Análisis financiero y estadísticas</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Rango de Fechas</h2>
        <div className="flex flex-col md:flex-row gap-4">
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Fecha Inicio</label>
            <input
              type="date"
              value={dateRange.startDate}
              onChange={(e) => setDateRange({ ...dateRange, startDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex-1">
            <label className="block text-sm font-medium text-gray-700 mb-2">Fecha Fin</label>
            <input
              type="date"
              value={dateRange.endDate}
              onChange={(e) => setDateRange({ ...dateRange, endDate: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Generando reportes...</p>
        </div>
      ) : (
        <>
          <div>
            <h2 className="text-xl font-semibold mb-4">Resumen Financiero</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Depósitos Aprobados</p>
                    <p className="text-2xl font-bold text-green-600 mt-1">
                      {formatCurrency(reportData.financial.approvedDeposits)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {reportData.financial.pendingDeposits} pendientes
                    </p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-green-600" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Retiros Completados</p>
                    <p className="text-2xl font-bold text-red-600 mt-1">
                      {formatCurrency(reportData.financial.completedWithdrawals)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {reportData.financial.pendingWithdrawals} pendientes
                    </p>
                  </div>
                  <TrendingDown className="w-8 h-8 text-red-600" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Flujo Neto</p>
                    <p className={`text-2xl font-bold mt-1 ${reportData.financial.netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(reportData.financial.netFlow)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Depósitos - Retiros
                    </p>
                  </div>
                  <DollarSign className="w-8 h-8 text-blue-600" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Balance Total Sistema</p>
                    <p className="text-2xl font-bold text-blue-600 mt-1">
                      {formatCurrency(reportData.players.totalBalance)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {formatCurrency(reportData.players.totalBlocked)} bloqueado
                    </p>
                  </div>
                  <DollarSign className="w-8 h-8 text-blue-600" />
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4">Estadísticas de Jugadas</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Tickets</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {reportData.tickets.total}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {reportData.tickets.active} activos
                    </p>
                  </div>
                  <Ticket className="w-8 h-8 text-gray-600" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Apostado</p>
                    <p className="text-2xl font-bold text-blue-600 mt-1">
                      {formatCurrency(reportData.tickets.totalAmount)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Ventas brutas
                    </p>
                  </div>
                  <DollarSign className="w-8 h-8 text-blue-600" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Premios</p>
                    <p className="text-2xl font-bold text-green-600 mt-1">
                      {formatCurrency(reportData.tickets.totalPrizes)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {reportData.tickets.won} ganadores
                    </p>
                  </div>
                  <Trophy className="w-8 h-8 text-green-600" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Ganancia Neta</p>
                    <p className={`text-2xl font-bold mt-1 ${reportData.tickets.netRevenue >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(reportData.tickets.netRevenue)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Apostado - Premios
                    </p>
                  </div>
                  <TrendingUp className="w-8 h-8 text-green-600" />
                </div>
              </div>
            </div>
          </div>

          <div>
            <h2 className="text-xl font-semibold mb-4">Estadísticas de Jugadores</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Total Jugadores</p>
                    <p className="text-2xl font-bold text-gray-900 mt-1">
                      {reportData.players.total}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      {reportData.players.active} activos
                    </p>
                  </div>
                  <Users className="w-8 h-8 text-blue-600" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Promedio por Jugador</p>
                    <p className="text-2xl font-bold text-blue-600 mt-1">
                      {formatCurrency(reportData.players.total > 0 ? reportData.players.totalBalance / reportData.players.total : 0)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Balance promedio
                    </p>
                  </div>
                  <DollarSign className="w-8 h-8 text-blue-600" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Tasa de Ganancia</p>
                    <p className="text-2xl font-bold text-green-600 mt-1">
                      {reportData.tickets.total > 0 
                        ? ((reportData.tickets.won / reportData.tickets.total) * 100).toFixed(1)
                        : 0}%
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Tickets ganadores
                    </p>
                  </div>
                  <Trophy className="w-8 h-8 text-green-600" />
                </div>
              </div>

              <div className="bg-white rounded-lg shadow p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Promedio Apuesta</p>
                    <p className="text-2xl font-bold text-blue-600 mt-1">
                      {formatCurrency(reportData.tickets.total > 0 ? reportData.tickets.totalAmount / reportData.tickets.total : 0)}
                    </p>
                    <p className="text-xs text-gray-500 mt-1">
                      Por ticket
                    </p>
                  </div>
                  <Ticket className="w-8 h-8 text-blue-600" />
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

'use client';
import { useState, useEffect } from 'react';
import { adminPlayersApi } from '@/lib/api/admin-players';

export default function StatsTab({ playerId }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const res = await adminPlayersApi.getPlayerStats(playerId);
        setStats(res.data);
      } catch { /* ignore */ } finally { setLoading(false); }
    };
    load();
  }, [playerId]);

  const fmt = (a) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES', minimumFractionDigits: 2 }).format(a || 0);

  if (loading) return <div className="text-center py-8 text-gray-500">Cargando estadísticas...</div>;
  if (!stats) return <div className="text-center py-8 text-gray-500">Sin datos</div>;

  const totalBets = (stats.totalTickets || 0) + (stats.totalTripletas || 0);
  const totalWon = (stats.wonTickets || 0) + (stats.wonTripletas || 0);
  const winRate = totalBets > 0 ? ((totalWon / totalBets) * 100).toFixed(1) : '0.0';
  const totalBet = parseFloat(stats.totalBet || 0);
  const totalPrize = parseFloat(stats.totalPrize || 0);
  const netPL = totalPrize - totalBet;
  const totalDeposits = parseFloat(stats.totalDeposits || 0);
  const totalWithdrawals = parseFloat(stats.totalWithdrawals || 0);

  return (
    <div className="space-y-6">
      {/* Main Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard label="Win Rate" value={`${winRate}%`} color="blue" />
        <StatCard label="Total Jugadas" value={totalBets} color="gray" />
        <StatCard label="Total Ganadas" value={totalWon} color="green" />
        <StatCard label="P/L Neto" value={fmt(netPL)} color={netPL >= 0 ? 'green' : 'red'} />
      </div>

      {/* Tickets vs Tripletas */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-gray-50 rounded-lg p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Tickets</h3>
          <div className="space-y-3">
            <Row label="Total" value={stats.totalTickets || 0} />
            <Row label="Ganados" value={stats.wonTickets || 0} color="green" />
            <Row label="Perdidos" value={stats.lostTickets || 0} color="red" />
          </div>
        </div>
        <div className="bg-gray-50 rounded-lg p-5">
          <h3 className="font-semibold text-gray-900 mb-4">Tripletas</h3>
          <div className="space-y-3">
            <Row label="Total" value={stats.totalTripletas || 0} />
            <Row label="Ganadas" value={stats.wonTripletas || 0} color="green" />
            <Row label="Perdidas/Expiradas" value={stats.lostTripletas || 0} color="red" />
          </div>
        </div>
      </div>

      {/* Financial Summary */}
      <div className="bg-gray-50 rounded-lg p-5">
        <h3 className="font-semibold text-gray-900 mb-4">Resumen Financiero</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <p className="text-xs text-gray-500 uppercase mb-1">Total Apostado</p>
            <p className="text-lg font-bold text-red-600">{fmt(totalBet)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase mb-1">Total Premios</p>
            <p className="text-lg font-bold text-green-600">{fmt(totalPrize)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase mb-1">Total Depósitos</p>
            <p className="text-lg font-bold text-blue-600">{fmt(totalDeposits)}</p>
          </div>
          <div>
            <p className="text-xs text-gray-500 uppercase mb-1">Total Retiros</p>
            <p className="text-lg font-bold text-orange-600">{fmt(totalWithdrawals)}</p>
          </div>
        </div>
      </div>

      {stats.calculatedAt && (
        <p className="text-xs text-gray-400 text-right">
          Calculado: {new Date(stats.calculatedAt).toLocaleString('es-VE')}
        </p>
      )}
    </div>
  );
}

function StatCard({ label, value, color }) {
  const colors = {
    blue: 'bg-blue-50 border-blue-200 text-blue-700',
    green: 'bg-green-50 border-green-200 text-green-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-700'
  };
  return (
    <div className={`border rounded-lg p-4 ${colors[color] || colors.gray}`}>
      <p className="text-xs uppercase font-medium mb-1">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}

function Row({ label, value, color }) {
  const c = color === 'green' ? 'text-green-600' : color === 'red' ? 'text-red-600' : 'text-gray-900';
  return (
    <div className="flex justify-between">
      <span className="text-gray-600">{label}</span>
      <span className={`font-medium ${c}`}>{value}</span>
    </div>
  );
}

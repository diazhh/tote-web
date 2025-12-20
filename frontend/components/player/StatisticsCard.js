'use client';

import { Ticket, Trophy, TrendingDown, Percent, DollarSign, Target } from 'lucide-react';

export default function StatisticsCard({ statistics }) {
  if (!statistics) {
    return (
      <div className="bg-white rounded-xl shadow-sm border p-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[1, 2, 3, 4].map((i) => (
            <div key={i} className="h-24 bg-gray-200 rounded"></div>
          ))}
        </div>
      </div>
    );
  }

  const { summary } = statistics;

  const stats = [
    {
      label: 'Tickets Totales',
      value: summary.totalTickets,
      icon: Ticket,
      color: 'blue',
      bgColor: 'bg-blue-50',
      iconColor: 'text-blue-600'
    },
    {
      label: 'Tickets Ganadores',
      value: summary.wonTickets,
      icon: Trophy,
      color: 'green',
      bgColor: 'bg-green-50',
      iconColor: 'text-green-600'
    },
    {
      label: 'Tickets Activos',
      value: summary.activeTickets,
      icon: Target,
      color: 'yellow',
      bgColor: 'bg-yellow-50',
      iconColor: 'text-yellow-600'
    },
    {
      label: 'Tasa de Ganancia',
      value: `${summary.winRate}%`,
      icon: Percent,
      color: 'purple',
      bgColor: 'bg-purple-50',
      iconColor: 'text-purple-600'
    }
  ];

  const financialStats = [
    {
      label: 'Total Apostado',
      value: summary.totalSpent,
      color: 'red',
      icon: TrendingDown
    },
    {
      label: 'Total Ganado',
      value: summary.totalWon,
      color: 'green',
      icon: Trophy
    },
    {
      label: 'Ganancia Neta',
      value: summary.netProfit,
      color: summary.netProfit >= 0 ? 'green' : 'red',
      icon: DollarSign
    }
  ];

  return (
    <div className="space-y-6">
      {/* Main Statistics */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Estadísticas de Juego</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {stats.map((stat, index) => (
            <div key={index} className={`${stat.bgColor} rounded-lg p-4`}>
              <div className="flex items-center gap-3 mb-2">
                <stat.icon className={`w-5 h-5 ${stat.iconColor}`} />
                <p className="text-sm text-gray-600 font-medium">{stat.label}</p>
              </div>
              <p className="text-2xl font-bold text-gray-900">{stat.value}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Financial Statistics */}
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Resumen Financiero</h2>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {financialStats.map((stat, index) => (
            <div key={index} className="border rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <stat.icon className={`w-5 h-5 ${
                  stat.color === 'green' ? 'text-green-600' : 
                  stat.color === 'red' ? 'text-red-600' : 
                  'text-gray-600'
                }`} />
                <p className="text-sm text-gray-600 font-medium">{stat.label}</p>
              </div>
              <p className={`text-2xl font-bold ${
                stat.color === 'green' ? 'text-green-600' : 
                stat.color === 'red' ? 'text-red-600' : 
                'text-gray-900'
              }`}>
                {stat.value >= 0 ? '+' : ''}Bs. {stat.value.toLocaleString('es-VE', { 
                  minimumFractionDigits: 2, 
                  maximumFractionDigits: 2 
                })}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

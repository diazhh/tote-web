'use client';

import { useEffect, useState } from 'react';
import { usePageVisit, PAGE_TYPES } from '@/hooks/usePageVisit';
import drawsAPI from '@/lib/api/draws';
import publicAPI from '@/lib/api/public';
import { Trophy, Calendar, Clock, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { formatCaracasDateTime } from '@/lib/utils/dateUtils';

export default function AdminDashboard() {
  usePageVisit(PAGE_TYPES.ADMIN_DASHBOARD, '/admin');
  
  const [stats, setStats] = useState({
    todayDraws: [],
    upcomingDraws: [],
    games: [],
    loading: true
  });

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    try {
      const [todayRes, upcomingRes, gamesRes] = await Promise.all([
        drawsAPI.today(),
        drawsAPI.upcoming(5),
        publicAPI.getGames()
      ]);

      const todayDraws = Array.isArray(todayRes.data) ? todayRes.data : (todayRes.data?.draws || []);
      const upcomingDraws = Array.isArray(upcomingRes.data) ? upcomingRes.data : (upcomingRes.data?.draws || []);
      const games = Array.isArray(gamesRes) ? gamesRes : (gamesRes.data || []);

      console.log('Dashboard data:', { todayDraws, upcomingDraws, games });

      setStats({
        todayDraws,
        upcomingDraws,
        games,
        loading: false
      });
    } catch (error) {
      console.error('Error loading dashboard:', error);
      toast.error('Error al cargar el dashboard');
      setStats(prev => ({ ...prev, loading: false }));
    }
  };

  if (stats.loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando dashboard...</p>
        </div>
      </div>
    );
  }

  const completedToday = stats.todayDraws.filter(d => d.status === 'PUBLISHED').length;
  const pendingToday = stats.todayDraws.filter(d => 
    d.status === 'PENDING' || d.status === 'SCHEDULED' || d.status === 'CLOSED'
  ).length;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Dashboard</h1>
        <p className="text-gray-600 mt-1">Resumen general del sistema</p>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 lg:gap-6">
        <div className="bg-white rounded-lg shadow p-4 lg:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Sorteos Hoy</p>
              <p className="text-2xl lg:text-3xl font-bold text-gray-900 mt-1">
                {stats.todayDraws.length}
              </p>
            </div>
            <div className="w-10 h-10 lg:w-12 lg:h-12 bg-blue-100 rounded-lg flex items-center justify-center">
              <Trophy className="w-5 h-5 lg:w-6 lg:h-6 text-blue-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 lg:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Completados</p>
              <p className="text-2xl lg:text-3xl font-bold text-green-600 mt-1">
                {completedToday}
              </p>
            </div>
            <div className="w-10 h-10 lg:w-12 lg:h-12 bg-green-100 rounded-lg flex items-center justify-center">
              <CheckCircle className="w-5 h-5 lg:w-6 lg:h-6 text-green-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 lg:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Pendientes</p>
              <p className="text-2xl lg:text-3xl font-bold text-orange-600 mt-1">
                {pendingToday}
              </p>
            </div>
            <div className="w-10 h-10 lg:w-12 lg:h-12 bg-orange-100 rounded-lg flex items-center justify-center">
              <Clock className="w-5 h-5 lg:w-6 lg:h-6 text-orange-600" />
            </div>
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-4 lg:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Juegos Activos</p>
              <p className="text-2xl lg:text-3xl font-bold text-purple-600 mt-1">
                {stats.games.length}
              </p>
            </div>
            <div className="w-10 h-10 lg:w-12 lg:h-12 bg-purple-100 rounded-lg flex items-center justify-center">
              <Calendar className="w-5 h-5 lg:w-6 lg:h-6 text-purple-600" />
            </div>
          </div>
        </div>
      </div>

      {/* Próximos Sorteos */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <div className="px-4 lg:px-6 py-4 border-b border-gray-200 flex items-center justify-between min-w-max">
          <h2 className="text-lg font-semibold text-gray-900">Próximos Sorteos</h2>
          <Link
            href="/admin/sorteos"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Ver todos →
          </Link>
        </div>
        <div className="p-4 lg:p-6">
          {stats.upcomingDraws.length === 0 ? (
            <p className="text-center text-gray-500 py-8">
              No hay sorteos próximos
            </p>
          ) : (
            <div className="space-y-4">
              {stats.upcomingDraws.map((draw) => (
                <div
                  key={draw.id}
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition gap-4 sm:gap-0"
                >
                  <div className="flex items-center space-x-4">
                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${
                      draw.status === 'PUBLISHED' ? 'bg-green-500' :
                      draw.status === 'CLOSED' ? 'bg-orange-500' :
                      'bg-blue-500'
                    }`} />
                    <div>
                      <p className="font-medium text-gray-900">
                        {draw.game?.name}
                      </p>
                      <p className="text-sm text-gray-600">
                        {formatCaracasDateTime(draw.scheduledAt)}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <span className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-medium ${
                      draw.status === 'PUBLISHED' ? 'bg-green-100 text-green-800' :
                      draw.status === 'CLOSED' ? 'bg-orange-100 text-orange-800' :
                      draw.status === 'DRAWN' ? 'bg-purple-100 text-purple-800' :
                      'bg-blue-100 text-blue-800'
                    }`}>
                      {draw.status === 'PUBLISHED' ? 'Publicado' :
                       draw.status === 'CLOSED' ? 'Cerrado' :
                       draw.status === 'DRAWN' ? 'Sorteado' :
                       draw.status === 'SCHEDULED' ? 'Programado' :
                       'Pendiente'}
                    </span>
                    {draw.winnerItem && (
                      <p className="text-sm text-gray-600 mt-1">
                        Ganador: {draw.winnerItem.number}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Juegos */}
      <div className="bg-white rounded-lg shadow overflow-x-auto">
        <div className="px-4 lg:px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Juegos</h2>
        </div>
        <div className="p-4 lg:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {stats.games.map((game) => (
              <div
                key={game.id}
                className="p-4 border border-gray-200 rounded-lg hover:shadow-md transition"
              >
                <h3 className="font-semibold text-gray-900">{game.name}</h3>
                <p className="text-sm text-gray-600 mt-1">{game.type}</p>
                <div className="mt-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                  <span className={`inline-flex items-center px-2 py-1 rounded text-xs font-medium ${
                    game.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                  }`}>
                    {game.isActive ? 'Activo' : 'Inactivo'}
                  </span>
                  <Link
                    href={`/admin/juegos/${game.id}`}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    Ver detalles
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import tripletaAPI from '@/lib/api/tripleta';
import { toast } from 'sonner';
import { Trophy, Calendar, DollarSign, TrendingUp, Filter } from 'lucide-react';

export default function TripletasPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [bets, setBets] = useState([]);
  const [filter, setFilter] = useState('all');

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/login');
      return;
    }
    loadBets();
  }, [router, filter]);

  const loadBets = async () => {
    try {
      setLoading(true);
      const filters = {};
      if (filter !== 'all') {
        filters.status = filter.toUpperCase();
      }
      
      const response = await tripletaAPI.getMyBets(filters);
      setBets(response.data || []);
    } catch (error) {
      console.error('Error loading tripleta bets:', error);
      toast.error('Error al cargar apuestas');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      ACTIVE: { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Activa' },
      WON: { bg: 'bg-green-100', text: 'text-green-800', label: 'Ganadora' },
      LOST: { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Perdida' },
      EXPIRED: { bg: 'bg-red-100', text: 'text-red-800', label: 'Expirada' },
    };
    const badge = badges[status] || badges.ACTIVE;
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${badge.bg} ${badge.text}`}>
        {badge.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 p-4">
        <div className="max-w-6xl mx-auto">
          <div className="flex items-center justify-center h-64">
            <div className="text-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-4 text-gray-600">Cargando apuestas...</p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-4">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Trophy className="w-7 h-7 text-yellow-600" />
              Mis Apuestas Tripleta
            </h1>
            <p className="text-gray-600 mt-1">Historial de tus apuestas tripleta</p>
          </div>
          
          {/* Filter */}
          <div className="flex items-center gap-2">
            <Filter className="w-5 h-5 text-gray-600" />
            <select
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
              className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="all">Todas</option>
              <option value="active">Activas</option>
              <option value="won">Ganadoras</option>
              <option value="expired">Expiradas</option>
            </select>
          </div>
        </div>

        {/* Bets List */}
        {bets.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Trophy className="w-16 h-16 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              No hay apuestas tripleta
            </h3>
            <p className="text-gray-600 mb-4">
              {filter === 'all' 
                ? 'Aún no has realizado ninguna apuesta tripleta'
                : `No tienes apuestas ${filter === 'active' ? 'activas' : filter === 'won' ? 'ganadoras' : 'expiradas'}`
              }
            </p>
            <button
              onClick={() => router.push('/jugar')}
              className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
            >
              Ir a Jugar
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-4">
            {bets.map((bet) => (
              <div
                key={bet.id}
                className="bg-white rounded-lg shadow hover:shadow-lg transition p-6"
              >
                <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
                  {/* Left Section */}
                  <div className="flex-1 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="text-lg font-semibold text-gray-900">
                        Apuesta #{bet.id.slice(0, 8)}
                      </h3>
                      {getStatusBadge(bet.status)}
                    </div>

                    {/* Numbers */}
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-gray-600">Números:</p>
                      <div className="flex gap-2">
                        {[bet.item1Id, bet.item2Id, bet.item3Id].map((itemId, idx) => (
                          <div
                            key={idx}
                            className="px-3 py-1 bg-blue-100 text-blue-800 rounded-lg font-semibold text-sm"
                          >
                            ID: {itemId.slice(0, 6)}
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* Info Grid */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                      <div>
                        <p className="text-gray-600 flex items-center gap-1">
                          <DollarSign className="w-4 h-4" />
                          Apuesta
                        </p>
                        <p className="font-semibold text-gray-900">${parseFloat(bet.amount).toFixed(2)}</p>
                      </div>
                      <div>
                        <p className="text-gray-600 flex items-center gap-1">
                          <TrendingUp className="w-4 h-4" />
                          Multiplicador
                        </p>
                        <p className="font-semibold text-gray-900">{bet.multiplier}x</p>
                      </div>
                      <div>
                        <p className="text-gray-600 flex items-center gap-1">
                          <Calendar className="w-4 h-4" />
                          Sorteos
                        </p>
                        <p className="font-semibold text-gray-900">{bet.drawsCount}</p>
                      </div>
                      <div>
                        <p className="text-gray-600 flex items-center gap-1">
                          <Trophy className="w-4 h-4" />
                          {bet.status === 'WON' ? 'Premio' : 'Potencial'}
                        </p>
                        <p className={`font-semibold ${bet.status === 'WON' ? 'text-green-600' : 'text-gray-900'}`}>
                          ${parseFloat(bet.status === 'WON' ? bet.prize : bet.amount * bet.multiplier).toFixed(2)}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Right Section - Date */}
                  <div className="text-right lg:text-left">
                    <p className="text-xs text-gray-600">Creada</p>
                    <p className="text-sm font-medium text-gray-900">
                      {new Date(bet.createdAt).toLocaleDateString('es-ES', {
                        day: '2-digit',
                        month: 'short',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </p>
                    {bet.expiresAt && (
                      <>
                        <p className="text-xs text-gray-600 mt-2">Expira</p>
                        <p className="text-sm font-medium text-gray-900">
                          {new Date(bet.expiresAt).toLocaleDateString('es-ES', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric'
                          })}
                        </p>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

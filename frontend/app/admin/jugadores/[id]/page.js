'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { ArrowLeft, User, Shield, ShieldOff } from 'lucide-react';
import { adminPlayersApi } from '@/lib/api/admin-players';
import ProfileTab from '@/components/admin/players/ProfileTab';
import FinancesTab from '@/components/admin/players/FinancesTab';
import BetsTab from '@/components/admin/players/BetsTab';
import MovementsTab from '@/components/admin/players/MovementsTab';
import StatsTab from '@/components/admin/players/StatsTab';

const TABS = [
  { key: 'perfil', label: 'Perfil' },
  { key: 'finanzas', label: 'Finanzas' },
  { key: 'jugadas', label: 'Jugadas' },
  { key: 'movimientos', label: 'Movimientos' },
  { key: 'estadisticas', label: 'Estadisticas' }
];

export default function PlayerDetailPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const playerId = params.id;

  const [player, setPlayer] = useState(null);
  const [loading, setLoading] = useState(true);

  const activeTab = searchParams.get('tab') || 'perfil';

  const setActiveTab = (tab) => {
    router.replace(`/admin/jugadores/${playerId}?tab=${tab}`, { scroll: false });
  };

  useEffect(() => {
    if (playerId) loadPlayer();
  }, [playerId]);

  const loadPlayer = async () => {
    try {
      setLoading(true);
      const res = await adminPlayersApi.getPlayerDetails(playerId);
      setPlayer(res.data);
    } catch (err) {
      console.error('Error loading player:', err);
    } finally {
      setLoading(false);
    }
  };

  const fmt = (a) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES', minimumFractionDigits: 2 }).format(a || 0);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600">Cargando datos del jugador...</p>
        </div>
      </div>
    );
  }

  if (!player) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 text-lg">Jugador no encontrado</p>
          <button onClick={() => router.push('/admin/jugadores')} className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">
            Volver a Jugadores
          </button>
        </div>
      </div>
    );
  }

  const { player: p, stats } = player;
  const balance = parseFloat(p.balance || 0);
  const blocked = parseFloat(p.blockedBalance || 0);
  const bonus = parseFloat(p.bonusBalance || 0);
  const available = balance - blocked;

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-7xl mx-auto">
        {/* Back */}
        <button onClick={() => router.push('/admin/jugadores')} className="flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4">
          <ArrowLeft className="w-5 h-5" /> Volver a Jugadores
        </button>

        {/* Header */}
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
            {/* Player Info */}
            <div className="flex items-center gap-4">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center">
                <User className="w-8 h-8 text-blue-600" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-2xl font-bold text-gray-900">{p.username}</h1>
                  {p.isActive ? (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-green-100 text-green-800">
                      <Shield className="w-3 h-3" /> Activo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full bg-red-100 text-red-800">
                      <ShieldOff className="w-3 h-3" /> Inactivo
                    </span>
                  )}
                </div>
                <p className="text-gray-600">{p.email}</p>
                {p.phone && <p className="text-gray-500 text-sm">{p.phone}</p>}
              </div>
            </div>

            {/* Balance Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 text-center">
                <p className="text-xs text-green-600 uppercase font-medium">Disponible</p>
                <p className="text-lg font-bold text-green-700">{fmt(available)}</p>
              </div>
              <div className="bg-orange-50 border border-orange-200 rounded-lg p-3 text-center">
                <p className="text-xs text-orange-600 uppercase font-medium">Bloqueado</p>
                <p className="text-lg font-bold text-orange-700">{fmt(blocked)}</p>
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3 text-center">
                <p className="text-xs text-purple-600 uppercase font-medium">Bono</p>
                <p className="text-lg font-bold text-purple-700">{fmt(bonus)}</p>
              </div>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                <p className="text-xs text-blue-600 uppercase font-medium">Total</p>
                <p className="text-lg font-bold text-blue-700">{fmt(balance)}</p>
              </div>
            </div>
          </div>
        </div>

        {/* Tabs */}
        <div className="bg-white rounded-lg shadow">
          <div className="border-b border-gray-200">
            <nav className="flex -mb-px overflow-x-auto">
              {TABS.map(t => (
                <button key={t.key} onClick={() => setActiveTab(t.key)}
                  className={`px-6 py-3 text-sm font-medium border-b-2 whitespace-nowrap ${
                    activeTab === t.key
                      ? 'border-blue-600 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}>
                  {t.label}
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {activeTab === 'perfil' && <ProfileTab playerId={playerId} player={p} onUpdate={loadPlayer} />}
            {activeTab === 'finanzas' && <FinancesTab playerId={playerId} player={p} onUpdate={loadPlayer} />}
            {activeTab === 'jugadas' && <BetsTab playerId={playerId} />}
            {activeTab === 'movimientos' && <MovementsTab playerId={playerId} />}
            {activeTab === 'estadisticas' && <StatsTab playerId={playerId} />}
          </div>
        </div>
      </div>
    </div>
  );
}

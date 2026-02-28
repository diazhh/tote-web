'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Search, User, DollarSign, TrendingUp, TrendingDown, Eye, Gift, Power, ChevronLeft, ChevronRight } from 'lucide-react';
import { toast } from 'sonner';
import { adminPlayersApi } from '@/lib/api/admin-players';

export default function JugadoresPage() {
  const router = useRouter();
  const [players, setPlayers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [stats, setStats] = useState({ total: 0, active: 0, totalBalance: 0, totalBlocked: 0, totalBonus: 0 });
  const [pagination, setPagination] = useState({ offset: 0, limit: 50, total: 0 });
  const [bonusModal, setBonusModal] = useState({ open: false, player: null });
  const [bonusForm, setBonusForm] = useState({ amount: '', reason: '' });
  const [actionLoading, setActionLoading] = useState(null);

  const fetchPlayers = useCallback(async () => {
    try {
      setLoading(true);
      const params = { limit: pagination.limit, offset: pagination.offset };
      if (searchTerm) params.search = searchTerm;
      if (statusFilter !== 'all') params.status = statusFilter;

      const response = await adminPlayersApi.getPlayers(params);
      const playersData = response.data.players || [];
      setPlayers(playersData);

      const totalBalance = playersData.reduce((sum, p) => sum + parseFloat(p.balance || 0), 0);
      const totalBlocked = playersData.reduce((sum, p) => sum + parseFloat(p.blockedBalance || 0), 0);
      const totalBonus = playersData.reduce((sum, p) => sum + parseFloat(p.bonusBalance || 0), 0);
      const active = playersData.filter(p => p.isActive).length;

      setStats({ total: response.data.total || playersData.length, active, totalBalance, totalBlocked, totalBonus });
      setPagination(prev => ({ ...prev, total: response.data.total || playersData.length }));
    } catch (error) {
      toast.error('Error al cargar jugadores');
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, pagination.offset, searchTerm, statusFilter]);

  useEffect(() => { fetchPlayers(); }, [fetchPlayers]);

  const handleToggleStatus = async (player) => {
    if (!confirm(`¿${player.isActive ? 'Desactivar' : 'Activar'} a ${player.username}?`)) return;
    try {
      setActionLoading(player.id);
      await adminPlayersApi.toggleStatus(player.id);
      toast.success(`${player.username} ${player.isActive ? 'desactivado' : 'activado'}`);
      fetchPlayers();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al cambiar estado');
    } finally {
      setActionLoading(null);
    }
  };

  const handleGiveBonus = async () => {
    if (!bonusForm.amount || parseFloat(bonusForm.amount) <= 0) {
      toast.error('Monto debe ser mayor a 0');
      return;
    }
    try {
      setActionLoading('bonus');
      await adminPlayersApi.giveBonus(bonusModal.player.id, bonusForm);
      toast.success(`Bono de ${formatCurrency(bonusForm.amount)} dado a ${bonusModal.player.username}`);
      setBonusModal({ open: false, player: null });
      setBonusForm({ amount: '', reason: '' });
      fetchPlayers();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al dar bono');
    } finally {
      setActionLoading(null);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES', minimumFractionDigits: 2 }).format(amount);
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Jugadores</h1>
        <p className="text-gray-600 mt-1">Centro de gestión de usuarios jugadores</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Total</p>
              <p className="text-2xl font-bold text-gray-900">{stats.total}</p>
            </div>
            <User className="w-8 h-8 text-blue-600" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Activos</p>
              <p className="text-2xl font-bold text-green-600">{stats.active}</p>
            </div>
            <TrendingUp className="w-8 h-8 text-green-600" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Balance Total</p>
              <p className="text-xl font-bold text-blue-600">{formatCurrency(stats.totalBalance)}</p>
            </div>
            <DollarSign className="w-8 h-8 text-blue-600" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Bloqueado</p>
              <p className="text-xl font-bold text-orange-600">{formatCurrency(stats.totalBlocked)}</p>
            </div>
            <TrendingDown className="w-8 h-8 text-orange-600" />
          </div>
        </div>
        <div className="bg-white rounded-lg shadow p-5">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-600">Bonos</p>
              <p className="text-xl font-bold text-purple-600">{formatCurrency(stats.totalBonus)}</p>
            </div>
            <Gift className="w-8 h-8 text-purple-600" />
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className="bg-white rounded-lg shadow p-4 flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
          <input
            type="text"
            placeholder="Buscar por usuario, email o teléfono..."
            value={searchTerm}
            onChange={(e) => { setSearchTerm(e.target.value); setPagination(prev => ({ ...prev, offset: 0 })); }}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <select
          value={statusFilter}
          onChange={(e) => { setStatusFilter(e.target.value); setPagination(prev => ({ ...prev, offset: 0 })); }}
          className="border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">Todos</option>
          <option value="active">Activos</option>
          <option value="inactive">Inactivos</option>
        </select>
      </div>

      {/* Table */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando jugadores...</p>
        </div>
      ) : players.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-12 text-center">
          <p className="text-gray-500">No se encontraron jugadores</p>
        </div>
      ) : (
        <>
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Usuario</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Email</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Teléfono</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Balance</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase">Bono</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase">Registro</th>
                    <th className="px-4 py-3 text-center text-xs font-medium text-gray-500 uppercase">Acciones</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {players.map((player) => (
                    <tr key={player.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap">
                        <div className="flex items-center">
                          <div className="w-8 h-8 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold text-sm">
                            {player.username?.charAt(0).toUpperCase()}
                          </div>
                          <span className="ml-3 text-sm font-medium text-gray-900">{player.username}</span>
                        </div>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {player.email}
                        {player.emailVerified && <span className="ml-1 text-green-600" title="Email verificado">✓</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {player.phone || '-'}
                        {player.whatsappVerified && <span className="ml-1 text-green-600" title="WhatsApp verificado">✓</span>}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-right text-green-600">
                        {formatCurrency(player.balance)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm font-medium text-right text-purple-600">
                        {parseFloat(player.bonusBalance || 0) > 0 ? formatCurrency(player.bonusBalance) : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-center">
                        <span className={`px-2 py-1 text-xs font-semibold rounded-full ${player.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                          {player.isActive ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {new Date(player.createdAt).toLocaleDateString('es-VE')}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        <div className="flex items-center justify-center gap-1">
                          <button
                            onClick={() => router.push(`/admin/jugadores/${player.id}`)}
                            className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors" title="Ver detalle"
                          >
                            <Eye className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => handleToggleStatus(player)}
                            disabled={actionLoading === player.id}
                            className={`p-1.5 rounded-lg transition-colors ${player.isActive ? 'text-red-600 hover:bg-red-50' : 'text-green-600 hover:bg-green-50'}`}
                            title={player.isActive ? 'Desactivar' : 'Activar'}
                          >
                            <Power className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => { setBonusModal({ open: true, player }); setBonusForm({ amount: '', reason: '' }); }}
                            className="p-1.5 text-purple-600 hover:bg-purple-50 rounded-lg transition-colors" title="Dar bono"
                          >
                            <Gift className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {pagination.total > pagination.limit && (
            <div className="flex items-center justify-between bg-white rounded-lg shadow px-4 py-3">
              <p className="text-sm text-gray-600">
                Mostrando {pagination.offset + 1}-{Math.min(pagination.offset + pagination.limit, pagination.total)} de {pagination.total}
              </p>
              <div className="flex gap-2">
                <button
                  onClick={() => setPagination(prev => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
                  disabled={pagination.offset === 0}
                  className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50"
                >
                  <ChevronLeft className="w-4 h-4" /> Anterior
                </button>
                <button
                  onClick={() => setPagination(prev => ({ ...prev, offset: prev.offset + prev.limit }))}
                  disabled={pagination.offset + pagination.limit >= pagination.total}
                  className="flex items-center gap-1 px-3 py-1.5 border rounded-lg text-sm disabled:opacity-50 hover:bg-gray-50"
                >
                  Siguiente <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}

      {/* Bonus Modal */}
      {bonusModal.open && bonusModal.player && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-lg font-semibold mb-1">Dar Bono</h3>
              <p className="text-sm text-gray-600 mb-4">Jugador: <strong>{bonusModal.player.username}</strong></p>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Monto (Bs)</label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={bonusForm.amount}
                    onChange={(e) => setBonusForm(prev => ({ ...prev, amount: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500"
                    placeholder="0.00"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Razón (opcional)</label>
                  <input
                    type="text"
                    value={bonusForm.reason}
                    onChange={(e) => setBonusForm(prev => ({ ...prev, reason: e.target.value }))}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500"
                    placeholder="Motivo del bono..."
                  />
                </div>
                <p className="text-xs text-gray-500">El bono solo puede ser usado para apostar. Las ganancias sí son retirables.</p>
              </div>
            </div>
            <div className="px-6 py-4 bg-gray-50 rounded-b-lg flex justify-end gap-3">
              <button onClick={() => setBonusModal({ open: false, player: null })} className="px-4 py-2 text-gray-700 border rounded-lg hover:bg-gray-100">
                Cancelar
              </button>
              <button
                onClick={handleGiveBonus}
                disabled={actionLoading === 'bonus'}
                className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50"
              >
                {actionLoading === 'bonus' ? 'Procesando...' : 'Dar Bono'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

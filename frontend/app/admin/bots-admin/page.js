'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { 
  Bot, Plus, Trash2, Settings, Send, CheckCircle, XCircle, 
  AlertCircle, Loader2, RefreshCw, Gamepad2
} from 'lucide-react';

export default function BotsAdminPage() {
  const router = useRouter();
  const [bots, setBots] = useState([]);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAssignModal, setShowAssignModal] = useState(false);
  const [selectedBot, setSelectedBot] = useState(null);
  const [creating, setCreating] = useState(false);
  const [newBot, setNewBot] = useState({ name: '', botToken: '' });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

  useEffect(() => {
    fetchBots();
    fetchGames();
  }, []);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('accessToken');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  const fetchBots = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/api/admin/bots`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setBots(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Error al cargar bots');
    } finally {
      setLoading(false);
    }
  };

  const fetchGames = async () => {
    try {
      const res = await fetch(`${API_URL}/api/games`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setGames(data.data);
      }
    } catch (err) {
      console.error('Error cargando juegos:', err);
    }
  };

  const handleCreateBot = async (e) => {
    e.preventDefault();
    setCreating(true);
    setError(null);

    try {
      const res = await fetch(`${API_URL}/api/admin/bots`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(newBot)
      });
      const data = await res.json();

      if (data.success) {
        setShowCreateModal(false);
        setNewBot({ name: '', botToken: '' });
        fetchBots();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Error al crear bot');
    } finally {
      setCreating(false);
    }
  };

  const handleDeleteBot = async (botId) => {
    if (!confirm('¿Estás seguro de eliminar este bot?')) return;

    try {
      const res = await fetch(`${API_URL}/api/admin/bots/${botId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();

      if (data.success) {
        fetchBots();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Error al eliminar bot');
    }
  };

  const handleToggleActive = async (bot) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/bots/${bot.id}`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ isActive: !bot.isActive })
      });
      const data = await res.json();

      if (data.success) {
        fetchBots();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Error al actualizar bot');
    }
  };

  const handleAssignGames = async (gameIds) => {
    try {
      const res = await fetch(`${API_URL}/api/admin/bots/${selectedBot.id}/games`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ gameIds })
      });
      const data = await res.json();

      if (data.success) {
        setShowAssignModal(false);
        fetchBots();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Error al asignar juegos');
    }
  };

  const getStatusBadge = (status) => {
    const statusConfig = {
      CONNECTED: { color: 'bg-green-100 text-green-800', icon: CheckCircle, text: 'Conectado' },
      DISCONNECTED: { color: 'bg-gray-100 text-gray-800', icon: XCircle, text: 'Desconectado' },
      ERROR: { color: 'bg-red-100 text-red-800', icon: AlertCircle, text: 'Error' },
      CONNECTING: { color: 'bg-yellow-100 text-yellow-800', icon: Loader2, text: 'Conectando' }
    };

    const config = statusConfig[status] || statusConfig.DISCONNECTED;
    const Icon = config.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
        <Icon className="w-3 h-3" />
        {config.text}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-gray-900 flex items-center gap-2">
            <Bot className="w-6 h-6 lg:w-7 lg:h-7 text-blue-600" />
            Bots de Administración
          </h1>
          <p className="text-gray-600 mt-1">
            Gestiona los bots de Telegram para notificaciones a administradores
          </p>
        </div>
        <button
          onClick={() => setShowCreateModal(true)}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus className="w-4 h-4" />
          Nuevo Bot
        </button>
      </div>

      {/* Error Alert */}
      {error && (
        <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2 text-red-700">
          <AlertCircle className="w-5 h-5 flex-shrink-0 mt-0.5" />
          <div className="flex-1">{error}</div>
          <button onClick={() => setError(null)} className="ml-auto text-red-500 hover:text-red-700 flex-shrink-0">
            ×
          </button>
        </div>
      )}

      {/* Bots List */}
      {bots.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg">
          <Bot className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h3 className="text-lg font-medium text-gray-900">No hay bots configurados</h3>
          <p className="text-gray-600 mt-1">Crea un bot de Telegram para enviar notificaciones</p>
          <button
            onClick={() => setShowCreateModal(true)}
            className="mt-4 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Crear primer bot
          </button>
        </div>
      ) : (
        <div className="grid gap-4">
          {bots.map((bot) => (
            <div key={bot.id} className="bg-white rounded-lg border shadow-sm p-4 lg:p-5">
              <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className={`p-3 rounded-lg flex-shrink-0 ${bot.isActive ? 'bg-blue-100' : 'bg-gray-100'}`}>
                    <Bot className={`w-6 h-6 ${bot.isActive ? 'text-blue-600' : 'text-gray-400'}`} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 truncate">{bot.name}</h3>
                    {bot.botUsername && (
                      <p className="text-sm text-blue-600">@{bot.botUsername}</p>
                    )}
                    <p className="text-xs text-gray-500 mt-1 break-all">Token: {bot.botToken}</p>
                    <div className="flex items-center gap-2 mt-2 flex-wrap">
                      {getStatusBadge(bot.status)}
                      {!bot.isActive && (
                        <span className="text-xs text-gray-500">(Desactivado)</span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => handleToggleActive(bot)}
                    className={`px-3 py-1.5 text-sm rounded-lg transition whitespace-nowrap ${
                      bot.isActive 
                        ? 'bg-gray-100 text-gray-700 hover:bg-gray-200' 
                        : 'bg-green-100 text-green-700 hover:bg-green-200'
                    }`}
                  >
                    {bot.isActive ? 'Desactivar' : 'Activar'}
                  </button>
                  <button
                    onClick={() => {
                      setSelectedBot(bot);
                      setShowAssignModal(true);
                    }}
                    className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                    title="Asignar juegos"
                  >
                    <Gamepad2 className="w-5 h-5" />
                  </button>
                  <button
                    onClick={() => handleDeleteBot(bot.id)}
                    className="p-2 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                    title="Eliminar"
                  >
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>

              {/* Juegos asignados */}
              {bot.gameAssignments?.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <p className="text-sm font-medium text-gray-700 mb-2">Juegos asignados:</p>
                  <div className="flex flex-wrap gap-2">
                    {bot.gameAssignments.map((assignment) => (
                      <span
                        key={assignment.id}
                        className="px-2 py-1 bg-blue-50 text-blue-700 text-sm rounded-lg"
                      >
                        {assignment.game.name}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Modal Crear Bot */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold mb-4">Crear Bot de Administración</h2>
            
            <form onSubmit={handleCreateBot}>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Nombre del Bot
                  </label>
                  <input
                    type="text"
                    value={newBot.name}
                    onChange={(e) => setNewBot({ ...newBot, name: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    placeholder="Ej: Bot Notificaciones Principal"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Token del Bot
                  </label>
                  <input
                    type="text"
                    value={newBot.botToken}
                    onChange={(e) => setNewBot({ ...newBot, botToken: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 font-mono text-sm"
                    placeholder="123456789:ABCdefGHIjklMNOpqrsTUVwxyz"
                    required
                  />
                  <p className="text-xs text-gray-500 mt-1">
                    Obtén el token desde @BotFather en Telegram
                  </p>
                </div>
              </div>

              <div className="flex justify-end gap-3 mt-6">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateModal(false);
                    setNewBot({ name: '', botToken: '' });
                  }}
                  className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={creating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
                >
                  {creating && <Loader2 className="w-4 h-4 animate-spin" />}
                  Crear Bot
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Asignar Juegos */}
      {showAssignModal && selectedBot && (
        <AssignGamesModal
          bot={selectedBot}
          games={games}
          onClose={() => {
            setShowAssignModal(false);
            setSelectedBot(null);
          }}
          onSave={handleAssignGames}
        />
      )}
    </div>
  );
}

function AssignGamesModal({ bot, games, onClose, onSave }) {
  const [selectedGames, setSelectedGames] = useState(
    bot.gameAssignments?.map(a => a.game.id) || []
  );
  const [saving, setSaving] = useState(false);

  const toggleGame = (gameId) => {
    setSelectedGames(prev => 
      prev.includes(gameId) 
        ? prev.filter(id => id !== gameId)
        : [...prev, gameId]
    );
  };

  const handleSave = async () => {
    setSaving(true);
    await onSave(selectedGames);
    setSaving(false);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl p-6 w-full max-w-md">
        <h2 className="text-xl font-bold mb-2">Asignar Juegos</h2>
        <p className="text-gray-600 text-sm mb-4">
          Selecciona los juegos que usarán el bot <strong>@{bot.botUsername}</strong> para notificaciones
        </p>

        <div className="space-y-2 max-h-64 overflow-y-auto">
          {games.map((game) => (
            <label
              key={game.id}
              className={`flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition ${
                selectedGames.includes(game.id)
                  ? 'border-blue-500 bg-blue-50'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
            >
              <input
                type="checkbox"
                checked={selectedGames.includes(game.id)}
                onChange={() => toggleGame(game.id)}
                className="w-4 h-4 text-blue-600 rounded"
              />
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">{game.name}</p>
                <p className="text-xs text-gray-500">{game.slug}</p>
              </div>
            </label>
          ))}
        </div>

        <div className="flex justify-end gap-3 mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            Guardar
          </button>
        </div>
      </div>
    </div>
  );
}

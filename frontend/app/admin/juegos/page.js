'use client';

import { useEffect, useState } from 'react';
import gamesAPI from '@/lib/api/games';
import { toast } from 'sonner';
import { Gamepad2, Plus, Edit2, Eye, Trash2 } from 'lucide-react';
import Link from 'next/link';
import GameModal from '@/components/admin/config/GameModal';

export default function JuegosPage() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedGame, setSelectedGame] = useState(null);

  useEffect(() => {
    loadGames();
  }, []);

  const loadGames = async () => {
    try {
      const response = await gamesAPI.getAll();
      setGames(response.data || []);
    } catch (error) {
      console.error('Error loading games:', error);
      toast.error('Error al cargar juegos');
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedGame(null);
    setShowModal(true);
  };

  const handleEdit = (game) => {
    setSelectedGame(game);
    setShowModal(true);
  };

  const handleDelete = async (game) => {
    if (!confirm(`¿Estás seguro de eliminar el juego "${game.name}"?`)) return;

    try {
      await gamesAPI.delete(game.id);
      toast.success('Juego eliminado correctamente');
      loadGames();
    } catch (error) {
      toast.error(error.message || 'Error al eliminar juego');
    }
  };

  const handleModalClose = (reload) => {
    setShowModal(false);
    setSelectedGame(null);
    if (reload) loadGames();
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando juegos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Juegos</h1>
          <p className="text-gray-600 mt-1">Administra los juegos del sistema</p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Juego
        </button>
      </div>

      {/* Games Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {games.map((game) => (
          <div
            key={game.id}
            className="bg-white rounded-lg shadow hover:shadow-lg transition p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Gamepad2 className="w-6 h-6 text-blue-600" />
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                game.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
              }`}>
                {game.isActive ? 'Activo' : 'Inactivo'}
              </span>
            </div>

            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {game.name}
            </h3>
            
            <div className="space-y-2 text-sm text-gray-600 mb-4">
              <div className="flex items-center justify-between">
                <span>Tipo:</span>
                <span className="font-medium">{game.type}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Slug:</span>
                <span className="font-mono text-xs">{game.slug}</span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Link
                href={`/admin/juegos/${game.id}`}
                className="flex-1 flex items-center justify-center px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition text-sm"
              >
                <Eye className="w-4 h-4 mr-2" />
                Configurar
              </Link>
              <button
                onClick={() => handleEdit(game)}
                className="flex items-center justify-center px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                title="Editar juego"
              >
                <Edit2 className="w-4 h-4 text-blue-600" />
              </button>
              <button
                onClick={() => handleDelete(game)}
                className="flex items-center justify-center px-3 py-2 border border-gray-300 rounded-lg hover:bg-red-50 transition"
                title="Eliminar juego"
              >
                <Trash2 className="w-4 h-4 text-red-600" />
              </button>
            </div>
          </div>
        ))}
      </div>

      {games.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Gamepad2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">No hay juegos configurados</p>
          <button
            onClick={handleCreate}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus className="w-4 h-4 mr-2" />
            Crear Primer Juego
          </button>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <GameModal
          game={selectedGame}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}

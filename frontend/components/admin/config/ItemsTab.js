'use client';

import { useEffect, useState } from 'react';
import gamesAPI from '@/lib/api/games';
import itemsAPI from '@/lib/api/items';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Hash, Filter, Upload } from 'lucide-react';
import ItemModal from './ItemModal';

export default function ItemsTab({ selectedGameId: initialGameId }) {
  const [items, setItems] = useState([]);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedItem, setSelectedItem] = useState(null);
  const [selectedGameId, setSelectedGameId] = useState(initialGameId || '');

  useEffect(() => {
    loadGames();
  }, []);

  useEffect(() => {
    if (initialGameId && initialGameId !== selectedGameId) {
      setSelectedGameId(initialGameId);
    }
  }, [initialGameId]);

  useEffect(() => {
    if (selectedGameId) {
      loadItems();
    } else {
      setItems([]);
      setLoading(false);
    }
  }, [selectedGameId]);

  const loadGames = async () => {
    try {
      const response = await gamesAPI.getAll();
      const gamesList = response.data || [];
      setGames(gamesList);
      if (gamesList.length > 0) {
        setSelectedGameId(gamesList[0].id);
      }
    } catch (error) {
      console.error('Error loading games:', error);
      toast.error('Error al cargar juegos');
      setLoading(false);
    }
  };

  const loadItems = async () => {
    setLoading(true);
    try {
      const response = await gamesAPI.getItems(selectedGameId);
      // Backend returns { data: { items: [...], total: X } }
      const itemsData = response.data?.items || response.data || [];
      setItems(Array.isArray(itemsData) ? itemsData : []);
    } catch (error) {
      console.error('Error loading items:', error);
      toast.error('Error al cargar items');
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedItem(null);
    setShowModal(true);
  };

  const handleEdit = (item) => {
    setSelectedItem(item);
    setShowModal(true);
  };

  const handleDelete = async (item) => {
    if (!confirm(`¿Estás seguro de eliminar el item "${item.number} - ${item.name}"?`)) return;

    try {
      await itemsAPI.delete(item.id);
      toast.success('Item eliminado correctamente');
      loadItems();
    } catch (error) {
      toast.error(error.message || 'Error al eliminar item');
    }
  };

  const handleModalClose = (reload) => {
    setShowModal(false);
    setSelectedItem(null);
    if (reload) loadItems();
  };

  const selectedGame = games.find(g => g.id === selectedGameId);

  if (loading && games.length === 0) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
        </div>
      </div>
    );
  }

  if (games.length === 0) {
    return (
      <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
        <Hash className="w-12 h-12 text-gray-400 mx-auto mb-4" />
        <p className="text-gray-600">Primero debes crear un juego en la pestaña "Juegos"</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Items de Juegos</h2>
          <p className="text-sm text-gray-600 mt-1">Gestiona los números/animales de cada juego</p>
        </div>
        {selectedGameId && (
          <button
            onClick={handleCreate}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nuevo Item
          </button>
        )}
      </div>

      {/* Game Filter - Only show if not viewing a specific game */}
      {!initialGameId && (
        <div className="flex items-center space-x-4">
          <Filter className="w-5 h-5 text-gray-400" />
          <select
            value={selectedGameId}
            onChange={(e) => setSelectedGameId(e.target.value)}
            className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
          >
            {games.map(game => (
              <option key={game.id} value={game.id}>{game.name}</option>
            ))}
          </select>
        </div>
      )}

      {/* Game Info */}
      {selectedGame && (
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="font-semibold text-gray-900">{selectedGame.name}</h3>
              <p className="text-sm text-gray-600 mt-1">
                Total de items: {items.length} / {selectedGame.totalNumbers}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Items Table */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Cargando items...</p>
          </div>
        </div>
      ) : items.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Hash className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">No hay items configurados para este juego</p>
          <button
            onClick={handleCreate}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus className="w-4 h-4 mr-2" />
            Crear Primer Item
          </button>
        </div>
      ) : (
        <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Número
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Nombre
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Orden
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Multiplicador
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {items.map((item) => (
                  <tr key={item.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-mono font-medium text-gray-900">
                        {item.number}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{item.name}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-600">{item.displayOrder}</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-900">{item.multiplier}x</span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                        item.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}>
                        {item.isActive ? 'Activo' : 'Inactivo'}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleEdit(item)}
                        className="text-blue-600 hover:text-blue-900 mr-3"
                      >
                        <Edit2 className="w-4 h-4 inline" />
                      </button>
                      <button
                        onClick={() => handleDelete(item)}
                        className="text-red-600 hover:text-red-900"
                      >
                        <Trash2 className="w-4 h-4 inline" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <ItemModal
          item={selectedItem}
          gameId={selectedGameId}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}

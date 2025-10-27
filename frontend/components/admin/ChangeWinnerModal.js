'use client';

import { useState, useEffect } from 'react';
import { X, Search } from 'lucide-react';
import drawsAPI from '@/lib/api/draws';
import api from '@/lib/api/axios';
import { toast } from 'sonner';
import { formatCaracasDateTime } from '@/lib/utils/dateUtils';

export default function ChangeWinnerModal({ draw, onClose, onSuccess }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedItem, setSelectedItem] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadGameItems();
  }, []);

  const loadGameItems = async () => {
    try {
      const response = await api.get(`/api/games/${draw.game.id}/items?pageSize=1000`);
      if (response.data.success) {
        setItems(response.data.data.items || []);
      }
    } catch (error) {
      console.error('Error loading items:', error);
      toast.error('Error al cargar los números');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!selectedItem) {
      toast.error('Selecciona un número ganador');
      return;
    }

    setSubmitting(true);
    try {
      await drawsAPI.changeWinner(draw.id, selectedItem.id);
      onSuccess();
    } catch (error) {
      console.error('Error changing winner:', error);
      toast.error('Error al cambiar el ganador');
      setSubmitting(false);
    }
  };

  const filteredItems = items.filter(item =>
    item.number.toLowerCase().includes(search.toLowerCase()) ||
    (item.name && item.name.toLowerCase().includes(search.toLowerCase()))
  );

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] flex flex-col">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-200 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Cambiar Ganador</h2>
            <p className="text-sm text-gray-600 mt-1">
              {draw.game.name} - {formatCaracasDateTime(draw.scheduledAt)}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Current Winner */}
        {(draw.winnerItem || draw.preselectedItem) && (
          <div className="px-6 py-4 bg-blue-50 border-b border-blue-100">
            <p className="text-sm text-blue-800">
              <strong>Ganador actual:</strong>{' '}
              {(draw.winnerItem || draw.preselectedItem).number}
              {(draw.winnerItem || draw.preselectedItem).name && 
                ` - ${(draw.winnerItem || draw.preselectedItem).name}`
              }
            </p>
          </div>
        )}

        {/* Search */}
        <div className="px-6 py-4 border-b border-gray-200">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="Buscar por número o nombre..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
            />
          </div>
        </div>

        {/* Items List */}
        <div className="flex-1 overflow-y-auto p-6">
          {loading ? (
            <div className="text-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto"></div>
              <p className="mt-2 text-gray-600">Cargando números...</p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-3">
              {filteredItems.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedItem(item)}
                  className={`p-3 border-2 rounded-lg text-center transition ${
                    selectedItem?.id === item.id
                      ? 'border-blue-600 bg-blue-50'
                      : 'border-gray-200 hover:border-blue-300'
                  }`}
                >
                  <div className="font-bold text-lg text-gray-900">
                    {item.number}
                  </div>
                  {item.name && (
                    <div className="text-xs text-gray-600 mt-1 truncate">
                      {item.name}
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-end space-x-3">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
            disabled={submitting}
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={!selectedItem || submitting}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Guardando...' : 'Cambiar Ganador'}
          </button>
        </div>
      </div>
    </div>
  );
}

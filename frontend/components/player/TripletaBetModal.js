'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import tripletaAPI from '@/lib/api/tripleta';
import gamesAPI from '@/lib/api/games';
import { X, Trophy, AlertCircle, DollarSign, Calendar, TrendingUp } from 'lucide-react';

export default function TripletaBetModal({ game, onClose, onSuccess }) {
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [items, setItems] = useState([]);
  const [selectedItems, setSelectedItems] = useState([]);
  const [amount, setAmount] = useState('');
  const [config, setConfig] = useState(null);

  useEffect(() => {
    loadGameData();
  }, [game]);

  const loadGameData = async () => {
    try {
      setLoading(true);
      const [gameRes, itemsRes] = await Promise.all([
        gamesAPI.getById(game.id),
        gamesAPI.getItems(game.id)
      ]);

      const gameData = gameRes.data || gameRes;
      setConfig(gameData?.config?.tripleta);

      const itemsData = itemsRes?.data?.items || itemsRes?.items || [];
      setItems(itemsData);
    } catch (error) {
      console.error('Error loading game data:', error);
      toast.error('Error al cargar datos del juego');
    } finally {
      setLoading(false);
    }
  };

  const handleItemSelect = (item) => {
    if (selectedItems.find(i => i.id === item.id)) {
      setSelectedItems(selectedItems.filter(i => i.id !== item.id));
    } else if (selectedItems.length < 3) {
      setSelectedItems([...selectedItems, item]);
    } else {
      toast.error('Solo puedes seleccionar 3 números');
    }
  };

  const handleSubmit = async () => {
    try {
      if (selectedItems.length !== 3) {
        toast.error('Debes seleccionar exactamente 3 números');
        return;
      }

      const betAmount = parseFloat(amount);
      if (!betAmount || betAmount <= 0) {
        toast.error('Ingresa un monto válido');
        return;
      }

      setSubmitting(true);

      const response = await tripletaAPI.createBet({
        gameId: game.id,
        item1Id: selectedItems[0].id,
        item2Id: selectedItems[1].id,
        item3Id: selectedItems[2].id,
        amount: betAmount
      });

      if (response.success) {
        toast.success('¡Apuesta Tripleta creada exitosamente!');
        if (onSuccess) onSuccess(response.data);
        onClose();
      }
    } catch (error) {
      console.error('Error creating tripleta bet:', error);
      toast.error(error.message || 'Error al crear la apuesta');
    } finally {
      setSubmitting(false);
    }
  };

  const potentialPrize = amount && config ? (parseFloat(amount) * config.multiplier).toFixed(2) : '0.00';

  if (loading) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-6 max-w-md w-full">
          <div className="text-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">Cargando...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!config || !config.enabled) {
    return (
      <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-lg p-6 max-w-md w-full">
          <div className="text-center">
            <AlertCircle className="w-12 h-12 text-yellow-500 mx-auto mb-4" />
            <h3 className="text-lg font-semibold mb-2">Tripleta no disponible</h3>
            <p className="text-gray-600 mb-4">
              La modalidad Tripleta no está habilitada para este juego.
            </p>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Cerrar
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4 overflow-y-auto">
      <div className="bg-white rounded-lg max-w-4xl w-full my-8">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-yellow-100 rounded-lg flex items-center justify-center">
              <Trophy className="w-6 h-6 text-yellow-600" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-gray-900">Apuesta Tripleta</h2>
              <p className="text-sm text-gray-600">{game.name}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Info Alert */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex gap-3">
              <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">¿Cómo funciona?</p>
                <p>
                  Selecciona 3 números diferentes. Si los 3 números salen en los próximos{' '}
                  <strong>{config.drawsCount} sorteos</strong>, ganas{' '}
                  <strong>{config.multiplier}x</strong> tu apuesta.
                </p>
              </div>
            </div>
          </div>

          {/* Configuration Info */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <TrendingUp className="w-4 h-4 text-gray-600" />
                <p className="text-sm text-gray-600">Multiplicador</p>
              </div>
              <p className="text-2xl font-bold text-gray-900">{config.multiplier}x</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Calendar className="w-4 h-4 text-gray-600" />
                <p className="text-sm text-gray-600">Sorteos</p>
              </div>
              <p className="text-2xl font-bold text-gray-900">{config.drawsCount}</p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <DollarSign className="w-4 h-4 text-gray-600" />
                <p className="text-sm text-gray-600">Premio Potencial</p>
              </div>
              <p className="text-2xl font-bold text-green-600">${potentialPrize}</p>
            </div>
          </div>

          {/* Selected Items */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">
              Números Seleccionados ({selectedItems.length}/3)
            </label>
            <div className="flex gap-3 mb-4">
              {[0, 1, 2].map((index) => (
                <div
                  key={index}
                  className={`flex-1 h-20 rounded-lg border-2 border-dashed flex items-center justify-center ${
                    selectedItems[index]
                      ? 'bg-blue-50 border-blue-300'
                      : 'bg-gray-50 border-gray-300'
                  }`}
                >
                  {selectedItems[index] ? (
                    <div className="text-center">
                      <p className="text-2xl font-bold text-blue-600">
                        {selectedItems[index].number}
                      </p>
                      <p className="text-xs text-gray-600">
                        {selectedItems[index].name}
                      </p>
                    </div>
                  ) : (
                    <p className="text-gray-400 text-sm">Número {index + 1}</p>
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Items Grid */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-3">
              Selecciona 3 números diferentes
            </label>
            <div className="grid grid-cols-4 sm:grid-cols-6 md:grid-cols-8 gap-2 max-h-64 overflow-y-auto p-2 bg-gray-50 rounded-lg">
              {items.map((item) => {
                const isSelected = selectedItems.find(i => i.id === item.id);
                return (
                  <button
                    key={item.id}
                    onClick={() => handleItemSelect(item)}
                    disabled={!isSelected && selectedItems.length >= 3}
                    className={`p-3 rounded-lg border-2 transition ${
                      isSelected
                        ? 'bg-blue-600 border-blue-600 text-white'
                        : 'bg-white border-gray-300 text-gray-900 hover:border-blue-400'
                    } disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    <p className="text-lg font-bold">{item.number}</p>
                    <p className="text-xs truncate">{item.name}</p>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Amount Input */}
          <div>
            <label className="block text-sm font-medium text-gray-900 mb-2">
              Monto a Apostar
            </label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">$</span>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                placeholder="0.00"
                className="w-full pl-8 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            {amount && parseFloat(amount) > 0 && (
              <p className="text-sm text-gray-600 mt-2">
                Si ganas, recibirás: <strong className="text-green-600">${potentialPrize}</strong>
              </p>
            )}
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col sm:flex-row gap-3 p-6 border-t border-gray-200">
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={submitting || selectedItems.length !== 3 || !amount || parseFloat(amount) <= 0}
            className="flex-1 px-4 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {submitting ? 'Procesando...' : 'Confirmar Apuesta'}
          </button>
        </div>
      </div>
    </div>
  );
}

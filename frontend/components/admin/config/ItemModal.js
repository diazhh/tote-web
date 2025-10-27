'use client';

import { useState, useEffect } from 'react';
import itemsAPI from '@/lib/api/items';
import { toast } from 'sonner';
import { X, Save } from 'lucide-react';

export default function ItemModal({ item, gameId, onClose }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    gameId: gameId,
    number: '',
    name: '',
    displayOrder: 0,
    multiplier: 30.00,
    isActive: true,
  });

  useEffect(() => {
    if (item) {
      setFormData({
        gameId: item.gameId,
        number: item.number || '',
        name: item.name || '',
        displayOrder: item.displayOrder || 0,
        multiplier: item.multiplier || 30.00,
        isActive: item.isActive !== undefined ? item.isActive : true,
      });
    }
  }, [item]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = {
        ...formData,
        displayOrder: parseInt(formData.displayOrder),
        multiplier: parseFloat(formData.multiplier),
      };

      if (item) {
        await itemsAPI.update(item.id, data);
        toast.success('Item actualizado correctamente');
      } else {
        await itemsAPI.create(data);
        toast.success('Item creado correctamente');
      }
      onClose(true);
    } catch (error) {
      toast.error(error.message || 'Error al guardar item');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {item ? 'Editar Item' : 'Nuevo Item'}
          </h2>
          <button
            onClick={() => onClose(false)}
            className="text-gray-400 hover:text-gray-600 transition"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label htmlFor="number" className="block text-sm font-medium text-gray-700 mb-2">
              Número *
            </label>
            <input
              id="number"
              name="number"
              type="text"
              value={formData.number}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono"
              required
              disabled={loading || !!item}
              placeholder="00, 01, 000, etc."
            />
            {item && (
              <p className="text-xs text-gray-500 mt-1">
                El número no se puede cambiar después de crear el item
              </p>
            )}
          </div>

          <div>
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Nombre *
            </label>
            <input
              id="name"
              name="name"
              type="text"
              value={formData.name}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
              disabled={loading}
              placeholder="BALLENA, CARNERO, etc."
            />
          </div>

          <div>
            <label htmlFor="displayOrder" className="block text-sm font-medium text-gray-700 mb-2">
              Orden de Visualización *
            </label>
            <input
              id="displayOrder"
              name="displayOrder"
              type="number"
              value={formData.displayOrder}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
              disabled={loading}
              min="0"
            />
            <p className="text-xs text-gray-500 mt-1">
              Define el orden en que se muestra este item
            </p>
          </div>

          <div>
            <label htmlFor="multiplier" className="block text-sm font-medium text-gray-700 mb-2">
              Multiplicador *
            </label>
            <input
              id="multiplier"
              name="multiplier"
              type="number"
              step="0.01"
              value={formData.multiplier}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
              disabled={loading}
              min="0"
            />
            <p className="text-xs text-gray-500 mt-1">
              Multiplicador de pago (ej: 30.00 = paga 30 veces la apuesta)
            </p>
          </div>

          <div className="flex items-center">
            <input
              id="isActive"
              name="isActive"
              type="checkbox"
              checked={formData.isActive}
              onChange={handleChange}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
              disabled={loading}
            />
            <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
              Item activo
            </label>
          </div>

          {/* Actions */}
          <div className="flex items-center justify-end space-x-3 pt-4 border-t border-gray-200">
            <button
              type="button"
              onClick={() => onClose(false)}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Save className="w-4 h-4 mr-2" />
              {loading ? 'Guardando...' : item ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

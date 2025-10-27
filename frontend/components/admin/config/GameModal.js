'use client';

import { useState, useEffect } from 'react';
import gamesAPI from '@/lib/api/games';
import { toast } from 'sonner';
import { X, Save } from 'lucide-react';

export default function GameModal({ game, onClose }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'ANIMALITOS',
    slug: '',
    totalNumbers: 38,
    description: '',
    isActive: true,
  });

  useEffect(() => {
    if (game) {
      setFormData({
        name: game.name || '',
        type: game.type || 'ANIMALITOS',
        slug: game.slug || '',
        totalNumbers: game.totalNumbers || 38,
        description: game.description || '',
        isActive: game.isActive !== undefined ? game.isActive : true,
      });
    }
  }, [game]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));

    // Auto-generate slug from name
    if (name === 'name' && !game) {
      const slug = value
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '');
      setFormData(prev => ({ ...prev, slug }));
    }
  };

  const handleTypeChange = (e) => {
    const type = e.target.value;
    let totalNumbers = 38;
    
    if (type === 'TRIPLE') totalNumbers = 1000;
    else if (type === 'ROULETTE') totalNumbers = 37;
    
    setFormData(prev => ({ ...prev, type, totalNumbers }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      const data = {
        ...formData,
        totalNumbers: parseInt(formData.totalNumbers),
      };

      if (game) {
        await gamesAPI.update(game.id, data);
        toast.success('Juego actualizado correctamente');
      } else {
        await gamesAPI.create(data);
        toast.success('Juego creado correctamente');
      }
      onClose(true);
    } catch (error) {
      toast.error(error.message || 'Error al guardar juego');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {game ? 'Editar Juego' : 'Nuevo Juego'}
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
            <label htmlFor="name" className="block text-sm font-medium text-gray-700 mb-2">
              Nombre del Juego *
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
              placeholder="Ej: LOTOANIMALITO"
            />
          </div>

          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Juego *
            </label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleTypeChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
              disabled={loading}
            >
              <option value="ANIMALITOS">Animalitos (38 números)</option>
              <option value="TRIPLE">Triple (1000 números)</option>
              <option value="ROULETTE">Ruleta (37 números)</option>
            </select>
          </div>

          <div>
            <label htmlFor="slug" className="block text-sm font-medium text-gray-700 mb-2">
              Slug (URL) *
            </label>
            <input
              id="slug"
              name="slug"
              type="text"
              value={formData.slug}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
              disabled={loading || !!game}
              placeholder="lotoanimalito"
              pattern="[a-z0-9-]+"
            />
            <p className="text-xs text-gray-500 mt-1">
              Solo letras minúsculas, números y guiones. No se puede cambiar después de crear.
            </p>
          </div>

          <div>
            <label htmlFor="totalNumbers" className="block text-sm font-medium text-gray-700 mb-2">
              Total de Números *
            </label>
            <input
              id="totalNumbers"
              name="totalNumbers"
              type="number"
              value={formData.totalNumbers}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
              disabled={loading}
              min="1"
            />
          </div>

          <div>
            <label htmlFor="description" className="block text-sm font-medium text-gray-700 mb-2">
              Descripción
            </label>
            <textarea
              id="description"
              name="description"
              value={formData.description}
              onChange={handleChange}
              rows={3}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              disabled={loading}
              placeholder="Descripción opcional del juego"
            />
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
              Juego activo
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
              {loading ? 'Guardando...' : game ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

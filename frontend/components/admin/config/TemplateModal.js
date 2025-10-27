'use client';

import { useState, useEffect } from 'react';
import templatesAPI from '@/lib/api/templates';
import { toast } from 'sonner';
import { X, Save, Plus, Trash2 } from 'lucide-react';

export default function TemplateModal({ template, games, onClose }) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    gameId: '',
    description: '',
    daysOfWeek: [],
    drawTimes: [],
    isActive: true,
  });
  const [newTime, setNewTime] = useState('08:00');

  useEffect(() => {
    if (template) {
      setFormData({
        name: template.name || '',
        gameId: template.gameId || '',
        description: template.description || '',
        daysOfWeek: template.daysOfWeek || [],
        drawTimes: template.drawTimes || [],
        isActive: template.isActive !== undefined ? template.isActive : true,
      });
    } else if (games.length > 0) {
      setFormData(prev => ({ ...prev, gameId: games[0].id }));
    }
  }, [template, games]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleDayToggle = (day) => {
    setFormData(prev => ({
      ...prev,
      daysOfWeek: prev.daysOfWeek.includes(day)
        ? prev.daysOfWeek.filter(d => d !== day)
        : [...prev.daysOfWeek, day].sort((a, b) => a - b)
    }));
  };

  const handleAddTime = () => {
    if (!newTime) return;
    if (formData.drawTimes.includes(newTime)) {
      toast.error('Este horario ya está agregado');
      return;
    }
    setFormData(prev => ({
      ...prev,
      drawTimes: [...prev.drawTimes, newTime].sort()
    }));
    setNewTime('08:00');
  };

  const handleRemoveTime = (time) => {
    setFormData(prev => ({
      ...prev,
      drawTimes: prev.drawTimes.filter(t => t !== time)
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (formData.daysOfWeek.length === 0) {
      toast.error('Selecciona al menos un día de la semana');
      return;
    }

    if (formData.drawTimes.length === 0) {
      toast.error('Agrega al menos un horario');
      return;
    }

    setLoading(true);

    try {
      const data = {
        ...formData,
        daysOfWeek: formData.daysOfWeek.map(d => parseInt(d)),
      };

      if (template) {
        await templatesAPI.update(template.id, data);
        toast.success('Plantilla actualizada correctamente');
      } else {
        await templatesAPI.create(data);
        toast.success('Plantilla creada correctamente');
      }
      onClose(true);
    } catch (error) {
      toast.error(error.message || 'Error al guardar plantilla');
    } finally {
      setLoading(false);
    }
  };

  const days = [
    { value: 1, label: 'Lunes' },
    { value: 2, label: 'Martes' },
    { value: 3, label: 'Miércoles' },
    { value: 4, label: 'Jueves' },
    { value: 5, label: 'Viernes' },
    { value: 6, label: 'Sábado' },
    { value: 7, label: 'Domingo' },
  ];

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {template ? 'Editar Plantilla' : 'Nueva Plantilla'}
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
              Nombre de la Plantilla *
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
              placeholder="Ej: Plantilla Lunes a Viernes"
            />
          </div>

          <div>
            <label htmlFor="gameId" className="block text-sm font-medium text-gray-700 mb-2">
              Juego *
            </label>
            <select
              id="gameId"
              name="gameId"
              value={formData.gameId}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
              disabled={loading}
            >
              <option value="">Seleccionar juego</option>
              {games.map(game => (
                <option key={game.id} value={game.id}>{game.name}</option>
              ))}
            </select>
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
              rows={2}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              disabled={loading}
              placeholder="Descripción opcional"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Días de la Semana *
            </label>
            <div className="grid grid-cols-4 gap-2">
              {days.map((day) => (
                <button
                  key={day.value}
                  type="button"
                  onClick={() => handleDayToggle(day.value)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition ${
                    formData.daysOfWeek.includes(day.value)
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                  disabled={loading}
                >
                  {day.label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              Horarios de Sorteos *
            </label>
            <div className="flex items-center space-x-2 mb-3">
              <input
                type="time"
                value={newTime}
                onChange={(e) => setNewTime(e.target.value)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                disabled={loading}
              />
              <button
                type="button"
                onClick={handleAddTime}
                className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                disabled={loading}
              >
                <Plus className="w-4 h-4 mr-2" />
                Agregar
              </button>
            </div>

            <div className="flex flex-wrap gap-2">
              {formData.drawTimes.map((time) => (
                <div
                  key={time}
                  className="flex items-center space-x-2 px-3 py-2 bg-purple-100 text-purple-800 rounded-lg"
                >
                  <span className="font-medium">{time}</span>
                  <button
                    type="button"
                    onClick={() => handleRemoveTime(time)}
                    className="text-purple-600 hover:text-purple-800"
                    disabled={loading}
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
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
              Plantilla activa
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
              {loading ? 'Guardando...' : template ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

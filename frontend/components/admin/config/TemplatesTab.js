'use client';

import { useEffect, useState } from 'react';
import templatesAPI from '@/lib/api/templates';
import gamesAPI from '@/lib/api/games';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Clock, Filter } from 'lucide-react';
import TemplateModal from './TemplateModal';

export default function TemplatesTab({ selectedGameId: initialGameId }) {
  const [templates, setTemplates] = useState([]);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [filterGameId, setFilterGameId] = useState(initialGameId || '');

  useEffect(() => {
    loadGames();
  }, []);

  useEffect(() => {
    if (initialGameId && initialGameId !== filterGameId) {
      setFilterGameId(initialGameId);
    }
  }, [initialGameId]);

  useEffect(() => {
    loadTemplates();
  }, [filterGameId]);

  const loadGames = async () => {
    try {
      const response = await gamesAPI.getAll();
      setGames(response.data || []);
    } catch (error) {
      console.error('Error loading games:', error);
    }
  };

  const loadTemplates = async () => {
    setLoading(true);
    try {
      const filters = {};
      if (filterGameId) filters.gameId = filterGameId;
      
      const response = await templatesAPI.getAll(filters);
      const templatesData = response.data || [];
      setTemplates(Array.isArray(templatesData) ? templatesData : []);
    } catch (error) {
      console.error('Error loading templates:', error);
      toast.error('Error al cargar plantillas');
      setTemplates([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedTemplate(null);
    setShowModal(true);
  };

  const handleEdit = (template) => {
    setSelectedTemplate(template);
    setShowModal(true);
  };

  const handleDelete = async (template) => {
    if (!confirm(`¿Estás seguro de eliminar la plantilla "${template.name}"?`)) return;

    try {
      await templatesAPI.delete(template.id);
      toast.success('Plantilla eliminada correctamente');
      loadTemplates();
    } catch (error) {
      toast.error(error.message || 'Error al eliminar plantilla');
    }
  };

  const handleModalClose = (reload) => {
    setShowModal(false);
    setSelectedTemplate(null);
    if (reload) loadTemplates();
  };

  const getDayName = (day) => {
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return days[day] || day;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando plantillas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Plantillas de Sorteos</h2>
          <p className="text-sm text-gray-600 mt-1">Define horarios de sorteos por juego</p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nueva Plantilla
        </button>
      </div>

      {/* Filter */}
      <div className="flex items-center space-x-4">
        <Filter className="w-5 h-5 text-gray-400" />
        <select
          value={filterGameId}
          onChange={(e) => setFilterGameId(e.target.value)}
          className="px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
        >
          <option value="">Todos los juegos</option>
          {games.map(game => (
            <option key={game.id} value={game.id}>{game.name}</option>
          ))}
        </select>
      </div>

      {/* Templates List */}
      {templates.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <Clock className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">No hay plantillas configuradas</p>
          <button
            onClick={handleCreate}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus className="w-4 h-4 mr-2" />
            Crear Primera Plantilla
          </button>
        </div>
      ) : (
        <div className="space-y-4">
          {templates.map((template) => (
            <div
              key={template.id}
              className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-md transition"
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center space-x-3 mb-2">
                    <h3 className="text-lg font-semibold text-gray-900">
                      {template.name}
                    </h3>
                    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                      template.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                    }`}>
                      {template.isActive ? 'Activo' : 'Inactivo'}
                    </span>
                  </div>

                  <p className="text-sm text-gray-600 mb-3">
                    {template.game?.name}
                  </p>

                  {template.description && (
                    <p className="text-sm text-gray-600 mb-3">
                      {template.description}
                    </p>
                  )}

                  <div className="flex items-start space-x-6 text-sm">
                    <div>
                      <span className="font-medium text-gray-700">Días:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {template.daysOfWeek?.map((day) => (
                          <span
                            key={day}
                            className="inline-flex items-center px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium"
                          >
                            {getDayName(day)}
                          </span>
                        ))}
                      </div>
                    </div>

                    <div>
                      <span className="font-medium text-gray-700">Horarios:</span>
                      <div className="flex flex-wrap gap-1 mt-1">
                        {template.drawTimes?.map((time, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center px-2 py-1 bg-purple-100 text-purple-800 rounded text-xs font-medium"
                          >
                            {time}
                          </span>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>

                <div className="flex items-center space-x-2 ml-4">
                  <button
                    onClick={() => handleEdit(template)}
                    className="flex items-center justify-center p-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                  >
                    <Edit2 className="w-4 h-4 text-blue-600" />
                  </button>
                  <button
                    onClick={() => handleDelete(template)}
                    className="flex items-center justify-center p-2 border border-gray-300 rounded-lg hover:bg-red-50 transition"
                  >
                    <Trash2 className="w-4 h-4 text-red-600" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <TemplateModal
          template={selectedTemplate}
          games={games}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}

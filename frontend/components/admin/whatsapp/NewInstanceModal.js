'use client';

import { useState } from 'react';
import { toast } from 'sonner';
import { Plus } from 'lucide-react';

export default function NewInstanceModal({ onClose, onSubmit }) {
  const [instanceId, setInstanceId] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [validationError, setValidationError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    // Validación básica
    if (!instanceId) {
      setValidationError('El ID de instancia es obligatorio');
      return;
    }
    
    if (!name) {
      setValidationError('El nombre es obligatorio');
      return;
    }
    
    // Validar formato (solo letras, números y guiones)
    const idRegex = /^[a-zA-Z0-9-_]+$/;
    if (!idRegex.test(instanceId)) {
      setValidationError('El ID solo puede contener letras, números, guiones y guiones bajos');
      return;
    }
    
    setValidationError('');
    
    try {
      setLoading(true);
      await onSubmit(instanceId, name);
    } catch (error) {
      console.error('Error al crear instancia:', error);
      toast.error('Error al crear instancia: ' + (error.message || 'Error desconocido'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Nueva Instancia de WhatsApp</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            &times;
          </button>
        </div>
        
        <form onSubmit={handleSubmit}>
          <div className="space-y-4">
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-gray-700">
                Nombre de la Instancia
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="name"
                  name="name"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Ej: WhatsApp Principal"
                  className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  required
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Nombre descriptivo para identificar esta instancia
              </p>
            </div>

            <div>
              <label htmlFor="instanceId" className="block text-sm font-medium text-gray-700">
                ID de Instancia
              </label>
              <div className="mt-1">
                <input
                  type="text"
                  id="instanceId"
                  name="instanceId"
                  value={instanceId}
                  onChange={(e) => setInstanceId(e.target.value)}
                  placeholder="Ej: whatsapp-principal"
                  className="shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full sm:text-sm border-gray-300 rounded-md"
                  required
                />
              </div>
              <p className="mt-1 text-xs text-gray-500">
                Identificador único técnico (solo letras, números, guiones)
              </p>
            </div>
            
            {validationError && (
              <div className="mt-2 text-sm text-red-600">
                {validationError}
              </div>
            )}
          </div>
          
          <div className="mt-6 flex justify-end space-x-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              disabled={loading}
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
              disabled={loading}
            >
              {loading ? (
                <>
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white mr-2"></div>
                  Creando...
                </>
              ) : (
                <>
                  <Plus className="w-4 h-4 mr-2" />
                  Crear Instancia
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

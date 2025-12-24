'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { formatCaracasDateTime } from '@/lib/utils/dateUtils';
import telegramAPI from '@/lib/api/telegram';

/**
 * Componente para gestionar instancias de Telegram Bot
 */
export default function TelegramInstanceManager() {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newInstance, setNewInstance] = useState({
    instanceId: '',
    name: '',
    botToken: '',
    chatId: '',
    webhookUrl: ''
  });

  useEffect(() => {
    loadInstances();
  }, []);

  const loadInstances = async (forceRefresh = false) => {
    try {
      setLoading(true);
      
      if (forceRefresh) {
        setInstances([]);
      }
      
      const data = await telegramAPI.listInstances();
      setInstances(data.instances || []);
      
      if (forceRefresh) {
        toast.success(`Actualizado: ${data.instances?.length || 0} instancia(s)`);
      }
      
    } catch (error) {
      console.error('Error al cargar instancias:', error);
      toast.error('Error al cargar instancias: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const createInstance = async () => {
    try {
      await telegramAPI.createInstance({
        instanceId: newInstance.instanceId,
        name: newInstance.name,
        botToken: newInstance.botToken,
        chatId: newInstance.chatId || null,
        webhookUrl: newInstance.webhookUrl || null
      });

      toast.success('Instancia de Telegram creada exitosamente');
      setShowCreateModal(false);
      setNewInstance({
        instanceId: '',
        name: '',
        botToken: '',
        chatId: '',
        webhookUrl: ''
      });

      await loadInstances();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.response?.data?.message || error.message || 'Error al crear instancia');
    }
  };

  const testConnection = async (instanceId) => {
    try {
      const result = await telegramAPI.testConnection(instanceId);
      toast.success('Conexión exitosa: ' + result.message);
      await loadInstances();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.response?.data?.message || error.message || 'Error al probar conexión');
    }
  };

  const disconnectInstance = async (instanceId) => {
    if (!confirm('¿Desconectar esta instancia?')) return;

    try {
      await telegramAPI.disconnectInstance(instanceId);
      toast.success('Instancia desconectada');
      await loadInstances();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.response?.data?.message || error.message || 'Error al desconectar instancia');
    }
  };

  const deleteInstance = async (instanceId) => {
    if (!confirm('¿Eliminar esta instancia? Se borrarán todos los datos.')) return;

    try {
      await telegramAPI.deleteInstance(instanceId);
      toast.success('Instancia eliminada');
      await loadInstances();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.response?.data?.message || error.message || 'Error al eliminar instancia');
    }
  };

  const toggleActive = async (instance) => {
    try {
      const newStatus = !instance.isActive;
      await telegramAPI.toggleActive(instance.instanceId, newStatus);
      toast.success(newStatus ? 'Canal activado - Se enviarán mensajes' : 'Canal pausado - No se enviarán mensajes');
      await loadInstances();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.response?.data?.message || error.message || 'Error al cambiar estado');
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      CONNECTED: 'bg-green-100 text-green-800',
      CONNECTING: 'bg-yellow-100 text-yellow-800',
      DISCONNECTED: 'bg-red-100 text-red-800',
      ERROR: 'bg-red-100 text-red-800'
    };

    const labels = {
      CONNECTED: 'Conectado',
      CONNECTING: 'Conectando',
      DISCONNECTED: 'Desconectado',
      ERROR: 'Error'
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badges[status] || badges.DISCONNECTED}`}>
        {labels[status] || status}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold text-gray-900">Instancias de Telegram</h2>
          <p className="text-gray-600 mt-1">Gestiona los bots de Telegram</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => loadInstances(true)}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            title="Recargar instancias"
          >
            🔄 Actualizar
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors"
          >
            + Nueva Instancia
          </button>
        </div>
      </div>

      {/* Lista de instancias */}
      <div className="grid gap-4">
        {instances.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 rounded-lg">
            <p className="text-gray-500">No hay instancias configuradas</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="mt-4 text-blue-600 hover:text-blue-700"
            >
              Crear primera instancia
            </button>
          </div>
        ) : (
          instances.map((instance) => (
            <div key={instance.instanceId} className="bg-white border rounded-lg p-6">
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-3 mb-2">
                    <h3 className="text-lg font-semibold">{instance.name}</h3>
                    {getStatusBadge(instance.status)}
                    {/* Toggle Activo/Pausado */}
                    <button
                      onClick={() => toggleActive(instance)}
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        instance.isActive !== false
                          ? 'bg-green-100 text-green-800 hover:bg-green-200'
                          : 'bg-red-100 text-red-800 hover:bg-red-200'
                      }`}
                      title={instance.isActive !== false ? 'Click para pausar envíos' : 'Click para activar envíos'}
                    >
                      {instance.isActive !== false ? '✓ Activo' : '⏸ Pausado'}
                    </button>
                  </div>
                  
                  <div className="space-y-1 text-sm text-gray-600">
                    <p><strong>Instance ID:</strong> {instance.instanceId}</p>
                    {instance.config?.username && (
                      <p><strong>Bot:</strong> @{instance.config.username}</p>
                    )}
                    {instance.chatId && (
                      <p><strong>Chat ID:</strong> {instance.chatId}</p>
                    )}
                    {instance.connectedAt && (
                      <p><strong>Conectado:</strong> {formatCaracasDateTime(instance.connectedAt)}</p>
                    )}
                    <p><strong>Última actividad:</strong> {formatCaracasDateTime(instance.lastSeen)}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={() => testConnection(instance.instanceId)}
                    className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                  >
                    Probar
                  </button>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal: Crear Instancia */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Nueva Instancia de Telegram</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre de la Instancia
                </label>
                <input
                  type="text"
                  value={newInstance.name}
                  onChange={(e) => setNewInstance({ ...newInstance, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Telegram Principal"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Instance ID
                </label>
                <input
                  type="text"
                  value={newInstance.instanceId}
                  onChange={(e) => setNewInstance({ ...newInstance, instanceId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="telegram-1"
                />
                <p className="text-xs text-gray-500 mt-1">Identificador único</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Bot Token
                </label>
                <input
                  type="password"
                  value={newInstance.botToken}
                  onChange={(e) => setNewInstance({ ...newInstance, botToken: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11"
                />
                <p className="text-xs text-gray-500 mt-1">Token del bot obtenido de @BotFather</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Chat ID (opcional)
                </label>
                <input
                  type="text"
                  value={newInstance.chatId}
                  onChange={(e) => setNewInstance({ ...newInstance, chatId: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="-1001234567890"
                />
                <p className="text-xs text-gray-500 mt-1">ID del chat/canal por defecto</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Webhook URL (opcional)
                </label>
                <input
                  type="url"
                  value={newInstance.webhookUrl}
                  onChange={(e) => setNewInstance({ ...newInstance, webhookUrl: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="https://tu-dominio.com/webhook"
                />
                <p className="text-xs text-gray-500 mt-1">URL para recibir actualizaciones</p>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowCreateModal(false)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={createInstance}
                disabled={!newInstance.name || !newInstance.instanceId || !newInstance.botToken}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Crear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { formatCaracasDateTime } from '@/lib/utils/dateUtils';
import whatsappAPI from '@/lib/api/whatsapp';
import WhatsAppQRModal from './whatsapp/WhatsAppQRModal';

/**
 * Componente para gestionar instancias de WhatsApp Baileys
 */
export default function WhatsAppInstanceManager() {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showQRModal, setShowQRModal] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [qrData, setQrData] = useState(null);
  const [newInstance, setNewInstance] = useState({
    instanceId: '',
    name: '',
    recipients: ''
  });

  useEffect(() => {
    loadInstances();
  }, []);

  const loadInstances = async (forceRefresh = false) => {
    try {
      setLoading(true);
      
      if (forceRefresh) {
        console.log('🔄 RECARGA FORZADA - Limpiando cache...');
        // Limpiar estado local
        setInstances([]);
      }
      
      console.log('📡 Solicitando datos al backend...');
      const data = await whatsappAPI.listInstances();
      
      console.log('📊 DATOS RECIBIDOS DEL BACKEND:', {
        success: data.success,
        count: data.instances?.length || 0,
        instances: data.instances
      });
      
      // MOSTRAR EXACTAMENTE LO QUE VIENE DEL BACKEND
      const instancesFromBackend = data.instances || [];
      console.log('✅ Mostrando en frontend:', instancesFromBackend);
      
      setInstances(instancesFromBackend);
      
      if (forceRefresh) {
        toast.success(`Actualizado: ${instancesFromBackend.length} instancia(s)`);
      }
      
    } catch (error) {
      console.error('❌ ERROR AL CARGAR:', error);
      toast.error('Error al cargar instancias: ' + (error.response?.data?.message || error.message));
    } finally {
      setLoading(false);
    }
  };

  const createInstance = async () => {
    try {
      // Crear instancia en el backend (el backend se encargará de crear el canal y la instancia)
      await whatsappAPI.createWhatsAppInstance({
        instanceId: newInstance.instanceId,
        name: newInstance.name,
        recipients: newInstance.recipients.split(',').map(r => r.trim()).filter(r => r)
      });

      toast.success('Instancia creada. Escanea el código QR.');
      setShowCreateModal(false);
      
      // Mostrar QR automáticamente
      const instanceId = newInstance.instanceId;
      setNewInstance({ instanceId: '', name: '', recipients: '' });
      
      setTimeout(() => {
        showQR(instanceId);
      }, 1000);

      await loadInstances();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.message || 'Error al crear instancia');
    }
  };

  const showQR = (instanceId) => {
    setSelectedInstance(instanceId);
    setShowQRModal(true);
  };

  const disconnectInstance = async (instanceId) => {
    if (!confirm('¿Desconectar esta instancia?')) return;

    try {
      await whatsappAPI.disconnectInstance(instanceId);
      toast.success('Instancia desconectada');
      await loadInstances();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.message || 'Error al desconectar instancia');
    }
  };

  const deleteInstance = async (instanceId) => {
    if (!confirm('¿Eliminar esta instancia? Se borrarán todos los datos de sesión.')) return;

    try {
      await whatsappAPI.deleteInstance(instanceId);
      toast.success('Instancia eliminada');
      await loadInstances();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.message || 'Error al eliminar instancia');
    }
  };

  const reconnectInstance = async (instanceId) => {
    try {
      const data = await whatsappAPI.reconnectInstance(instanceId);
      
      if (data.status === 'already_connected') {
        toast.success('La instancia ya está conectada');
      } else {
        toast.success('Reconectando...');
        setTimeout(() => showQR(instanceId), 1000);
      }

      await loadInstances();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.message || 'Error al reconectar instancia');
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      connected: 'bg-green-100 text-green-800',
      connecting: 'bg-yellow-100 text-yellow-800',
      qr_ready: 'bg-blue-100 text-blue-800',
      disconnected: 'bg-red-100 text-red-800',
      logged_out: 'bg-gray-100 text-gray-800'
    };

    const labels = {
      connected: 'Conectado',
      connecting: 'Conectando',
      qr_ready: 'QR Listo',
      disconnected: 'Desconectado',
      logged_out: 'Sesión Cerrada'
    };

    return (
      <span className={`px-2 py-1 rounded-full text-xs font-medium ${badges[status] || badges.disconnected}`}>
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
          <h2 className="text-2xl font-bold text-gray-900">Instancias de WhatsApp</h2>
          <p className="text-gray-600 mt-1">Gestiona las conexiones de WhatsApp usando Baileys</p>
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
                    <h3 className="text-lg font-semibold">{instance.channelName || instance.instanceId}</h3>
                    {getStatusBadge(instance.status)}
                  </div>
                  
                  <div className="space-y-1 text-sm text-gray-600">
                    <p><strong>Instance ID:</strong> {instance.instanceId}</p>
                    {instance.phoneNumber && (
                      <p><strong>Número:</strong> +{instance.phoneNumber}</p>
                    )}
                    {instance.connectedAt && (
                      <p><strong>Conectado:</strong> {formatCaracasDateTime(instance.connectedAt)}</p>
                    )}
                    <p><strong>Última actividad:</strong> {formatCaracasDateTime(instance.lastSeen)}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  {instance.status === 'connected' ? (
                    <>
                      <button
                        onClick={() => disconnectInstance(instance.instanceId)}
                        className="px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
                      >
                        Desconectar
                      </button>
                      <button
                        onClick={() => deleteInstance(instance.instanceId)}
                        className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                      >
                        Eliminar
                      </button>
                    </>
                  ) : (
                    <>
                      <button
                        onClick={() => showQR(instance.instanceId)}
                        className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                      >
                        Ver QR
                      </button>
                      <button
                        onClick={() => reconnectInstance(instance.instanceId)}
                        className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200"
                      >
                        Reconectar
                      </button>
                      <button
                        onClick={() => deleteInstance(instance.instanceId)}
                        className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                      >
                        Eliminar
                      </button>
                    </>
                  )}
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
            <h3 className="text-xl font-bold mb-4">Nueva Instancia de WhatsApp</h3>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Nombre del Canal
                </label>
                <input
                  type="text"
                  value={newInstance.name}
                  onChange={(e) => setNewInstance({ ...newInstance, name: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="WhatsApp Principal"
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
                  placeholder="instance-1"
                />
                <p className="text-xs text-gray-500 mt-1">Identificador único (ej: instance-1, wa-canal-1)</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Destinatarios (separados por coma)
                </label>
                <textarea
                  value={newInstance.recipients}
                  onChange={(e) => setNewInstance({ ...newInstance, recipients: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="584121234567, 584129876543"
                  rows={3}
                />
                <p className="text-xs text-gray-500 mt-1">Números con código de país, sin +</p>
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
                disabled={!newInstance.name || !newInstance.instanceId}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: QR Code */}
      {showQRModal && (
        <WhatsAppQRModal 
          instanceId={selectedInstance}
          onClose={() => setShowQRModal(false)}
          onSuccess={() => {
            setShowQRModal(false);
            loadInstances();
          }}
        />
      )}
    </div>
  );
}

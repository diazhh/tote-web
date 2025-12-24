'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { 
  Smartphone, 
  QrCode, 
  RefreshCw, 
  Power, 
  Trash2, 
  Plus,
  MessageSquare,
  CheckCircle,
  XCircle
} from 'lucide-react';
import whatsappAPI from '@/lib/api/whatsapp';
import WhatsAppQRModal from '@/components/admin/whatsapp/WhatsAppQRModal';
import TestMessageModal from '@/components/admin/whatsapp/TestMessageModal';
import NewInstanceModal from '@/components/admin/whatsapp/NewInstanceModal';
import { formatCaracasDateTime } from '@/lib/utils/dateUtils';

export default function WhatsAppPage() {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [showQRModal, setShowQRModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [showNewInstanceModal, setShowNewInstanceModal] = useState(false);

  useEffect(() => {
    loadInstances();
  }, []);

  const loadInstances = async () => {
    try {
      setLoading(true);
      const response = await whatsappAPI.listInstances();
      setInstances(response.instances || []);
    } catch (error) {
      console.error('Error al cargar instancias:', error);
      toast.error('Error al cargar instancias de WhatsApp');
    } finally {
      setLoading(false);
    }
  };

  const handleShowQR = (instance) => {
    setSelectedInstance(instance);
    setShowQRModal(true);
  };

  const handleShowTestMessage = (instance) => {
    setSelectedInstance(instance);
    setShowTestModal(true);
  };

  const handleReconnect = async (instanceId) => {
    try {
      toast.loading(`Reconectando instancia ${instanceId}...`);
      await whatsappAPI.reconnectInstance(instanceId);
      toast.success('Instancia reconectada. Escanea el código QR para conectar.');
      loadInstances();
    } catch (error) {
      console.error('Error al reconectar:', error);
      toast.error('Error al reconectar instancia');
    }
  };

  const handleDisconnect = async (instanceId) => {
    try {
      if (!confirm('¿Estás seguro de que deseas desconectar esta instancia?')) {
        return;
      }
      
      toast.loading(`Desconectando instancia ${instanceId}...`);
      await whatsappAPI.disconnectInstance(instanceId);
      toast.success('Instancia desconectada correctamente');
      loadInstances();
    } catch (error) {
      console.error('Error al desconectar:', error);
      toast.error('Error al desconectar instancia');
    }
  };

  const handleDelete = async (instanceId) => {
    try {
      if (!confirm('¿Estás seguro de que deseas eliminar esta instancia y todos sus datos? Esta acción no se puede deshacer.')) {
        return;
      }
      
      toast.loading(`Eliminando instancia ${instanceId}...`);
      await whatsappAPI.deleteInstance(instanceId);
      toast.success('Instancia eliminada correctamente');
      loadInstances();
    } catch (error) {
      console.error('Error al eliminar:', error);
      toast.error('Error al eliminar instancia');
    }
  };

  const handleToggleActive = async (instance) => {
    try {
      const newStatus = !instance.isActive;
      await whatsappAPI.toggleActive(instance.instanceId, newStatus);
      toast.success(newStatus ? 'Canal activado - Se enviarán mensajes' : 'Canal pausado - No se enviarán mensajes');
      loadInstances();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cambiar estado');
    }
  };

  const handleCleanup = async () => {
    try {
      if (!confirm('¿Estás seguro de que deseas limpiar todas las sesiones inactivas?')) {
        return;
      }
      
      toast.loading('Limpiando sesiones inactivas...');
      const result = await whatsappAPI.cleanupSessions();
      toast.success(`Se limpiaron ${result.cleaned} sesiones inactivas`);
      loadInstances();
    } catch (error) {
      console.error('Error al limpiar sesiones:', error);
      toast.error('Error al limpiar sesiones inactivas');
    }
  };

  const handleCreateInstance = async (instanceId, name) => {
    try {
      toast.loading(`Creando nueva instancia ${name}...`);
      await whatsappAPI.initializeInstance(instanceId, name);
      toast.success('Instancia creada. Escanea el código QR para conectar.');
      setShowNewInstanceModal(false);
      loadInstances();
    } catch (error) {
      console.error('Error al crear instancia:', error);
      toast.error('Error al crear instancia');
    }
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'connected':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
            <CheckCircle className="w-3 h-3 mr-1" />
            Conectado
          </span>
        );
      case 'disconnected':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
            <XCircle className="w-3 h-3 mr-1" />
            Desconectado
          </span>
        );
      case 'qr_ready':
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
            <QrCode className="w-3 h-3 mr-1" />
            QR Listo
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
            {status || 'Desconocido'}
          </span>
        );
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando instancias de WhatsApp...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp</h1>
          <p className="text-gray-600 mt-1">Gestiona tus instancias de WhatsApp</p>
        </div>
        <div className="flex flex-col sm:flex-row gap-3">
          <button
            onClick={() => setShowNewInstanceModal(true)}
            className="inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus className="w-4 h-4 mr-2" />
            Nueva Instancia
          </button>
          <button
            onClick={handleCleanup}
            className="inline-flex items-center justify-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Trash2 className="w-4 h-4 mr-2" />
            Limpiar Inactivas
          </button>
        </div>
      </div>

      {instances.length === 0 ? (
        <div className="bg-white rounded-lg shadow p-6 lg:p-8 text-center">
          <Smartphone className="w-12 h-12 text-gray-400 mx-auto" />
          <h2 className="mt-4 text-lg font-medium text-gray-900">No hay instancias de WhatsApp</h2>
          <p className="mt-2 text-gray-500">
            Crea una nueva instancia para comenzar a enviar mensajes.
          </p>
          <button
            onClick={() => setShowNewInstanceModal(true)}
            className="mt-4 inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            <Plus className="w-4 h-4 mr-2" />
            Crear Instancia
          </button>
        </div>
      ) : (
        <div className="bg-white rounded-lg shadow overflow-hidden">
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Instancia
                  </th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Estado
                  </th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Envíos
                  </th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Teléfono
                  </th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Conectado
                  </th>
                  <th className="px-4 lg:px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Canal
                  </th>
                  <th className="px-4 lg:px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Acciones
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {instances.map((instance) => (
                  <tr key={instance.instanceId}>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <div className="flex-shrink-0 h-8 w-8 lg:h-10 lg:w-10 bg-gray-100 rounded-full flex items-center justify-center">
                          <Smartphone className="h-4 w-4 lg:h-5 lg:w-5 text-gray-500" />
                        </div>
                        <div className="ml-3 lg:ml-4">
                          <div className="text-sm font-medium text-gray-900">
                            {instance.name || instance.instanceId}
                          </div>
                          {instance.name && (
                            <div className="text-xs text-gray-500">
                              {instance.instanceId}
                            </div>
                          )}
                        </div>
                      </div>
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(instance.status)}
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap">
                      <button
                        onClick={() => handleToggleActive(instance)}
                        className={`px-2 py-1 rounded-full text-xs font-medium ${
                          instance.isActive !== false
                            ? 'bg-green-100 text-green-800 hover:bg-green-200'
                            : 'bg-red-100 text-red-800 hover:bg-red-200'
                        }`}
                        title={instance.isActive !== false ? 'Click para pausar envíos' : 'Click para activar envíos'}
                      >
                        {instance.isActive !== false ? '✓ Activo' : '⏸ Pausado'}
                      </button>
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {instance.phoneNumber || 'No conectado'}
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {instance.connectedAt ? formatCaracasDateTime(instance.connectedAt) : 'N/A'}
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {instance.channelName || 'Sin asociar'}
                    </td>
                    <td className="px-4 lg:px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <div className="flex justify-end space-x-1 lg:space-x-2">
                        {instance.status === 'connected' && (
                          <button
                            onClick={() => handleShowTestMessage(instance)}
                            className="text-blue-600 hover:text-blue-900 p-1"
                            title="Enviar mensaje de prueba"
                          >
                            <MessageSquare className="w-4 h-4 lg:w-5 lg:h-5" />
                          </button>
                        )}
                        
                        {(instance.status === 'qr_ready' || instance.status === 'disconnected') && (
                          <button
                            onClick={() => handleShowQR(instance)}
                            className="text-blue-600 hover:text-blue-900 p-1"
                            title="Ver código QR"
                          >
                            <QrCode className="w-4 h-4 lg:w-5 lg:h-5" />
                          </button>
                        )}
                        
                        <button
                          onClick={() => handleReconnect(instance.instanceId)}
                          className="text-green-600 hover:text-green-900 p-1"
                          title="Reconectar"
                        >
                          <RefreshCw className="w-4 h-4 lg:w-5 lg:h-5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Modales */}
      {showQRModal && selectedInstance && (
        <WhatsAppQRModal
          instanceId={selectedInstance.instanceId}
          onClose={() => setShowQRModal(false)}
          onSuccess={loadInstances}
        />
      )}
      
      {showTestModal && selectedInstance && (
        <TestMessageModal
          instanceId={selectedInstance.instanceId}
          onClose={() => setShowTestModal(false)}
        />
      )}
      
      {showNewInstanceModal && (
        <NewInstanceModal
          onClose={() => setShowNewInstanceModal(false)}
          onSubmit={handleCreateInstance}
        />
      )}
    </div>
  );
}

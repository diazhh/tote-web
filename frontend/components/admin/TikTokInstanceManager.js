'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { formatCaracasDateTime } from '@/lib/utils/dateUtils';
import tiktokAPI from '@/lib/api/tiktok';

/**
 * Componente para gestionar instancias de TikTok
 */
export default function TikTokInstanceManager() {
  const [instances, setInstances] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [selectedInstance, setSelectedInstance] = useState(null);
  const [authCode, setAuthCode] = useState('');
  const [newInstance, setNewInstance] = useState({
    instanceId: '',
    name: '',
    clientKey: '',
    clientSecret: '',
    redirectUri: ''
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
      
      const data = await tiktokAPI.listInstances();
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
      const result = await tiktokAPI.createInstance({
        instanceId: newInstance.instanceId,
        name: newInstance.name,
        clientKey: newInstance.clientKey,
        clientSecret: newInstance.clientSecret,
        redirectUri: newInstance.redirectUri
      });

      toast.success('Instancia de TikTok creada. Autoriza la aplicación.');
      
      // Abrir URL de autorización
      if (result.authUrl) {
        window.open(result.authUrl, '_blank');
      }

      setShowCreateModal(false);
      setNewInstance({
        instanceId: '',
        name: '',
        clientKey: '',
        clientSecret: '',
        redirectUri: ''
      });

      await loadInstances();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.response?.data?.message || error.message || 'Error al crear instancia');
    }
  };

  const openAuthModal = (instance) => {
    setSelectedInstance(instance);
    setAuthCode('');
    setShowAuthModal(true);
  };

  const authorizeInstance = async () => {
    try {
      await tiktokAPI.authorizeInstance(
        selectedInstance.instanceId,
        authCode,
        selectedInstance.config?.redirectUri
      );

      toast.success('TikTok autorizado exitosamente');
      setShowAuthModal(false);
      setSelectedInstance(null);
      setAuthCode('');

      await loadInstances();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.response?.data?.message || error.message || 'Error al autorizar instancia');
    }
  };

  const refreshToken = async (instanceId) => {
    try {
      const result = await tiktokAPI.refreshToken(instanceId);
      toast.success('Token refrescado exitosamente');
      await loadInstances();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.response?.data?.message || error.message || 'Error al refrescar token');
    }
  };

  const testConnection = async (instanceId) => {
    try {
      const result = await tiktokAPI.testConnection(instanceId);
      toast.success('Conexión exitosa: ' + result.message);
      await loadInstances();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.response?.data?.message || error.message || 'Error al probar conexión');
    }
  };

  const disconnectInstance = async (instanceId) => {
    if (!confirm('¿Desconectar esta instancia? Se revocará el acceso.')) return;

    try {
      await tiktokAPI.disconnectInstance(instanceId);
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
      await tiktokAPI.deleteInstance(instanceId);
      toast.success('Instancia eliminada');
      await loadInstances();
    } catch (error) {
      console.error('Error:', error);
      toast.error(error.response?.data?.message || error.message || 'Error al eliminar instancia');
    }
  };

  const getStatusBadge = (status) => {
    const badges = {
      CONNECTED: 'bg-green-100 text-green-800',
      CONNECTING: 'bg-yellow-100 text-yellow-800',
      DISCONNECTED: 'bg-red-100 text-red-800',
      ERROR: 'bg-red-100 text-red-800',
      EXPIRED: 'bg-orange-100 text-orange-800'
    };

    const labels = {
      CONNECTED: 'Conectado',
      CONNECTING: 'Conectando',
      DISCONNECTED: 'Desconectado',
      ERROR: 'Error',
      EXPIRED: 'Token Expirado'
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
          <h2 className="text-2xl font-bold text-gray-900">Instancias de TikTok</h2>
          <p className="text-gray-600 mt-1">Gestiona las conexiones de TikTok for Business API</p>
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
                  </div>
                  
                  <div className="space-y-1 text-sm text-gray-600">
                    <p><strong>Instance ID:</strong> {instance.instanceId}</p>
                    <p><strong>Client Key:</strong> {instance.clientKey}</p>
                    {instance.openId && (
                      <p><strong>Open ID:</strong> {instance.openId}</p>
                    )}
                    {instance.scope && (
                      <p><strong>Permisos:</strong> {instance.scope}</p>
                    )}
                    {instance.tokenExpiresAt && (
                      <p><strong>Token expira:</strong> {formatCaracasDateTime(instance.tokenExpiresAt)}</p>
                    )}
                    {instance.connectedAt && (
                      <p><strong>Conectado:</strong> {formatCaracasDateTime(instance.connectedAt)}</p>
                    )}
                    <p><strong>Última actividad:</strong> {formatCaracasDateTime(instance.lastSeen)}</p>
                  </div>
                </div>

                <div className="flex gap-2">
                  {instance.status === 'CONNECTED' ? (
                    <>
                      <button
                        onClick={() => testConnection(instance.instanceId)}
                        className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                      >
                        Probar
                      </button>
                      <button
                        onClick={() => refreshToken(instance.instanceId)}
                        className="px-3 py-1 text-sm bg-purple-100 text-purple-700 rounded hover:bg-purple-200"
                      >
                        Refrescar
                      </button>
                      <button
                        onClick={() => disconnectInstance(instance.instanceId)}
                        className="px-3 py-1 text-sm bg-yellow-100 text-yellow-700 rounded hover:bg-yellow-200"
                      >
                        Desconectar
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => openAuthModal(instance)}
                      className="px-3 py-1 text-sm bg-green-100 text-green-700 rounded hover:bg-green-200"
                    >
                      Autorizar
                    </button>
                  )}
                  <button
                    onClick={() => deleteInstance(instance.instanceId)}
                    className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                  >
                    Eliminar
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
            <h3 className="text-xl font-bold mb-4">Nueva Instancia de TikTok</h3>
            
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
                  placeholder="TikTok Principal"
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
                  placeholder="tiktok-1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client Key
                </label>
                <input
                  type="text"
                  value={newInstance.clientKey}
                  onChange={(e) => setNewInstance({ ...newInstance, clientKey: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="aw123456789"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Client Secret
                </label>
                <input
                  type="password"
                  value={newInstance.clientSecret}
                  onChange={(e) => setNewInstance({ ...newInstance, clientSecret: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="abc123def456..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Redirect URI
                </label>
                <input
                  type="url"
                  value={newInstance.redirectUri}
                  onChange={(e) => setNewInstance({ ...newInstance, redirectUri: e.target.value })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="https://tu-dominio.com/callback"
                />
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
                disabled={!newInstance.name || !newInstance.instanceId || !newInstance.clientKey || !newInstance.clientSecret || !newInstance.redirectUri}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Crear
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Autorizar Instancia */}
      {showAuthModal && selectedInstance && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-md w-full mx-4">
            <h3 className="text-xl font-bold mb-4">Autorizar TikTok</h3>
            
            <div className="space-y-4">
              <p className="text-sm text-gray-600">
                Para completar la autorización, visita la URL de TikTok y copia el código de autorización:
              </p>
              
              <div className="bg-gray-50 p-3 rounded-lg">
                <p className="text-xs text-gray-500 mb-2">URL de autorización:</p>
                <a 
                  href={tiktokAPI.generateAuthUrl(selectedInstance.clientKey, selectedInstance.config?.redirectUri)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-blue-600 hover:text-blue-700 text-sm break-all"
                >
                  {tiktokAPI.generateAuthUrl(selectedInstance.clientKey, selectedInstance.config?.redirectUri)}
                </a>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Código de Autorización
                </label>
                <input
                  type="text"
                  value={authCode}
                  onChange={(e) => setAuthCode(e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  placeholder="Pega aquí el código de autorización"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={() => setShowAuthModal(false)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={authorizeInstance}
                disabled={!authCode}
                className="flex-1 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Autorizar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { 
  Smartphone, 
  QrCode, 
  RefreshCw, 
  Power, 
  CheckCircle,
  XCircle,
  Users,
  Send
} from 'lucide-react';
import api from '@/lib/api/axios';

export default function WhatsAppPage() {
  const [status, setStatus] = useState(null);
  const [qrCode, setQrCode] = useState(null);
  const [groups, setGroups] = useState([]);
  const [loading, setLoading] = useState(true);
  const [testRecipient, setTestRecipient] = useState('');
  const [testMessage, setTestMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const response = await api.get('/admin/whatsapp/status');
      setStatus(response.data);
      
      if (response.data.hasQR && !response.data.isReady) {
        loadQRCode();
      } else {
        setQrCode(null);
      }
      
      if (response.data.isReady) {
        loadGroups();
      }
    } catch (error) {
      console.error('Error al cargar estado:', error);
    } finally {
      setLoading(false);
    }
  };

  const loadQRCode = async () => {
    try {
      const response = await api.get('/admin/whatsapp/qr');
      setQrCode(response.data.qrCode);
    } catch (error) {
      console.error('Error al cargar QR:', error);
    }
  };

  const loadGroups = async () => {
    try {
      const response = await api.get('/admin/whatsapp/groups');
      setGroups(response.data.groups || []);
    } catch (error) {
      console.error('Error al cargar grupos:', error);
    }
  };

  const handleInitialize = async () => {
    try {
      toast.loading('Inicializando WhatsApp...');
      await api.post('/admin/whatsapp/initialize');
      toast.success('WhatsApp inicializado. Escanea el código QR.');
      setTimeout(loadStatus, 2000);
    } catch (error) {
      console.error('Error al inicializar:', error);
      toast.error('Error al inicializar WhatsApp');
    }
  };

  const handleLogout = async () => {
    try {
      if (!confirm('¿Estás seguro de que deseas desconectar WhatsApp?')) {
        return;
      }
      toast.loading('Desconectando...');
      await api.post('/admin/whatsapp/logout');
      toast.success('WhatsApp desconectado');
      loadStatus();
    } catch (error) {
      console.error('Error al desconectar:', error);
      toast.error('Error al desconectar WhatsApp');
    }
  };

  const handleSendTest = async (e) => {
    e.preventDefault();
    if (!testRecipient || !testMessage) {
      toast.error('Completa todos los campos');
      return;
    }
    
    try {
      setSending(true);
      await api.post('/admin/whatsapp/test', {
        chatId: testRecipient,
        message: testMessage
      });
      toast.success('Mensaje enviado correctamente');
      setTestMessage('');
    } catch (error) {
      console.error('Error al enviar:', error);
      toast.error('Error al enviar mensaje');
    } finally {
      setSending(false);
    }
  };

  const getStatusBadge = () => {
    if (!status) return null;
    
    if (status.isReady) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-green-100 text-green-800">
          <CheckCircle className="w-4 h-4 mr-2" />
          Conectado
        </span>
      );
    }
    
    if (status.connectionStatus === 'qr_ready') {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-blue-100 text-blue-800">
          <QrCode className="w-4 h-4 mr-2" />
          Esperando escaneo
        </span>
      );
    }
    
    if (status.isInitializing) {
      return (
        <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-yellow-100 text-yellow-800">
          <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
          Inicializando
        </span>
      );
    }
    
    return (
      <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-800">
        <XCircle className="w-4 h-4 mr-2" />
        Desconectado
      </span>
    );
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando estado de WhatsApp...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">WhatsApp Service</h1>
          <p className="text-gray-600 mt-1">Servicio standalone con whatsapp-web.js</p>
        </div>
        <div className="flex items-center gap-3">
          {getStatusBadge()}
          {!status?.isReady && !status?.isInitializing && (
            <button
              onClick={handleInitialize}
              className="inline-flex items-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700"
            >
              <Power className="w-4 h-4 mr-2" />
              Inicializar
            </button>
          )}
          {status?.isReady && (
            <button
              onClick={handleLogout}
              className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50"
            >
              <Power className="w-4 h-4 mr-2" />
              Desconectar
            </button>
          )}
        </div>
      </div>

      {/* QR Code Section */}
      {qrCode && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">Escanear Código QR</h2>
          <div className="flex flex-col items-center">
            <img src={qrCode} alt="QR Code" className="max-w-sm w-full" />
            <p className="mt-4 text-sm text-gray-600 text-center">
              Escanea este código con WhatsApp en tu teléfono para conectar
            </p>
          </div>
        </div>
      )}

      {/* Groups Section */}
      {status?.isReady && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">Grupos Disponibles</h2>
              <button
                onClick={loadGroups}
                className="text-blue-600 hover:text-blue-700"
              >
                <RefreshCw className="w-5 h-5" />
              </button>
            </div>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {groups.length === 0 ? (
                <p className="text-gray-500 text-sm">No hay grupos disponibles</p>
              ) : (
                groups.map((group) => (
                  <div key={group.id} className="flex items-center justify-between p-3 border rounded-lg hover:bg-gray-50">
                    <div className="flex items-center space-x-3">
                      <Users className="w-5 h-5 text-gray-400" />
                      <div>
                        <p className="text-sm font-medium text-gray-900">{group.name}</p>
                        <p className="text-xs text-gray-500">{group.participantsCount} participantes</p>
                      </div>
                    </div>
                    <button
                      onClick={() => setTestRecipient(group.id)}
                      className="text-blue-600 hover:text-blue-700 text-xs"
                    >
                      Usar
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Enviar Mensaje de Prueba</h2>
            <form onSubmit={handleSendTest} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  ID del Chat/Grupo
                </label>
                <input
                  type="text"
                  value={testRecipient}
                  onChange={(e) => setTestRecipient(e.target.value)}
                  placeholder="123456789@g.us"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
                <p className="mt-1 text-xs text-gray-500">
                  Formato: número@c.us para contactos, número@g.us para grupos
                </p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Mensaje
                </label>
                <textarea
                  value={testMessage}
                  onChange={(e) => setTestMessage(e.target.value)}
                  rows={4}
                  placeholder="Escribe tu mensaje aquí..."
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                disabled={sending || !testRecipient || !testMessage}
                className="w-full inline-flex items-center justify-center px-4 py-2 border border-transparent rounded-md shadow-sm text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed"
              >
                {sending ? (
                  <>
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                    Enviando...
                  </>
                ) : (
                  <>
                    <Send className="w-4 h-4 mr-2" />
                    Enviar Mensaje
                  </>
                )}
              </button>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}

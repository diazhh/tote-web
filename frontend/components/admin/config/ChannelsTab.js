'use client';

import { useEffect, useState } from 'react';
import gameChannelsAPI from '@/lib/api/game-channels';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, MessageSquare, CheckCircle, XCircle, Send } from 'lucide-react';
import GameChannelModal from './GameChannelModal';

export default function ChannelsTab({ gameId }) {
  const [channels, setChannels] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [selectedChannel, setSelectedChannel] = useState(null);
  const [testingChannel, setTestingChannel] = useState(null);

  useEffect(() => {
    loadChannels();
  }, [gameId]);

  const loadChannels = async () => {
    if (!gameId) {
      setChannels([]);
      setLoading(false);
      return;
    }
    
    setLoading(true);
    try {
      const response = await gameChannelsAPI.getByGame(gameId);
      const channelsData = response.channels || [];
      setChannels(Array.isArray(channelsData) ? channelsData : []);
    } catch (error) {
      console.error('Error loading channels:', error);
      toast.error('Error al cargar canales');
      setChannels([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = () => {
    setSelectedChannel(null);
    setShowModal(true);
  };

  const handleEdit = (channel) => {
    setSelectedChannel(channel);
    setShowModal(true);
  };

  const handleDelete = async (channel) => {
    if (!confirm(`¿Estás seguro de eliminar el canal "${channel.name}"?`)) return;

    try {
      await gameChannelsAPI.delete(channel.id);
      toast.success('Canal eliminado correctamente');
      loadChannels();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al eliminar canal');
    }
  };

  const handleTest = async (channel) => {
    // TODO: Implementar test de canal
    toast.info('Función de prueba en desarrollo');
  };

  const handleModalClose = (reload) => {
    setShowModal(false);
    setSelectedChannel(null);
    if (reload) loadChannels();
  };

  const getChannelIcon = (type) => {
    // You can replace these with actual brand icons
    return <MessageSquare className="w-6 h-6" />;
  };

  const getChannelColor = (type) => {
    const colors = {
      TELEGRAM: 'bg-blue-100 text-blue-800',
      WHATSAPP: 'bg-green-100 text-green-800',
      FACEBOOK: 'bg-indigo-100 text-indigo-800',
      INSTAGRAM: 'bg-pink-100 text-pink-800',
      TIKTOK: 'bg-gray-100 text-gray-800',
    };
    return colors[type] || 'bg-gray-100 text-gray-800';
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando canales...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Configuración de Canales</h2>
          <p className="text-sm text-gray-600 mt-1">
            Gestiona las credenciales de publicación en redes sociales{gameId ? ' para este juego' : ''}
          </p>
        </div>
        <button
          onClick={handleCreate}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nuevo Canal
        </button>
      </div>

      {/* Info Box */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="text-sm font-medium text-blue-900 mb-2">Información sobre Canales</h3>
        <ul className="text-sm text-blue-800 space-y-1">
          <li>• <strong>WhatsApp:</strong> Selecciona una instancia conectada y configura destinatarios</li>
          <li>• <strong>Telegram:</strong> Configura el Chat ID del canal o grupo</li>
          <li>• <strong>Plantillas:</strong> Usa variables dinámicas como {`{{gameName}}`}, {`{{winnerNumber}}`}, {`{{time}}`}</li>
          <li>• <strong>Vista Previa:</strong> Prueba cómo se verá el mensaje antes de guardar</li>
        </ul>
      </div>

      {/* Channels Grid */}
      {channels.length === 0 ? (
        <div className="text-center py-12 bg-gray-50 rounded-lg border-2 border-dashed border-gray-300">
          <MessageSquare className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600 mb-4">No hay canales configurados</p>
          <button
            onClick={handleCreate}
            className="inline-flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
          >
            <Plus className="w-4 h-4 mr-2" />
            Configurar Primer Canal
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {channels.map((channel) => (
            <div
              key={channel.id}
              className="bg-white border border-gray-200 rounded-lg p-6 hover:shadow-lg transition"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center space-x-3">
                  <div className={`w-12 h-12 rounded-lg flex items-center justify-center ${getChannelColor(channel.channelType)}`}>
                    {getChannelIcon(channel.channelType)}
                  </div>
                  <div>
                    <h3 className="text-lg font-semibold text-gray-900">
                      {channel.name}
                    </h3>
                    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${getChannelColor(channel.channelType)}`}>
                      {channel.channelType}
                    </span>
                  </div>
                </div>
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  channel.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                }`}>
                  {channel.isActive ? (
                    <>
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Activo
                    </>
                  ) : (
                    <>
                      <XCircle className="w-3 h-3 mr-1" />
                      Inactivo
                    </>
                  )}
                </span>
              </div>

              <div className="flex items-center space-x-2">
                <button
                  onClick={() => handleTest(channel)}
                  disabled={testingChannel === channel.id}
                  className="flex-1 flex items-center justify-center px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm disabled:opacity-50"
                >
                  <Send className="w-4 h-4 mr-2" />
                  {testingChannel === channel.id ? 'Probando...' : 'Probar'}
                </button>
                <button
                  onClick={() => handleEdit(channel)}
                  className="flex items-center justify-center px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
                >
                  <Edit2 className="w-4 h-4 text-blue-600" />
                </button>
                <button
                  onClick={() => handleDelete(channel)}
                  className="flex items-center justify-center px-3 py-2 border border-gray-300 rounded-lg hover:bg-red-50 transition"
                >
                  <Trash2 className="w-4 h-4 text-red-600" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <GameChannelModal
          channel={selectedChannel}
          gameId={gameId}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}

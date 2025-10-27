'use client';

import { useState, useEffect } from 'react';
import channelsAPI from '@/lib/api/channels';
import { toast } from 'sonner';
import { X, Save, Eye, EyeOff } from 'lucide-react';

export default function ChannelModal({ channel, onClose, gameId }) {
  const [loading, setLoading] = useState(false);
  const [showSecrets, setShowSecrets] = useState(false);
  const [formData, setFormData] = useState({
    name: '',
    type: 'TELEGRAM',
    isActive: true,
    config: {},
  });

  useEffect(() => {
    if (channel) {
      setFormData({
        name: channel.name || '',
        type: channel.type || 'TELEGRAM',
        isActive: channel.isActive !== undefined ? channel.isActive : true,
        config: channel.config || {},
      });
    }
  }, [channel]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }));
  };

  const handleConfigChange = (key, value) => {
    setFormData(prev => ({
      ...prev,
      config: {
        ...prev.config,
        [key]: value
      }
    }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Ensure gameId is included when provided
      const payload = {
        ...formData,
        ...(gameId ? { gameId } : {}),
      };
      if (channel) {
        await channelsAPI.update(channel.id, payload);
        toast.success('Canal actualizado correctamente');
      } else {
        await channelsAPI.create(payload);
        toast.success('Canal creado correctamente');
      }
      onClose(true);
    } catch (error) {
      toast.error(error.message || 'Error al guardar canal');
    } finally {
      setLoading(false);
    }
  };

  const renderConfigFields = () => {
    const { type, config } = formData;

    switch (type) {
      case 'TELEGRAM':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Bot Token *
              </label>
              <div className="relative">
                <input
                  type={showSecrets ? 'text' : 'password'}
                  value={config.botToken || ''}
                  onChange={(e) => handleConfigChange('botToken', e.target.value)}
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  required
                  disabled={loading}
                  placeholder="1234567890:ABCdefGHIjklMNOpqrsTUVwxyz"
                />
                <button
                  type="button"
                  onClick={() => setShowSecrets(!showSecrets)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Obtén el token de @BotFather en Telegram
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Chat ID *
              </label>
              <input
                type="text"
                value={config.chatId || ''}
                onChange={(e) => handleConfigChange('chatId', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                required
                disabled={loading}
                placeholder="-1001234567890"
              />
              <p className="text-xs text-gray-500 mt-1">
                ID del canal o grupo donde publicar
              </p>
            </div>
          </>
        );

      case 'WHATSAPP':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                API URL *
              </label>
              <input
                type="url"
                value={config.apiUrl || ''}
                onChange={(e) => handleConfigChange('apiUrl', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                required
                disabled={loading}
                placeholder="https://api.whatsapp.com/send"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                ID *
              </label>
              <input
                type="text"
                value={config.id || ''}
                onChange={(e) => handleConfigChange('id', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                required
                disabled={loading}
                placeholder="ID de la cuenta"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Token *
              </label>
              <div className="relative">
                <input
                  type={showSecrets ? 'text' : 'password'}
                  value={config.token || ''}
                  onChange={(e) => handleConfigChange('token', e.target.value)}
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  required
                  disabled={loading}
                  placeholder="Token de autenticación"
                />
                <button
                  type="button"
                  onClick={() => setShowSecrets(!showSecrets)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>
          </>
        );

      case 'FACEBOOK':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Page ID *
              </label>
              <input
                type="text"
                value={config.pageId || ''}
                onChange={(e) => handleConfigChange('pageId', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                required
                disabled={loading}
                placeholder="123456789012345"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Page Access Token *
              </label>
              <div className="relative">
                <input
                  type={showSecrets ? 'text' : 'password'}
                  value={config.accessToken || ''}
                  onChange={(e) => handleConfigChange('accessToken', e.target.value)}
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  required
                  disabled={loading}
                  placeholder="EAAxxxxxxxxxx..."
                />
                <button
                  type="button"
                  onClick={() => setShowSecrets(!showSecrets)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Obtén el token desde Facebook Developer Console
              </p>
            </div>
          </>
        );

      case 'INSTAGRAM':
        return (
          <>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Instagram Business Account ID *
              </label>
              <input
                type="text"
                value={config.accountId || ''}
                onChange={(e) => handleConfigChange('accountId', e.target.value)}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                required
                disabled={loading}
                placeholder="17841400000000000"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Access Token *
              </label>
              <div className="relative">
                <input
                  type={showSecrets ? 'text' : 'password'}
                  value={config.accessToken || ''}
                  onChange={(e) => handleConfigChange('accessToken', e.target.value)}
                  className="w-full px-4 py-2 pr-10 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                  required
                  disabled={loading}
                  placeholder="EAAxxxxxxxxxx..."
                />
                <button
                  type="button"
                  onClick={() => setShowSecrets(!showSecrets)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                >
                  {showSecrets ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Requiere cuenta de Instagram Business vinculada a Facebook
              </p>
            </div>
          </>
        );

      default:
        return null;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200">
          <h2 className="text-xl font-semibold text-gray-900">
            {channel ? 'Editar Canal' : 'Nuevo Canal'}
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
              Nombre del Canal *
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
              placeholder="Ej: Canal Telegram Principal"
            />
          </div>

          <div>
            <label htmlFor="type" className="block text-sm font-medium text-gray-700 mb-2">
              Tipo de Canal *
            </label>
            <select
              id="type"
              name="type"
              value={formData.type}
              onChange={handleChange}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
              disabled={loading || !!channel}
            >
              <option value="TELEGRAM">Telegram</option>
              <option value="WHATSAPP">WhatsApp</option>
              <option value="FACEBOOK">Facebook</option>
              <option value="INSTAGRAM">Instagram</option>
            </select>
            {channel && (
              <p className="text-xs text-gray-500 mt-1">
                El tipo no se puede cambiar después de crear el canal
              </p>
            )}
          </div>

          {/* Dynamic Config Fields */}
          {renderConfigFields()}

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
              Canal activo
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
              {loading ? 'Guardando...' : channel ? 'Actualizar' : 'Crear'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

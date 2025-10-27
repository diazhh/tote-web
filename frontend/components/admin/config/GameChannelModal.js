'use client';

import { useState, useEffect } from 'react';
import gameChannelsAPI from '@/lib/api/game-channels';
import { toast } from 'sonner';
import { X, Save, Eye, Plus, Trash2, HelpCircle, Sparkles } from 'lucide-react';

export default function GameChannelModal({ channel, gameId, onClose }) {
  const [loading, setLoading] = useState(false);
  const [loadingInstances, setLoadingInstances] = useState(false);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [whatsappInstances, setWhatsappInstances] = useState([]);
  const [showVariables, setShowVariables] = useState(false);
  const [variables, setVariables] = useState([]);
  const [preview, setPreview] = useState('');
  
  const [formData, setFormData] = useState({
    name: '',
    channelType: 'WHATSAPP',
    whatsappInstanceId: '',
    telegramChatId: '',
    messageTemplate: '',
    recipients: [],
    isActive: true,
  });

  const [newRecipient, setNewRecipient] = useState('');

  useEffect(() => {
    loadTemplateVariables();
    
    if (channel) {
      setFormData({
        name: channel.name || '',
        channelType: channel.channelType || 'WHATSAPP',
        whatsappInstanceId: channel.whatsappInstanceId || '',
        telegramChatId: channel.telegramChatId || '',
        messageTemplate: channel.messageTemplate || '',
        recipients: channel.recipients || [],
        isActive: channel.isActive !== undefined ? channel.isActive : true,
      });
    } else {
      // Cargar plantilla por defecto
      loadDefaultTemplate('WHATSAPP');
    }
  }, [channel]);

  useEffect(() => {
    if (formData.channelType === 'WHATSAPP') {
      loadWhatsAppInstances();
    }
  }, [formData.channelType]);

  const loadWhatsAppInstances = async () => {
    setLoadingInstances(true);
    try {
      const response = await gameChannelsAPI.getWhatsAppInstances();
      setWhatsappInstances(response.instances || []);
    } catch (error) {
      console.error('Error loading WhatsApp instances:', error);
      toast.error('Error al cargar instancias de WhatsApp');
    } finally {
      setLoadingInstances(false);
    }
  };

  const loadDefaultTemplate = async (channelType) => {
    try {
      const response = await gameChannelsAPI.getDefaultTemplate(channelType);
      setFormData(prev => ({
        ...prev,
        messageTemplate: response.template || ''
      }));
    } catch (error) {
      console.error('Error loading default template:', error);
    }
  };

  const loadTemplateVariables = async () => {
    try {
      const response = await gameChannelsAPI.getTemplateVariables();
      setVariables(response.variables || []);
    } catch (error) {
      console.error('Error loading variables:', error);
    }
  };

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    const newValue = type === 'checkbox' ? checked : value;
    
    setFormData(prev => ({
      ...prev,
      [name]: newValue
    }));

    // Si cambia el tipo de canal, cargar plantilla por defecto
    if (name === 'channelType' && !channel) {
      loadDefaultTemplate(value);
    }
  };

  const handleAddRecipient = () => {
    if (!newRecipient.trim()) return;
    
    // Validar formato de número (solo dígitos, sin +)
    const cleanNumber = newRecipient.replace(/\D/g, '');
    if (cleanNumber.length < 10) {
      toast.error('Número inválido. Debe tener al menos 10 dígitos');
      return;
    }

    if (formData.recipients.includes(cleanNumber)) {
      toast.error('Este número ya está en la lista');
      return;
    }

    setFormData(prev => ({
      ...prev,
      recipients: [...prev.recipients, cleanNumber]
    }));
    setNewRecipient('');
  };

  const handleRemoveRecipient = (index) => {
    setFormData(prev => ({
      ...prev,
      recipients: prev.recipients.filter((_, i) => i !== index)
    }));
  };

  const handlePreview = async () => {
    if (!formData.messageTemplate.trim()) {
      toast.error('Escribe una plantilla primero');
      return;
    }

    setLoadingPreview(true);
    try {
      const response = await gameChannelsAPI.previewTemplate(
        formData.messageTemplate,
        gameId
      );
      setPreview(response.preview || '');
      toast.success('Vista previa generada');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al generar vista previa');
      setPreview('');
    } finally {
      setLoadingPreview(false);
    }
  };

  const insertVariable = (varName) => {
    const textarea = document.getElementById('messageTemplate');
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = formData.messageTemplate;
    const before = text.substring(0, start);
    const after = text.substring(end);
    const variable = `{{${varName}}}`;
    
    setFormData(prev => ({
      ...prev,
      messageTemplate: before + variable + after
    }));

    // Restaurar el foco y posición del cursor
    setTimeout(() => {
      textarea.focus();
      textarea.setSelectionRange(start + variable.length, start + variable.length);
    }, 0);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);

    try {
      // Validaciones
      if (formData.channelType === 'WHATSAPP') {
        if (!formData.whatsappInstanceId) {
          toast.error('Selecciona una instancia de WhatsApp');
          setLoading(false);
          return;
        }
        if (formData.recipients.length === 0) {
          toast.error('Agrega al menos un destinatario');
          setLoading(false);
          return;
        }
      }

      if (!formData.messageTemplate.trim()) {
        toast.error('La plantilla de mensaje es requerida');
        setLoading(false);
        return;
      }

      const payload = {
        channelType: formData.channelType,
        name: formData.name,
        whatsappInstanceId: formData.channelType === 'WHATSAPP' ? formData.whatsappInstanceId : null,
        telegramChatId: formData.channelType === 'TELEGRAM' ? formData.telegramChatId : null,
        messageTemplate: formData.messageTemplate,
        recipients: formData.recipients,
        isActive: formData.isActive
      };

      if (channel) {
        await gameChannelsAPI.update(channel.id, payload);
        toast.success('Canal actualizado correctamente');
      } else {
        await gameChannelsAPI.create(gameId, payload);
        toast.success('Canal creado correctamente');
      }
      onClose(true);
    } catch (error) {
      console.error('Error saving channel:', error);
      toast.error(error.response?.data?.error || 'Error al guardar canal');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 sticky top-0 bg-white z-10">
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
        <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Nombre y Tipo */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
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
                placeholder="Ej: WhatsApp Principal"
              />
            </div>

            <div>
              <label htmlFor="channelType" className="block text-sm font-medium text-gray-700 mb-2">
                Tipo de Canal *
              </label>
              <select
                id="channelType"
                name="channelType"
                value={formData.channelType}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                required
                disabled={loading || !!channel}
              >
                <option value="WHATSAPP">WhatsApp</option>
                <option value="TELEGRAM">Telegram</option>
                <option value="FACEBOOK">Facebook</option>
                <option value="INSTAGRAM">Instagram</option>
              </select>
              {channel && (
                <p className="text-xs text-gray-500 mt-1">
                  El tipo no se puede cambiar después de crear el canal
                </p>
              )}
            </div>
          </div>

          {/* Configuración específica por tipo */}
          {formData.channelType === 'WHATSAPP' && (
            <>
              {/* Instancia de WhatsApp */}
              <div>
                <label htmlFor="whatsappInstanceId" className="block text-sm font-medium text-gray-700 mb-2">
                  Instancia de WhatsApp *
                </label>
                {loadingInstances ? (
                  <div className="text-sm text-gray-500">Cargando instancias...</div>
                ) : (
                  <select
                    id="whatsappInstanceId"
                    name="whatsappInstanceId"
                    value={formData.whatsappInstanceId}
                    onChange={handleChange}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    required
                    disabled={loading}
                  >
                    <option value="">Selecciona una instancia</option>
                    {whatsappInstances.map((instance) => (
                      <option key={instance.instanceId} value={instance.instanceId}>
                        {instance.instanceId} - {instance.status === 'connected' ? '✓ Conectado' : '✗ Desconectado'}
                        {instance.phoneNumber ? ` (${instance.phoneNumber})` : ''}
                      </option>
                    ))}
                  </select>
                )}
                <p className="text-xs text-gray-500 mt-1">
                  Selecciona la instancia de WhatsApp que se usará para enviar mensajes
                </p>
              </div>

              {/* Destinatarios */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Destinatarios (Números de WhatsApp) *
                </label>
                <div className="flex gap-2 mb-2">
                  <input
                    type="text"
                    value={newRecipient}
                    onChange={(e) => setNewRecipient(e.target.value)}
                    onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), handleAddRecipient())}
                    className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                    placeholder="584121234567 (código de país + número, sin +)"
                    disabled={loading}
                  />
                  <button
                    type="button"
                    onClick={handleAddRecipient}
                    className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition"
                    disabled={loading}
                  >
                    <Plus className="w-5 h-5" />
                  </button>
                </div>
                <div className="space-y-2">
                  {formData.recipients.map((recipient, index) => (
                    <div key={index} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded-lg">
                      <span className="text-sm text-gray-700">+{recipient}</span>
                      <button
                        type="button"
                        onClick={() => handleRemoveRecipient(index)}
                        className="text-red-600 hover:text-red-800"
                        disabled={loading}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                </div>
                {formData.recipients.length === 0 && (
                  <p className="text-xs text-gray-500 mt-1">
                    Agrega al menos un número de WhatsApp
                  </p>
                )}
              </div>
            </>
          )}

          {formData.channelType === 'TELEGRAM' && (
            <div>
              <label htmlFor="telegramChatId" className="block text-sm font-medium text-gray-700 mb-2">
                Chat ID de Telegram *
              </label>
              <input
                id="telegramChatId"
                name="telegramChatId"
                type="text"
                value={formData.telegramChatId}
                onChange={handleChange}
                className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
                required
                disabled={loading}
                placeholder="-1001234567890"
              />
            </div>
          )}

          {/* Plantilla de Mensaje */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="messageTemplate" className="block text-sm font-medium text-gray-700">
                Plantilla de Mensaje *
              </label>
              <button
                type="button"
                onClick={() => setShowVariables(!showVariables)}
                className="text-sm text-blue-600 hover:text-blue-800 flex items-center"
              >
                <HelpCircle className="w-4 h-4 mr-1" />
                {showVariables ? 'Ocultar' : 'Ver'} variables
              </button>
            </div>
            
            {showVariables && (
              <div className="mb-3 p-3 bg-blue-50 border border-blue-200 rounded-lg">
                <p className="text-xs font-medium text-blue-900 mb-2">Variables disponibles (haz clic para insertar):</p>
                <div className="flex flex-wrap gap-1">
                  {variables.map((v) => (
                    <button
                      key={v.name}
                      type="button"
                      onClick={() => insertVariable(v.name)}
                      className="px-2 py-1 bg-white border border-blue-300 rounded text-xs text-blue-700 hover:bg-blue-100 transition"
                      title={v.description}
                    >
                      {`{{${v.name}}}`}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <textarea
              id="messageTemplate"
              name="messageTemplate"
              value={formData.messageTemplate}
              onChange={handleChange}
              rows={8}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none font-mono text-sm"
              required
              disabled={loading}
              placeholder="🎰 *{{gameName}}*&#10;&#10;⏰ Hora: {{time}}&#10;🎯 Resultado: *{{winnerNumberPadded}}*&#10;🏆 {{winnerName}}"
            />
            <div className="flex items-center justify-between mt-2">
              <p className="text-xs text-gray-500">
                Usa sintaxis Mustache: {`{{variable}}`}
              </p>
              <button
                type="button"
                onClick={handlePreview}
                disabled={loadingPreview || !formData.messageTemplate.trim()}
                className="flex items-center px-3 py-1 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition disabled:opacity-50"
              >
                <Sparkles className="w-4 h-4 mr-1" />
                {loadingPreview ? 'Generando...' : 'Vista Previa'}
              </button>
            </div>
          </div>

          {/* Vista Previa */}
          {preview && (
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <h4 className="text-sm font-medium text-gray-700 mb-2">Vista Previa:</h4>
              <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans">{preview}</pre>
            </div>
          )}

          {/* Canal Activo */}
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

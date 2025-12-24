'use client';

import { useState } from 'react';
import { X, Send, Loader2, CheckCircle, XCircle, MessageSquare } from 'lucide-react';
import { toast } from 'sonner';
import gameChannelsAPI from '@/lib/api/game-channels';

export default function ChannelTestModal({ channel, onClose }) {
  const [recipient, setRecipient] = useState('');
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState(null);

  const getPlaceholder = () => {
    switch (channel.channelType) {
      case 'WHATSAPP':
        return 'Ej: 584121234567 o 120363012345678901@g.us';
      case 'TELEGRAM':
        return 'Ej: -1001234567890 o @nombrecanal';
      case 'FACEBOOK':
        return 'Se usará el Page ID configurado';
      case 'INSTAGRAM':
        return 'Se usará el User ID configurado';
      default:
        return 'Destinatario';
    }
  };

  const getHelperText = () => {
    switch (channel.channelType) {
      case 'WHATSAPP':
        return 'Ingresa un número de teléfono (con código de país) o ID de grupo de WhatsApp';
      case 'TELEGRAM':
        return 'Ingresa el Chat ID del canal/grupo (número negativo) o @username';
      case 'FACEBOOK':
        return 'La prueba se publicará en la página de Facebook configurada';
      case 'INSTAGRAM':
        return 'La prueba se publicará en el perfil de Instagram configurado';
      default:
        return '';
    }
  };

  const needsRecipient = () => {
    return channel.channelType === 'WHATSAPP' || channel.channelType === 'TELEGRAM';
  };

  const handleSendTest = async () => {
    if (needsRecipient() && !recipient.trim()) {
      toast.error('Ingresa un destinatario');
      return;
    }

    setSending(true);
    setResult(null);

    try {
      const testRecipient = needsRecipient() ? recipient.trim() : 'default';
      const response = await gameChannelsAPI.sendTest(
        channel.id,
        testRecipient,
        message.trim() || null
      );

      if (response.success) {
        setResult({ success: true, message: response.message, data: response.result });
        toast.success('Mensaje de prueba enviado correctamente');
      } else {
        setResult({ success: false, message: response.error || 'Error desconocido' });
        toast.error(response.error || 'Error al enviar mensaje de prueba');
      }
    } catch (error) {
      const errorMessage = error.response?.data?.error || error.message || 'Error al enviar mensaje de prueba';
      setResult({ success: false, message: errorMessage });
      toast.error(errorMessage);
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b">
          <div className="flex items-center gap-3">
            <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
              channel.channelType === 'WHATSAPP' ? 'bg-green-100 text-green-800' :
              channel.channelType === 'TELEGRAM' ? 'bg-blue-100 text-blue-800' :
              channel.channelType === 'FACEBOOK' ? 'bg-indigo-100 text-indigo-800' :
              'bg-pink-100 text-pink-800'
            }`}>
              <MessageSquare className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900">Probar Canal</h2>
              <p className="text-sm text-gray-500">{channel.name} - {channel.channelType}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Destinatario */}
          {needsRecipient() && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Destinatario de Prueba *
              </label>
              <input
                type="text"
                value={recipient}
                onChange={(e) => setRecipient(e.target.value)}
                placeholder={getPlaceholder()}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                disabled={sending}
              />
              <p className="mt-1 text-xs text-gray-500">{getHelperText()}</p>
            </div>
          )}

          {!needsRecipient() && (
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
              <p className="text-sm text-blue-800">{getHelperText()}</p>
            </div>
          )}

          {/* Mensaje personalizado */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mensaje Personalizado (opcional)
            </label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              placeholder="Mensaje de prueba del sistema - Tote Web"
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
              disabled={sending}
            />
            <p className="mt-1 text-xs text-gray-500">
              Se enviará una imagen de prueba junto con este mensaje
            </p>
          </div>

          {/* Resultado */}
          {result && (
            <div className={`rounded-lg p-4 ${
              result.success ? 'bg-green-50 border border-green-200' : 'bg-red-50 border border-red-200'
            }`}>
              <div className="flex items-start gap-3">
                {result.success ? (
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
                )}
                <div>
                  <p className={`font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
                    {result.success ? '¡Enviado correctamente!' : 'Error al enviar'}
                  </p>
                  <p className={`text-sm mt-1 ${result.success ? 'text-green-700' : 'text-red-700'}`}>
                    {result.message}
                  </p>
                  {result.data && (
                    <p className="text-xs text-gray-600 mt-2">
                      Plataforma: {result.data.platform}
                      {result.data.recipient && ` | Destinatario: ${result.data.recipient}`}
                      {result.data.chatId && ` | Chat ID: ${result.data.chatId}`}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t bg-gray-50">
          <button
            onClick={onClose}
            className="px-4 py-2 text-gray-700 hover:bg-gray-100 rounded-lg transition"
            disabled={sending}
          >
            Cerrar
          </button>
          <button
            onClick={handleSendTest}
            disabled={sending || (needsRecipient() && !recipient.trim())}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {sending ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Enviando...
              </>
            ) : (
              <>
                <Send className="w-4 h-4 mr-2" />
                Enviar Prueba
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}

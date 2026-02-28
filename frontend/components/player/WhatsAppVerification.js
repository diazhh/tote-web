'use client';

import { useState } from 'react';
import { MessageSquare, CheckCircle, Send, Bell, BellOff } from 'lucide-react';
import { toast } from 'sonner';
import whatsappOtpApi from '@/lib/api/whatsapp-otp';

export default function WhatsAppVerification({ user, onUpdate }) {
  const [step, setStep] = useState('idle'); // idle | sending | code | verifying
  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);

  const isVerified = user?.whatsappVerified;
  const notificationsEnabled = user?.whatsappNotifications;

  const handleSendOtp = async () => {
    try {
      setLoading(true);
      setStep('sending');
      await whatsappOtpApi.sendOtp();
      setStep('code');
      toast.success('Codigo enviado por WhatsApp');
    } catch (error) {
      setStep('idle');
      toast.error(error.response?.data?.error || 'Error al enviar codigo');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async () => {
    if (code.length !== 6) {
      toast.error('El codigo debe tener 6 digitos');
      return;
    }
    try {
      setLoading(true);
      setStep('verifying');
      await whatsappOtpApi.verifyOtp(code);
      toast.success('WhatsApp verificado correctamente');
      setStep('idle');
      setCode('');
      if (onUpdate) onUpdate();
    } catch (error) {
      setStep('code');
      toast.error(error.response?.data?.error || 'Codigo incorrecto');
    } finally {
      setLoading(false);
    }
  };

  const handleToggleNotifications = async () => {
    try {
      setLoading(true);
      await whatsappOtpApi.toggleNotifications(!notificationsEnabled);
      toast.success(notificationsEnabled ? 'Notificaciones desactivadas' : 'Notificaciones activadas');
      if (onUpdate) onUpdate();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al cambiar notificaciones');
    } finally {
      setLoading(false);
    }
  };

  if (isVerified) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-6 h-6 text-green-600" />
            </div>
            <div>
              <h3 className="font-semibold text-gray-900">WhatsApp Verificado</h3>
              <p className="text-sm text-gray-500">{user?.phone}</p>
            </div>
          </div>
        </div>
        <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-2">
            {notificationsEnabled ? (
              <Bell className="w-5 h-5 text-blue-600" />
            ) : (
              <BellOff className="w-5 h-5 text-gray-400" />
            )}
            <span className="text-sm text-gray-700">
              Notificaciones {notificationsEnabled ? 'activadas' : 'desactivadas'}
            </span>
          </div>
          <button
            onClick={handleToggleNotifications}
            disabled={loading}
            className={`px-3 py-1.5 text-sm font-medium rounded-lg transition ${
              notificationsEnabled
                ? 'bg-gray-200 text-gray-700 hover:bg-gray-300'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
          >
            {notificationsEnabled ? 'Desactivar' : 'Activar'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow p-6">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 bg-green-100 rounded-full flex items-center justify-center">
          <MessageSquare className="w-6 h-6 text-green-600" />
        </div>
        <div>
          <h3 className="font-semibold text-gray-900">Verificar WhatsApp</h3>
          <p className="text-sm text-gray-500">
            Verifica tu numero para recibir notificaciones
          </p>
        </div>
      </div>

      {step === 'idle' && (
        <div>
          <p className="text-sm text-gray-600 mb-4">
            Te enviaremos un codigo de 6 digitos a <strong>{user?.phone || 'tu numero'}</strong> por WhatsApp.
          </p>
          <button
            onClick={handleSendOtp}
            disabled={loading || !user?.phone}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition disabled:opacity-50"
          >
            <Send className="w-4 h-4" />
            Enviar Codigo
          </button>
          {!user?.phone && (
            <p className="text-xs text-red-500 mt-2">Necesitas registrar un numero de telefono primero.</p>
          )}
        </div>
      )}

      {(step === 'code' || step === 'verifying') && (
        <div>
          <p className="text-sm text-gray-600 mb-3">
            Ingresa el codigo de 6 digitos que recibiste:
          </p>
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
            placeholder="000000"
            maxLength={6}
            className="w-full text-center text-2xl tracking-[0.5em] font-mono border border-gray-300 rounded-lg px-4 py-3 mb-3 focus:ring-2 focus:ring-green-500 focus:border-transparent"
          />
          <div className="flex gap-2">
            <button
              onClick={handleVerify}
              disabled={loading || code.length !== 6}
              className="flex-1 px-4 py-2.5 bg-green-600 text-white font-medium rounded-lg hover:bg-green-700 transition disabled:opacity-50"
            >
              {step === 'verifying' ? 'Verificando...' : 'Verificar'}
            </button>
            <button
              onClick={handleSendOtp}
              disabled={loading}
              className="px-4 py-2.5 bg-gray-200 text-gray-700 font-medium rounded-lg hover:bg-gray-300 transition disabled:opacity-50"
            >
              Reenviar
            </button>
          </div>
        </div>
      )}

      {step === 'sending' && (
        <div className="text-center py-4">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-green-600 mx-auto"></div>
          <p className="mt-2 text-sm text-gray-600">Enviando codigo...</p>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useRef, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, CheckCircle, ArrowLeft, RefreshCw } from 'lucide-react';
import emailVerificationAPI from '@/lib/api/email-verification';
import { toast } from 'sonner';

export default function VerifyEmailPage() {
  const router = useRouter();
  const [code, setCode] = useState(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [verified, setVerified] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const inputRefs = useRef([]);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
    // Auto-send verification code on page load
    const sendInitialCode = async () => {
      try {
        setSending(true);
        await emailVerificationAPI.sendCode();
        toast.success('Código enviado a tu correo');
        setCooldown(60);
      } catch (error) {
        toast.error(error.response?.data?.error || 'Error al enviar el código');
      } finally {
        setSending(false);
      }
    };
    sendInitialCode();
  }, []);

  const handleChange = (index, value) => {
    if (!/^\d*$/.test(value)) return;
    const newCode = [...code];
    newCode[index] = value.slice(-1);
    setCode(newCode);
    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index, e) => {
    if (e.key === 'Backspace' && !code[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    if (pasted.length === 6) {
      setCode(pasted.split(''));
      inputRefs.current[5]?.focus();
    }
  };

  const handleVerify = async () => {
    const fullCode = code.join('');
    if (fullCode.length !== 6) {
      toast.error('Ingresa el código completo de 6 dígitos');
      return;
    }

    try {
      setLoading(true);
      const result = await emailVerificationAPI.verifyCode(fullCode);
      if (result.success) {
        setVerified(true);
        toast.success('Correo verificado exitosamente');
        setTimeout(() => router.push('/dashboard'), 2000);
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al verificar el código');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0) return;
    try {
      setSending(true);
      await emailVerificationAPI.sendCode();
      toast.success('Código reenviado a tu correo');
      setCooldown(60);
      setCode(['', '', '', '', '', '']);
      inputRefs.current[0]?.focus();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al reenviar el código');
    } finally {
      setSending(false);
    }
  };

  if (verified) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full text-center">
          <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Correo verificado</h2>
          <p className="text-gray-600">Redirigiendo al dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-lg p-8 max-w-md w-full">
        <button
          onClick={() => router.push('/dashboard')}
          className="flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 mb-6"
        >
          <ArrowLeft className="w-4 h-4" /> Volver al dashboard
        </button>

        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
            <Mail className="w-8 h-8 text-blue-600" />
          </div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Verifica tu correo</h2>
          <p className="text-gray-600 text-sm">
            Ingresa el código de 6 dígitos que enviamos a tu correo electrónico.
          </p>
        </div>

        <div className="flex justify-center gap-3 mb-6" onPaste={handlePaste}>
          {code.map((digit, index) => (
            <input
              key={index}
              ref={el => inputRefs.current[index] = el}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              className="w-12 h-14 text-center text-2xl font-bold border-2 border-gray-300 rounded-lg focus:border-blue-500 focus:ring-2 focus:ring-blue-200 outline-none transition-all"
            />
          ))}
        </div>

        <button
          onClick={handleVerify}
          disabled={loading || code.join('').length !== 6}
          className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed mb-4"
        >
          {loading ? 'Verificando...' : 'Verificar código'}
        </button>

        <div className="text-center">
          <p className="text-sm text-gray-500 mb-2">¿No recibiste el código?</p>
          <button
            onClick={handleResend}
            disabled={sending || cooldown > 0}
            className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-700 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <RefreshCw className={`w-4 h-4 ${sending ? 'animate-spin' : ''}`} />
            {cooldown > 0 ? `Reenviar en ${cooldown}s` : 'Reenviar código'}
          </button>
          <p className="text-xs text-amber-600 mt-3 bg-amber-50 p-2 rounded-lg">
            Revisa tu carpeta de <strong>spam</strong> o <strong>correo no deseado</strong> si no ves el email.
          </p>
        </div>
      </div>
    </div>
  );
}

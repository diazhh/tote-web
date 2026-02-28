'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Mail, X, ArrowRight } from 'lucide-react';
import emailVerificationAPI from '@/lib/api/email-verification';

export default function EmailVerificationBanner() {
  const router = useRouter();
  const [show, setShow] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  useEffect(() => {
    const checkStatus = async () => {
      try {
        const result = await emailVerificationAPI.getStatus();
        if (result.success && !result.data.emailVerified) {
          setShow(true);
        }
      } catch {
        // Silently ignore
      }
    };
    checkStatus();
  }, []);

  if (!show || dismissed) return null;

  return (
    <div className="mb-6 bg-amber-50 border border-amber-200 rounded-lg p-4 flex items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-amber-100 rounded-full">
          <Mail className="w-5 h-5 text-amber-600" />
        </div>
        <div>
          <p className="text-sm font-semibold text-amber-800">Verifica tu correo electrónico</p>
          <p className="text-xs text-amber-600">Para mayor seguridad, verifica tu email. Revisa tu bandeja de entrada o spam.</p>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        <button
          onClick={() => router.push('/verify-email')}
          className="px-4 py-2 bg-amber-600 text-white text-sm rounded-lg hover:bg-amber-700 transition-colors flex items-center gap-1"
        >
          Verificar <ArrowRight className="w-4 h-4" />
        </button>
        <button
          onClick={() => setDismissed(true)}
          className="p-1 text-amber-400 hover:text-amber-600"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

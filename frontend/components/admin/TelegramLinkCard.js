'use client';

import { useState, useEffect } from 'react';
import { 
  Send, Link2, Unlink, RefreshCw, CheckCircle, 
  AlertCircle, Loader2, Copy, Bell, BellOff, QrCode
} from 'lucide-react';
import QRCode from 'qrcode';

export default function TelegramLinkCard() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [linkCode, setLinkCode] = useState(null);
  const [qrDataUrl, setQrDataUrl] = useState(null);
  const [generating, setGenerating] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000/api';

  useEffect(() => {
    fetchStatus();
  }, []);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('accessToken');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  const fetchStatus = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/users/telegram/status`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data.success) {
        setStatus(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Error al cargar estado');
    } finally {
      setLoading(false);
    }
  };

  const generateLinkCode = async () => {
    try {
      setGenerating(true);
      setError(null);
      const res = await fetch(`${API_URL}/users/telegram/link-code`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();

      if (data.success) {
        setLinkCode(data.data);
        
        // Generar QR con el link de Telegram
        if (data.data.botUsername) {
          const telegramLink = `https://t.me/${data.data.botUsername}?start=vincular_${data.data.code}`;
          const qr = await QRCode.toDataURL(telegramLink, {
            width: 200,
            margin: 2,
            color: { dark: '#0088cc', light: '#ffffff' }
          });
          setQrDataUrl(qr);
        }
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Error al generar código');
    } finally {
      setGenerating(false);
    }
  };

  const unlinkTelegram = async () => {
    if (!confirm('¿Estás seguro de desvincular tu cuenta de Telegram?')) return;

    try {
      const res = await fetch(`${API_URL}/users/telegram/unlink`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });
      const data = await res.json();

      if (data.success) {
        setStatus({ ...status, isLinked: false, telegramUserId: null });
        setLinkCode(null);
        setQrDataUrl(null);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Error al desvincular');
    }
  };

  const toggleNotify = async (gameId, currentNotify) => {
    try {
      const res = await fetch(`${API_URL}/users/games/${gameId}/notify`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ notify: !currentNotify })
      });
      const data = await res.json();

      if (data.success) {
        fetchStatus();
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Error al actualizar notificaciones');
    }
  };

  const copyCode = () => {
    if (linkCode?.code) {
      navigator.clipboard.writeText(`/vincular ${linkCode.code}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-xl border shadow-sm p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
      {/* Header */}
      <div className="p-5 border-b bg-gradient-to-r from-blue-500 to-blue-600">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-lg">
            <Send className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Notificaciones de Telegram</h3>
            <p className="text-blue-100 text-sm">
              Recibe alertas de sorteos en tu Telegram
            </p>
          </div>
        </div>
      </div>

      <div className="p-5">
        {/* Error */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">×</button>
          </div>
        )}

        {/* Estado de vinculación */}
        {status?.isLinked ? (
          <div className="space-y-4">
            {/* Vinculado */}
            <div className="flex items-center gap-3 p-4 bg-green-50 rounded-lg">
              <CheckCircle className="w-6 h-6 text-green-600" />
              <div>
                <p className="font-medium text-green-800">Cuenta vinculada</p>
                <p className="text-sm text-green-600">
                  ID: {status.telegramUserId}
                </p>
              </div>
              <button
                onClick={unlinkTelegram}
                className="ml-auto flex items-center gap-1 px-3 py-1.5 text-sm text-red-600 hover:bg-red-50 rounded-lg transition"
              >
                <Unlink className="w-4 h-4" />
                Desvincular
              </button>
            </div>

            {/* Juegos y notificaciones */}
            {status.games?.length > 0 && (
              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">
                  Notificaciones por juego:
                </p>
                <div className="space-y-2">
                  {status.games.map((game) => (
                    <div
                      key={game.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-lg"
                    >
                      <span className="font-medium text-gray-900">{game.name}</span>
                      <button
                        onClick={() => toggleNotify(game.id, game.notify)}
                        className={`flex items-center gap-1 px-3 py-1.5 text-sm rounded-lg transition ${
                          game.notify
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-200 text-gray-600 hover:bg-gray-300'
                        }`}
                      >
                        {game.notify ? (
                          <>
                            <Bell className="w-4 h-4" />
                            Activas
                          </>
                        ) : (
                          <>
                            <BellOff className="w-4 h-4" />
                            Desactivadas
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {status.games?.length === 0 && (
              <div className="p-4 bg-yellow-50 rounded-lg">
                <p className="text-sm text-yellow-800">
                  No tienes juegos asignados. Contacta al administrador para que te asigne juegos.
                </p>
              </div>
            )}
          </div>
        ) : (
          <div className="space-y-4">
            {/* No vinculado */}
            {!status?.botAvailable ? (
              <div className="p-4 bg-yellow-50 rounded-lg">
                <p className="text-sm text-yellow-800">
                  No hay bot de administración configurado. Contacta al administrador.
                </p>
              </div>
            ) : !linkCode ? (
              <div className="text-center py-4">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Link2 className="w-8 h-8 text-blue-600" />
                </div>
                <h4 className="font-medium text-gray-900 mb-2">
                  Vincula tu cuenta de Telegram
                </h4>
                <p className="text-sm text-gray-600 mb-4">
                  Genera un código para vincular tu cuenta y recibir notificaciones
                </p>
                <button
                  onClick={generateLinkCode}
                  disabled={generating}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2 mx-auto"
                >
                  {generating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <QrCode className="w-4 h-4" />
                  )}
                  Generar código
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {/* Código generado */}
                <div className="text-center">
                  {qrDataUrl && (
                    <div className="mb-4">
                      <img 
                        src={qrDataUrl} 
                        alt="QR Code" 
                        className="mx-auto rounded-lg shadow-sm"
                      />
                      <p className="text-xs text-gray-500 mt-2">
                        Escanea con tu cámara o app de Telegram
                      </p>
                    </div>
                  )}

                  <div className="bg-gray-100 rounded-lg p-4">
                    <p className="text-sm text-gray-600 mb-2">
                      O envía este comando al bot @{linkCode.botUsername}:
                    </p>
                    <div className="flex items-center justify-center gap-2">
                      <code className="px-3 py-2 bg-white rounded-lg font-mono text-lg">
                        /vincular {linkCode.code}
                      </code>
                      <button
                        onClick={copyCode}
                        className="p-2 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                        title="Copiar"
                      >
                        {copied ? (
                          <CheckCircle className="w-5 h-5 text-green-600" />
                        ) : (
                          <Copy className="w-5 h-5" />
                        )}
                      </button>
                    </div>
                    <p className="text-xs text-gray-500 mt-2">
                      Expira en {linkCode.expiresIn}
                    </p>
                  </div>
                </div>

                <div className="flex justify-center gap-2">
                  <button
                    onClick={generateLinkCode}
                    disabled={generating}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-gray-600 hover:bg-gray-100 rounded-lg transition"
                  >
                    <RefreshCw className={`w-4 h-4 ${generating ? 'animate-spin' : ''}`} />
                    Nuevo código
                  </button>
                  <button
                    onClick={fetchStatus}
                    className="flex items-center gap-1 px-3 py-1.5 text-sm text-blue-600 hover:bg-blue-50 rounded-lg transition"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Verificar vinculación
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

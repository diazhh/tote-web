'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { QrCode, Smartphone } from 'lucide-react';
import whatsappAPI from '@/lib/api/whatsapp';

export default function WhatsAppQRModal({ instanceId, onClose, onSuccess }) {
  const [qrData, setQrData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [pollingInterval, setPollingInterval] = useState(null);

  useEffect(() => {
    loadQRCode();
    
    // Configurar polling para verificar estado con frecuencia más alta
    const interval = setInterval(() => {
      checkStatus();
    }, 2000); // Reducido a 2 segundos para detectar cambios más rápido
    
    setPollingInterval(interval);
    
    // Verificar estado inmediatamente después de cargar el QR
    setTimeout(() => {
      checkStatus();
    }, 1000);
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [instanceId]);

  const loadQRCode = async () => {
    try {
      setLoading(true);
      setError(null);
      
      const response = await whatsappAPI.getQRCode(instanceId);
      
      if (response.status === 'connected') {
        toast.success('¡WhatsApp ya está conectado!');
        if (onSuccess) onSuccess();
        onClose();
        return;
      }
      
      setQrData(response);
    } catch (error) {
      console.error('Error al cargar código QR:', error);
      
      let errorMessage = 'No se pudo cargar el código QR.';
      
      if (error.response?.status === 404) {
        errorMessage = 'La instancia no existe. Créala primero.';
      } else if (error.response?.status === 400) {
        errorMessage = 'La instancia necesita ser reinicializada.';
      } else if (error.response?.data?.message) {
        errorMessage = error.response.data.message;
      } else if (error.message) {
        errorMessage += ' ' + error.message;
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleReinitialize = async () => {
    try {
      setLoading(true);
      setError(null);
      
      toast.info('Reinicializando instancia...');
      
      await whatsappAPI.reinitializeInstance(instanceId);
      
      // Esperar un poco y luego cargar el QR
      setTimeout(() => {
        loadQRCode();
      }, 2000);
      
    } catch (error) {
      console.error('Error al reinicializar:', error);
      setError('No se pudo reinicializar la instancia: ' + (error.response?.data?.message || error.message));
      setLoading(false);
    }
  };

  const checkStatus = async () => {
    try {
      const response = await whatsappAPI.getInstanceStatus(instanceId);
      
      console.log(`[WhatsAppQRModal] Estado de ${instanceId}:`, response);
      
      // Verificar si está conectado o si tiene número de teléfono (lo que indica conexión)
      if (response.status === 'connected' || response.phoneNumber) {
        console.log(`[WhatsAppQRModal] ✅ Conexión detectada para ${instanceId}`, {
          status: response.status,
          phoneNumber: response.phoneNumber
        });
        
        // Forzar una actualización del estado en el backend
        if (response.status !== 'connected' && response.phoneNumber) {
          console.log(`[WhatsAppQRModal] Forzando actualización de estado a connected...`);
          try {
            await whatsappAPI.reconnectInstance(instanceId);
          } catch (reconnectError) {
            console.warn('Error al reconectar, pero continuando:', reconnectError);
          }
        }
        
        toast.success('¡WhatsApp conectado exitosamente!');
        clearInterval(pollingInterval);
        if (onSuccess) onSuccess();
        onClose();
      } else {
        console.log(`[WhatsAppQRModal] Estado actual: ${response.status}`);
        
        // Si el QR está listo pero no se ha escaneado por un tiempo, refrescarlo
        if (response.status === 'qr_ready' && qrData && Date.now() - new Date(qrData.timestamp).getTime() > 60000) {
          console.log(`[WhatsAppQRModal] QR expirado, refrescando...`);
          loadQRCode();
        }
      }
    } catch (error) {
      console.error('Error al verificar estado:', error);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-lg max-w-md w-full p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-semibold text-gray-900">Conectar WhatsApp</h2>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-gray-500"
          >
            &times;
          </button>
        </div>
        
        <div className="text-center py-4">
          {loading ? (
            <div className="flex flex-col items-center justify-center">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
              <p className="mt-4 text-gray-600">Cargando código QR...</p>
            </div>
          ) : error ? (
            <div className="text-red-500">
              <p>{error}</p>
              <div className="mt-4 space-x-2">
                <button
                  onClick={loadQRCode}
                  className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Reintentar
                </button>
                <button
                  onClick={handleReinitialize}
                  className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
                >
                  Reinicializar
                </button>
              </div>
            </div>
          ) : qrData ? (
            <div className="flex flex-col items-center">
              <div className="bg-white p-2 rounded-lg shadow-sm">
                {qrData.qrImage ? (
                  <img 
                    src={qrData.qrImage} 
                    alt="Código QR de WhatsApp" 
                    className="w-64 h-64"
                  />
                ) : (
                  <div className="w-64 h-64 flex items-center justify-center bg-gray-100">
                    <QrCode className="w-16 h-16 text-gray-400" />
                  </div>
                )}
              </div>
              
              <div className="mt-6 text-center">
                <h3 className="font-medium text-gray-900">Escanea el código QR</h3>
                <p className="text-sm text-gray-500 mt-1">
                  Abre WhatsApp en tu teléfono, ve a Ajustes &gt; Dispositivos vinculados &gt; Vincular un dispositivo
                </p>
              </div>
            </div>
          ) : (
            <div className="flex flex-col items-center">
              <Smartphone className="w-16 h-16 text-gray-400" />
              <p className="mt-4 text-gray-600">No hay código QR disponible</p>
            </div>
          )}
        </div>
        
        <div className="mt-6 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 border border-gray-300 rounded-md shadow-sm text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

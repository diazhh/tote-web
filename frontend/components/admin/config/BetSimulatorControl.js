'use client';

import { useState, useEffect } from 'react';
import { Play, Square, Loader2, CheckCircle, AlertCircle, Zap } from 'lucide-react';

export default function BetSimulatorControl() {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000/api';

  useEffect(() => {
    fetchConfig();
  }, []);

  const getAuthHeaders = () => {
    const token = localStorage.getItem('accessToken');
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  };

  const fetchConfig = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_URL}/system/bet-simulator`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      
      if (data.success) {
        setConfig(data.data);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Error al cargar configuración');
    } finally {
      setLoading(false);
    }
  };

  const toggleSimulator = async () => {
    try {
      setUpdating(true);
      setError(null);
      setSuccess(null);

      const res = await fetch(`${API_URL}/system/bet-simulator`, {
        method: 'PUT',
        headers: getAuthHeaders(),
        body: JSON.stringify({ enabled: !config.enabled })
      });
      const data = await res.json();

      if (data.success) {
        setConfig(data.data);
        setSuccess(data.message);
        setTimeout(() => setSuccess(null), 5000);
      } else {
        setError(data.error);
      }
    } catch (err) {
      setError('Error al actualizar configuración');
    } finally {
      setUpdating(false);
    }
  };

  const runNow = async () => {
    try {
      setRunning(true);
      setError(null);
      setSuccess(null);

      const res = await fetch(`${API_URL}/system/bet-simulator/run`, {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json();

      if (data.success) {
        setSuccess(data.message);
        fetchConfig(); // Actualizar lastExecutedAt
        setTimeout(() => setSuccess(null), 5000);
      } else {
        setError(data.message || 'Error al ejecutar simulador');
      }
    } catch (err) {
      setError('Error al ejecutar simulador');
    } finally {
      setRunning(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      {/* Header */}
      <div className="p-6 border-b bg-gradient-to-r from-purple-500 to-purple-600">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-white/20 rounded-lg">
            <Zap className="w-6 h-6 text-white" />
          </div>
          <div>
            <h3 className="font-semibold text-white">Generador de Jugadas</h3>
            <p className="text-purple-100 text-sm">
              Genera tickets y tripletas automáticamente
            </p>
          </div>
        </div>
      </div>

      <div className="p-6">
        {/* Mensajes */}
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg flex items-center gap-2 text-red-700 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
            <button onClick={() => setError(null)} className="ml-auto">×</button>
          </div>
        )}

        {success && (
          <div className="mb-4 p-3 bg-green-50 border border-green-200 rounded-lg flex items-center gap-2 text-green-700 text-sm">
            <CheckCircle className="w-4 h-4" />
            {success}
          </div>
        )}

        {/* Estado */}
        <div className="mb-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-sm font-medium text-gray-700">Estado del Generador</p>
              <p className="text-xs text-gray-500 mt-1">
                {config?.enabled 
                  ? 'Generando jugadas en cada apertura de sorteo'
                  : 'Desactivado - No se generarán jugadas automáticas'
                }
              </p>
            </div>
            <button
              onClick={toggleSimulator}
              disabled={updating}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                config?.enabled ? 'bg-green-600' : 'bg-gray-200'
              } ${updating ? 'opacity-50 cursor-not-allowed' : ''}`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  config?.enabled ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>

          {/* Última ejecución */}
          {config?.lastExecutedAt && (
            <div className="text-xs text-gray-500">
              Última ejecución: {new Date(config.lastExecutedAt).toLocaleString('es-VE')}
            </div>
          )}
        </div>

        {/* Información */}
        <div className="mb-6 p-4 bg-blue-50 rounded-lg">
          <h4 className="text-sm font-medium text-blue-900 mb-2">¿Cómo funciona?</h4>
          <ul className="text-sm text-blue-800 space-y-1">
            <li>• <strong>Al activar:</strong> Genera jugadas inmediatamente</li>
            <li>• <strong>En cada sorteo:</strong> Genera jugadas cuando se crean nuevos sorteos (01:05 AM)</li>
            <li>• <strong>Cantidad:</strong> 20-40 tickets y 5-15 tripletas por sorteo</li>
            <li>• <strong>Usuario:</strong> jugador_test (saldo ilimitado)</li>
          </ul>
        </div>

        {/* Botón ejecutar ahora */}
        <button
          onClick={runNow}
          disabled={running}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed transition"
        >
          {running ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              Generando jugadas...
            </>
          ) : (
            <>
              <Play className="w-5 h-5" />
              Generar Jugadas Ahora
            </>
          )}
        </button>

        <p className="text-xs text-gray-500 text-center mt-2">
          Ejecuta el generador manualmente sin importar si está activado o no
        </p>
      </div>
    </div>
  );
}

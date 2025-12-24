'use client';

import { useState, useEffect, useRef } from 'react';
import { RefreshCw } from 'lucide-react';

export default function RefreshControl({ onRefresh, autoRefreshIntervals = [5, 10, 30, 60] }) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [autoRefreshInterval, setAutoRefreshInterval] = useState(0); // 0 = disabled
  const intervalRef = useRef(null);

  useEffect(() => {
    // Limpiar intervalo anterior
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }

    // Configurar nuevo intervalo si está habilitado
    if (autoRefreshInterval > 0) {
      intervalRef.current = setInterval(() => {
        handleRefresh();
      }, autoRefreshInterval * 1000);
    }

    // Cleanup al desmontar
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [autoRefreshInterval]);

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try {
      await onRefresh();
    } catch (error) {
      console.error('Error refreshing:', error);
    } finally {
      setIsRefreshing(false);
    }
  };

  return (
    <div className="flex items-center gap-3">
      {/* Botón de refrescar manual */}
      <button
        onClick={handleRefresh}
        disabled={isRefreshing}
        className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
      >
        <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin' : ''}`} />
        {isRefreshing ? 'Actualizando...' : 'Refrescar'}
      </button>

      {/* Selector de auto-refresh */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-600">Auto-refrescar:</label>
        <select
          value={autoRefreshInterval}
          onChange={(e) => setAutoRefreshInterval(Number(e.target.value))}
          className="px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
        >
          <option value={0}>Desactivado</option>
          {autoRefreshIntervals.map((interval) => (
            <option key={interval} value={interval}>
              Cada {interval} seg
            </option>
          ))}
        </select>
      </div>

      {/* Indicador de auto-refresh activo */}
      {autoRefreshInterval > 0 && (
        <div className="flex items-center gap-2 text-sm text-green-600">
          <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
          Auto-refresh activo
        </div>
      )}
    </div>
  );
}

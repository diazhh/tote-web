'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import { Play, Square, Settings, Loader2 } from 'lucide-react';

export default function TestBetsControl() {
  const [config, setConfig] = useState({ enabled: false });
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState({
    interval: 30000,
    minAmount: 1,
    maxAmount: 100,
    minBets: 1,
    maxBets: 5
  });

  useEffect(() => {
    loadConfig();
  }, []);

  const loadConfig = async () => {
    try {
      setLoading(true);
      const response = await fetch('/api/system/test-bets', {
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) throw new Error('Error al cargar configuración');

      const data = await response.json();
      setConfig(data.data);
      
      if (data.data.interval) {
        setSettings({
          interval: data.data.interval || 30000,
          minAmount: data.data.minAmount || 1,
          maxAmount: data.data.maxAmount || 100,
          minBets: data.data.minBets || 1,
          maxBets: data.data.maxBets || 5
        });
      }
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cargar configuración');
    } finally {
      setLoading(false);
    }
  };

  const toggleTestBets = async () => {
    try {
      setToggling(true);
      const endpoint = config.enabled ? '/api/system/test-bets/disable' : '/api/system/test-bets/enable';
      const body = config.enabled ? {} : settings;

      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) throw new Error('Error al cambiar estado');

      const data = await response.json();
      toast.success(data.message);
      await loadConfig();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al cambiar estado de jugadas de prueba');
    } finally {
      setToggling(false);
    }
  };

  const saveSettings = async () => {
    try {
      const response = await fetch('/api/system/test-bets/enable', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        },
        body: JSON.stringify(settings)
      });

      if (!response.ok) throw new Error('Error al guardar configuración');

      toast.success('Configuración guardada');
      setShowSettings(false);
      await loadConfig();
    } catch (error) {
      console.error('Error:', error);
      toast.error('Error al guardar configuración');
    }
  };

  if (loading) {
    return (
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex items-center justify-center h-32">
          <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-xl font-bold text-gray-900">Jugadas de Prueba</h2>
            <p className="text-sm text-gray-600 mt-1">
              Sistema automático de inserción de jugadas para pruebas
            </p>
          </div>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 text-gray-600 hover:text-gray-900 hover:bg-gray-100 rounded-lg transition"
            title="Configuración"
          >
            <Settings className="w-5 h-5" />
          </button>
        </div>

        {/* Estado y Control */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg mb-4">
          <div className="flex items-center gap-3">
            <div className={`w-3 h-3 rounded-full ${config.enabled ? 'bg-green-500 animate-pulse' : 'bg-gray-400'}`} />
            <div>
              <p className="font-medium text-gray-900">
                {config.enabled ? 'Activo' : 'Inactivo'}
              </p>
              <p className="text-sm text-gray-600">
                {config.enabled ? 'Insertando jugadas automáticamente' : 'Sistema detenido'}
              </p>
            </div>
          </div>

          <button
            onClick={toggleTestBets}
            disabled={toggling}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition disabled:opacity-50 ${
              config.enabled
                ? 'bg-red-600 hover:bg-red-700 text-white'
                : 'bg-green-600 hover:bg-green-700 text-white'
            }`}
          >
            {toggling ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : config.enabled ? (
              <Square className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {toggling ? 'Procesando...' : config.enabled ? 'Detener' : 'Iniciar'}
          </button>
        </div>

        {/* Configuración Actual */}
        {config.enabled && (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4 p-4 bg-blue-50 rounded-lg">
            <div>
              <p className="text-xs text-blue-600 font-medium">Intervalo</p>
              <p className="text-lg font-bold text-blue-900">{(config.interval / 1000).toFixed(0)}s</p>
            </div>
            <div>
              <p className="text-xs text-blue-600 font-medium">Monto</p>
              <p className="text-lg font-bold text-blue-900">${config.minAmount} - ${config.maxAmount}</p>
            </div>
            <div>
              <p className="text-xs text-blue-600 font-medium">Jugadas/Sorteo</p>
              <p className="text-lg font-bold text-blue-900">{config.minBets} - {config.maxBets}</p>
            </div>
          </div>
        )}

        {/* Panel de Configuración */}
        {showSettings && (
          <div className="mt-4 p-4 border-2 border-blue-200 rounded-lg bg-blue-50">
            <h3 className="font-semibold text-gray-900 mb-4">Configuración Avanzada</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Intervalo (segundos)
                </label>
                <input
                  type="number"
                  value={settings.interval / 1000}
                  onChange={(e) => setSettings({ ...settings, interval: parseInt(e.target.value) * 1000 })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  min="10"
                  max="300"
                />
                <p className="text-xs text-gray-500 mt-1">Cada cuántos segundos insertar jugadas</p>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto Mínimo ($)
                </label>
                <input
                  type="number"
                  value={settings.minAmount}
                  onChange={(e) => setSettings({ ...settings, minAmount: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  min="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Monto Máximo ($)
                </label>
                <input
                  type="number"
                  value={settings.maxAmount}
                  onChange={(e) => setSettings({ ...settings, maxAmount: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  min="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Jugadas Mínimas
                </label>
                <input
                  type="number"
                  value={settings.minBets}
                  onChange={(e) => setSettings({ ...settings, minBets: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  min="1"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Jugadas Máximas
                </label>
                <input
                  type="number"
                  value={settings.maxBets}
                  onChange={(e) => setSettings({ ...settings, maxBets: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                  min="1"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-4">
              <button
                onClick={() => setShowSettings(false)}
                className="flex-1 px-4 py-2 border rounded-lg hover:bg-gray-50"
              >
                Cancelar
              </button>
              <button
                onClick={saveSettings}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Guardar y Aplicar
              </button>
            </div>
          </div>
        )}

        {/* Información */}
        <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded-lg">
          <p className="text-sm text-yellow-800">
            <strong>Nota:</strong> Las jugadas de prueba se insertan automáticamente en sorteos abiertos 
            usando jugadores con username que empiece con "test_". Asegúrate de tener jugadores de prueba creados.
          </p>
        </div>
      </div>
    </div>
  );
}

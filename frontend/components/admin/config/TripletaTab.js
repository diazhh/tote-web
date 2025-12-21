'use client';

import { useState, useEffect } from 'react';
import { toast } from 'sonner';
import gamesAPI from '@/lib/api/games';
import { Trophy, Save, AlertCircle } from 'lucide-react';

export default function TripletaTab({ game, onUpdate }) {
  const [config, setConfig] = useState({
    enabled: false,
    multiplier: 50,
    drawsCount: 10,
  });
  const [saving, setSaving] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);

  useEffect(() => {
    if (game?.config?.tripleta) {
      setConfig({
        enabled: game.config.tripleta.enabled || false,
        multiplier: game.config.tripleta.multiplier || 50,
        drawsCount: game.config.tripleta.drawsCount || 10,
      });
    }
  }, [game]);

  const handleChange = (field, value) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
    setHasChanges(true);
  };

  const handleSave = async () => {
    try {
      setSaving(true);

      // Validaciones
      if (config.enabled) {
        if (config.multiplier <= 0) {
          toast.error('El multiplicador debe ser mayor a 0');
          return;
        }
        if (config.drawsCount <= 0) {
          toast.error('La cantidad de sorteos debe ser mayor a 0');
          return;
        }
      }

      const updatedConfig = {
        ...game.config,
        tripleta: {
          enabled: config.enabled,
          multiplier: parseFloat(config.multiplier),
          drawsCount: parseInt(config.drawsCount),
        }
      };

      await gamesAPI.update(game.id, { config: updatedConfig });
      toast.success('Configuración de Tripleta guardada correctamente');
      setHasChanges(false);
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error saving tripleta config:', error);
      toast.error(error.message || 'Error al guardar configuración');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-start gap-4">
        <div className="w-12 h-12 bg-yellow-100 rounded-lg flex items-center justify-center flex-shrink-0">
          <Trophy className="w-6 h-6 text-yellow-600" />
        </div>
        <div className="flex-1">
          <h2 className="text-xl font-semibold text-gray-900">Configuración de Tripleta</h2>
          <p className="text-gray-600 mt-1">
            La modalidad Tripleta permite a los jugadores seleccionar 3 números diferentes. 
            Si los 3 números salen en los próximos sorteos configurados, ganan el premio multiplicado.
          </p>
        </div>
      </div>

      {/* Alert Info */}
      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <div className="flex gap-3">
          <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm text-blue-800">
            <p className="font-medium mb-1">¿Cómo funciona la Tripleta?</p>
            <ul className="list-disc list-inside space-y-1">
              <li>El jugador selecciona 3 números diferentes</li>
              <li>La apuesta es válida por la cantidad de sorteos configurados</li>
              <li>Si los 3 números salen en cualquiera de esos sorteos, gana</li>
              <li>El premio es el monto apostado multiplicado por el multiplicador configurado</li>
            </ul>
          </div>
        </div>
      </div>

      {/* Configuration Form */}
      <div className="bg-white border border-gray-200 rounded-lg p-6 space-y-6">
        {/* Enable/Disable */}
        <div className="flex items-center justify-between">
          <div>
            <label className="text-sm font-medium text-gray-900">
              Habilitar Modalidad Tripleta
            </label>
            <p className="text-sm text-gray-600 mt-1">
              Activa o desactiva la modalidad Tripleta para este juego
            </p>
          </div>
          <button
            onClick={() => handleChange('enabled', !config.enabled)}
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
              config.enabled ? 'bg-blue-600' : 'bg-gray-200'
            }`}
          >
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                config.enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          </button>
        </div>

        {/* Multiplier */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Multiplicador de Premio
          </label>
          <p className="text-sm text-gray-600 mb-3">
            El monto apostado se multiplicará por este valor si el jugador gana
          </p>
          <input
            type="number"
            min="1"
            step="0.01"
            value={config.multiplier}
            onChange={(e) => handleChange('multiplier', e.target.value)}
            disabled={!config.enabled}
            className="w-full sm:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            placeholder="Ej: 50"
          />
          {config.enabled && (
            <p className="text-sm text-gray-500 mt-2">
              Ejemplo: Si apuesta $10 y gana, recibirá ${(10 * parseFloat(config.multiplier || 0)).toFixed(2)}
            </p>
          )}
        </div>

        {/* Draws Count */}
        <div>
          <label className="block text-sm font-medium text-gray-900 mb-2">
            Cantidad de Sorteos
          </label>
          <p className="text-sm text-gray-600 mb-3">
            Número de sorteos consecutivos en los que la apuesta estará activa
          </p>
          <input
            type="number"
            min="1"
            step="1"
            value={config.drawsCount}
            onChange={(e) => handleChange('drawsCount', e.target.value)}
            disabled={!config.enabled}
            className="w-full sm:w-64 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:bg-gray-100 disabled:cursor-not-allowed"
            placeholder="Ej: 10"
          />
          {config.enabled && (
            <p className="text-sm text-gray-500 mt-2">
              La apuesta será válida por los próximos {config.drawsCount} sorteos
            </p>
          )}
        </div>
      </div>

      {/* Save Button */}
      {hasChanges && (
        <div className="flex justify-end gap-3">
          <button
            onClick={() => {
              if (game?.config?.tripleta) {
                setConfig({
                  enabled: game.config.tripleta.enabled || false,
                  multiplier: game.config.tripleta.multiplier || 50,
                  drawsCount: game.config.tripleta.drawsCount || 10,
                });
              }
              setHasChanges(false);
            }}
            className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
          >
            Cancelar
          </button>
          <button
            onClick={handleSave}
            disabled={saving}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4" />
            {saving ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </div>
      )}

      {/* Current Status */}
      <div className="bg-gray-50 rounded-lg p-4">
        <h3 className="text-sm font-medium text-gray-900 mb-3">Estado Actual</h3>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-600">Estado</p>
            <p className={`text-sm font-semibold ${config.enabled ? 'text-green-600' : 'text-gray-600'}`}>
              {config.enabled ? 'Habilitada' : 'Deshabilitada'}
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Multiplicador</p>
            <p className="text-sm font-semibold text-gray-900">
              {config.multiplier}x
            </p>
          </div>
          <div>
            <p className="text-xs text-gray-600">Sorteos</p>
            <p className="text-sm font-semibold text-gray-900">
              {config.drawsCount}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

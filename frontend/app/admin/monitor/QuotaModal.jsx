'use client';

import { useState, useEffect } from 'react';
import { X, Shield, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import quotaApi from '@/lib/api/quota';

function formatCurrency(amount) {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'VES',
    minimumFractionDigits: 2,
  }).format(amount || 0);
}

/**
 * Modal for setting / removing the cap on a specific (draw, item).
 */
export default function QuotaModal({ draw, item, onClose, onSaved }) {
  const [value, setValue] = useState(item.maxAmount ?? '');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setValue(item.maxAmount ?? '');
  }, [item]);

  const hasExistingQuota = item.maxAmount !== null && item.maxAmount !== undefined;

  const handleSave = async () => {
    const n = Number(value);
    if (!Number.isFinite(n) || n <= 0) {
      toast.error('Monto máximo debe ser un número mayor a 0');
      return;
    }
    setSaving(true);
    try {
      await quotaApi.setQuota(draw.id, item.gameItemId, n);
      toast.success('Cupo guardado');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error guardando cupo');
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async () => {
    setSaving(true);
    try {
      await quotaApi.removeQuota(draw.id, item.gameItemId);
      toast.success('Cupo eliminado');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error eliminando cupo');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5 text-blue-600" />
            Cupo del item {item.number} — {item.name}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700" disabled={saving}>
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 space-y-4">
          <div className="text-sm text-gray-600">
            <div>Sorteo: <span className="font-medium">{draw.game} — {(draw.drawTime || '').slice(0, 5)}</span></div>
            <div className="mt-1">
              Vendido actual: <span className="font-bold text-green-600">{formatCurrency(item.soldAmount)}</span>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Monto máximo (Bs)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
              disabled={saving}
              autoFocus
            />
            {hasExistingQuota && Number(value) < item.soldAmount && (
              <p className="text-xs text-red-600 mt-1">
                Atención: el cupo que estás poniendo ({formatCurrency(Number(value))}) es menor al vendido actual. Las ventas existentes no se ven afectadas, pero nuevas ventas serán rechazadas.
              </p>
            )}
          </div>
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-between gap-2">
          <div>
            {hasExistingQuota && (
              <button
                onClick={handleRemove}
                className="px-4 py-2 bg-red-50 text-red-700 border border-red-200 rounded-lg hover:bg-red-100 flex items-center gap-2"
                disabled={saving}
              >
                <Trash2 className="w-4 h-4" />
                Eliminar cupo
              </button>
            )}
          </div>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
              disabled={saving}
            >
              Cancelar
            </button>
            <button
              onClick={handleSave}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              disabled={saving}
            >
              {saving ? 'Guardando...' : 'Guardar'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

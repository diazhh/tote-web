'use client';

import { useState } from 'react';
import { createConfig } from '@/lib/api/commissions';

// Append-only config creator (F-5). Supports all 4 formula types per
// FIN-COMM-01: SALES_PCT, UTILITY_PCT, SALES_AND_UTILITY_PCT, TIERED.
// Tier reordering UI is intentionally deferred per REQUIREMENTS.md
// (deferred_items list). NO edit/delete UI either — append-only.

const FORMULA_OPTIONS = [
  { value: 'SALES_PCT', label: 'SALES_PCT — % sobre ventas' },
  { value: 'UTILITY_PCT', label: 'UTILITY_PCT — % sobre utilidad' },
  {
    value: 'SALES_AND_UTILITY_PCT',
    label: 'SALES_AND_UTILITY_PCT — % ventas + % utilidad',
  },
  { value: 'TIERED', label: 'TIERED — brackets por ventas acumuladas semanales' },
];

export default function NewConfigModal({ apiSystemId, onClose, onCreated }) {
  const [formulaType, setFormulaType] = useState('SALES_PCT');
  const [effectiveFrom, setEffectiveFrom] = useState(() =>
    // Local datetime string suitable for <input type="datetime-local">
    new Date().toISOString().slice(0, 16)
  );
  const [salesRate, setSalesRate] = useState('');
  const [utilityRate, setUtilityRate] = useState('');
  const [notes, setNotes] = useState('');
  const [tiers, setTiers] = useState([{ minSales: '0', maxSales: '', rate: '' }]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const needsSalesRate =
    formulaType === 'SALES_PCT' || formulaType === 'SALES_AND_UTILITY_PCT';
  const needsUtilityRate =
    formulaType === 'UTILITY_PCT' || formulaType === 'SALES_AND_UTILITY_PCT';
  const needsTiers = formulaType === 'TIERED';

  const addTier = () => {
    setTiers((prev) => [
      ...prev,
      { minSales: '', maxSales: '', rate: '' },
    ]);
  };

  const removeTier = (idx) => {
    setTiers((prev) => prev.filter((_, i) => i !== idx));
  };

  const updateTier = (idx, key, value) => {
    setTiers((prev) =>
      prev.map((t, i) => (i === idx ? { ...t, [key]: value } : t))
    );
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const body = {
        apiSystemId,
        formulaType,
        effectiveFrom: new Date(effectiveFrom).toISOString(),
        notes: notes || undefined,
      };
      if (needsSalesRate) body.salesRate = salesRate;
      if (needsUtilityRate) body.utilityRate = utilityRate;
      if (needsTiers) {
        body.tiers = tiers.map((t) => ({
          minSales: t.minSales,
          maxSales: t.maxSales === '' ? null : t.maxSales,
          rate: t.rate,
        }));
      }
      await createConfig(body);
      if (onCreated) await onCreated();
      onClose();
    } catch (err) {
      setError(err.message || 'Error creando configuración');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-4 sm:p-6 max-w-2xl w-full mx-2 sm:mx-0 max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">Nueva Configuración de Comisión</h2>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-4">
          Las configuraciones son <strong>append-only</strong> — cada guardado
          crea una nueva versión. La configuración anterior queda preservada
          en el historial.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo de fórmula *
            </label>
            <select
              value={formulaType}
              onChange={(e) => setFormulaType(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
            >
              {FORMULA_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Efectivo desde *
            </label>
            <input
              type="datetime-local"
              value={effectiveFrom}
              onChange={(e) => setEffectiveFrom(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
            />
            <p className="text-xs text-gray-500 mt-1">
              Esta versión aplica a sorteos con drawnAt &gt;= este instante.
            </p>
          </div>

          {needsSalesRate && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tasa sobre ventas (%) *
              </label>
              <input
                type="number"
                step="0.00000001"
                min="0"
                value={salesRate}
                onChange={(e) => setSalesRate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                placeholder="5.5"
                required
              />
            </div>
          )}

          {needsUtilityRate && (
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Tasa sobre utilidad (%) *
              </label>
              <input
                type="number"
                step="0.00000001"
                min="0"
                value={utilityRate}
                onChange={(e) => setUtilityRate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                placeholder="10.0"
                required
              />
            </div>
          )}

          {needsTiers && (
            <div className="border-t pt-4 mt-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-semibold text-gray-900">
                  Brackets (Tiers)
                </h3>
                <button
                  type="button"
                  onClick={addTier}
                  className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                >
                  + Agregar bracket
                </button>
              </div>
              <p className="text-xs text-gray-500 mb-3">
                Las brackets evalúan contra las ventas acumuladas del proveedor
                en la semana ISO en curso (D-04). El último bracket puede dejar
                <code className="bg-gray-100 px-1 rounded mx-1">maxSales</code>
                vacío para indicar &quot;sin tope&quot;.
              </p>
              <div className="space-y-2">
                {tiers.map((tier, idx) => (
                  <div
                    key={idx}
                    className="flex flex-wrap gap-2 items-end bg-gray-50 rounded p-2"
                  >
                    <div className="flex-1 min-w-[100px]">
                      <label className="block text-xs text-gray-600 mb-1">
                        Min ventas
                      </label>
                      <input
                        type="number"
                        step="0.00000001"
                        min="0"
                        value={tier.minSales}
                        onChange={(e) =>
                          updateTier(idx, 'minSales', e.target.value)
                        }
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono"
                        required
                      />
                    </div>
                    <div className="flex-1 min-w-[100px]">
                      <label className="block text-xs text-gray-600 mb-1">
                        Max ventas (vacío = sin tope)
                      </label>
                      <input
                        type="number"
                        step="0.00000001"
                        min="0"
                        value={tier.maxSales}
                        onChange={(e) =>
                          updateTier(idx, 'maxSales', e.target.value)
                        }
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono"
                      />
                    </div>
                    <div className="flex-1 min-w-[80px]">
                      <label className="block text-xs text-gray-600 mb-1">
                        Tasa (%)
                      </label>
                      <input
                        type="number"
                        step="0.00000001"
                        min="0"
                        value={tier.rate}
                        onChange={(e) =>
                          updateTier(idx, 'rate', e.target.value)
                        }
                        className="w-full px-2 py-1 border border-gray-300 rounded text-sm font-mono"
                        required
                      />
                    </div>
                    {tiers.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeTier(idx)}
                        className="px-2 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
                      >
                        Quitar
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notas (opcional)
            </label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={2}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              placeholder="Cambio negociado con el proveedor el ..."
            />
          </div>

          {error && (
            <div className="bg-red-50 border border-red-200 rounded p-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Guardando…' : 'Crear configuración'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

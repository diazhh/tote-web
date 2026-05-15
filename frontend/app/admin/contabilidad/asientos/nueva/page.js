'use client';

// /admin/contabilidad/asientos/nueva — create-entry form.
//
// F-6 frontend block: when currency=USD, fetch rate for entryDate. If no rate
// exists for that date, show the explicit Spanish error
//   "No hay tasa de cambio para {date} — ingresa una tasa primero."
// AND disable the submit button. Backend also rejects (defense in depth).
//
// Query string honored: ?type=PAYMENT&settlementId=<id> pre-populates the
// form (planner pre-decision O3 — quick action from /admin/contabilidad/pagos).

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  fetchRates,
  fetchCategories,
  createEntry,
} from '@/lib/api/contabilidad';
import { getSettlements } from '@/lib/api/commissions';

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function NuevoAsientoPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Pre-populate from query string (O3): ?type=PAYMENT&settlementId=...
  const qsType = searchParams.get('type');
  const qsSettlementId = searchParams.get('settlementId');

  const [formData, setFormData] = useState({
    type: qsType || 'EXPENSE',
    entryDate: todayIsoDate(),
    categoryId: '',
    description: '',
    currency: 'BsF',
    amount: '',
    settlementId: qsSettlementId || null,
  });
  const [categories, setCategories] = useState([]);
  const [rateForDate, setRateForDate] = useState(null);
  const [rateLoading, setRateLoading] = useState(false);
  const [settlements, setSettlements] = useState([]);
  const [submitting, setSubmitting] = useState(false);

  // Load categories filtered by current type (D-02)
  useEffect(() => {
    fetchCategories({ appliesTo: formData.type })
      .then((res) => setCategories(Array.isArray(res?.data) ? res.data : []))
      .catch((err) => toast.error(err.message || 'Error cargando categorías'));
    // When type changes, clear categoryId (a category bound to a different type
    // would otherwise stay stale in the dropdown).
    setFormData((fd) => ({ ...fd, categoryId: '' }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.type]);

  // F-6 frontend block: when currency===USD, fetch rate for entryDate.
  useEffect(() => {
    if (formData.currency !== 'USD') {
      setRateForDate({}); // truthy non-null so usdBlocked stays false for BsF
      return;
    }
    setRateLoading(true);
    fetchRates({ from: formData.entryDate, to: formData.entryDate })
      .then((res) => {
        const rows = Array.isArray(res?.data) ? res.data : [];
        setRateForDate(rows.length > 0 ? rows[0] : null);
      })
      .catch((err) => {
        toast.error(err.message || 'Error consultando tasa');
        setRateForDate(null);
      })
      .finally(() => setRateLoading(false));
  }, [formData.currency, formData.entryDate]);

  // PAYMENT type reveals the settlement picker
  const loadSettlements = useCallback(async () => {
    try {
      const [confirmed, adjusted] = await Promise.all([
        getSettlements({ status: 'CONFIRMED' }),
        getSettlements({ status: 'ADJUSTED' }),
      ]);
      const all = [
        ...(Array.isArray(confirmed?.data) ? confirmed.data : []),
        ...(Array.isArray(adjusted?.data) ? adjusted.data : []),
      ];
      setSettlements(all);
    } catch (err) {
      toast.error(err.message || 'Error cargando liquidaciones');
    }
  }, []);

  useEffect(() => {
    if (formData.type === 'PAYMENT') {
      loadSettlements();
    } else {
      // When the type leaves PAYMENT, force settlementId back to null.
      setFormData((fd) =>
        fd.settlementId ? { ...fd, settlementId: null } : fd
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [formData.type]);

  const usdBlocked =
    formData.currency === 'USD' && (rateLoading ? false : !rateForDate);

  // Live BsF preview when USD
  const livePreviewBsF =
    formData.currency === 'USD' &&
    rateForDate &&
    rateForDate.rateBsPerUsd &&
    formData.amount
      ? (Number(formData.amount) * Number(rateForDate.rateBsPerUsd)).toFixed(2)
      : null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (usdBlocked) return; // F-6 frontend block
    const amountNum = Number(formData.amount);
    if (!(amountNum > 0)) return toast.error('Monto debe ser un número positivo');
    if (!formData.categoryId) return toast.error('Categoría requerida');

    setSubmitting(true);
    try {
      const payload = {
        type: formData.type,
        entryDate: formData.entryDate,
        categoryId: formData.categoryId,
        description: formData.description || undefined,
        currency: formData.currency,
        amount: amountNum,
      };
      if (formData.type === 'PAYMENT' && formData.settlementId) {
        payload.settlementId = formData.settlementId;
      }
      const res = await createEntry(payload);
      const newId = res?.data?.id;
      toast.success('Asiento creado');
      if (newId) {
        router.push(`/admin/contabilidad/asientos/${newId}`);
      } else {
        router.push('/admin/contabilidad/asientos');
      }
    } catch (err) {
      // Backend NoRateForDate also produces 400 — surface the message and let
      // the next render of the rate-fetch effect re-disable the button.
      if (/NoRateForDate|tasa de cambio/i.test(err.message)) {
        setRateForDate(null);
      }
      toast.error(err.message || 'Error creando asiento');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Nuevo asiento</h1>
        <Link
          href="/admin/contabilidad/asientos"
          className="text-sm text-blue-700 hover:underline"
        >
          ← Volver
        </Link>
      </div>

      <form
        onSubmit={handleSubmit}
        className="bg-white shadow rounded-lg p-4 space-y-4"
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
            >
              <option value="EXPENSE">EXPENSE</option>
              <option value="INCOME">INCOME</option>
              <option value="PAYMENT">PAYMENT</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Fecha</label>
            <input
              type="date"
              required
              value={formData.entryDate}
              onChange={(e) =>
                setFormData({ ...formData, entryDate: e.target.value })
              }
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Categoría</label>
            <select
              value={formData.categoryId}
              onChange={(e) =>
                setFormData({ ...formData, categoryId: e.target.value })
              }
              required
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
            >
              <option value="">— Selecciona —</option>
              {categories
                .filter((c) => c.isActive !== false)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Moneda</label>
            <select
              value={formData.currency}
              onChange={(e) =>
                setFormData({ ...formData, currency: e.target.value })
              }
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
            >
              <option value="BsF">BsF</option>
              <option value="USD">USD</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Monto ({formData.currency})
            </label>
            <input
              type="number"
              step="0.00000001"
              min="0"
              required
              value={formData.amount}
              onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
            />
          </div>
          {formData.type === 'PAYMENT' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Liquidación
              </label>
              <select
                value={formData.settlementId || ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    settlementId: e.target.value || null,
                  })
                }
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
              >
                <option value="">— Sin liquidación —</option>
                {settlements.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.isoYear}-W{s.isoWeek} · {s.apiSystem?.name || s.apiSystemId} ·{' '}
                    {s.status}
                  </option>
                ))}
              </select>
            </div>
          )}
        </div>

        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Descripción
          </label>
          <textarea
            value={formData.description}
            onChange={(e) =>
              setFormData({ ...formData, description: e.target.value })
            }
            rows={2}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
          />
        </div>

        {/* F-6 frontend block — explicit Spanish error + disabled submit */}
        {formData.currency === 'USD' && rateLoading && (
          <p className="text-sm text-gray-500">Consultando tasa…</p>
        )}
        {usdBlocked && (
          <div className="text-red-600 text-sm border border-red-200 bg-red-50 rounded-md px-3 py-2">
            No hay tasa de cambio para {formData.entryDate} — ingresa una tasa
            primero.
          </div>
        )}

        {/* Live BsF preview for USD entries */}
        {livePreviewBsF !== null && (
          <div className="text-sm text-gray-700 bg-blue-50 border border-blue-200 rounded-md px-3 py-2">
            <strong>Equivalente:</strong> {livePreviewBsF} BsF{' '}
            <span className="text-xs text-gray-500">
              (a tasa {Number(rateForDate.rateBsPerUsd).toFixed(4)}{' '}
              {rateForDate.rateType})
            </span>
          </div>
        )}

        <div className="flex items-center justify-end gap-2">
          <Link
            href="/admin/contabilidad/asientos"
            className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            Cancelar
          </Link>
          <button
            type="submit"
            disabled={usdBlocked || submitting}
            className="px-4 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Guardando…' : 'Crear asiento'}
          </button>
        </div>
      </form>
    </div>
  );
}

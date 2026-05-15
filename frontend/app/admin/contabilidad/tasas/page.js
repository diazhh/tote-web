'use client';

// /admin/contabilidad/tasas — daily exchange-rate timeline + "Nueva tasa" inline form.
//
// FIN-RATE-01: admin records BsF-per-USD rate per date (typed BCV/PARALELO/OTRO).
// FIN-RATE-02: rates are immutable post-create — NO edit / NO delete affordance.
// FIN-RATE-05: multiple rows per same date are allowed; the most-recent createdAt wins (D-01).

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { fetchRates, createRate } from '@/lib/api/contabilidad';

const TABS = [
  { key: 'asientos',   label: 'Asientos',   href: '/admin/contabilidad/asientos' },
  { key: 'tasas',      label: 'Tasas',      href: '/admin/contabilidad/tasas' },
  { key: 'categorias', label: 'Categorías', href: '/admin/contabilidad/categorias' },
  { key: 'pagos',      label: 'Pagos',      href: '/admin/contabilidad/pagos' },
];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

export default function TasasPage() {
  const [rates, setRates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [rateTypeFilter, setRateTypeFilter] = useState('');
  const [formData, setFormData] = useState({
    date: todayIsoDate(),
    rateBsPerUsd: '',
    rateType: 'BCV',
    notes: '',
  });
  const [submitting, setSubmitting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchRates({ rateType: rateTypeFilter || undefined });
      setRates(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      toast.error(err.message || 'Error cargando tasas');
    } finally {
      setLoading(false);
    }
  }, [rateTypeFilter]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    const rateNum = Number(formData.rateBsPerUsd);
    if (!formData.date) return toast.error('La fecha es requerida');
    if (!(rateNum > 0)) return toast.error('La tasa debe ser un número positivo');
    setSubmitting(true);
    try {
      await createRate({
        date: formData.date,
        rateBsPerUsd: rateNum,
        rateType: formData.rateType,
        notes: formData.notes || undefined,
      });
      toast.success('Tasa creada');
      setFormData({
        date: todayIsoDate(),
        rateBsPerUsd: '',
        rateType: 'BCV',
        notes: '',
      });
      await load();
    } catch (err) {
      toast.error(err.message || 'Error creando tasa');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Contabilidad</h1>
        <p className="text-sm text-gray-500">Tasas de cambio (inmutables — FIN-RATE-02)</p>
      </div>

      <nav className="flex gap-2 border-b border-gray-200">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              tab.key === 'tasas'
                ? 'text-blue-700 border-blue-600'
                : 'text-gray-600 border-transparent hover:text-blue-700'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      {/* Inline form (RESEARCH Open Question #3 — inline-add at top of timeline) */}
      <form
        onSubmit={handleSubmit}
        className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 grid grid-cols-1 md:grid-cols-5 gap-3"
      >
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Fecha</label>
          <input
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            required
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Tipo</label>
          <select
            value={formData.rateType}
            onChange={(e) => setFormData({ ...formData, rateType: e.target.value })}
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
          >
            <option value="BCV">BCV</option>
            <option value="PARALELO">PARALELO</option>
            <option value="OTRO">OTRO</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">BsF / USD</label>
          <input
            type="number"
            step="0.0001"
            min="0"
            value={formData.rateBsPerUsd}
            onChange={(e) => setFormData({ ...formData, rateBsPerUsd: e.target.value })}
            placeholder="0.0000"
            required
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Notas</label>
          <input
            type="text"
            value={formData.notes}
            onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
            placeholder="Opcional"
            className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
          />
        </div>
        <div className="flex items-end">
          <button
            type="submit"
            disabled={submitting}
            className="w-full px-3 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Guardando…' : 'Crear tasa'}
          </button>
        </div>
      </form>

      {/* Type filter */}
      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-700">Filtrar por tipo:</label>
        <select
          value={rateTypeFilter}
          onChange={(e) => setRateTypeFilter(e.target.value)}
          className="px-2 py-1 text-sm border border-gray-300 rounded-md"
        >
          <option value="">Todos</option>
          <option value="BCV">BCV</option>
          <option value="PARALELO">PARALELO</option>
          <option value="OTRO">OTRO</option>
        </select>
      </div>

      {/* Timeline table */}
      <div className="bg-white shadow rounded-lg overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
              <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">BsF / USD</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Notas</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Creado</th>
              <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Por</th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-100">
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-500">
                  Cargando…
                </td>
              </tr>
            )}
            {!loading && rates.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-center text-sm text-gray-400">
                  Sin tasas registradas
                </td>
              </tr>
            )}
            {!loading &&
              rates.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50">
                  <td className="px-4 py-2 text-sm text-gray-900">
                    {String(r.date).slice(0, 10)}
                  </td>
                  <td className="px-4 py-2 text-sm">
                    <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                      {r.rateType}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-sm text-right font-mono text-gray-900">
                    {Number(r.rateBsPerUsd).toFixed(8)}
                  </td>
                  <td className="px-4 py-2 text-sm text-gray-700">{r.notes || '—'}</td>
                  <td className="px-4 py-2 text-sm text-gray-500">
                    {r.createdAt ? new Date(r.createdAt).toLocaleString('es-VE') : '—'}
                  </td>
                  <td className="px-4 py-2 text-xs font-mono text-gray-500">
                    {r.createdById || '—'}
                  </td>
                </tr>
              ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

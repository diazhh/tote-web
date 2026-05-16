'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { createAccount } from '@/lib/api/contabilidad';

function today() { return new Date().toISOString().slice(0, 10); }

export default function NuevaCuentaPage() {
  const router = useRouter();
  const [form, setForm] = useState({
    name: '', currency: 'BsF', openingBalance: '0', openingDate: today(), sortOrder: 0,
  });
  const [submitting, setSubmitting] = useState(false);

  async function submit(e) {
    e.preventDefault();
    if (!form.name.trim()) return toast.error('Nombre requerido');
    setSubmitting(true);
    try {
      await createAccount(form);
      toast.success('Cuenta creada');
      router.push('/admin/contabilidad/cuentas');
    } catch (err) {
      toast.error(err.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Nueva cuenta</h1>
        <Link href="/admin/contabilidad/cuentas" className="text-sm text-blue-700 hover:underline">← Volver</Link>
      </div>
      <form onSubmit={submit} className="bg-white shadow rounded-lg p-4 space-y-3">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
          <input className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
            placeholder="Ej: Caja BsF, Zelle USD, Banco Mercantil"
            value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Moneda</label>
            <select className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
              value={form.currency} onChange={(e) => setForm({ ...form, currency: e.target.value })}>
              <option value="BsF">BsF (Bolívares)</option>
              <option value="USD">USD (Dólares)</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Fecha inicio</label>
            <input type="date" className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
              value={form.openingDate} onChange={(e) => setForm({ ...form, openingDate: e.target.value })} required />
          </div>
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Saldo inicial ({form.currency})</label>
          <input type="number" step="0.01" className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
            value={form.openingBalance} onChange={(e) => setForm({ ...form, openingBalance: e.target.value })} required />
          <p className="text-xs text-gray-500 mt-1">
            Este es el saldo que tenías en esta cuenta el día indicado. Es inmutable después de crear.
          </p>
        </div>
        <div className="flex justify-end gap-2">
          <Link href="/admin/contabilidad/cuentas"
            className="min-h-11 px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
            Cancelar
          </Link>
          <button type="submit" disabled={submitting}
            className="min-h-11 px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
            {submitting ? 'Creando…' : 'Crear cuenta'}
          </button>
        </div>
      </form>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  fetchAccounts, createTransfer, uploadTransferAttachment, fetchRates,
} from '@/lib/api/contabilidad';
import AttachmentPicker from '@/components/contabilidad/AttachmentPicker';

function today() { return new Date().toISOString().slice(0, 10); }

export default function NuevaTransferenciaPage() {
  const router = useRouter();
  const [accounts, setAccounts] = useState([]);
  const [form, setForm] = useState({
    transferDate: today(), fromAccountId: '', toAccountId: '',
    amountFrom: '', description: '',
  });
  const [attachment, setAttachment] = useState(null);
  const [rate, setRate] = useState(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    fetchAccounts({ includeInactive: false }).then((r) => setAccounts(r?.data || [])).catch(() => {});
  }, []);

  const fromAcct = accounts.find((a) => a.id === form.fromAccountId);
  const toAcct = accounts.find((a) => a.id === form.toAccountId);
  const needsRate = fromAcct && toAcct && fromAcct.currency !== toAcct.currency;

  useEffect(() => {
    if (!needsRate) { setRate(null); return; }
    fetchRates({ from: form.transferDate, to: form.transferDate })
      .then((r) => setRate(r?.data?.[0] || null))
      .catch(() => setRate(null));
  }, [needsRate, form.transferDate]);

  const livePreview = (() => {
    if (!form.amountFrom || !fromAcct || !toAcct) return null;
    if (fromAcct.currency === toAcct.currency) return null;
    if (!rate) return null;
    const r = Number(rate.rateBsPerUsd);
    if (fromAcct.currency === 'USD' && toAcct.currency === 'BsF') return (Number(form.amountFrom) * r).toFixed(2);
    if (fromAcct.currency === 'BsF' && toAcct.currency === 'USD') return (Number(form.amountFrom) / r).toFixed(2);
    return null;
  })();

  async function submit(e) {
    e.preventDefault();
    if (form.fromAccountId === form.toAccountId) return toast.error('Cuentas deben ser distintas');
    if (!Number(form.amountFrom) > 0) return toast.error('Monto debe ser positivo');
    if (needsRate && !rate) return toast.error(`No hay tasa para ${form.transferDate}`);

    setSubmitting(true);
    try {
      const res = await createTransfer(form);
      const tId = res?.data?.id;
      if (attachment && tId) {
        try { await uploadTransferAttachment(tId, attachment); }
        catch { toast.error('Transferencia creada pero falló subir comprobante'); }
      }
      toast.success('Transferencia creada');
      router.push(tId ? `/admin/contabilidad/transferencias/${tId}` : '/admin/contabilidad/transferencias');
    } catch (err) {
      toast.error(err.message);
    } finally { setSubmitting(false); }
  }

  return (
    <div className="space-y-4 max-w-xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Nueva transferencia</h1>
        <Link href="/admin/contabilidad/transferencias" className="text-sm text-blue-700 hover:underline">← Volver</Link>
      </div>
      <form onSubmit={submit} className="bg-white shadow rounded-lg p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Fecha</label>
            <input type="date" required className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
              value={form.transferDate} onChange={(e) => setForm({ ...form, transferDate: e.target.value })} />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Desde</label>
            <select required className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
              value={form.fromAccountId} onChange={(e) => setForm({ ...form, fromAccountId: e.target.value })}>
              <option value="">— Selecciona —</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>)}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Hacia</label>
            <select required className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
              value={form.toAccountId} onChange={(e) => setForm({ ...form, toAccountId: e.target.value })}>
              <option value="">— Selecciona —</option>
              {accounts.filter((a) => a.id !== form.fromAccountId).map((a) => (
                <option key={a.id} value={a.id}>{a.name} ({a.currency})</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Monto ({fromAcct?.currency || ''})</label>
            <input type="number" step="0.01" required className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
              value={form.amountFrom} onChange={(e) => setForm({ ...form, amountFrom: e.target.value })} />
          </div>
        </div>
        {needsRate && !rate && (
          <p className="text-sm text-red-600">No hay tasa para {form.transferDate} — ingresa una tasa primero.</p>
        )}
        {livePreview && (
          <p className="text-sm text-blue-700 bg-blue-50 border border-blue-200 rounded-md p-2">
            Equivalente: <strong>{livePreview} {toAcct?.currency}</strong>
          </p>
        )}
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Descripción</label>
          <textarea rows={2} required className="w-full px-2 py-2 text-sm border border-gray-300 rounded-md"
            value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Comprobante (opcional)</label>
          <AttachmentPicker value={attachment} onChange={setAttachment} disabled={submitting} />
        </div>
        <div className="flex justify-end gap-2">
          <Link href="/admin/contabilidad/transferencias"
            className="min-h-11 px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200">
            Cancelar
          </Link>
          <button type="submit" disabled={submitting || (needsRate && !rate)}
            className="min-h-11 px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
            {submitting ? 'Creando…' : 'Crear transferencia'}
          </button>
        </div>
      </form>
    </div>
  );
}

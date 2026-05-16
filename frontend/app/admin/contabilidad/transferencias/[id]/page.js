'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  fetchTransfer, reverseTransfer,
  uploadTransferAttachment, downloadTransferAttachmentUrl, deleteTransferAttachment,
} from '@/lib/api/contabilidad';
import { StatusBadge, formatBsF } from '@/components/contabilidad/MoneyBadge';
import AttachmentPicker from '@/components/contabilidad/AttachmentPicker';

export default function TransferDetailPage() {
  const { id } = useParams();
  const [t, setT] = useState(null);
  const [reason, setReason] = useState('');
  const [showReverse, setShowReverse] = useState(false);
  const [reversing, setReversing] = useState(false);
  const [att, setAtt] = useState(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    try { const r = await fetchTransfer(id); setT(r.data); } catch (e) { toast.error(e.message); }
  }, [id]);
  useEffect(() => { if (id) load(); }, [id, load]);

  async function doReverse() {
    if (!reason.trim()) return toast.error('Motivo requerido');
    setReversing(true);
    try {
      await reverseTransfer(id, reason);
      toast.success('Transferencia reversada');
      setShowReverse(false);
      await load();
    } catch (e) { toast.error(e.message); } finally { setReversing(false); }
  }

  async function doUpload() {
    if (!att) return;
    setUploading(true);
    try {
      await uploadTransferAttachment(id, att);
      toast.success('Comprobante subido');
      setAtt(null);
      await load();
    } catch (e) { toast.error(e.message); } finally { setUploading(false); }
  }

  async function downloadAtt(a) {
    const token = localStorage.getItem('accessToken');
    const res = await fetch(downloadTransferAttachmentUrl(id, a.id), { headers: { Authorization: `Bearer ${token}` } });
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url; link.download = a.originalName; link.click();
    URL.revokeObjectURL(url);
  }

  async function delAtt(a) {
    if (!confirm(`¿Eliminar "${a.originalName}"?`)) return;
    try { await deleteTransferAttachment(id, a.id); toast.success('Eliminado'); await load(); }
    catch (e) { toast.error(e.message); }
  }

  if (!t) return <p className="text-sm text-gray-500">Cargando…</p>;

  const canReverse = !t.reversedById && !t.reversesId;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Transferencia</h1>
        <Link href="/admin/contabilidad/transferencias" className="text-sm text-blue-700 hover:underline">← Volver</Link>
      </div>

      <section className="bg-white shadow rounded-lg p-4 space-y-2">
        <StatusBadge entry={t} />
        <p className="text-sm text-gray-600">{String(t.transferDate).slice(0, 10)}</p>
        <div className="text-sm text-gray-900">
          <span className="font-medium">{t.fromAccount?.name}</span>
          <span className="mx-2 text-gray-400">→</span>
          <span className="font-medium">{t.toAccount?.name}</span>
        </div>
        <p className="text-2xl font-mono font-bold text-gray-900">
          {formatBsF(t.amountFrom)} {t.fromAccount?.currency}
        </p>
        {t.fromAccount?.currency !== t.toAccount?.currency && (
          <p className="text-sm text-gray-700">≈ {formatBsF(t.amountTo)} {t.toAccount?.currency}</p>
        )}
        <p className="text-sm text-gray-700 mt-2">{t.description}</p>
      </section>

      <section className="bg-white shadow rounded-lg p-4 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Comprobantes</h2>
        {(t.attachments || []).length === 0 && <p className="text-sm text-gray-400">Sin comprobantes</p>}
        <ul className="space-y-2">
          {(t.attachments || []).map((a) => (
            <li key={a.id} className="flex items-center justify-between border border-gray-200 rounded-md px-3 py-2">
              <span className="text-sm text-gray-900">{a.originalName}</span>
              <div className="flex gap-2">
                <button onClick={() => downloadAtt(a)} className="px-2 py-1 text-xs text-white bg-blue-600 rounded">Descargar</button>
                <button onClick={() => delAtt(a)} className="px-2 py-1 text-xs text-white bg-red-600 rounded">Quitar</button>
              </div>
            </li>
          ))}
        </ul>
        <AttachmentPicker value={att} onChange={setAtt} disabled={uploading} />
        {att && (
          <button onClick={doUpload} disabled={uploading}
            className="min-h-11 px-3 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
            {uploading ? 'Subiendo…' : 'Subir comprobante'}
          </button>
        )}
      </section>

      {canReverse && (
        <div className="flex justify-end">
          <button onClick={() => setShowReverse(true)}
            className="min-h-11 px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700">
            Reversar transferencia
          </button>
        </div>
      )}

      {showReverse && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-2" onClick={() => setShowReverse(false)}>
          <div className="bg-white rounded-lg p-4 max-w-md w-full" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-lg font-bold mb-2">Reversar transferencia</h2>
            <textarea rows={3} placeholder="Motivo…" value={reason} onChange={(e) => setReason(e.target.value)}
              className="w-full px-2 py-2 text-sm border border-gray-300 rounded-md" />
            <div className="flex justify-end gap-2 mt-3">
              <button onClick={() => setShowReverse(false)} className="px-3 py-2 text-sm text-gray-700 bg-gray-100 rounded-md">Cancelar</button>
              <button onClick={doReverse} disabled={!reason.trim() || reversing}
                className="px-3 py-2 text-sm text-white bg-red-600 rounded-md disabled:opacity-50">
                {reversing ? 'Reversando…' : 'Confirmar'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

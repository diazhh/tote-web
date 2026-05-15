'use client';

// /admin/contabilidad/asientos/[id] — entry detail.
//
// - Amounts: amountBsF (8-decimal), originalAmount + originalCurrency,
//   exchangeRate.rateBsPerUsd + rateType, USD historical eq =
//   amountBsF / exchangeRate.rateBsPerUsd (F-7 — NEVER reconverted).
// - Receipts: list w/ auth-gated download (P-1 — NEVER via /storage/*) +
//   single-file upload widget. uploadAttachment() in lib/api/contabilidad.js
//   constructs `new FormData()` and OMITS the Content-Type header so the
//   browser sets the multipart boundary automatically.
// - AuditLog history: rendered from entry.auditHistory (embedded by controller).
// - Reversar button: visible only when !entry.reversedById && !entry.reversesId.
//   Modal requires reversalReason; POST to /reverse and refresh.
// - Inline PATCH for description / categoryId / settlementId. IMMUTABLE fields
//   (amountBsF, entryDate, exchangeRateId, type) are display-only (FIN-LEDGER-09).

import { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
  fetchEntry,
  fetchCategories,
  updateEntry,
  reverseEntry,
  uploadAttachment,
  downloadAttachmentUrl,
  deleteAttachment,
} from '@/lib/api/contabilidad';
import { getSettlements } from '@/lib/api/commissions';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';
const ALLOWED_MIMES = [
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/jpg',
];
const MAX_BYTES = 5 * 1024 * 1024; // 5MB — advisory only; server byte-validates (F-14)

function formatBsF(value) {
  if (value === null || value === undefined) return '—';
  return Number(value).toFixed(8);
}

function formatBytes(n) {
  if (!n && n !== 0) return '—';
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(2)} MB`;
}

function ReversalModal({ onClose, onSubmit, submitting }) {
  const [reason, setReason] = useState('');
  return (
    <div
      className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-lg p-4 sm:p-6 max-w-md w-full mx-2 sm:mx-0"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-bold mb-3">Reversar asiento</h2>
        <p className="text-sm text-gray-600 mb-3">
          Crea un asiento de reversal con monto negativo. Esta acción no se puede deshacer.
        </p>
        <label className="block text-xs font-medium text-gray-700 mb-1">
          Motivo de la reversión <span className="text-red-600">*</span>
        </label>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          required
          rows={3}
          className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
          placeholder="Explica brevemente por qué…"
        />
        <div className="flex items-center justify-end gap-2 mt-4">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
          >
            Cancelar
          </button>
          <button
            onClick={() => {
              if (!reason.trim()) {
                toast.error('Motivo requerido');
                return;
              }
              onSubmit(reason.trim());
            }}
            disabled={submitting || !reason.trim()}
            className="px-4 py-1.5 text-sm text-white bg-red-600 rounded-md hover:bg-red-700 disabled:opacity-50"
          >
            {submitting ? 'Reversando…' : 'Confirmar reversión'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function EntryDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id;

  const [entry, setEntry] = useState(null);
  const [loading, setLoading] = useState(true);
  const [categories, setCategories] = useState([]);
  const [settlements, setSettlements] = useState([]);

  // Inline PATCH state
  const [editFields, setEditFields] = useState({
    description: '',
    categoryId: '',
    settlementId: null,
  });
  const [dirtyFields, setDirtyFields] = useState(new Set());
  const [savingPatch, setSavingPatch] = useState(false);

  // Reversal modal
  const [showReversal, setShowReversal] = useState(false);
  const [reversing, setReversing] = useState(false);

  // Upload state
  const fileInputRef = useRef(null);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchEntry(id);
      const data = res?.data || null;
      setEntry(data);
      if (data) {
        setEditFields({
          description: data.description || '',
          categoryId: data.categoryId || '',
          settlementId: data.settlementId || null,
        });
        setDirtyFields(new Set());
        // Load categories for this entry's type
        fetchCategories({ appliesTo: data.type })
          .then((r) => setCategories(Array.isArray(r?.data) ? r.data : []))
          .catch(() => {});
        if (data.type === 'PAYMENT') {
          Promise.all([
            getSettlements({ status: 'CONFIRMED' }),
            getSettlements({ status: 'ADJUSTED' }),
          ])
            .then(([c, a]) =>
              setSettlements([
                ...(Array.isArray(c?.data) ? c.data : []),
                ...(Array.isArray(a?.data) ? a.data : []),
              ])
            )
            .catch(() => {});
        }
      }
    } catch (err) {
      toast.error(err.message || 'Error cargando asiento');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    if (id) load();
  }, [id, load]);

  // canReverse predicate (D-06)
  const canReverse =
    entry && !entry.reversedById && !entry.reversesId;

  // F-7: USD historical eq = amountBsF / exchangeRate.rateBsPerUsd
  // NEVER reconvert with a current rate.
  const usdEq =
    entry?.exchangeRate?.rateBsPerUsd && Number(entry.exchangeRate.rateBsPerUsd) > 0
      ? (Number(entry.amountBsF) / Number(entry.exchangeRate.rateBsPerUsd)).toFixed(2)
      : null;

  const handleFieldChange = (key, value) => {
    setEditFields((prev) => ({ ...prev, [key]: value }));
    setDirtyFields((prev) => new Set(prev).add(key));
  };

  const handleSavePatch = async () => {
    if (dirtyFields.size === 0) return;
    const patch = {};
    // PATCH only dirty fields. IMMUTABLE fields are never sent.
    if (dirtyFields.has('description'))
      patch.description = editFields.description;
    if (dirtyFields.has('categoryId')) patch.categoryId = editFields.categoryId;
    if (dirtyFields.has('settlementId'))
      patch.settlementId = editFields.settlementId;
    setSavingPatch(true);
    try {
      await updateEntry(id, patch);
      toast.success('Asiento actualizado');
      await load();
    } catch (err) {
      toast.error(err.message || 'Error guardando cambios');
    } finally {
      setSavingPatch(false);
    }
  };

  const handleReverse = async (reversalReason) => {
    setReversing(true);
    try {
      const res = await reverseEntry(id, reversalReason);
      const newId = res?.data?.id;
      toast.success('Asiento reversado');
      setShowReversal(false);
      if (newId) {
        router.push(`/admin/contabilidad/asientos/${newId}`);
      } else {
        await load();
      }
    } catch (err) {
      toast.error(err.message || 'Error al reversar');
    } finally {
      setReversing(false);
    }
  };

  const handleFilePick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    // Client-side advisory checks (server byte-validates — F-14 anti-pattern note)
    if (file.size > MAX_BYTES) {
      toast.error('Archivo excede 5MB');
      e.target.value = '';
      return;
    }
    if (file.type && !ALLOWED_MIMES.includes(file.type)) {
      // Advisory only — the server is the source of truth on MIME (F-14).
      toast.error('Tipo no permitido (sólo PDF/JPG/PNG)');
      e.target.value = '';
      return;
    }
    setUploading(true);
    try {
      await uploadAttachment(id, file);
      toast.success('Recibo subido');
      e.target.value = '';
      await load();
    } catch (err) {
      // P-3: server returns 413 (LIMIT_FILE_SIZE) or 422 (MIME spoof) with
      // friendly Spanish messages — surface them.
      toast.error(err.message || 'Error subiendo recibo');
    } finally {
      setUploading(false);
    }
  };

  // Auth-gated download — fetch+blob because <a href> can't carry Authorization (P-1).
  const handleDownload = async (att) => {
    try {
      const token = localStorage.getItem('accessToken');
      const url = downloadAttachmentUrl(id, att.id);
      const res = await fetch(url, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = objUrl;
      a.download = att.originalName || 'recibo';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objUrl);
    } catch (err) {
      toast.error(err.message || 'Error descargando');
    }
  };

  const handleDeleteAttachment = async (att) => {
    if (!confirm(`¿Eliminar recibo "${att.originalName}"?`)) return;
    try {
      await deleteAttachment(id, att.id);
      toast.success('Recibo eliminado');
      await load();
    } catch (err) {
      toast.error(err.message || 'Error eliminando recibo');
    }
  };

  if (loading) {
    return <p className="text-sm text-gray-500">Cargando…</p>;
  }
  if (!entry) {
    return <p className="text-sm text-red-600">Asiento no encontrado.</p>;
  }

  return (
    <div className="space-y-4 max-w-4xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">Asiento contable</h1>
        <Link
          href="/admin/contabilidad/asientos"
          className="text-sm text-blue-700 hover:underline"
        >
          ← Volver a la lista
        </Link>
      </div>

      {/* Status badges */}
      <div className="flex flex-wrap gap-2 text-xs">
        <span className="inline-flex items-center px-2 py-0.5 rounded-full font-medium bg-blue-100 text-blue-800">
          {entry.type}
        </span>
        {entry.reversedById && (
          <Link
            href={`/admin/contabilidad/asientos/${entry.reversedById}`}
            className="inline-flex items-center px-2 py-0.5 rounded-full font-medium bg-red-100 text-red-800 hover:bg-red-200"
          >
            Reversado → ver reversal
          </Link>
        )}
        {entry.reversesId && (
          <Link
            href={`/admin/contabilidad/asientos/${entry.reversesId}`}
            className="inline-flex items-center px-2 py-0.5 rounded-full font-medium bg-yellow-100 text-yellow-800 hover:bg-yellow-200"
          >
            Reversal de #{entry.reversesId.slice(0, 6)} → ver original
          </Link>
        )}
        <span className="inline-flex items-center px-2 py-0.5 rounded-full font-medium bg-gray-100 text-gray-700">
          {String(entry.entryDate).slice(0, 10)}
        </span>
      </div>

      {/* Amounts (display-only — F-7, FIN-LEDGER-09 IMMUTABLE fields) */}
      <section className="bg-white shadow rounded-lg p-4 space-y-2">
        <h2 className="text-base font-semibold text-gray-900">Montos</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-500">Monto BsF:</span>{' '}
            <span className="font-mono">{formatBsF(entry.amountBsF)}</span>
          </div>
          {entry.originalAmount !== null && entry.originalAmount !== undefined && (
            <div>
              <span className="text-gray-500">Monto original:</span>{' '}
              <span className="font-mono">
                {Number(entry.originalAmount).toFixed(8)}{' '}
                {entry.originalCurrency || ''}
              </span>
            </div>
          )}
          {entry.exchangeRate && (
            <div>
              <span className="text-gray-500">Tasa aplicada:</span>{' '}
              <span className="font-mono">
                {Number(entry.exchangeRate.rateBsPerUsd).toFixed(8)}{' '}
                <span className="text-xs text-gray-500">
                  ({entry.exchangeRate.rateType})
                </span>
              </span>
            </div>
          )}
          {usdEq !== null && (
            <div>
              <span className="text-gray-500">
                Equivalente USD (histórico):
              </span>{' '}
              {/* F-7: amountBsF / exchangeRate.rateBsPerUsd — NEVER reconverted */}
              <span className="font-mono">{usdEq} USD</span>
            </div>
          )}
        </div>
      </section>

      {/* Editable fields (FIN-LEDGER-09 — only description / categoryId / settlementId) */}
      <section className="bg-white shadow rounded-lg p-4 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Detalles editables</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Categoría
            </label>
            <select
              value={editFields.categoryId}
              onChange={(e) => handleFieldChange('categoryId', e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
            >
              <option value="">— Selecciona —</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} {c.isActive === false ? '(inactiva)' : ''}
                </option>
              ))}
            </select>
          </div>
          {entry.type === 'PAYMENT' && (
            <div>
              <label className="block text-xs font-medium text-gray-700 mb-1">
                Liquidación
              </label>
              <select
                value={editFields.settlementId || ''}
                onChange={(e) =>
                  handleFieldChange('settlementId', e.target.value || null)
                }
                className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
              >
                <option value="">— Sin liquidación —</option>
                {settlements.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.isoYear}-W{s.isoWeek} ·{' '}
                    {s.apiSystem?.name || s.apiSystemId} · {s.status}
                  </option>
                ))}
              </select>
            </div>
          )}
          <div className="md:col-span-2">
            <label className="block text-xs font-medium text-gray-700 mb-1">
              Descripción
            </label>
            <textarea
              rows={2}
              value={editFields.description}
              onChange={(e) => handleFieldChange('description', e.target.value)}
              className="w-full px-2 py-1.5 text-sm border border-gray-300 rounded-md"
            />
          </div>
        </div>
        <div className="flex justify-end gap-2">
          <button
            onClick={handleSavePatch}
            disabled={dirtyFields.size === 0 || savingPatch}
            className="px-3 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {savingPatch ? 'Guardando…' : 'Guardar cambios'}
          </button>
        </div>
      </section>

      {/* Receipts */}
      <section className="bg-white shadow rounded-lg p-4 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Recibos</h2>
        <ul className="space-y-1">
          {(entry.attachments || []).length === 0 && (
            <li className="text-sm text-gray-400">Sin recibos</li>
          )}
          {(entry.attachments || []).map((att) => (
            <li
              key={att.id}
              className="flex items-center justify-between border border-gray-200 rounded-md px-3 py-2"
            >
              <div className="text-sm">
                <div className="font-medium text-gray-900">
                  {att.originalName}
                </div>
                <div className="text-xs text-gray-500">
                  {formatBytes(att.sizeBytes)} ·{' '}
                  {att.uploadedAt
                    ? new Date(att.uploadedAt).toLocaleString('es-VE')
                    : ''}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleDownload(att)}
                  className="px-2 py-1 text-xs text-white bg-blue-600 rounded hover:bg-blue-700"
                >
                  Descargar
                </button>
                <button
                  onClick={() => handleDeleteAttachment(att)}
                  className="px-2 py-1 text-xs text-white bg-red-600 rounded hover:bg-red-700"
                >
                  Quitar
                </button>
              </div>
            </li>
          ))}
        </ul>
        <div className="border-t border-gray-200 pt-3">
          <label className="block text-xs font-medium text-gray-700 mb-1">
            Subir recibo (PDF / JPG / PNG · máx. 5MB)
          </label>
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleFilePick}
            disabled={uploading}
            className="text-sm"
          />
          {uploading && (
            <p className="text-xs text-gray-500 mt-1">Subiendo…</p>
          )}
        </div>
      </section>

      {/* AuditLog history */}
      <section className="bg-white shadow rounded-lg p-4 space-y-2">
        <h2 className="text-base font-semibold text-gray-900">Historial (AuditLog)</h2>
        <ul className="space-y-1">
          {(entry.auditHistory || []).length === 0 && (
            <li className="text-sm text-gray-400">Sin registros</li>
          )}
          {(entry.auditHistory || []).map((row) => (
            <li
              key={row.id}
              className="text-xs border-l-2 border-gray-200 pl-3 py-1"
            >
              <div>
                <span className="font-medium text-gray-900">{row.action}</span>{' '}
                <span className="text-gray-500">por</span>{' '}
                <span className="font-mono">{row.userId}</span>{' '}
                <span className="text-gray-500">
                  · {row.createdAt
                    ? new Date(row.createdAt).toLocaleString('es-VE')
                    : ''}
                </span>
              </div>
              <div className="text-gray-500">
                IP: {row.ipAddress || '—'} · UA:{' '}
                {row.userAgent ? row.userAgent.slice(0, 60) : '—'}
              </div>
              {row.changes && (
                <details className="mt-1">
                  <summary className="cursor-pointer text-gray-600">
                    Ver diff
                  </summary>
                  <pre className="text-[10px] bg-gray-50 p-2 rounded overflow-x-auto">
                    {typeof row.changes === 'string'
                      ? row.changes
                      : JSON.stringify(row.changes, null, 2)}
                  </pre>
                </details>
              )}
            </li>
          ))}
        </ul>
      </section>

      {/* Reversar — visible only when !entry.reversedById && !entry.reversesId (D-06) */}
      {canReverse && (
        <div className="flex justify-end">
          <button
            onClick={() => setShowReversal(true)}
            className="px-4 py-2 text-sm text-white bg-red-600 rounded-md hover:bg-red-700"
          >
            Reversar asiento
          </button>
        </div>
      )}

      {showReversal && (
        <ReversalModal
          onClose={() => setShowReversal(false)}
          onSubmit={handleReverse}
          submitting={reversing}
        />
      )}
    </div>
  );
}

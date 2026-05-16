'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { ArrowLeft, FileSpreadsheet, FileText, CheckCircle2, Pencil } from 'lucide-react';
import {
  getSettlementDetail,
  confirmSettlement,
  adjustSettlement,
  downloadSettlementExcel,
  downloadSettlementPdf,
} from '@/lib/api/commissions';
import StatusBadge from '@/components/admin/comisiones/StatusBadge';

function fmtAmount(n) {
  if (n === null || n === undefined) return '—';
  const num = Number(n);
  if (!Number.isFinite(num)) return String(n);
  return num.toLocaleString('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-VE');
  } catch {
    return String(iso);
  }
}

function settlementTag(s) {
  if (!s) return '';
  return `${s.isoYear}-W${String(s.isoWeek).padStart(2, '0')}`;
}

function AdjustModal({ onClose, onSubmit, currentAmount }) {
  const [amount, setAmount] = useState(currentAmount ? String(currentAmount) : '');
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!reason.trim()) {
      setError('La razón del ajuste es obligatoria.');
      return;
    }
    setSubmitting(true);
    try {
      await onSubmit({ amount, adjustmentReason: reason });
      onClose();
    } catch (err) {
      setError(err.message || 'Error aplicando ajuste');
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
        className="bg-white rounded-lg p-6 max-w-md w-full mx-2"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-xl font-bold mb-4">Ajustar liquidación</h2>
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded p-2 mb-4">
          El monto anterior se preservará en <code>originalAmount</code> y el
          estado pasa a <strong>ADJUSTED</strong>. La razón queda registrada en
          el AuditLog.
        </p>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nuevo monto *
            </label>
            <input
              type="number"
              step="0.00000001"
              min="0"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Razón del ajuste *
            </label>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
              required
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
              className="px-4 py-2 text-white bg-orange-600 rounded-lg hover:bg-orange-700 disabled:opacity-50"
            >
              {submitting ? 'Aplicando…' : 'Aplicar ajuste'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export default function SettlementDetailPage() {
  const params = useParams();
  const id = params?.id;

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showAdjust, setShowAdjust] = useState(false);
  const [actionBusy, setActionBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const res = await getSettlementDetail(id);
      // Accept either { success, data: {...} } or the raw settlement object.
      const settlement = res?.data || res;
      setData(settlement);
    } catch (err) {
      setError(err.message || 'Error cargando liquidación');
      setData(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleConfirm = async () => {
    if (!data || actionBusy) return;
    setActionBusy(true);
    try {
      await confirmSettlement(id);
      await load();
    } catch (err) {
      setError(err.message || 'Error confirmando');
    } finally {
      setActionBusy(false);
    }
  };

  const handleAdjustSubmit = async ({ amount, adjustmentReason }) => {
    await adjustSettlement(id, { amount, adjustmentReason });
    await load();
  };

  const triggerBlobDownload = async (fetchBlob, filename) => {
    setActionBusy(true);
    try {
      const blob = await fetchBlob(id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      // Defer revoke so the browser has time to start the download.
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (err) {
      setError(err.message || 'Error descargando');
    } finally {
      setActionBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="space-y-4">
        <Link
          href="/admin/comisiones"
          className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver
        </Link>
        <div className="bg-red-50 border border-red-200 rounded p-4 text-sm text-red-700">
          {error || 'Liquidación no encontrada'}
        </div>
      </div>
    );
  }

  const tag = settlementTag(data);
  const providerName = data.apiSystem?.name || data.apiSystemId;
  const providerSlug = data.apiSystem?.slug || 'provider';
  const ledgerRows = Array.isArray(data.ledgerRows) ? data.ledgerRows : [];

  return (
    <div className="space-y-6">
      <Link
        href="/admin/comisiones"
        className="inline-flex items-center text-sm text-gray-500 hover:text-gray-700"
      >
        <ArrowLeft className="w-4 h-4 mr-1" /> Volver a Comisiones
      </Link>

      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            {providerName} — {tag}
          </h1>
          <div className="mt-2 flex items-center gap-2">
            <StatusBadge status={data.status} />
            <span className="text-sm text-gray-500">
              Líneas: {ledgerRows.length || data.ledgerRowCount || 0}
            </span>
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-sm font-semibold text-gray-900 mb-4 uppercase tracking-wide">
          Totales
        </h2>
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <p className="text-xs text-gray-500">Monto actual</p>
            <p className="text-2xl font-bold font-mono text-gray-900">
              {fmtAmount(data.amount)}
            </p>
          </div>
          {data.originalAmount !== null && data.originalAmount !== undefined && (
            <div>
              <p className="text-xs text-gray-500">Monto original</p>
              <p className="text-xl font-mono text-gray-700 line-through">
                {fmtAmount(data.originalAmount)}
              </p>
            </div>
          )}
          {data.confirmedAt && (
            <div>
              <p className="text-xs text-gray-500">Confirmada</p>
              <p className="text-sm text-gray-900">{fmtDate(data.confirmedAt)}</p>
              {data.confirmedBy?.email && (
                <p className="text-xs text-gray-500">{data.confirmedBy.email}</p>
              )}
            </div>
          )}
        </div>
        {data.adjustmentReason && (
          <div className="mt-4 border-t pt-3">
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-1">
              Razón del ajuste
            </p>
            <p className="text-sm text-gray-800">{data.adjustmentReason}</p>
          </div>
        )}
      </div>

      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-2">
          {/* D-03: Confirmar is HIDDEN when status !== 'DRAFT' */}
          {data.status === 'DRAFT' && (
            <button
              onClick={handleConfirm}
              disabled={actionBusy}
              className="flex items-center px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4 mr-2" />
              Confirmar liquidación
            </button>
          )}
          {(data.status === 'CONFIRMED' || data.status === 'ADJUSTED') && (
            <button
              onClick={() => setShowAdjust(true)}
              disabled={actionBusy}
              className="flex items-center px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
            >
              <Pencil className="w-4 h-4 mr-2" />
              Ajustar
            </button>
          )}
          <button
            onClick={() =>
              triggerBlobDownload(
                downloadSettlementExcel,
                `liquidacion-${tag}-${providerSlug}.xlsx`
              )
            }
            disabled={actionBusy}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            <FileSpreadsheet className="w-4 h-4 mr-2" />
            Descargar Excel
          </button>
          <button
            onClick={() =>
              triggerBlobDownload(
                downloadSettlementPdf,
                `liquidacion-${tag}-${providerSlug}.pdf`
              )
            }
            disabled={actionBusy}
            className="flex items-center px-4 py-2 bg-gray-700 text-white rounded-lg hover:bg-gray-800 disabled:opacity-50"
          >
            <FileText className="w-4 h-4 mr-2" />
            Descargar PDF
          </button>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <div className="px-6 py-3 border-b border-gray-200">
          <h2 className="text-sm font-semibold text-gray-900 uppercase tracking-wide">
            Líneas del ledger
          </h2>
        </div>
        {ledgerRows.length === 0 ? (
          <div className="p-6 text-center text-sm text-gray-500">
            Sin líneas asociadas a esta liquidación.
          </div>
        ) : (
          <>
            {/* Cards en móvil */}
            <div className="md:hidden p-3 space-y-2">
              {ledgerRows.map((row) => (
                <div
                  key={row.id}
                  className="bg-white border border-gray-200 rounded-lg p-4"
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <span className="text-xs font-mono text-gray-600 truncate">
                      Sorteo {row.drawId?.slice(0, 8) || '—'}
                    </span>
                    <span className="text-xs text-gray-500 whitespace-nowrap">
                      {fmtDate(row.draw?.drawnAt || row.createdAt)}
                    </span>
                  </div>
                  <p className="text-2xl font-mono font-bold text-gray-900">
                    {fmtAmount(row.amount)}
                  </p>
                  <p className="text-xs text-gray-500">Comisión</p>
                  <div className="mt-2 grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <p className="text-xs text-gray-500">Ventas</p>
                      <p className="font-mono text-gray-700">
                        {fmtAmount(row.salesBase)}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-gray-500">Utilidad</p>
                      <p className="font-mono text-gray-700">
                        {fmtAmount(row.utilityBase)}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>

            {/* Tabla en desktop */}
            <div className="hidden md:block overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Sorteo
                    </th>
                    <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Fecha
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Ventas
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Utilidad
                    </th>
                    <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                      Comisión
                    </th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-200">
                  {ledgerRows.map((row) => (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4 whitespace-nowrap text-xs font-mono text-gray-700">
                        {row.drawId?.slice(0, 8) || '—'}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-700">
                        {fmtDate(row.draw?.drawnAt || row.createdAt)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono">
                        {fmtAmount(row.salesBase)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono">
                        {fmtAmount(row.utilityBase)}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono font-semibold">
                        {fmtAmount(row.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>

      {showAdjust && (
        <AdjustModal
          onClose={() => setShowAdjust(false)}
          onSubmit={handleAdjustSubmit}
          currentAmount={data.amount}
        />
      )}
    </div>
  );
}

'use client';

import { useState, useEffect, useMemo } from 'react';
import { X, Shield, ShieldOff, Search, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import quotaApi from '@/lib/api/quota';
import gamesApi from '@/lib/api/games';

function formatCurrency(amount) {
  return new Intl.NumberFormat('es-VE', {
    style: 'currency',
    currency: 'VES',
    minimumFractionDigits: 2,
  }).format(amount || 0);
}

/**
 * Modal para bloquear (o liberar) cualquier item del juego para un sorteo dado,
 * incluso si todavía no tiene jugadas registradas. Complementa al QuotaModal
 * (que solo opera sobre items ya presentes en el monitor).
 *
 * - "Bloquear": setQuota(maxAmount=0). El backend ya rechaza cualquier intento
 *   de venta > 0 contra ese (draw, item).
 * - "Cupo personalizado": permite poner un cupo > 0 cuando se quiere capear sin
 *   bloquear del todo.
 * - "Liberar": elimina el cupo existente.
 */
export default function BlockItemModal({ draw, gameId, quotas, onClose, onSaved }) {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState(null);
  const [search, setSearch] = useState('');
  const [customAmount, setCustomAmount] = useState({}); // gameItemId -> string

  // Mapa rápido para saber el estado de cupo actual por gameItemId.
  const quotaByItem = useMemo(
    () => new Map(quotas.map((q) => [q.gameItemId, q])),
    [quotas]
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const resp = await gamesApi.getItems(gameId);
        const list = resp?.data?.items ?? resp?.data ?? [];
        if (!cancelled) setItems(list);
      } catch (err) {
        toast.error('Error cargando items del juego');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [gameId]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return items;
    return items.filter((it) =>
      String(it.number).toLowerCase().includes(term) ||
      String(it.name || '').toLowerCase().includes(term)
    );
  }, [items, search]);

  const applyAndRefresh = async (gameItemId, fn) => {
    setSavingId(gameItemId);
    try {
      await fn();
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || err.message || 'Error');
    } finally {
      setSavingId(null);
    }
  };

  const handleBlock = (item) =>
    applyAndRefresh(item.id, async () => {
      await quotaApi.setQuota(draw.id, item.id, 0);
      toast.success(`Item ${item.number} bloqueado`);
    });

  const handleCustom = (item) => {
    const raw = customAmount[item.id];
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0) {
      toast.error('Monto debe ser >= 0');
      return;
    }
    return applyAndRefresh(item.id, async () => {
      await quotaApi.setQuota(draw.id, item.id, n);
      toast.success(`Cupo guardado para ${item.number}: ${formatCurrency(n)}`);
      setCustomAmount((prev) => ({ ...prev, [item.id]: '' }));
    });
  };

  const handleRelease = (item) =>
    applyAndRefresh(item.id, async () => {
      await quotaApi.removeQuota(draw.id, item.id);
      toast.success(`Cupo de ${item.number} eliminado`);
    });

  const renderStatus = (q) => {
    if (!q) return null;
    if (q.maxAmount === 0) {
      return <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Bloqueado</span>;
    }
    if (q.maxAmount > 0) {
      return (
        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
          Cupo {formatCurrency(q.maxAmount)}
        </span>
      );
    }
    return null;
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h3 className="text-lg font-semibold flex items-center gap-2">
            <Shield className="w-5 h-5 text-red-600" />
            Bloquear número — {draw.game} {(draw.drawTime || '').slice(0, 5)}
          </h3>
          <button onClick={onClose} className="text-gray-500 hover:text-gray-700">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-4 border-b">
          <div className="relative">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar número o nombre..."
              autoFocus
              className="w-full pl-9 pr-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
            />
          </div>
          <p className="text-xs text-gray-500 mt-2">
            "Bloquear" = cupo 0 (rechaza cualquier venta nueva). "Cupo" = límite parcial. "Liberar" = elimina el cupo.
          </p>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex items-center justify-center py-12 text-gray-500">
              <Loader2 className="w-5 h-5 animate-spin mr-2" /> Cargando items...
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-center py-8 text-gray-400 text-sm">Sin resultados</p>
          ) : (
            <ul className="divide-y divide-gray-100">
              {filtered.map((item) => {
                const q = quotaByItem.get(item.id);
                const busy = savingId === item.id;
                return (
                  <li key={item.id} className="px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-3">
                    <div className="flex items-center gap-3 sm:w-56 shrink-0">
                      <div className="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center font-bold text-gray-700">
                        {item.number}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 text-sm">{item.name || `Item ${item.number}`}</p>
                        <p className="text-xs text-gray-500">
                          Mult x{Number(item.multiplier ?? 0)}
                        </p>
                      </div>
                    </div>
                    <div className="flex-1 flex items-center gap-2 text-sm">
                      {renderStatus(q)}
                      {q?.soldAmount > 0 && (
                        <span className="text-xs text-gray-500">vendido {formatCurrency(q.soldAmount)}</span>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 justify-end">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="cupo"
                        value={customAmount[item.id] ?? ''}
                        onChange={(e) => setCustomAmount((prev) => ({ ...prev, [item.id]: e.target.value }))}
                        className="w-24 px-2 py-1 text-xs border border-gray-300 rounded"
                        disabled={busy}
                      />
                      <button
                        onClick={() => handleCustom(item)}
                        disabled={busy || !(customAmount[item.id] ?? '').toString().trim()}
                        className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-40"
                      >
                        Cupo
                      </button>
                      <button
                        onClick={() => handleBlock(item)}
                        disabled={busy || q?.maxAmount === 0}
                        className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-40 flex items-center gap-1"
                      >
                        <Shield className="w-3 h-3" />
                        Bloquear
                      </button>
                      {q && (
                        <button
                          onClick={() => handleRelease(item)}
                          disabled={busy}
                          className="px-3 py-1 text-xs bg-gray-100 text-gray-700 border border-gray-300 rounded hover:bg-gray-200 disabled:opacity-40 flex items-center gap-1"
                        >
                          <ShieldOff className="w-3 h-3" />
                          Liberar
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="p-4 border-t bg-gray-50 flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 bg-gray-200 text-gray-800 rounded-lg hover:bg-gray-300"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

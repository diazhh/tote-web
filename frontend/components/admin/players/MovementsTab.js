'use client';
import { useState, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { adminPlayersApi } from '@/lib/api/admin-players';

const TYPE_LABELS = {
  DEPOSIT: { label: 'Depósito', cls: 'bg-green-100 text-green-800' },
  WITHDRAWAL: { label: 'Retiro', cls: 'bg-red-100 text-red-800' },
  BET: { label: 'Jugada', cls: 'bg-blue-100 text-blue-800' },
  PRIZE: { label: 'Premio', cls: 'bg-yellow-100 text-yellow-800' },
  REFUND: { label: 'Reembolso', cls: 'bg-purple-100 text-purple-800' },
  ADJUSTMENT: { label: 'Ajuste', cls: 'bg-gray-100 text-gray-800' },
  BONUS: { label: 'Bonificación', cls: 'bg-pink-100 text-pink-800' }
};

export default function MovementsTab({ playerId }) {
  const [movements, setMovements] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [pagination, setPagination] = useState({ offset: 0, limit: 30 });

  const loadMovements = useCallback(async () => {
    try {
      setLoading(true);
      const params = { limit: pagination.limit, offset: pagination.offset };
      if (typeFilter) params.type = typeFilter;
      if (dateFrom) params.dateFrom = dateFrom;
      if (dateTo) params.dateTo = dateTo;
      const res = await adminPlayersApi.getPlayerMovements(playerId, params);
      setMovements(res.data.movements || []);
      setTotal(res.data.total || 0);
    } catch { /* ignore */ } finally { setLoading(false); }
  }, [playerId, pagination, typeFilter, dateFrom, dateTo]);

  useEffect(() => { loadMovements(); }, [loadMovements]);

  const fmt = (a) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES', minimumFractionDigits: 2 }).format(a);
  const fmtDate = (d) => new Date(d).toLocaleString('es-VE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const getEnrichedDescription = (m) => {
    let desc = m.description || '-';
    if (m.ticket) {
      desc += ` - ${m.ticket.draw?.gameName || ''} ${m.ticket.ticketNumber || ''}`;
    }
    if (m.tripleta) {
      desc += ` - ${m.tripleta.gameName || ''} [${m.tripleta.items?.map(i => i.number).join(', ') || ''}]`;
    }
    if (m.metadata?.bonusUsed) {
      desc += ` (Bono: ${fmt(m.metadata.bonusUsed)})`;
    }
    return desc;
  };

  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <select value={typeFilter} onChange={(e) => { setTypeFilter(e.target.value); setPagination(p => ({ ...p, offset: 0 })); }}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-2 focus:ring-blue-500">
          <option value="">Todos los tipos</option>
          {Object.entries(TYPE_LABELS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
        </select>
        <input type="date" value={dateFrom} onChange={(e) => { setDateFrom(e.target.value); setPagination(p => ({ ...p, offset: 0 })); }}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Desde" />
        <input type="date" value={dateTo} onChange={(e) => { setDateTo(e.target.value); setPagination(p => ({ ...p, offset: 0 })); }}
          className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm" placeholder="Hasta" />
        {(typeFilter || dateFrom || dateTo) && (
          <button onClick={() => { setTypeFilter(''); setDateFrom(''); setDateTo(''); setPagination(p => ({ ...p, offset: 0 })); }}
            className="text-sm text-blue-600 hover:text-blue-800">Limpiar filtros</button>
        )}
      </div>

      {loading ? (
        <div className="text-center py-8 text-gray-500">Cargando movimientos...</div>
      ) : movements.length === 0 ? (
        <div className="text-center py-8 text-gray-500">No hay movimientos</div>
      ) : (
        <>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Fecha</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Tipo</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Descripción</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Monto</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Antes</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Después</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {movements.map(m => {
                  const style = TYPE_LABELS[m.type] || TYPE_LABELS.ADJUSTMENT;
                  const isPositive = parseFloat(m.amount) > 0;
                  return (
                    <tr key={m.id} className="hover:bg-gray-50">
                      <td className="px-4 py-2 text-gray-600 whitespace-nowrap">{fmtDate(m.createdAt)}</td>
                      <td className="px-4 py-2 whitespace-nowrap">
                        <span className={`px-2 py-0.5 text-xs font-medium rounded-full ${style.cls}`}>{style.label}</span>
                      </td>
                      <td className="px-4 py-2 text-gray-900 max-w-xs truncate">{getEnrichedDescription(m)}</td>
                      <td className={`px-4 py-2 text-right font-bold whitespace-nowrap ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
                        {isPositive ? '+' : ''}{fmt(m.amount)}
                      </td>
                      <td className="px-4 py-2 text-right text-gray-600 whitespace-nowrap">{fmt(m.balanceBefore)}</td>
                      <td className="px-4 py-2 text-right font-medium text-gray-900 whitespace-nowrap">{fmt(m.balanceAfter)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Pagination */}
          {total > pagination.limit && (
            <div className="flex items-center justify-between pt-2">
              <p className="text-sm text-gray-600">
                {pagination.offset + 1}-{Math.min(pagination.offset + pagination.limit, total)} de {total}
              </p>
              <div className="flex gap-2">
                <button onClick={() => setPagination(p => ({ ...p, offset: Math.max(0, p.offset - p.limit) }))}
                  disabled={pagination.offset === 0}
                  className="flex items-center gap-1 px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-50">
                  <ChevronLeft className="w-4 h-4" /> Anterior
                </button>
                <button onClick={() => setPagination(p => ({ ...p, offset: p.offset + p.limit }))}
                  disabled={pagination.offset + pagination.limit >= total}
                  className="flex items-center gap-1 px-3 py-1 border rounded text-sm disabled:opacity-50 hover:bg-gray-50">
                  Siguiente <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

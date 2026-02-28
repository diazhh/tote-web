'use client';
import { useState, useEffect } from 'react';
import { Clock, CheckCircle, XCircle, AlertCircle, X } from 'lucide-react';
import { adminPlayersApi } from '@/lib/api/admin-players';
import TripletaDetailModal from '@/components/shared/TripletaDetailModal';

export default function BetsTab({ playerId }) {
  const [tickets, setTickets] = useState([]);
  const [tripletas, setTripletas] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all'); // all, tickets, tripletas
  const [ticketModal, setTicketModal] = useState({ open: false, data: null });
  const [tripletaModal, setTripletaModal] = useState({ open: false, data: null });

  useEffect(() => { loadData(); }, [playerId]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [ticketsRes, tripletasRes] = await Promise.all([
        adminPlayersApi.getPlayerTickets(playerId, { limit: 100 }),
        adminPlayersApi.getPlayerTripletas(playerId, { limit: 100 })
      ]);
      setTickets(ticketsRes.data.tickets || []);
      setTripletas(tripletasRes.data.tripletas || []);
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  const fmt = (a) => new Intl.NumberFormat('es-VE', { style: 'currency', currency: 'VES', minimumFractionDigits: 2 }).format(a);
  const fmtDate = (d) => new Date(d).toLocaleString('es-VE', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  const badge = (status) => {
    const m = {
      ACTIVE: 'bg-blue-100 text-blue-800',
      WON: 'bg-green-100 text-green-800',
      LOST: 'bg-red-100 text-red-800',
      EXPIRED: 'bg-gray-100 text-gray-800',
      CANCELLED: 'bg-yellow-100 text-yellow-800'
    };
    const icons = { ACTIVE: Clock, WON: CheckCircle, LOST: XCircle, EXPIRED: AlertCircle, CANCELLED: XCircle };
    const Icon = icons[status] || AlertCircle;
    return <span className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs font-medium rounded-full ${m[status] || 'bg-gray-100 text-gray-800'}`}><Icon className="w-3 h-3" />{status}</span>;
  };

  const formatDrawDate = (draw) => {
    if (!draw) return '-';
    const d = new Date(draw.drawDate);
    return `${d.toLocaleDateString('es-VE')} ${draw.drawTime || ''}`;
  };

  if (loading) return <div className="text-center py-8 text-gray-500">Cargando jugadas...</div>;

  return (
    <div className="space-y-4">
      {/* Filter toggle */}
      <div className="flex gap-2">
        {['all', 'tickets', 'tripletas'].map(f => (
          <button key={f} onClick={() => setFilter(f)}
            className={`px-4 py-1.5 rounded-lg text-sm font-medium ${filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}>
            {f === 'all' ? `Todas (${tickets.length + tripletas.length})` : f === 'tickets' ? `Tickets (${tickets.length})` : `Tripletas (${tripletas.length})`}
          </button>
        ))}
      </div>

      {/* Tickets */}
      {(filter === 'all' || filter === 'tickets') && tickets.length > 0 && (
        <div>
          {filter === 'all' && <h3 className="text-sm font-semibold text-gray-700 mb-2">Tickets</h3>}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Juego</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Sorteo</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Monto</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Premio</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Ver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {tickets.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{t.draw?.game?.name}</td>
                    <td className="px-4 py-2 text-gray-600">{formatDrawDate(t.draw)}</td>
                    <td className="px-4 py-2 text-right font-medium">{fmt(t.totalAmount)}</td>
                    <td className="px-4 py-2 text-right font-medium text-green-600">
                      {parseFloat(t.totalPrize || 0) > 0 ? fmt(t.totalPrize) : '-'}
                    </td>
                    <td className="px-4 py-2 text-center">{badge(t.status)}</td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => setTicketModal({ open: true, data: t })} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Detalle</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Tripletas */}
      {(filter === 'all' || filter === 'tripletas') && tripletas.length > 0 && (
        <div>
          {filter === 'all' && <h3 className="text-sm font-semibold text-gray-700 mb-2 mt-4">Tripletas</h3>}
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 text-sm">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Juego</th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-500 uppercase">Números</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Monto</th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-500 uppercase">Premio</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Estado</th>
                  <th className="px-4 py-2 text-center text-xs font-medium text-gray-500 uppercase">Ver</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {tripletas.map(t => (
                  <tr key={t.id} className="hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{t.game?.name}</td>
                    <td className="px-4 py-2">
                      {t.items ? t.items.map(i => i.number).join(', ') : `${t.item1?.number}, ${t.item2?.number}, ${t.item3?.number}`}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">{fmt(t.amount)}</td>
                    <td className="px-4 py-2 text-right font-medium text-green-600">
                      {parseFloat(t.prize || 0) > 0 ? fmt(t.prize) : '-'}
                    </td>
                    <td className="px-4 py-2 text-center">{badge(t.status)}</td>
                    <td className="px-4 py-2 text-center">
                      <button onClick={() => setTripletaModal({ open: true, data: t })} className="text-blue-600 hover:text-blue-800 text-xs font-medium">Detalle</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {tickets.length === 0 && tripletas.length === 0 && (
        <div className="text-center py-8 text-gray-500">No hay jugadas registradas</div>
      )}

      {/* Ticket Detail Modal */}
      {ticketModal.open && ticketModal.data && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] overflow-y-auto">
            <div className="flex items-center justify-between p-4 border-b sticky top-0 bg-white">
              <h3 className="text-lg font-semibold">Detalle del Ticket</h3>
              <button onClick={() => setTicketModal({ open: false, data: null })} className="text-gray-500 hover:text-gray-700"><X className="w-5 h-5" /></button>
            </div>
            <div className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div><label className="text-xs text-gray-500 uppercase">Juego</label><p className="font-medium">{ticketModal.data.draw?.game?.name}</p></div>
                <div><label className="text-xs text-gray-500 uppercase">Sorteo</label><p className="font-medium">{formatDrawDate(ticketModal.data.draw)}</p></div>
                <div><label className="text-xs text-gray-500 uppercase">Monto</label><p className="text-lg font-bold text-green-600">{fmt(ticketModal.data.totalAmount)}</p></div>
                <div><label className="text-xs text-gray-500 uppercase">Estado</label><div className="mt-1">{badge(ticketModal.data.status)}</div></div>
              </div>
              {ticketModal.data.details?.length > 0 && (
                <div className="border-t pt-4">
                  <label className="text-xs text-gray-500 uppercase mb-2 block">Jugadas ({ticketModal.data.details.length})</label>
                  <div className="space-y-2">
                    {ticketModal.data.details.map((d, i) => (
                      <div key={i} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                        <div className="flex items-center gap-3">
                          <div className="bg-blue-600 text-white w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm">{d.gameItem?.number || d.number}</div>
                          <span className="text-sm text-gray-600">{d.gameItem?.name}</span>
                        </div>
                        <div className="text-right">
                          <p className="font-bold">{fmt(d.amount)}</p>
                          {d.status === 'WON' && <p className="text-xs text-green-600">Premio: {fmt(d.prize)}</p>}
                          {badge(d.status)}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Tripleta Detail Modal */}
      {tripletaModal.open && tripletaModal.data && (
        <TripletaDetailModal tripleta={tripletaModal.data} onClose={() => setTripletaModal({ open: false, data: null })} />
      )}
    </div>
  );
}

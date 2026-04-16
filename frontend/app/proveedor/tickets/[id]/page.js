'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { portalFetch } from '@/lib/portal-api';

const TICKET_STATUS_BADGE = {
  ACTIVE: 'bg-blue-100 text-blue-700',
  WON: 'bg-green-100 text-green-700',
  LOST: 'bg-gray-200 text-gray-700',
  CANCELLED: 'bg-red-100 text-red-700',
};

const TICKET_STATUS_LABEL = {
  ACTIVE: 'Activo',
  WON: 'Ganador',
  LOST: 'Perdedor',
  CANCELLED: 'Cancelado',
};

const DETAIL_STATUS_LABEL = {
  ACTIVE: 'Activo',
  WON: 'Ganador',
  LOST: 'Perdedor',
  CANCELLED: 'Cancelado',
};

function formatCurrency(v) {
  if (v === null || v === undefined) return '-';
  return Number(v).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function isDrawComplete(status) {
  return status === 'DRAWN' || status === 'PUBLISHED';
}

export default function TicketDetailPage() {
  const { id } = useParams();
  const [ticket, setTicket] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    portalFetch(`/api/portal/tickets/${id}`)
      .then(setTicket)
      .catch(e => setError(e.status === 404 ? 'No encontrado' : e.message));
  }, [id]);

  if (error) return <div className="text-red-600">{error}</div>;
  if (!ticket) return <div className="text-gray-500">Cargando...</div>;

  const drawDone = isDrawComplete(ticket.draw?.status);
  const winnerNumber = ticket.draw?.winnerItem?.number ?? null;
  const totalPrize = Number(ticket.totalPrize ?? 0);
  const hasWinnings = totalPrize > 0;

  return (
    <div className="max-w-4xl">
      <Link className="text-sm text-blue-600 hover:underline" href="/proveedor/tickets">← Volver a tickets</Link>

      <div className="flex items-center gap-3 mt-2 mb-4">
        <h1 className="text-2xl font-bold text-gray-900">
          Ticket {ticket.externalTicketId || ticket.id.slice(0, 8)}
        </h1>
        <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${TICKET_STATUS_BADGE[ticket.status] || 'bg-gray-100'}`}>
          {TICKET_STATUS_LABEL[ticket.status] || ticket.status}
        </span>
      </div>

      {/* Resumen */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 shadow-sm">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider">Ticket ID</div>
            <div className="font-mono text-lg font-bold text-gray-900 mt-0.5">
              {ticket.externalTicketId || ticket.id.slice(0, 8)}
            </div>
            {ticket.ticketNumber != null && (
              <div className="text-xs text-gray-500 mt-0.5">#{ticket.ticketNumber}</div>
            )}
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider">Monto total</div>
            <div className="text-lg font-bold text-green-600 mt-0.5">
              {formatCurrency(ticket.totalAmount)}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider">Premio</div>
            <div className={`text-lg font-bold mt-0.5 ${hasWinnings ? 'text-green-600' : 'text-gray-400'}`}>
              {hasWinnings ? formatCurrency(totalPrize) : '—'}
            </div>
          </div>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider">Jugadas</div>
            <div className="text-lg font-bold text-gray-900 mt-0.5">
              {ticket.details?.length ?? 0}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-gray-100">
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider">Registrado</div>
            <div className="text-sm text-gray-900 mt-0.5">
              {new Date(ticket.createdAt).toLocaleString('es-VE')}
            </div>
          </div>
          {ticket.providerData?.timestamp && (
            <div>
              <div className="text-xs text-gray-500 uppercase tracking-wider">Timestamp proveedor</div>
              <div className="text-sm text-gray-900 mt-0.5 font-mono">
                {ticket.providerData.timestamp}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Sorteo */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-4 shadow-sm">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-2">Sorteo</div>
        {ticket.draw ? (
          <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
            <Link className="text-blue-600 hover:underline font-semibold text-lg"
              href={`/proveedor/sorteos/${ticket.draw.id}`}>
              {ticket.draw.game?.name}
            </Link>
            <span className="text-gray-600 text-sm">
              {new Date(ticket.draw.drawDate).toLocaleDateString('es-VE')} {ticket.draw.drawTime?.slice(0, 5)}
            </span>
            <span className="text-gray-600 text-sm">— {ticket.draw.status}</span>
            {drawDone && winnerNumber != null && (
              <span className="inline-flex items-center gap-1.5 text-sm">
                <span className="text-gray-500">Ganador:</span>
                <span className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-yellow-400 text-gray-900 font-bold shadow-sm">
                  {winnerNumber}
                </span>
                {ticket.draw.winnerItem?.name && (
                  <span className="font-medium text-gray-700">{ticket.draw.winnerItem.name}</span>
                )}
              </span>
            )}
          </div>
        ) : '-'}
      </div>

      {/* Jugadas */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 shadow-sm">
        <div className="text-xs text-gray-500 uppercase tracking-wider mb-3">
          Jugadas ({ticket.details?.length ?? 0})
        </div>
        <div className="space-y-2">
          {ticket.details?.map(d => {
            const status = d.status || 'ACTIVE';
            const isWon = status === 'WON';
            const isLost = status === 'LOST';
            const isCancelled = status === 'CANCELLED';
            const prize = Number(d.prize ?? 0);
            return (
              <div key={d.id}
                className={`flex items-center justify-between p-3 rounded-lg border ${
                  isWon ? 'bg-green-50 border-green-300'
                    : isLost ? 'bg-gray-50 border-gray-200'
                    : isCancelled ? 'bg-red-50 border-red-200'
                    : 'bg-white border-gray-200'
                }`}>
                <div className="flex items-center gap-3">
                  <div className={`w-11 h-11 rounded-full flex items-center justify-center font-bold text-lg shadow-sm ${
                    isWon ? 'bg-green-600 text-white'
                      : isCancelled ? 'bg-red-500 text-white'
                      : 'bg-blue-600 text-white'
                  }`}>
                    {d.gameItem?.number}
                  </div>
                  <div>
                    <div className="font-semibold text-gray-900">{d.gameItem?.name ?? '—'}</div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      Multiplicador {d.multiplier ?? 1}x
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <div className="font-bold text-gray-900">{formatCurrency(d.amount)}</div>
                  <div className="mt-1">
                    <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                      isWon ? 'bg-green-100 text-green-800'
                        : isLost ? 'bg-gray-100 text-gray-700'
                        : isCancelled ? 'bg-red-100 text-red-700'
                        : 'bg-blue-100 text-blue-800'
                    }`}>
                      {DETAIL_STATUS_LABEL[status] || status}
                    </span>
                  </div>
                  {isWon && prize > 0 && (
                    <div className="text-sm font-semibold text-green-600 mt-1">
                      Premio {formatCurrency(prize)}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
          {(!ticket.details || ticket.details.length === 0) && (
            <div className="text-center text-gray-400 py-4">Sin jugadas</div>
          )}
        </div>
      </div>
    </div>
  );
}

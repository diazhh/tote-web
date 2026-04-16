'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { portalFetch } from '@/lib/portal-api';

const STATUS_BADGE = {
  ACTIVE: 'bg-blue-100 text-blue-700',
  WON: 'bg-green-100 text-green-700',
  LOST: 'bg-gray-100 text-gray-600',
  CANCELLED: 'bg-red-100 text-red-700',
};

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

  return (
    <div>
      <Link className="text-sm text-blue-600 hover:underline" href="/proveedor/tickets">← Volver a tickets</Link>
      <h1 className="text-2xl font-bold mt-2 mb-4 text-gray-900">
        Ticket {ticket.externalTicketId || ticket.id.slice(0, 8)}
      </h1>

      <div className="bg-white border border-gray-200 rounded p-4 mb-4 grid grid-cols-2 gap-3 text-sm">
        <div><span className="text-gray-500">Fecha:</span> {new Date(ticket.createdAt).toLocaleString('es-VE')}</div>
        <div>
          <span className="text-gray-500">Estado:</span>{' '}
          <span className={`px-2 py-0.5 rounded text-xs font-medium ${STATUS_BADGE[ticket.status] || 'bg-gray-100'}`}>
            {ticket.status}
          </span>
        </div>
        <div><span className="text-gray-500">Monto total:</span> {Number(ticket.totalAmount).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</div>
        <div><span className="text-gray-500">Jugadas:</span> {ticket.details?.length ?? 0}</div>
        <div className="col-span-2">
          <span className="text-gray-500">Sorteo:</span>{' '}
          {ticket.draw ? (
            <>
              <Link className="text-blue-600 hover:underline" href={`/proveedor/sorteos/${ticket.draw.id}`}>
                {ticket.draw.game?.name} — {new Date(ticket.draw.drawDate).toLocaleDateString('es-VE')} {ticket.draw.drawTime?.slice(0,5)}
              </Link>
              {drawDone && winnerNumber && (
                <span className="ml-2 text-xs text-gray-600">(ganador: <strong>{winnerNumber}</strong>)</span>
              )}
            </>
          ) : '-'}
        </div>
      </div>

      <h2 className="font-semibold mb-2 text-gray-800">Jugadas</h2>
      <div className="bg-white border border-gray-200 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-gray-700">Número</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-700">Nombre</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-700">Monto</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-700">Mult</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-700">Resultado</th>
            </tr>
          </thead>
          <tbody>
            {ticket.details?.map(d => {
              const isWinner = drawDone && winnerNumber !== null && d.gameItem?.number === winnerNumber;
              return (
                <tr key={d.id} className="border-t">
                  <td className="px-3 py-2 font-mono">{d.gameItem?.number}</td>
                  <td className="px-3 py-2 text-gray-700">{d.gameItem?.name ?? '-'}</td>
                  <td className="px-3 py-2">{Number(d.amount).toLocaleString('es-VE', { minimumFractionDigits: 2 })}</td>
                  <td className="px-3 py-2">{d.multiplier ?? 1}</td>
                  <td className="px-3 py-2">
                    {!drawDone ? <span className="text-gray-400">Pendiente</span>
                      : isWinner ? <span className="text-green-700 font-semibold">GANADOR</span>
                      : <span className="text-gray-500">—</span>}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

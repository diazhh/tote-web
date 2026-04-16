'use client';
import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { portalFetch } from '@/lib/portal-api';

function isDrawComplete(status) {
  return status === 'DRAWN' || status === 'PUBLISHED';
}

export default function SorteoDetailPage() {
  const { id } = useParams();
  const [payload, setPayload] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    portalFetch(`/api/portal/draws/${id}`)
      .then(setPayload)
      .catch(e => setError(e.status === 404 ? 'No encontrado' : e.message));
  }, [id]);

  if (error) return <div className="text-red-600">{error}</div>;
  if (!payload) return <div className="text-gray-500">Cargando...</div>;

  const { draw, tickets } = payload;
  const drawDone = isDrawComplete(draw.status);
  const winnerNumber = draw.winnerItem?.number ?? null;

  return (
    <div>
      <Link className="text-sm text-blue-600 hover:underline" href="/proveedor/sorteos">← Volver a sorteos</Link>
      <h1 className="text-2xl font-bold mt-2 mb-4 text-gray-900">{draw.game?.name}</h1>

      <div className="bg-white border border-gray-200 rounded p-4 mb-4 grid grid-cols-2 gap-3 text-sm">
        <div><span className="text-gray-500">Fecha:</span> {new Date(draw.drawDate).toLocaleDateString('es-VE')}</div>
        <div><span className="text-gray-500">Hora:</span> <span className="font-mono">{draw.drawTime?.slice(0,5)}</span></div>
        <div><span className="text-gray-500">Estado:</span> {draw.status}</div>
        <div>
          <span className="text-gray-500">Número ganador:</span>{' '}
          {drawDone
            ? <span className="font-bold text-lg text-gray-900">{winnerNumber ?? '-'}</span>
            : <span className="text-gray-400">Pendiente</span>}
        </div>
      </div>

      <h2 className="font-semibold mb-2 text-gray-800">Tus tickets en este sorteo ({tickets.length})</h2>
      <div className="bg-white border border-gray-200 rounded overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="text-left px-3 py-2 font-semibold text-gray-700">Fecha</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-700">ID Externo</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-700">Jugadas</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-700">Monto</th>
              <th className="text-left px-3 py-2 font-semibold text-gray-700">Ganador</th>
            </tr>
          </thead>
          <tbody>
            {tickets.map(t => {
              const hasWinner = drawDone && winnerNumber !== null &&
                t.details.some(d => d.gameItem?.number === winnerNumber);
              return (
                <tr key={t.id} className="border-t">
                  <td className="px-3 py-2 text-gray-700">{new Date(t.createdAt).toLocaleString('es-VE')}</td>
                  <td className="px-3 py-2">
                    <Link className="text-blue-600 hover:underline font-mono text-xs"
                      href={`/proveedor/tickets/${t.id}`}>
                      {t.externalTicketId || t.id.slice(0, 8)}
                    </Link>
                  </td>
                  <td className="px-3 py-2 font-mono text-xs text-gray-600">
                    {t.details.map(d => d.gameItem?.number).join(', ')}
                  </td>
                  <td className="px-3 py-2">
                    {Number(t.totalAmount).toLocaleString('es-VE', { minimumFractionDigits: 2 })}
                  </td>
                  <td className="px-3 py-2">
                    {!drawDone ? <span className="text-gray-400">—</span>
                      : hasWinner ? <span className="text-green-700 font-semibold">SÍ</span>
                      : <span className="text-gray-500">No</span>}
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

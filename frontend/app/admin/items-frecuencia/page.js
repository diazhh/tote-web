'use client';

/**
 * Frecuencia de items: para un juego, lista todos sus números/items con la
 * fecha en que cada uno salió por última vez y cuántos días han pasado.
 * Sin paginación. Filtro único por juego.
 */
import { useState, useEffect, useCallback } from 'react';
import { Calendar, Gamepad2, RefreshCw, History } from 'lucide-react';
import { toast } from 'sonner';
import monitorApi from '@/lib/api/monitor';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  // d viene como UTC midnight de la fecha Venezuela; mostramos solo Y-M-D leyendo UTC
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${day}/${m}/${y}`;
}

export default function ItemsFrecuenciaPage() {
  const [games, setGames] = useState([]);
  const [gameId, setGameId] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);

  // Cargar juegos para el dropdown
  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
    fetch(`${API_URL}/games`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => r.json())
      .then((data) => {
        const arr = Array.isArray(data?.data) ? data.data : Array.isArray(data) ? data : [];
        setGames(arr);
        if (arr.length > 0 && !gameId) setGameId(arr[0].id);
      })
      .catch(() => toast.error('Error cargando juegos'));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fetchData = useCallback(async () => {
    if (!gameId) return;
    setLoading(true);
    try {
      const result = await monitorApi.getItemsLastDrawn(gameId);
      if (result?.success) {
        setItems(result.data || []);
      } else {
        toast.error(result?.error || 'Error obteniendo datos');
      }
    } catch (err) {
      toast.error('Error cargando frecuencia');
    } finally {
      setLoading(false);
    }
  }, [gameId]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const selectedGame = games.find((g) => g.id === gameId);
  const neverCount = items.filter((i) => !i.lastDrawnAt).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <History className="w-7 h-7 text-blue-600" />
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Frecuencia de items</h1>
            <p className="text-sm text-gray-500">Última salida y días transcurridos por número</p>
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={loading || !gameId}
          className="inline-flex items-center gap-2 px-3 py-2 rounded-md border bg-white text-sm hover:bg-gray-50 disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refrescar
        </button>
      </div>

      {/* Filtro */}
      <div className="bg-white rounded-lg border p-4 flex items-center gap-4">
        <Gamepad2 className="w-5 h-5 text-gray-400" />
        <label className="text-sm font-medium text-gray-700">Juego:</label>
        <select
          value={gameId}
          onChange={(e) => setGameId(e.target.value)}
          className="flex-1 max-w-xs border-gray-300 rounded-md text-sm py-2 px-3 border focus:ring-blue-500 focus:border-blue-500"
        >
          {games.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
        {selectedGame && (
          <span className="text-sm text-gray-500">
            {items.length} items
            {neverCount > 0 ? ` · ${neverCount} nunca han salido` : ''}
          </span>
        )}
      </div>

      {/* Tabla */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-gray-500">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
            <p className="mt-3 text-sm">Cargando...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="p-12 text-center text-gray-500">No hay items para este juego.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    Número
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    Nombre
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">
                    Última salida
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">
                    Días desde
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200 bg-white">
                {items.map((item) => {
                  const never = !item.lastDrawnAt;
                  return (
                    <tr key={item.id} className={never ? 'bg-yellow-50' : ''}>
                      <td className="px-4 py-2 text-sm font-mono text-gray-900 font-semibold">
                        {item.number}
                      </td>
                      <td className="px-4 py-2 text-sm text-gray-700">{item.name}</td>
                      <td className="px-4 py-2 text-sm text-gray-700">
                        {never ? (
                          <span className="text-yellow-700 italic">Nunca</span>
                        ) : (
                          <span className="inline-flex items-center gap-1.5">
                            <Calendar className="w-3.5 h-3.5 text-gray-400" />
                            {formatDate(item.lastDrawnAt)}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-2 text-sm text-right">
                        {never ? (
                          <span className="text-yellow-700 italic">—</span>
                        ) : (
                          <span
                            className={
                              item.daysSince === 0
                                ? 'text-green-700 font-semibold'
                                : item.daysSince <= 7
                                ? 'text-blue-700'
                                : item.daysSince <= 30
                                ? 'text-gray-700'
                                : 'text-red-700 font-semibold'
                            }
                          >
                            {item.daysSince === 0
                              ? 'Hoy'
                              : item.daysSince === 1
                              ? '1 día'
                              : `${item.daysSince} días`}
                          </span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

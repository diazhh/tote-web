'use client';

/**
 * Frecuencia de items: para un juego, lista todos sus números/items con la
 * fecha en que cada uno salió por última vez y cuántos días han pasado.
 * Sin paginación. Filtro único por juego. Sort por número o fecha.
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Calendar, Gamepad2, RefreshCw, History, ArrowUp, ArrowDown } from 'lucide-react';
import { toast } from 'sonner';
import monitorApi from '@/lib/api/monitor';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

function formatDate(d) {
  if (!d) return '—';
  const date = new Date(d);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const day = String(date.getUTCDate()).padStart(2, '0');
  return `${day}/${m}/${y}`;
}

function daysClass(days) {
  if (days === 0) return 'text-green-700 font-semibold';
  if (days <= 7) return 'text-blue-700';
  if (days <= 30) return 'text-gray-700';
  return 'text-red-700 font-semibold';
}

function daysLabel(days) {
  if (days === 0) return 'Hoy';
  if (days === 1) return '1 día';
  return `${days} días`;
}

export default function ItemsFrecuenciaPage() {
  const [games, setGames] = useState([]);
  const [gameId, setGameId] = useState('');
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [sortBy, setSortBy] = useState('number'); // 'number' | 'date'
  const [sortDir, setSortDir] = useState('asc');  // 'asc' | 'desc'

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

  const sortedItems = useMemo(() => {
    const arr = [...items];
    const dir = sortDir === 'asc' ? 1 : -1;
    if (sortBy === 'number') {
      arr.sort((a, b) => {
        const na = Number(a.number);
        const nb = Number(b.number);
        if (Number.isFinite(na) && Number.isFinite(nb)) return (na - nb) * dir;
        return String(a.number).localeCompare(String(b.number)) * dir;
      });
    } else {
      // sort por fecha: nulls (nunca) siempre al final
      arr.sort((a, b) => {
        const na = !a.lastDrawnAt;
        const nb = !b.lastDrawnAt;
        if (na && nb) return 0;
        if (na) return 1;
        if (nb) return -1;
        return (new Date(a.lastDrawnAt) - new Date(b.lastDrawnAt)) * dir;
      });
    }
    return arr;
  }, [items, sortBy, sortDir]);

  const toggleSort = (field) => {
    if (sortBy === field) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortBy(field);
      setSortDir(field === 'number' ? 'asc' : 'desc');
    }
  };

  const SortBtn = ({ field, label }) => {
    const active = sortBy === field;
    return (
      <button
        type="button"
        onClick={() => toggleSort(field)}
        className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-md text-sm border transition ${
          active
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        }`}
      >
        {label}
        {active && (sortDir === 'asc' ? <ArrowUp className="w-3.5 h-3.5" /> : <ArrowDown className="w-3.5 h-3.5" />)}
      </button>
    );
  };

  const selectedGame = games.find((g) => g.id === gameId);
  const neverCount = items.filter((i) => !i.lastDrawnAt).length;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div className="flex items-center gap-3">
          <History className="w-6 h-6 sm:w-7 sm:h-7 text-blue-600 shrink-0" />
          <div className="min-w-0">
            <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Frecuencia de items</h1>
            <p className="text-xs sm:text-sm text-gray-500">Última salida y días transcurridos por número</p>
          </div>
        </div>
        <button
          onClick={fetchData}
          disabled={loading || !gameId}
          className="inline-flex items-center justify-center gap-2 px-3 py-2 rounded-md border bg-white text-sm hover:bg-gray-50 disabled:opacity-50 self-stretch sm:self-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          Refrescar
        </button>
      </div>

      {/* Filtros + sort */}
      <div className="bg-white rounded-lg border p-3 sm:p-4 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <Gamepad2 className="w-5 h-5 text-gray-400" />
            <label className="text-sm font-medium text-gray-700">Juego:</label>
          </div>
          <select
            value={gameId}
            onChange={(e) => setGameId(e.target.value)}
            className="w-full sm:flex-1 sm:max-w-xs border-gray-300 rounded-md text-sm py-2 px-3 border focus:ring-blue-500 focus:border-blue-500"
          >
            {games.map((g) => (
              <option key={g.id} value={g.id}>
                {g.name}
              </option>
            ))}
          </select>
          {selectedGame && (
            <span className="text-xs sm:text-sm text-gray-500">
              {items.length} items{neverCount > 0 ? ` · ${neverCount} nunca` : ''}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-gray-100">
          <span className="text-xs font-medium text-gray-500 uppercase tracking-wide">Ordenar:</span>
          <SortBtn field="number" label="Número" />
          <SortBtn field="date" label="Fecha" />
        </div>
      </div>

      {/* Resultados */}
      {loading ? (
        <div className="bg-white rounded-lg border p-12 text-center text-gray-500">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-3 text-sm">Cargando...</p>
        </div>
      ) : sortedItems.length === 0 ? (
        <div className="bg-white rounded-lg border p-12 text-center text-gray-500">
          No hay items para este juego.
        </div>
      ) : (
        <>
          {/* Mobile: cards */}
          <ul className="sm:hidden space-y-2">
            {sortedItems.map((item) => {
              const never = !item.lastDrawnAt;
              return (
                <li
                  key={item.id}
                  className={`bg-white rounded-lg border p-3 flex items-center gap-3 ${
                    never ? 'bg-yellow-50' : ''
                  }`}
                >
                  <div className="shrink-0 w-12 h-12 rounded-md bg-gray-100 flex items-center justify-center">
                    <span className="font-mono font-bold text-gray-900 text-base">{item.number}</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-gray-800 truncate">{item.name}</div>
                    <div className="text-xs text-gray-500 mt-0.5 inline-flex items-center gap-1">
                      <Calendar className="w-3 h-3" />
                      {never ? <span className="italic text-yellow-700">Nunca ha salido</span> : formatDate(item.lastDrawnAt)}
                    </div>
                  </div>
                  <div className="shrink-0 text-right">
                    {never ? (
                      <span className="text-yellow-700 italic text-sm">—</span>
                    ) : (
                      <span className={`text-sm ${daysClass(item.daysSince)}`}>{daysLabel(item.daysSince)}</span>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Desktop: tabla */}
          <div className="hidden sm:block bg-white rounded-lg border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="min-w-full divide-y divide-gray-200">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Número</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Nombre</th>
                    <th className="px-4 py-3 text-left text-xs font-semibold text-gray-600 uppercase">Última salida</th>
                    <th className="px-4 py-3 text-right text-xs font-semibold text-gray-600 uppercase">Días desde</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-200 bg-white">
                  {sortedItems.map((item) => {
                    const never = !item.lastDrawnAt;
                    return (
                      <tr key={item.id} className={never ? 'bg-yellow-50' : ''}>
                        <td className="px-4 py-2 text-sm font-mono text-gray-900 font-semibold">{item.number}</td>
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
                            <span className={daysClass(item.daysSince)}>{daysLabel(item.daysSince)}</span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

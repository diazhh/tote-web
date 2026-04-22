// frontend/components/admin/conciliacion/ConciliacionFilters.js
'use client';

import { todayInCaracas } from '@/lib/utils/dateUtils';

export default function ConciliacionFilters({ filters, games, onChange, onSearch, loading }) {
  const handleChange = (field, value) => {
    onChange({ ...filters, [field]: value });
  };

  const toggleGame = (gameId) => {
    const current = filters.gameIds || [];
    const next = current.includes(gameId)
      ? current.filter(id => id !== gameId)
      : [...current, gameId];
    onChange({ ...filters, gameIds: next });
  };

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 space-y-4">
      <div className="flex flex-wrap gap-4 items-end">
        {/* Date range */}
        <div className="flex items-center gap-2">
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Desde</label>
            <input
              type="date"
              value={filters.dateFrom}
              max={filters.dateTo || todayInCaracas()}
              onChange={e => handleChange('dateFrom', e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-500 mb-1">Hasta</label>
            <input
              type="date"
              value={filters.dateTo}
              min={filters.dateFrom}
              max={todayInCaracas()}
              onChange={e => handleChange('dateTo', e.target.value)}
              className="border border-gray-300 rounded-md px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>

        {/* Buscar button */}
        <button
          onClick={onSearch}
          disabled={loading}
          className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-md hover:bg-blue-700 disabled:opacity-50 transition"
        >
          {loading ? 'Cargando...' : 'Buscar'}
        </button>
      </div>

      {/* Game selector */}
      {games.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 mb-2">Juegos (todos si ninguno seleccionado)</p>
          <div className="flex flex-wrap gap-2">
            {games.map(game => {
              const selected = (filters.gameIds || []).includes(game.id);
              return (
                <button
                  key={game.id}
                  onClick={() => toggleGame(game.id)}
                  className={`px-3 py-1 text-xs font-medium rounded-full border transition ${
                    selected
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-gray-700 border-gray-300 hover:border-blue-400'
                  }`}
                >
                  {game.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

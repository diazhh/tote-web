'use client';

import { Trophy, Clock, CheckCircle2 } from 'lucide-react';
import { formatTime } from '@/lib/utils/format';
import EmptyState from '@/components/common/EmptyState';

/**
 * Today's draws list component
 * @param {Object} props
 * @param {Array} props.draws - Array of draws
 */
export default function TodayDrawsList({ draws }) {
  // Ensure draws is an array
  const drawsArray = Array.isArray(draws) ? draws : [];
  
  if (drawsArray.length === 0) {
    return (
      <EmptyState 
        title="No hay sorteos hoy"
        description="No se encontraron sorteos programados para el día de hoy"
      />
    );
  }

  // Group draws by game
  const drawsByGame = drawsArray.reduce((acc, draw) => {
    const gameId = draw.game.id;
    if (!acc[gameId]) {
      acc[gameId] = {
        game: draw.game,
        draws: []
      };
    }
    acc[gameId].draws.push(draw);
    return acc;
  }, {});

  return (
    <div className="space-y-8">
      {Object.values(drawsByGame).map(({ game, draws: gameDraws }) => (
        <div key={game.id} className="bg-white rounded-xl shadow-md overflow-hidden">
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 px-6 py-4">
            <h3 className="text-2xl font-bold text-white">{game.name}</h3>
            <p className="text-sm text-white/80">{game.description}</p>
          </div>

          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {gameDraws.map((draw) => (
                <DrawCard key={draw.id} draw={draw} />
              ))}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

/**
 * Individual draw card
 */
function DrawCard({ draw }) {
  const isDrawn = draw.status === 'DRAWN' || draw.status === 'PUBLISHED';
  const isPending = draw.status === 'PENDING';

  return (
    <div className={`
      relative rounded-lg border-2 p-4 transition-all hover:shadow-lg
      ${isDrawn ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}
    `}>
      <div className="flex items-start justify-between mb-3">
        <div className="flex items-center gap-2 text-sm font-medium text-gray-600">
          <Clock className="h-4 w-4" />
          <span>{formatTime(draw.scheduledAt)}</span>
        </div>
        
        {isDrawn && (
          <CheckCircle2 className="h-5 w-5 text-green-600" />
        )}
      </div>

      {isDrawn && draw.winnerItem ? (
        <div className="flex items-center gap-3">
          <Trophy className="h-8 w-8 text-yellow-500 flex-shrink-0" />
          <div>
            <p className="text-3xl font-bold text-gray-900">
              {draw.winnerItem.number}
            </p>
            <p className="text-sm text-gray-600">
              {draw.winnerItem.name}
            </p>
          </div>
        </div>
      ) : isPending ? (
        <div className="text-center py-4">
          <p className="text-sm text-gray-500">Pendiente</p>
        </div>
      ) : draw.preselectedItem ? (
        <div className="flex items-center gap-3">
          <Trophy className="h-8 w-8 text-gray-400 flex-shrink-0" />
          <div>
            <p className="text-3xl font-bold text-gray-900">
              {draw.preselectedItem.number}
            </p>
            <p className="text-sm text-gray-600">
              {draw.preselectedItem.name}
            </p>
            <p className="text-xs text-gray-500 mt-1">Preseleccionado</p>
          </div>
        </div>
      ) : (
        <div className="text-center py-4">
          <p className="text-sm text-gray-500">En proceso...</p>
        </div>
      )}
    </div>
  );
}

import { Trophy, Clock, Calendar } from 'lucide-react';
import { formatDate } from '@/lib/utils/format';
import { formatDrawTime } from '@/lib/utils/dateUtils';
import EmptyState from '@/components/common/EmptyState';

/**
 * Game today results component
 * @param {Object} props
 * @param {Array} props.draws - Today's draws
 */
export default function GameTodayResults({ draws }) {
  if (!draws || draws.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-md p-8">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <Calendar className="h-6 w-6 text-primary" />
          Resultados de Hoy
        </h2>
        <EmptyState 
          title="No hay sorteos hoy"
          description="No se encontraron sorteos programados para el día de hoy"
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-8">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <Calendar className="h-6 w-6 text-primary" />
        Resultados de Hoy - {formatDate(new Date())}
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {draws.map((draw) => (
          <DrawResultCard key={draw.id} draw={draw} />
        ))}
      </div>
    </div>
  );
}

/**
 * Individual draw result card
 */
function DrawResultCard({ draw }) {
  const isDrawn = draw.status === 'DRAWN' || draw.status === 'PUBLISHED';
  const isPending = draw.status === 'PENDING';

  return (
    <div className={`
      relative rounded-lg border-2 p-6 transition-all
      ${isDrawn ? 'border-green-500 bg-green-50' : 'border-gray-200 bg-white'}
    `}>
      <div className="flex items-center gap-2 text-sm font-medium text-gray-600 mb-4">
        <Clock className="h-4 w-4" />
        <span>{formatDrawTime(draw)}</span>
      </div>

      {isDrawn && draw.winnerItem ? (
        <div className="text-center">
          <Trophy className="h-10 w-10 text-yellow-500 mx-auto mb-3" />
          <p className="text-5xl font-bold text-gray-900 mb-2">
            {draw.winnerItem.number}
          </p>
          <p className="text-lg text-gray-700 font-medium">
            {draw.winnerItem.name}
          </p>
          {draw.winnerItem.multiplier && (
            <p className="text-sm text-gray-500 mt-2">
              Multiplicador: x{draw.winnerItem.multiplier}
            </p>
          )}
        </div>
      ) : isPending ? (
        <div className="text-center py-6">
          <Clock className="h-10 w-10 text-gray-400 mx-auto mb-3" />
          <p className="text-sm text-gray-500">Pendiente</p>
        </div>
      ) : draw.preselectedItem ? (
        <div className="text-center">
          <Trophy className="h-10 w-10 text-gray-400 mx-auto mb-3" />
          <p className="text-5xl font-bold text-gray-900 mb-2">
            {draw.preselectedItem.number}
          </p>
          <p className="text-lg text-gray-700 font-medium">
            {draw.preselectedItem.name}
          </p>
          <p className="text-xs text-gray-500 mt-2">Preseleccionado</p>
        </div>
      ) : (
        <div className="text-center py-6">
          <p className="text-sm text-gray-500">En proceso...</p>
        </div>
      )}
    </div>
  );
}

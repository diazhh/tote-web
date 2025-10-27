import { History, Trophy, ChevronLeft, ChevronRight } from 'lucide-react';
import { formatDateTime } from '@/lib/utils/format';
import EmptyState from '@/components/common/EmptyState';

/**
 * Game history component
 * @param {Object} props
 * @param {Object} props.history - History data with draws and pagination
 * @param {number} props.currentPage - Current page
 * @param {Function} props.onPageChange - Page change handler
 */
export default function GameHistory({ history, currentPage, onPageChange }) {
  const { draws, pagination } = history;

  if (!draws || draws.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-md p-8">
        <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
          <History className="h-6 w-6 text-primary" />
          Histórico de Resultados
        </h2>
        <EmptyState 
          title="No hay histórico"
          description="No se encontraron resultados anteriores"
        />
      </div>
    );
  }

  return (
    <div className="bg-white rounded-xl shadow-md p-8">
      <h2 className="text-2xl font-bold mb-6 flex items-center gap-2">
        <History className="h-6 w-6 text-primary" />
        Histórico de Resultados
      </h2>

      <div className="overflow-x-auto">
        <table className="w-full">
          <thead>
            <tr className="border-b-2 border-gray-200">
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Fecha y Hora</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-700">Número</th>
              <th className="text-left py-3 px-4 font-semibold text-gray-700">Nombre</th>
              <th className="text-center py-3 px-4 font-semibold text-gray-700">Estado</th>
            </tr>
          </thead>
          <tbody>
            {draws.map((draw) => (
              <tr key={draw.id} className="border-b border-gray-100 hover:bg-gray-50 transition-colors">
                <td className="py-4 px-4 text-sm text-gray-600">
                  {formatDateTime(draw.scheduledAt)}
                </td>
                <td className="py-4 px-4 text-center">
                  {draw.winnerItem ? (
                    <div className="flex items-center justify-center gap-2">
                      <Trophy className="h-5 w-5 text-yellow-500" />
                      <span className="text-2xl font-bold text-gray-900">
                        {draw.winnerItem.number}
                      </span>
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="py-4 px-4">
                  {draw.winnerItem ? (
                    <div>
                      <p className="font-medium text-gray-900">{draw.winnerItem.name}</p>
                      {draw.winnerItem.multiplier && (
                        <p className="text-xs text-gray-500">x{draw.winnerItem.multiplier}</p>
                      )}
                    </div>
                  ) : (
                    <span className="text-gray-400">-</span>
                  )}
                </td>
                <td className="py-4 px-4 text-center">
                  <StatusBadge status={draw.status} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {pagination && pagination.totalPages > 1 && (
        <div className="flex items-center justify-between mt-6 pt-6 border-t border-gray-200">
          <p className="text-sm text-gray-600">
            Página {pagination.currentPage} de {pagination.totalPages}
            {' '}({pagination.total} resultados)
          </p>
          
          <div className="flex items-center gap-2">
            <button
              onClick={() => onPageChange(currentPage - 1)}
              disabled={!pagination.hasPrevPage}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="h-5 w-5" />
            </button>
            <button
              onClick={() => onPageChange(currentPage + 1)}
              disabled={!pagination.hasNextPage}
              className="px-4 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * Status badge component
 */
function StatusBadge({ status }) {
  const getStatusConfig = (status) => {
    switch (status) {
      case 'PUBLISHED':
        return { label: 'Publicado', color: 'bg-green-100 text-green-800' };
      case 'DRAWN':
        return { label: 'Sorteado', color: 'bg-blue-100 text-blue-800' };
      case 'CLOSED':
        return { label: 'Cerrado', color: 'bg-yellow-100 text-yellow-800' };
      case 'PENDING':
        return { label: 'Pendiente', color: 'bg-gray-100 text-gray-800' };
      case 'CANCELLED':
        return { label: 'Cancelado', color: 'bg-red-100 text-red-800' };
      default:
        return { label: status, color: 'bg-gray-100 text-gray-800' };
    }
  };

  const config = getStatusConfig(status);

  return (
    <span className={`inline-block px-3 py-1 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

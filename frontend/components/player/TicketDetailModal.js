import { X, Calendar, Clock, Hash, DollarSign, Trophy, CheckCircle, XCircle, Ticket as TicketIcon } from 'lucide-react';

export default function TicketDetailModal({ ticket, onClose }) {
  if (!ticket) return null;

  const formatDateTime = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString('es-VE', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getStatusBadge = (status) => {
    const styles = {
      ACTIVE: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Clock, label: 'Activo' },
      WON: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle, label: 'Ganador' },
      LOST: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle, label: 'Perdedor' },
      CANCELLED: { bg: 'bg-gray-100', text: 'text-gray-700', icon: XCircle, label: 'Cancelado' }
    };
    const style = styles[status] || styles.ACTIVE;
    const Icon = style.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-semibold ${style.bg} ${style.text}`}>
        <Icon className="w-4 h-4" />
        {style.label}
      </span>
    );
  };

  const getDetailStatusBadge = (status) => {
    const styles = {
      ACTIVE: { bg: 'bg-blue-50', text: 'text-blue-700', label: 'Activo' },
      WON: { bg: 'bg-green-50', text: 'text-green-700', label: 'Ganador' },
      LOST: { bg: 'bg-gray-50', text: 'text-gray-500', label: 'Perdedor' }
    };
    const style = styles[status] || styles.ACTIVE;

    return (
      <span className={`text-xs font-semibold ${style.text}`}>
        {style.label}
      </span>
    );
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-blue-600 to-blue-700 text-white p-6 rounded-t-xl">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white bg-opacity-20 rounded-lg">
                <TicketIcon className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Detalle del Ticket</h2>
                <p className="text-blue-100 text-sm mt-1">ID: {ticket.id?.slice(0, 13)}...</p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white hover:bg-opacity-20 rounded-lg transition-colors"
            >
              <X className="w-6 h-6" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Status and Amounts */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-600 mb-1">Estado</p>
              {getStatusBadge(ticket.status)}
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-600 mb-1">Monto Jugado</p>
              <p className="text-2xl font-bold text-gray-900">
                Bs. {parseFloat(ticket.totalAmount || 0).toFixed(2)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-600 mb-1">Premio</p>
              <p className={`text-2xl font-bold ${parseFloat(ticket.totalPrize || 0) > 0 ? 'text-green-600' : 'text-gray-400'}`}>
                Bs. {parseFloat(ticket.totalPrize || 0).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Draw Info */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-gray-900">Información del Sorteo</h3>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-xs text-gray-600">Juego</p>
                  <p className="font-semibold text-gray-900">{ticket.draw?.game?.name || ticket.draw?.gameName || 'N/A'}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-xs text-gray-600">Fecha del Sorteo</p>
                  <p className="font-semibold text-gray-900">
                    {ticket.draw?.scheduledAt ? formatDateTime(ticket.draw.scheduledAt) : (ticket.draw?.drawTime ? formatDateTime(ticket.draw.drawTime) : 'N/A')}
                  </p>
                </div>
              </div>
            </div>
            {ticket.draw?.winnerItem && (
              <div className="mt-3 pt-3 border-t border-blue-200">
                <div className="flex items-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-600" />
                  <div>
                    <p className="text-xs text-gray-600">Número Ganador</p>
                    <p className="text-lg font-bold text-yellow-600">
                      {ticket.draw.winnerItem.number} - {ticket.draw.winnerItem.name}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Ticket Details */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Hash className="w-5 h-5 text-gray-600" />
              <h3 className="font-bold text-gray-900">Números Jugados</h3>
            </div>
            <div className="space-y-2">
              {ticket.details?.map((detail, idx) => (
                <div
                  key={idx}
                  className={`border rounded-lg p-4 transition-all ${
                    detail.status === 'WON'
                      ? 'bg-green-50 border-green-300'
                      : detail.status === 'LOST'
                      ? 'bg-gray-50 border-gray-200'
                      : 'bg-white border-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={`text-center ${
                        detail.status === 'WON' ? 'text-green-700' : 'text-gray-700'
                      }`}>
                        <p className="text-3xl font-bold">
                          {detail.gameItem?.number || detail.number || 'N/A'}
                        </p>
                        <p className="text-xs font-semibold mt-1">
                          {detail.gameItem?.name || ''}
                        </p>
                      </div>
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <DollarSign className="w-4 h-4 text-gray-500" />
                          <span className="text-sm text-gray-600">
                            Jugado: <span className="font-semibold text-gray-900">Bs. {parseFloat(detail.amount || 0).toFixed(2)}</span>
                          </span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Trophy className="w-4 h-4 text-gray-500" />
                          <span className="text-sm text-gray-600">
                            Multiplicador: <span className="font-semibold text-gray-900">x{parseFloat(detail.multiplier || 0).toFixed(0)}</span>
                          </span>
                        </div>
                        {detail.status === 'WON' && (
                          <div className="flex items-center gap-2">
                            <CheckCircle className="w-4 h-4 text-green-600" />
                            <span className="text-sm text-green-700 font-semibold">
                              Premio: Bs. {parseFloat(detail.prize || 0).toFixed(2)}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      {getDetailStatusBadge(detail.status)}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Footer Info */}
          <div className="bg-gray-50 rounded-lg p-4 text-sm text-gray-600">
            <p className="flex items-center gap-2">
              <Clock className="w-4 h-4" />
              Creado: {formatDateTime(ticket.createdAt)}
            </p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="sticky bottom-0 bg-gray-50 border-t p-4 rounded-b-xl">
          <button
            onClick={onClose}
            className="w-full py-3 bg-gray-200 text-gray-700 rounded-lg font-semibold hover:bg-gray-300 transition-colors"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

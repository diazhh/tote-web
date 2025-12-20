import { CheckCircle2, X } from 'lucide-react';

export default function TicketModal({ tickets, onClose, onGoToDashboard }) {
  const formatDrawTime = (drawTime) => {
    const date = new Date(drawTime);
    return date.toLocaleTimeString('es-VE', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: true
    });
  };

  const formatDrawDate = (drawTime) => {
    const date = new Date(drawTime);
    return date.toLocaleDateString('es-VE', {
      day: '2-digit',
      month: 'short'
    });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between rounded-t-lg">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-6 h-6 text-green-600" />
            <h3 className="font-bold text-lg">¡Tickets Creados!</h3>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {tickets.map((ticket, index) => (
            <div key={ticket.id || index} className="border rounded-lg p-4 bg-gray-50">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h4 className="font-bold text-lg">{ticket.gameName}</h4>
                  <p className="text-sm text-gray-600">
                    {formatDrawTime(ticket.drawTime)} • {formatDrawDate(ticket.drawTime)}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-xs text-gray-600">Total</p>
                  <p className="text-xl font-bold text-blue-600">
                    Bs. {parseFloat(ticket.totalAmount || 0).toFixed(2)}
                  </p>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-sm font-semibold text-gray-700">Números jugados:</p>
                <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
                  {ticket.details?.map((detail, idx) => (
                    <div key={idx} className="bg-white border rounded p-2 text-center">
                      <p className="font-bold text-lg text-blue-600">
                        {detail.gameItem?.number || detail.gameItem?.itemNumber || detail.itemNumber || detail.number}
                      </p>
                      <p className="text-xs text-gray-600">
                        Bs. {parseFloat(detail.amount || 0).toFixed(2)}
                      </p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="mt-3 pt-3 border-t">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-gray-600">ID del Ticket:</span>
                  <span className="font-mono text-gray-900">{ticket.id?.slice(0, 8)}...</span>
                </div>
              </div>
            </div>
          ))}

          <button
            onClick={onGoToDashboard}
            className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition-colors"
          >
            Ir al Dashboard
          </button>
        </div>
      </div>
    </div>
  );
}

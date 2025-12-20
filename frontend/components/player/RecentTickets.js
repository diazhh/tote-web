'use client';

import { useState } from 'react';
import { Ticket, Calendar, Hash, TrendingUp, Trophy, X, Eye } from 'lucide-react';
import TicketDetailModal from './TicketDetailModal';

export default function RecentTickets({ tickets, onRefresh }) {
  const [selectedTicket, setSelectedTicket] = useState(null);
  const [showDetailModal, setShowDetailModal] = useState(false);

  const handleViewDetail = (ticket) => {
    setSelectedTicket(ticket);
    setShowDetailModal(true);
  };

  const handleCloseModal = () => {
    setShowDetailModal(false);
    setSelectedTicket(null);
  };
  if (!tickets || tickets.length === 0) {
    return (
      <div className="bg-white rounded-xl shadow-sm border p-6">
        <h2 className="text-xl font-bold text-gray-900 mb-6">Tickets Recientes</h2>
        <div className="text-center py-12">
          <Ticket className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <p className="text-gray-500">No tienes tickets todavía</p>
          <p className="text-sm text-gray-400 mt-2">Comienza a jugar para ver tus tickets aquí</p>
        </div>
      </div>
    );
  }

  const getStatusBadge = (status) => {
    const styles = {
      ACTIVE: 'bg-blue-100 text-blue-700',
      WON: 'bg-green-100 text-green-700',
      LOST: 'bg-red-100 text-red-700',
      CANCELLED: 'bg-gray-100 text-gray-700'
    };

    const labels = {
      ACTIVE: 'Activo',
      WON: 'Ganador',
      LOST: 'Perdedor',
      CANCELLED: 'Cancelado'
    };

    return (
      <span className={`px-3 py-1 rounded-full text-xs font-semibold ${styles[status] || styles.ACTIVE}`}>
        {labels[status] || status}
      </span>
    );
  };

  const getStatusIcon = (status) => {
    switch (status) {
      case 'WON':
        return <Trophy className="w-5 h-5 text-green-600" />;
      case 'LOST':
        return <X className="w-5 h-5 text-red-600" />;
      case 'ACTIVE':
        return <TrendingUp className="w-5 h-5 text-blue-600" />;
      default:
        return <Ticket className="w-5 h-5 text-gray-600" />;
    }
  };

  return (
    <div className="bg-white rounded-xl shadow-sm border p-6">
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-xl font-bold text-gray-900">TICKETS</h2>
      </div>

      <div className="space-y-4">
        {tickets.map((ticket) => (
          <div
            key={ticket.id}
            className="border rounded-lg p-4 hover:shadow-md transition-shadow cursor-pointer"
            onClick={() => handleViewDetail(ticket)}
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex items-center gap-3">
                <div className="bg-gray-100 p-2 rounded-lg">
                  {getStatusIcon(ticket.status)}
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <p className="font-semibold text-gray-900">
                      TICKET
                    </p>
                    {getStatusBadge(ticket.status)}
                  </div>
                  <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                    <Hash className="w-4 h-4" />
                    <span>{ticket.ticketNumber}</span>
                  </div>
                </div>
              </div>
              <div className="text-right">
                <p className="text-sm text-gray-500">Jugado</p>
                <p className="font-semibold text-gray-900">
                  Bs. {parseFloat(ticket.totalAmount || 0).toLocaleString('es-VE', { 
                    minimumFractionDigits: 2, 
                    maximumFractionDigits: 2 
                  })}
                </p>
              </div>
            </div>

            {/* Numbers */}
            <div className="flex flex-wrap gap-2 mb-3">
              {ticket.details.map((detail, idx) => (
                <div
                  key={idx}
                  className={`px-3 py-1 rounded-lg text-sm font-semibold ${
                    detail.status === 'WON'
                      ? 'bg-green-100 text-green-700 border-2 border-green-300'
                      : detail.status === 'LOST'
                      ? 'bg-gray-100 text-gray-500'
                      : 'bg-blue-100 text-blue-700'
                  }`}
                >
                  {detail.number}
                  {detail.status === 'WON' && (
                    <span className="ml-1">
                      (+Bs. {parseFloat(detail.prize || 0).toFixed(2)})
                    </span>
                  )}
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="flex justify-between items-center pt-3 border-t">
              <div className="flex items-center gap-2 text-sm text-gray-500">
                <Calendar className="w-4 h-4" />
                <span>
                  {new Date(ticket.createdAt).toLocaleDateString('es-VE', {
                    day: '2-digit',
                    month: 'short',
                    year: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit'
                  })}
                </span>
              </div>
              {ticket.status === 'WON' && parseFloat(ticket.totalPrize || 0) > 0 && (
                <div className="text-right">
                  <p className="text-sm text-green-600 font-medium">Premio</p>
                  <p className="font-bold text-green-600">
                    +Bs. {parseFloat(ticket.totalPrize || 0).toLocaleString('es-VE', { 
                      minimumFractionDigits: 2, 
                      maximumFractionDigits: 2 
                    })}
                  </p>
                </div>
              )}
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  handleViewDetail(ticket);
                }}
                className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100 transition-colors text-sm font-medium"
              >
                <Eye className="w-4 h-4" />
                Ver Detalle
              </button>
              {ticket.draw.status === 'COMPLETED' && ticket.draw.winnerNumber && (
                <div className="text-sm text-gray-600">
                  Ganador: <span className="font-semibold">{ticket.draw.winnerNumber}</span>
                </div>
              )}
            </div>
          </div>
        ))}
      </div>

      {showDetailModal && selectedTicket && (
        <TicketDetailModal
          ticket={selectedTicket}
          onClose={handleCloseModal}
        />
      )}
    </div>
  );
}

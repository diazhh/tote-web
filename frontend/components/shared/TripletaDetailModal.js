import { X, Calendar, Clock, Layers, DollarSign, Trophy, CheckCircle, AlertTriangle, Hash } from 'lucide-react';
import { useState, useEffect } from 'react';
import axios from '@/lib/api/axios';

export default function TripletaDetailModal({ tripleta, onClose }) {
  const [gameItems, setGameItems] = useState([]);
  const [drawsInRange, setDrawsInRange] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (tripleta) {
      fetchTripletaDetails();
    }
  }, [tripleta]);

  const fetchTripletaDetails = async () => {
    try {
      setLoading(true);
      
      // Fetch game items
      const itemIds = [tripleta.item1Id, tripleta.item2Id, tripleta.item3Id];
      const itemResponses = await Promise.all(
        itemIds.map(id => axios.get(`/game-items/${id}`).catch(() => null))
      );
      const items = itemResponses.map(r => r?.data?.data).filter(Boolean);
      setGameItems(items);

      // Fetch draws in range to calculate executed/remaining
      try {
        const drawsResponse = await axios.get(`/tripleta/${tripleta.id}/draws`);
        if (drawsResponse.data?.success) {
          setDrawsInRange(drawsResponse.data.data);
        }
      } catch (error) {
        console.error('Error fetching draws:', error);
      }
    } catch (error) {
      console.error('Error fetching tripleta details:', error);
    } finally {
      setLoading(false);
    }
  };

  if (!tripleta) return null;

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

  const formatTime = (dateStr) => {
    const date = new Date(dateStr);
    const hours = String(date.getHours()).padStart(2, '0');
    const minutes = String(date.getMinutes()).padStart(2, '0');
    return `${hours}:${minutes}`;
  };

  const getStatusBadge = (status) => {
    const styles = {
      ACTIVE: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Clock, label: 'Activa' },
      WON: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle, label: 'Ganadora' },
      LOST: { bg: 'bg-red-100', text: 'text-red-700', icon: X, label: 'Perdida' },
      EXPIRED: { bg: 'bg-gray-100', text: 'text-gray-700', icon: X, label: 'Expirada' }
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

  const getDangerBadge = (numbersRemaining) => {
    if (numbersRemaining === 0) {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">🏆 Completa</span>;
    } else if (numbersRemaining === 1) {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-red-100 text-red-800">⚠️ Alto riesgo</span>;
    } else if (numbersRemaining === 2) {
      return <span className="px-2 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Riesgo medio</span>;
    }
    return <span className="px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-800">Bajo riesgo</span>;
  };

  // Calculate numbers won/remaining
  const numbersWon = tripleta.numbersWon || (tripleta.items?.filter(i => i.won).length) || 0;
  const numbersRemaining = 3 - numbersWon;
  
  // Calculate draws executed/remaining
  const drawsExecuted = drawsInRange?.executed || 0;
  const drawsTotal = drawsInRange?.total || tripleta.drawsCount || 0;
  const drawsRemaining = drawsTotal - drawsExecuted;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-gradient-to-r from-purple-600 to-purple-700 text-white p-6 rounded-t-xl">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-white bg-opacity-20 rounded-lg">
                <Layers className="w-6 h-6" />
              </div>
              <div>
                <h2 className="text-2xl font-bold">Detalle de Tripleta</h2>
                <p className="text-purple-100 text-sm mt-1">ID: {tripleta.id?.slice(0, 13)}...</p>
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
              {getStatusBadge(tripleta.status)}
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-600 mb-1">Monto Apostado</p>
              <p className="text-2xl font-bold text-gray-900">
                Bs. {parseFloat(tripleta.amount || 0).toFixed(2)}
              </p>
            </div>
            <div className="bg-gray-50 rounded-lg p-4">
              <p className="text-xs text-gray-600 mb-1">Premio Potencial</p>
              <p className={`text-2xl font-bold ${parseFloat(tripleta.prize || 0) > 0 ? 'text-green-600' : 'text-purple-600'}`}>
                Bs. {parseFloat(tripleta.prize || tripleta.potentialPrize || (tripleta.amount * tripleta.multiplier) || 0).toFixed(2)}
              </p>
            </div>
          </div>

          {/* Progress Stats */}
          <div className="grid grid-cols-2 gap-4">
            {/* Numbers Progress */}
            <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Hash className="w-4 h-4 text-purple-600" />
                <p className="text-xs font-medium text-gray-600">Números</p>
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold text-purple-700">{numbersWon}</p>
                <p className="text-lg text-gray-500">/ 3</p>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {numbersRemaining === 0 ? '¡Completa!' : `Faltan ${numbersRemaining}`}
              </p>
            </div>

            {/* Draws Progress */}
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-center gap-2 mb-2">
                <Trophy className="w-4 h-4 text-blue-600" />
                <p className="text-xs font-medium text-gray-600">Sorteos</p>
              </div>
              <div className="flex items-baseline gap-2">
                <p className="text-3xl font-bold text-blue-700">{drawsExecuted}</p>
                <p className="text-lg text-gray-500">/ {drawsTotal}</p>
              </div>
              <p className="text-xs text-gray-600 mt-1">
                {drawsRemaining === 0 ? 'Finalizados' : `Faltan ${drawsRemaining}`}
              </p>
            </div>
          </div>

          {/* Multiplier */}
          <div className="bg-gray-50 rounded-lg p-4">
            <p className="text-xs text-gray-600 mb-1">Multiplicador</p>
            <p className="text-xl font-bold text-purple-700">x{parseFloat(tripleta.multiplier || 0).toFixed(0)}</p>
          </div>

          {/* Risk Badge */}
          <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
            <span className="text-sm font-medium text-gray-700">Nivel de Riesgo:</span>
            {getDangerBadge(numbersRemaining)}
          </div>

          {/* Numbers Selected */}
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Trophy className="w-5 h-5 text-purple-600" />
              <h3 className="font-bold text-gray-900">Números Seleccionados</h3>
            </div>
            {loading ? (
              <div className="text-center py-8 text-gray-500">Cargando números...</div>
            ) : (
              <div className="space-y-3">
                {(tripleta.items || gameItems).map((item, idx) => {
                  const isWon = item.won || false;
                  return (
                    <div
                      key={idx}
                      className={`border rounded-lg p-4 transition-all ${
                        isWon
                          ? 'bg-green-50 border-green-300'
                          : 'bg-white border-gray-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-4">
                          <div className={`text-center ${isWon ? 'text-green-700' : 'text-gray-700'}`}>
                            <p className="text-3xl font-bold">{item.number}</p>
                            <p className="text-xs font-semibold mt-1">{item.name}</p>
                          </div>
                          <div className="space-y-1">
                            {isWon && item.wonInDraw && (
                              <div className="flex items-center gap-2">
                                <CheckCircle className="w-4 h-4 text-green-600" />
                                <span className="text-sm text-green-700 font-semibold">
                                  Ganó: {formatTime(item.wonInDraw.scheduledAt)}
                                </span>
                              </div>
                            )}
                          </div>
                        </div>
                        <div>
                          <span className={`text-xs font-semibold ${isWon ? 'text-green-600' : 'text-gray-500'}`}>
                            {isWon ? '✓ Ganador' : 'Pendiente'}
                          </span>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Draws in Range */}
          {drawsInRange?.draws && drawsInRange.draws.length > 0 && (
            <div>
              <div className="flex items-center gap-2 mb-3">
                <Calendar className="w-5 h-5 text-gray-600" />
                <h3 className="font-bold text-gray-900">
                  Sorteos Involucrados ({drawsExecuted}/{drawsTotal} ejecutados)
                </h3>
              </div>
              <div className="max-h-48 overflow-y-auto border rounded-lg">
                <table className="min-w-full divide-y divide-gray-200 text-sm">
                  <thead className="bg-gray-50 sticky top-0">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Hora</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Estado</th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500">Relevante</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-200">
                    {drawsInRange.draws.map((draw, idx) => (
                      <tr key={idx} className={draw.isRelevant ? 'bg-green-50' : ''}>
                        <td className="px-3 py-2">{formatTime(draw.scheduledAt)}</td>
                        <td className="px-3 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs ${
                            draw.status === 'PUBLISHED' ? 'bg-green-100 text-green-800' :
                            draw.status === 'DRAWN' ? 'bg-blue-100 text-blue-800' :
                            draw.status === 'SCHEDULED' ? 'bg-gray-100 text-gray-800' :
                            'bg-yellow-100 text-yellow-800'
                          }`}>
                            {draw.status}
                          </span>
                        </td>
                        <td className="px-3 py-2">
                          {draw.isRelevant && <span className="text-green-600 font-medium">✓ Número ganó aquí</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* High Risk Alert */}
          {numbersRemaining === 1 && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <div className="flex items-start gap-3">
                <AlertTriangle className="w-6 h-6 text-red-600 flex-shrink-0" />
                <div>
                  <p className="font-bold text-red-800">¡ALTO RIESGO!</p>
                  <p className="text-sm text-red-700">
                    Esta tripleta solo necesita 1 número más para completarse. 
                    Si el número faltante sale como ganador, se pagará un premio de Bs. {parseFloat(tripleta.prize || tripleta.potentialPrize || (tripleta.amount * tripleta.multiplier) || 0).toFixed(2)}.
                  </p>
                  {(tripleta.items || gameItems).find(i => !i.won) && (
                    <p className="text-sm text-red-700 mt-2">
                      <strong>Número faltante:</strong> {(tripleta.items || gameItems).find(i => !i.won)?.number} - {(tripleta.items || gameItems).find(i => !i.won)?.name}
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Validity Period */}
          <div className="bg-gray-50 rounded-lg p-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-xs text-gray-600">Creada</p>
                  <p className="font-semibold text-gray-900">{formatDateTime(tripleta.createdAt)}</p>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Clock className="w-4 h-4 text-gray-500" />
                <div>
                  <p className="text-xs text-gray-600">Expira</p>
                  <p className="font-semibold text-gray-900">{formatDateTime(tripleta.expiresAt)}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Info Box */}
          <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
            <div className="flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
              <div>
                <p className="font-medium text-blue-800">¿Cómo funciona la Tripleta?</p>
                <p className="text-sm text-blue-700 mt-1">
                  Los 3 números seleccionados deben salir ganadores en los próximos {drawsTotal} sorteos (en cualquier orden) para ganar el premio multiplicado.
                </p>
              </div>
            </div>
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

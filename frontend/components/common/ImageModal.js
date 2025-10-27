'use client';

import { X, Download } from 'lucide-react';
import { formatTime, formatDate } from '@/lib/utils/format';

export default function ImageModal({ draw, imageUrl, onClose }) {
  if (!draw || !imageUrl) return null;

  const handleDownload = async () => {
    try {
      const response = await fetch(imageUrl);
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${draw.game.slug}_${draw.winnerItem.number}_${formatDate(draw.scheduledAt).replace(/\//g, '-')}.png`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading image:', error);
    }
  };

  const handleBackdropClick = (e) => {
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  return (
    <div 
      className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-75 p-4"
      onClick={handleBackdropClick}
    >
      <div className="bg-white rounded-lg shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b bg-gradient-to-r from-blue-50 to-purple-50">
          <h2 className="text-xl font-bold text-gray-900">
            {draw.game.name} - Resultado
          </h2>
          <div className="flex items-center gap-2">
            <button
              onClick={handleDownload}
              className="p-2 rounded-lg hover:bg-white transition-colors"
              title="Descargar imagen"
            >
              <Download className="h-5 w-5 text-gray-600" />
            </button>
            <button
              onClick={onClose}
              className="p-2 rounded-lg hover:bg-white transition-colors"
              title="Cerrar"
            >
              <X className="h-5 w-5 text-gray-600" />
            </button>
          </div>
        </div>

        {/* Image Container */}
        <div className="flex-1 overflow-auto bg-gray-100 flex items-center justify-center p-6">
          <img
            src={imageUrl}
            alt={`Resultado ${draw.winnerItem.number}`}
            className="max-w-full max-h-full object-contain rounded-lg shadow-lg"
            style={{ maxHeight: 'calc(90vh - 200px)' }}
          />
        </div>

        {/* Footer with Draw Info */}
        <div className="p-6 border-t bg-white">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <div className="text-xs text-gray-500 mb-1">Juego</div>
              <div className="font-semibold text-gray-900">{draw.game.name}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Ganador</div>
              <div className="font-semibold text-gray-900">
                {draw.winnerItem.number}
                {draw.winnerItem.name && (
                  <span className="text-sm text-gray-600 ml-1">- {draw.winnerItem.name}</span>
                )}
              </div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Fecha</div>
              <div className="font-semibold text-gray-900">{formatDate(draw.scheduledAt)}</div>
            </div>
            <div>
              <div className="text-xs text-gray-500 mb-1">Hora</div>
              <div className="font-semibold text-gray-900">{formatTime(draw.scheduledAt)}</div>
            </div>
          </div>
          
          {draw.drawnAt && (
            <div className="mt-4 pt-4 border-t">
              <div className="text-xs text-gray-500">
                Sorteo realizado el {formatDate(draw.drawnAt)} a las {formatTime(draw.drawnAt)}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

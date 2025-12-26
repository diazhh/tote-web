import { Clock, ChevronDown, X } from 'lucide-react';

export default function DrawSelector({ draws, selectedDraw, onSelectDraw, isOpen, onToggle }) {
  /**
   * Formatea drawTime (HH:MM o HH:MM:SS) a formato 12h AM/PM
   * El drawTime ya está en hora de Venezuela, no necesita conversión
   */
  const formatDrawTime = (draw) => {
    try {
      // Usar drawTime directamente si está disponible (ya está en hora Venezuela)
      const timeStr = draw.drawTime;
      if (!timeStr) return 'Hora no disponible';
      
      const [hoursStr, minutesStr] = timeStr.split(':');
      const hours = parseInt(hoursStr, 10);
      const minutes = minutesStr || '00';
      
      if (isNaN(hours)) return 'Hora no disponible';
      
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      
      return `${displayHours}:${minutes.substring(0, 2)} ${ampm}`;
    } catch (e) {
      return 'Hora no disponible';
    }
  };

  /**
   * Verifica si el sorteo ya cerró usando hora Venezuela
   */
  const isDrawClosed = (draw) => {
    try {
      // Obtener hora actual en Venezuela
      const now = new Date();
      const venezuelaTime = now.toLocaleTimeString('es-VE', {
        timeZone: 'America/Caracas',
        hour12: false,
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      });
      
      // El sorteo cierra 5 minutos antes de drawTime
      const drawTime = draw.drawTime;
      if (!drawTime) return false;
      
      const [hours, mins] = drawTime.split(':').map(Number);
      const totalMinutes = hours * 60 + mins - 5; // 5 minutos antes
      const closeHour = Math.floor(totalMinutes / 60);
      const closeMin = totalMinutes % 60;
      const closeTimeStr = `${closeHour.toString().padStart(2, '0')}:${closeMin.toString().padStart(2, '0')}:00`;
      
      return venezuelaTime >= closeTimeStr;
    } catch (e) {
      return false;
    }
  };

  const availableDraws = draws.filter(d => !isDrawClosed(d));

  return (
    <>
      {/* Mobile: Button with Modal */}
      <button
        onClick={onToggle}
        disabled={availableDraws.length === 0}
        className={`lg:hidden w-full py-3 px-4 rounded-lg font-semibold flex items-center justify-between transition-all ${
          selectedDraw
            ? 'bg-green-100 text-green-800 border-2 border-green-300'
            : 'bg-white text-gray-700 border-2 border-gray-200'
        } ${availableDraws.length === 0 ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5" />
          {selectedDraw ? (
            <span>{formatDrawTime(selectedDraw)}</span>
          ) : availableDraws.length === 0 ? (
            <span>No hay sorteos disponibles</span>
          ) : (
            <span>Seleccionar Sorteo</span>
          )}
        </div>
        <ChevronDown className="w-5 h-5" />
      </button>

      {/* Desktop: Direct Selection */}
      <div className="hidden lg:block space-y-2">
        {availableDraws.length === 0 ? (
          <div className="text-center py-8 text-gray-500 bg-gray-50 rounded-lg">
            No hay sorteos disponibles
          </div>
        ) : (
          availableDraws.map(draw => (
            <button
              key={draw.id}
              onClick={() => onSelectDraw(draw)}
              className={`w-full p-4 rounded-xl text-left transition-all ${
                selectedDraw?.id === draw.id
                  ? 'bg-green-50 border-2 border-green-500 shadow-sm'
                  : 'bg-gray-50 border-2 border-transparent hover:border-green-300 hover:bg-green-50'
              }`}
            >
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <Clock className={`w-5 h-5 ${selectedDraw?.id === draw.id ? 'text-green-600' : 'text-gray-500'}`} />
                  <div>
                    <p className="font-bold text-lg text-gray-900">{formatDrawTime(draw)}</p>
                    <p className="text-sm text-gray-600">{draw.game?.name}</p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                  Activo
                </span>
              </div>
            </button>
          ))
        )}
      </div>

      {/* Mobile Modal */}
      {isOpen && (
        <div className="lg:hidden fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white w-full max-w-md rounded-2xl max-h-[80vh] overflow-y-auto">
            <div className="sticky top-0 bg-white border-b p-4 flex items-center justify-between">
              <h3 className="font-bold text-lg">Seleccionar Sorteo</h3>
              <button onClick={onToggle} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-2">
              {availableDraws.length === 0 ? (
                <p className="text-center text-gray-500 py-8">No hay sorteos disponibles</p>
              ) : (
                availableDraws.map(draw => (
                  <button
                    key={draw.id}
                    onClick={() => {
                      onSelectDraw(draw);
                      onToggle();
                    }}
                    className={`w-full p-4 rounded-lg text-left transition-all ${
                      selectedDraw?.id === draw.id
                        ? 'bg-blue-100 border-2 border-blue-500'
                        : 'bg-gray-50 border-2 border-transparent hover:border-blue-300'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-bold text-lg">{formatDrawTime(draw)}</p>
                        <p className="text-sm text-gray-600">{draw.game?.name}</p>
                      </div>
                      <span className="px-3 py-1 bg-green-100 text-green-700 text-xs font-semibold rounded-full">
                        Activo
                      </span>
                    </div>
                  </button>
                ))
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

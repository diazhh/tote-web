import { X, Ticket, Hash, DollarSign } from 'lucide-react';

export default function SelectedItems({ selections, onRemove }) {
  const groupedByDraw = {};
  selections.forEach(s => {
    const key = `${s.gameName}-${s.drawTime}`;
    if (!groupedByDraw[key]) {
      groupedByDraw[key] = {
        gameName: s.gameName,
        drawTime: s.drawTime,
        items: []
      };
    }
    groupedByDraw[key].items.push(s);
  });

  const formatDrawTime = (drawTime) => {
    try {
      if (!drawTime) return 'Hora no disponible';
      const date = new Date(drawTime);
      if (isNaN(date.getTime())) return 'Hora no disponible';
      
      const hours = date.getHours();
      const minutes = date.getMinutes();
      const ampm = hours >= 12 ? 'PM' : 'AM';
      const displayHours = hours % 12 || 12;
      const displayMinutes = minutes.toString().padStart(2, '0');
      
      return `${displayHours}:${displayMinutes} ${ampm}`;
    } catch (e) {
      return 'Hora no disponible';
    }
  };

  const getTotalAmount = () => {
    return selections.reduce((sum, s) => sum + s.amount, 0);
  };

  if (selections.length === 0) {
    return null;
  }

  return (
    <div className="bg-white rounded-lg lg:rounded-xl border-2 border-gray-200 overflow-hidden shadow-sm">
      <div className="bg-gray-50 px-4 lg:px-5 py-3 lg:py-4 border-b">
        <div className="flex items-center justify-between">
          <p className="text-sm lg:text-base font-bold text-gray-900">Números Seleccionados</p>
          <span className="px-2 lg:px-3 py-1 lg:py-1.5 bg-blue-100 text-blue-700 text-xs lg:text-sm font-bold rounded-lg">
            {selections.length}
          </span>
        </div>
      </div>

      <div className="divide-y max-h-[400px] lg:max-h-[500px] overflow-y-auto">
        {Object.entries(groupedByDraw).map(([key, group]) => (
          <div key={key} className="p-3 lg:p-4">
            <p className="text-xs lg:text-sm font-semibold text-gray-600 mb-2">
              {group.gameName} • {formatDrawTime(group.drawTime)}
            </p>
            <div className="space-y-1 lg:space-y-2">
              {group.items.map(item => (
                <div
                  key={`${item.drawId}-${item.itemId}`}
                  className="flex items-center justify-between bg-gray-50 hover:bg-gray-100 rounded-lg px-3 lg:px-4 py-2 lg:py-3 transition-colors"
                >
                  <div className="flex items-center gap-3 lg:gap-4">
                    <div className="flex items-center gap-1 text-blue-700">
                      <Hash className="w-4 h-4 lg:w-5 lg:h-5" />
                      <span className="font-bold text-lg lg:text-xl">{item.itemNumber}</span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-600">
                      <DollarSign className="w-4 h-4 lg:w-5 lg:h-5" />
                      <span className="font-semibold text-sm lg:text-base">{item.amount.toFixed(2)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => onRemove(item.drawId, item.itemId)}
                    className="p-1 lg:p-2 text-red-500 hover:text-red-700 hover:bg-red-50 rounded-lg transition-colors"
                  >
                    <X className="w-4 h-4 lg:w-5 lg:h-5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 px-4 lg:px-5 py-3 lg:py-4 border-t-2 border-blue-200">
        <div className="flex items-center justify-between">
          <span className="text-sm lg:text-base font-semibold text-gray-700">Total:</span>
          <span className="text-xl lg:text-2xl font-bold text-blue-700">Bs. {getTotalAmount().toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

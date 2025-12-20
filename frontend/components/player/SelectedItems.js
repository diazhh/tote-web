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
    <div className="bg-white rounded-lg border-2 border-gray-200 overflow-hidden">
      <div className="bg-gray-50 px-4 py-3 border-b">
        <div className="flex items-center justify-between">
          <p className="text-sm font-bold text-gray-900">Números Seleccionados</p>
          <span className="px-2 py-1 bg-blue-100 text-blue-700 text-xs font-bold rounded">
            {selections.length}
          </span>
        </div>
      </div>

      <div className="divide-y">
        {Object.entries(groupedByDraw).map(([key, group]) => (
          <div key={key} className="p-3">
            <p className="text-xs font-semibold text-gray-600 mb-2">
              {group.gameName} • {formatDrawTime(group.drawTime)}
            </p>
            <div className="space-y-1">
              {group.items.map(item => (
                <div
                  key={`${item.drawId}-${item.itemId}`}
                  className="flex items-center justify-between bg-gray-50 rounded px-3 py-2"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex items-center gap-1 text-blue-700">
                      <Hash className="w-4 h-4" />
                      <span className="font-bold text-lg">{item.itemNumber}</span>
                    </div>
                    <div className="flex items-center gap-1 text-gray-600">
                      <DollarSign className="w-4 h-4" />
                      <span className="font-semibold">{item.amount.toFixed(2)}</span>
                    </div>
                  </div>
                  <button
                    onClick={() => onRemove(item.drawId, item.itemId)}
                    className="p-1 text-red-500 hover:text-red-700 hover:bg-red-50 rounded"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="bg-blue-50 px-4 py-3 border-t-2 border-blue-200">
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-gray-700">Total:</span>
          <span className="text-xl font-bold text-blue-700">Bs. {getTotalAmount().toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}

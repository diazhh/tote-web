import { Delete, Check } from 'lucide-react';

export default function NumberPad({ inputValue, onInput, onDelete, onEnter, disabled, maxDigits = 2 }) {
  const keys = ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'DEL', '0', 'OK'];

  const handleKey = (key) => {
    if (disabled) return;
    
    if (key === 'DEL') {
      onDelete();
    } else if (key === 'OK') {
      onEnter();
    } else {
      onInput(key);
    }
  };

  return (
    <div className="space-y-3">
      <div className="bg-gray-100 rounded-lg p-4 text-center">
        <p className="text-4xl font-bold text-gray-900 tracking-widest min-h-[48px]">
          {inputValue || (maxDigits === 3 ? '---' : '--')}
        </p>
        <p className="text-xs text-gray-500 mt-1">
          Ingresa un número ({maxDigits === 3 ? '000-999' : '00-99'})
        </p>
      </div>
      
      <div className="grid grid-cols-3 gap-2">
        {keys.map(key => (
          <button
            key={key}
            onClick={() => handleKey(key)}
            disabled={disabled}
            className={`aspect-[2/1] rounded-xl font-bold text-xl flex items-center justify-center transition-all active:scale-95 ${
              key === 'OK'
                ? 'bg-green-500 text-white hover:bg-green-600'
                : key === 'DEL'
                ? 'bg-red-100 text-red-600 hover:bg-red-200'
                : 'bg-white border-2 border-gray-200 text-gray-900 hover:border-blue-300 hover:bg-blue-50'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {key === 'DEL' ? <Delete className="w-6 h-6" /> : key === 'OK' ? <Check className="w-6 h-6" /> : key}
          </button>
        ))}
      </div>
    </div>
  );
}

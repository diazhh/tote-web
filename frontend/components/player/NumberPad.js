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
    <div className="space-y-3 lg:space-y-4">
      <div className="bg-gradient-to-br from-gray-100 to-gray-200 rounded-xl lg:rounded-2xl p-4 lg:p-6 text-center border-2 border-gray-300">
        <p className="text-4xl lg:text-5xl font-bold text-gray-900 tracking-widest min-h-[48px] lg:min-h-[60px]">
          {inputValue || (maxDigits === 3 ? '---' : '--')}
        </p>
        <p className="text-xs lg:text-sm text-gray-600 mt-2 font-medium">
          {maxDigits === 3 ? '000-999' : '00-99'}
        </p>
      </div>
      
      <div className="grid grid-cols-3 gap-2 lg:gap-3">
        {keys.map(key => (
          <button
            key={key}
            onClick={() => handleKey(key)}
            disabled={disabled}
            className={`aspect-[2/1] lg:aspect-[3/2] rounded-xl lg:rounded-2xl font-bold text-xl lg:text-2xl flex items-center justify-center transition-all active:scale-95 shadow-sm hover:shadow-md ${
              key === 'OK'
                ? 'bg-green-500 text-white hover:bg-green-600'
                : key === 'DEL'
                ? 'bg-red-100 text-red-600 hover:bg-red-200'
                : 'bg-white border-2 border-gray-200 text-gray-900 hover:border-blue-400 hover:bg-blue-50'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
          >
            {key === 'DEL' ? <Delete className="w-6 h-6 lg:w-7 lg:h-7" /> : key === 'OK' ? <Check className="w-6 h-6 lg:w-7 lg:h-7" /> : key}
          </button>
        ))}
      </div>
    </div>
  );
}

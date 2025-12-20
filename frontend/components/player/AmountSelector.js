import { useState } from 'react';
import { X, DollarSign } from 'lucide-react';

export default function AmountSelector({ amount, onChangeAmount }) {
  const [showCustomModal, setShowCustomModal] = useState(false);
  const [customInput, setCustomInput] = useState('');
  const amounts = [0.5, 1, 2, 5, 10, 20];

  const handleCustomAmount = () => {
    const value = parseFloat(customInput);
    if (isNaN(value) || value <= 0) {
      return;
    }
    onChangeAmount(value);
    setShowCustomModal(false);
    setCustomInput('');
  };

  const handleCustomInput = (digit) => {
    if (customInput.length < 6) {
      setCustomInput(prev => prev + digit);
    }
  };

  const handleCustomDelete = () => {
    setCustomInput(prev => prev.slice(0, -1));
  };

  const isCustomAmount = !amounts.includes(amount);

  return (
    <>
      <div className="space-y-2">
        <p className="text-sm font-semibold text-gray-700">Monto por número:</p>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {amounts.map(value => (
            <button
              key={value}
              onClick={() => onChangeAmount(value)}
              className={`flex-shrink-0 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
                amount === value
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
              }`}
            >
              Bs. {value.toFixed(2)}
            </button>
          ))}
          <button
            onClick={() => setShowCustomModal(true)}
            className={`flex-shrink-0 px-4 py-2 rounded-lg font-semibold text-sm transition-all ${
              isCustomAmount
                ? 'bg-blue-600 text-white'
                : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
            }`}
          >
            {isCustomAmount ? `Bs. ${amount.toFixed(2)}` : 'Otro'}
          </button>
        </div>
      </div>

      {showCustomModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-sm">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-bold text-lg">Monto Personalizado</h3>
              <button onClick={() => setShowCustomModal(false)} className="p-2 hover:bg-gray-100 rounded-lg">
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="bg-gray-100 rounded-lg p-4 text-center mb-4">
              <p className="text-3xl font-bold text-gray-900">Bs. {customInput || '0.00'}</p>
            </div>

            <div className="grid grid-cols-3 gap-2 mb-4">
              {['1', '2', '3', '4', '5', '6', '7', '8', '9', 'DEL', '0', '.'].map(key => (
                <button
                  key={key}
                  onClick={() => {
                    if (key === 'DEL') handleCustomDelete();
                    else if (key === '.') {
                      if (!customInput.includes('.')) handleCustomInput(key);
                    } else handleCustomInput(key);
                  }}
                  className={`aspect-square rounded-lg font-bold text-xl flex items-center justify-center transition-all ${
                    key === 'DEL'
                      ? 'bg-red-100 text-red-600 hover:bg-red-200'
                      : 'bg-gray-200 text-gray-900 hover:bg-gray-300'
                  }`}
                >
                  {key}
                </button>
              ))}
            </div>

            <button
              onClick={handleCustomAmount}
              disabled={!customInput || parseFloat(customInput) <= 0}
              className="w-full py-3 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed"
            >
              Confirmar
            </button>
          </div>
        </div>
      )}
    </>
  );
}

'use client';
import { useState } from 'react';

export default function BonusModal({ player, onClose, onSubmit, loading }) {
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const handleSubmit = () => {
    if (!amount || parseFloat(amount) <= 0) return;
    onSubmit({ amount: parseFloat(amount), reason });
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4">
        <div className="p-6">
          <h3 className="text-lg font-semibold mb-1">Dar Bono</h3>
          <p className="text-sm text-gray-600 mb-4">Jugador: <strong>{player.username}</strong></p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Monto (Bs)</label>
              <input
                type="number"
                min="0.01"
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500"
                placeholder="0.00"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Razón (opcional)</label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-purple-500"
                placeholder="Motivo del bono..."
              />
            </div>
            <p className="text-xs text-gray-500">El bono solo puede ser usado para apostar. Las ganancias sí son retirables.</p>
          </div>
        </div>
        <div className="px-6 py-4 bg-gray-50 rounded-b-lg flex justify-end gap-3">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 border rounded-lg hover:bg-gray-100">Cancelar</button>
          <button onClick={handleSubmit} disabled={loading || !amount || parseFloat(amount) <= 0} className="px-4 py-2 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50">
            {loading ? 'Procesando...' : 'Dar Bono'}
          </button>
        </div>
      </div>
    </div>
  );
}

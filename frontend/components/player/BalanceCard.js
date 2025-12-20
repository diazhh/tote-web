'use client';

import { useState } from 'react';
import { Wallet, RefreshCw, TrendingUp, Lock } from 'lucide-react';

export default function BalanceCard({ balance, onRefresh }) {
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = async () => {
    setRefreshing(true);
    await onRefresh();
    setRefreshing(false);
  };

  if (!balance) {
    return (
      <div className="bg-white rounded-xl shadow-sm border p-6 animate-pulse">
        <div className="h-8 bg-gray-200 rounded w-1/3 mb-4"></div>
        <div className="h-12 bg-gray-200 rounded w-1/2"></div>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-xl shadow-lg p-6 text-white">
      <div className="flex justify-between items-start mb-6">
        <div className="flex items-center gap-3">
          <div className="bg-white/20 p-3 rounded-lg">
            <Wallet className="w-6 h-6" />
          </div>
          <div>
            <h2 className="text-lg font-semibold">Balance Total</h2>
            <p className="text-blue-100 text-sm">Tu saldo disponible</p>
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={refreshing}
          className="bg-white/20 hover:bg-white/30 p-2 rounded-lg transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-5 h-5 ${refreshing ? 'animate-spin' : ''}`} />
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <p className="text-blue-100 text-sm mb-1">Balance Total</p>
          <p className="text-4xl font-bold">
            Bs. {balance.balance.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
          </p>
        </div>

        <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/20">
          <div className="bg-white/10 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-4 h-4 text-green-300" />
              <p className="text-sm text-blue-100">Disponible</p>
            </div>
            <p className="text-2xl font-semibold">
              Bs. {balance.availableBalance.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>

          <div className="bg-white/10 rounded-lg p-4">
            <div className="flex items-center gap-2 mb-2">
              <Lock className="w-4 h-4 text-yellow-300" />
              <p className="text-sm text-blue-100">Bloqueado</p>
            </div>
            <p className="text-2xl font-semibold">
              Bs. {balance.blockedBalance.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </p>
          </div>
        </div>
      </div>

      <div className="mt-6 flex gap-3">
        <button 
          onClick={() => window.location.href = '/depositos'}
          className="flex-1 bg-white text-blue-600 font-semibold py-3 rounded-lg hover:bg-blue-50 transition-colors"
        >
          Depositar
        </button>
        <button 
          onClick={() => window.location.href = '/retiros'}
          className="flex-1 bg-white/20 hover:bg-white/30 font-semibold py-3 rounded-lg transition-colors"
        >
          Retirar
        </button>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, TrendingUp, TrendingDown, DollarSign, Calendar, Hash, Trophy, CreditCard } from 'lucide-react';
import { toast } from 'sonner';
import api from '@/lib/api/axios';

export default function BalanceHistoricoPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [transactions, setTransactions] = useState([]);
  const [currentBalance, setCurrentBalance] = useState(0);
  const [user, setUser] = useState(null);

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/login');
      return;
    }
    
    const userObj = JSON.parse(userData);
    if (userObj.role === 'ADMIN' || userObj.role === 'OPERATOR') {
      router.push('/admin');
      return;
    }
    
    setUser(userObj);
    loadTransactions();
  }, [router]);

  const loadTransactions = async () => {
    try {
      setLoading(true);
      const response = await api.get('/api/player/balance-history');
      
      if (response.data.success) {
        setTransactions(response.data.data.transactions || []);
        setCurrentBalance(parseFloat(response.data.data.currentBalance || 0));
      }
    } catch (error) {
      console.error('Error loading transactions:', error);
      toast.error('Error al cargar el historial');
    } finally {
      setLoading(false);
    }
  };

  const getTransactionIcon = (type) => {
    switch (type) {
      case 'DEPOSIT':
        return <TrendingUp className="w-5 h-5 text-green-600" />;
      case 'TICKET':
        return <TrendingDown className="w-5 h-5 text-red-600" />;
      case 'PRIZE':
        return <Trophy className="w-5 h-5 text-yellow-600" />;
      case 'WITHDRAWAL':
        return <CreditCard className="w-5 h-5 text-blue-600" />;
      default:
        return <DollarSign className="w-5 h-5 text-gray-600" />;
    }
  };

  const getTransactionLabel = (type) => {
    const labels = {
      DEPOSIT: 'Depósito',
      TICKET: 'Jugada',
      PRIZE: 'Premio',
      WITHDRAWAL: 'Retiro'
    };
    return labels[type] || type;
  };

  const getTransactionColor = (type) => {
    switch (type) {
      case 'DEPOSIT':
      case 'PRIZE':
        return 'text-green-600';
      case 'TICKET':
      case 'WITHDRAWAL':
        return 'text-red-600';
      default:
        return 'text-gray-600';
    }
  };

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

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando historial...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-6 h-6" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Balance e Histórico</h1>
              <p className="text-sm text-gray-600">Movimientos de tu cuenta</p>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Current Balance Card */}
        <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-xl shadow-lg p-8 mb-8 text-white">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-blue-100 text-sm mb-2">Balance Actual</p>
              <p className="text-5xl font-bold">
                Bs. {currentBalance.toLocaleString('es-VE', {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2
                })}
              </p>
            </div>
            <DollarSign className="w-16 h-16 text-blue-300" />
          </div>
        </div>

        {/* Transactions List */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <h2 className="text-xl font-bold text-gray-900 mb-6">Historial de Movimientos</h2>
          
          {transactions.length === 0 ? (
            <div className="text-center py-12">
              <DollarSign className="w-16 h-16 text-gray-300 mx-auto mb-4" />
              <p className="text-gray-500">No hay movimientos todavía</p>
            </div>
          ) : (
            <div className="space-y-3">
              {transactions.map((transaction, index) => (
                <div
                  key={transaction.id || index}
                  className="border rounded-lg p-4 hover:shadow-md transition-shadow"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className="bg-gray-100 p-3 rounded-lg flex-shrink-0">
                        {getTransactionIcon(transaction.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2 mb-1">
                          <p className="font-semibold text-gray-900">
                            {getTransactionLabel(transaction.type)}
                          </p>
                          {transaction.reference && (
                            <span className="text-xs text-gray-500 flex items-center gap-1 break-all">
                              <Hash className="w-3 h-3 flex-shrink-0" />
                              <span className="break-all">{transaction.reference}</span>
                            </span>
                          )}
                        </div>
                        <div className="flex items-center gap-2 text-sm text-gray-500 mb-1">
                          <Calendar className="w-4 h-4 flex-shrink-0" />
                          <span className="truncate">{formatDateTime(transaction.createdAt)}</span>
                        </div>
                        {transaction.description && (
                          <p className="text-sm text-gray-600 mt-1 break-words">{transaction.description}</p>
                        )}
                      </div>
                    </div>
                    <div className="text-right sm:text-right flex-shrink-0 sm:ml-4 pl-0 sm:pl-4 border-t sm:border-t-0 sm:border-l pt-3 sm:pt-0">
                      <p className={`text-xl sm:text-2xl font-bold ${getTransactionColor(transaction.type)} whitespace-nowrap`}>
                        {transaction.type === 'DEPOSIT' || transaction.type === 'PRIZE' ? '+' : '-'}
                        Bs. {parseFloat(transaction.amount || 0).toLocaleString('es-VE', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </p>
                      <p className="text-xs sm:text-sm text-gray-500 mt-1 whitespace-nowrap">
                        Balance: Bs. {parseFloat(transaction.balance || 0).toLocaleString('es-VE', {
                          minimumFractionDigits: 2,
                          maximumFractionDigits: 2
                        })}
                      </p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

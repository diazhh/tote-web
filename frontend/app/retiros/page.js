'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import withdrawalsApi from '@/lib/api/withdrawals';
import pagoMovilApi from '@/lib/api/pago-movil';
import playerApi from '@/lib/api/player';
import { toast } from 'sonner';
import { ArrowLeft, Wallet, Phone, CreditCard, Hash, Clock, CheckCircle, XCircle, AlertCircle, Plus } from 'lucide-react';

export default function RetirosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [myAccounts, setMyAccounts] = useState([]);
  const [myWithdrawals, setMyWithdrawals] = useState([]);
  const [balance, setBalance] = useState(null);
  const [selectedAccount, setSelectedAccount] = useState(null);
  
  const [formData, setFormData] = useState({
    amount: ''
  });

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/login');
      return;
    }
    loadData();
  }, [router]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [accountsRes, withdrawalsRes, balanceRes] = await Promise.all([
        pagoMovilApi.getMyAccounts(),
        withdrawalsApi.getMyWithdrawals({ limit: 10 }),
        playerApi.getBalance()
      ]);

      if (accountsRes.success) {
        setMyAccounts(accountsRes.data);
        const defaultAccount = accountsRes.data.find(acc => acc.isDefault);
        setSelectedAccount(defaultAccount || accountsRes.data[0]);
      }

      if (withdrawalsRes.success) {
        setMyWithdrawals(withdrawalsRes.data);
      }

      if (balanceRes.success) {
        setBalance(balanceRes.data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    
    if (!selectedAccount) {
      toast.error('Debes tener una cuenta Pago Móvil registrada');
      return;
    }

    const amount = parseFloat(formData.amount);
    if (!amount || amount <= 0) {
      toast.error('Ingresa un monto válido');
      return;
    }

    if (amount > balance.availableBalance) {
      toast.error('Saldo insuficiente');
      return;
    }

    try {
      setSubmitting(true);
      const response = await withdrawalsApi.createWithdrawal({
        pagoMovilAccountId: selectedAccount.id,
        amount
      });

      if (response.success) {
        toast.success('Retiro solicitado exitosamente');
        setFormData({ amount: '' });
        loadData();
      }
    } catch (error) {
      console.error('Error creating withdrawal:', error);
      toast.error(error.response?.data?.error || 'Error al solicitar retiro');
    } finally {
      setSubmitting(false);
    }
  };

  const handleCancelWithdrawal = async (id) => {
    if (!confirm('¿Estás seguro de cancelar este retiro?')) return;

    try {
      const response = await withdrawalsApi.cancelWithdrawal(id);
      if (response.success) {
        toast.success('Retiro cancelado');
        loadData();
      }
    } catch (error) {
      console.error('Error canceling withdrawal:', error);
      toast.error(error.response?.data?.error || 'Error al cancelar retiro');
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      PENDING: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Clock, label: 'Pendiente' },
      PROCESSING: { bg: 'bg-blue-100', text: 'text-blue-700', icon: Clock, label: 'Procesando' },
      COMPLETED: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle, label: 'Completado' },
      REJECTED: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle, label: 'Rechazado' },
      CANCELLED: { bg: 'bg-gray-100', text: 'text-gray-700', icon: XCircle, label: 'Cancelado' }
    };
    const style = styles[status] || styles.PENDING;
    const Icon = style.icon;

    return (
      <span className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-xs font-semibold ${style.bg} ${style.text}`}>
        <Icon className="w-3 h-3" />
        {style.label}
      </span>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando...</p>
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
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Retiros</h1>
              <p className="text-sm text-gray-600">Solicita un retiro a tu cuenta</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form Section */}
          <div className="space-y-6">
            {/* Balance Card */}
            <div className="bg-gradient-to-br from-green-600 to-green-700 rounded-xl shadow-lg p-6 text-white">
              <div className="flex items-center gap-3 mb-4">
                <div className="bg-white/20 p-3 rounded-lg">
                  <Wallet className="w-6 h-6" />
                </div>
                <div>
                  <p className="text-green-100 text-sm">Saldo Disponible</p>
                  <p className="text-3xl font-bold">
                    Bs. {balance?.availableBalance.toLocaleString('es-VE', {
                      minimumFractionDigits: 2,
                      maximumFractionDigits: 2
                    })}
                  </p>
                </div>
              </div>
            </div>

            {/* Withdrawal Form */}
            <div className="bg-white rounded-xl shadow-sm border p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-6">Solicitar Retiro</h2>

              {myAccounts.length === 0 ? (
                <div className="text-center py-8">
                  <CreditCard className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                  <p className="text-gray-600 mb-4">No tienes cuentas Pago Móvil registradas</p>
                  <button
                    onClick={() => router.push('/cuentas')}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
                  >
                    <Plus className="w-4 h-4" />
                    Agregar Cuenta
                  </button>
                </div>
              ) : (
                <>
                  {/* Account Selection */}
                  <div className="mb-6">
                    <label className="block text-sm font-medium text-gray-700 mb-3">
                      Cuenta Destino
                    </label>
                    <div className="space-y-3">
                      {myAccounts.map((account) => (
                        <div
                          key={account.id}
                          onClick={() => setSelectedAccount(account)}
                          className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                            selectedAccount?.id === account.id
                              ? 'border-green-600 bg-green-50'
                              : 'border-gray-200 hover:border-gray-300'
                          }`}
                        >
                          <div className="flex items-start justify-between">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <p className="font-semibold text-gray-900">{account.bank}</p>
                                {account.isDefault && (
                                  <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                                    Predeterminada
                                  </span>
                                )}
                              </div>
                              <div className="space-y-1 text-sm text-gray-600">
                                <div className="flex items-center gap-2">
                                  <Phone className="w-4 h-4" />
                                  <span>{account.phone}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                  <CreditCard className="w-4 h-4" />
                                  <span>V-{account.idNumber}</span>
                                </div>
                              </div>
                            </div>
                            {selectedAccount?.id === account.id && (
                              <CheckCircle className="w-5 h-5 text-green-600" />
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>

                  {/* Amount Form */}
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-2">
                        Monto a Retirar (Bs.)
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        value={formData.amount}
                        onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                        className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-green-500 focus:border-transparent"
                        placeholder="0.00"
                        max={balance?.availableBalance}
                        required
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Máximo: Bs. {balance?.availableBalance.toFixed(2)}
                      </p>
                    </div>

                    <button
                      type="submit"
                      disabled={submitting || !selectedAccount || !balance || balance.availableBalance <= 0}
                      className="w-full bg-green-600 text-white font-semibold py-3 rounded-lg hover:bg-green-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {submitting ? 'Procesando...' : 'Solicitar Retiro'}
                    </button>
                  </form>

                  <div className="mt-6 p-4 bg-yellow-50 rounded-lg">
                    <div className="flex gap-2">
                      <AlertCircle className="w-5 h-5 text-yellow-600 flex-shrink-0 mt-0.5" />
                      <div className="text-sm text-yellow-800">
                        <p className="font-semibold mb-1">Importante:</p>
                        <ul className="list-disc list-inside space-y-1">
                          <li>El saldo será bloqueado hasta que se procese el retiro</li>
                          <li>Puedes cancelar el retiro mientras esté pendiente</li>
                          <li>Los retiros son procesados por un administrador</li>
                        </ul>
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Withdrawals History */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Mis Retiros</h2>
            
            {myWithdrawals.length === 0 ? (
              <div className="text-center py-12">
                <Wallet className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No tienes retiros registrados</p>
              </div>
            ) : (
              <div className="space-y-4">
                {myWithdrawals.map((withdrawal) => (
                  <div key={withdrawal.id} className="border rounded-lg p-4">
                    <div className="flex justify-between items-start mb-3">
                      <div>
                        <p className="font-semibold text-gray-900">
                          Bs. {parseFloat(withdrawal.amount).toLocaleString('es-VE', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </p>
                        {withdrawal.reference && (
                          <div className="flex items-center gap-2 mt-1 text-sm text-gray-500">
                            <Hash className="w-4 h-4" />
                            <span>{withdrawal.reference}</span>
                          </div>
                        )}
                      </div>
                      {getStatusBadge(withdrawal.status)}
                    </div>

                    <div className="text-sm text-gray-600 space-y-1">
                      <p>{withdrawal.pagoMovilAccount.bank}</p>
                      <p>{withdrawal.pagoMovilAccount.phone}</p>
                      <p className="text-xs text-gray-500">
                        {new Date(withdrawal.createdAt).toLocaleDateString('es-VE', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                      {withdrawal.notes && (
                        <p className="text-xs text-gray-500 mt-2 italic">{withdrawal.notes}</p>
                      )}
                    </div>

                    {withdrawal.status === 'PENDING' && (
                      <button
                        onClick={() => handleCancelWithdrawal(withdrawal.id)}
                        className="mt-3 w-full text-sm text-red-600 hover:text-red-700 font-medium"
                      >
                        Cancelar Retiro
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

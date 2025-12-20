'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import depositsApi from '@/lib/api/deposits';
import pagoMovilApi from '@/lib/api/pago-movil';
import { toast } from 'sonner';
import { ArrowLeft, Building2, Phone, CreditCard, Hash, Clock, CheckCircle, XCircle, AlertCircle } from 'lucide-react';

export default function DepositosPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [systemAccounts, setSystemAccounts] = useState([]);
  const [myDeposits, setMyDeposits] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  
  const [formData, setFormData] = useState({
    amount: '',
    reference: '',
    phone: '',
    bankCode: ''
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
      const [accountsRes, depositsRes] = await Promise.all([
        pagoMovilApi.getSystemAccounts(),
        depositsApi.getMyDeposits({ limit: 10 })
      ]);

      if (accountsRes.success) {
        setSystemAccounts(accountsRes.data);
        if (accountsRes.data.length > 0) {
          setSelectedAccount(accountsRes.data[0]);
        }
      }

      if (depositsRes.success) {
        setMyDeposits(depositsRes.data);
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
      toast.error('Selecciona una cuenta destino');
      return;
    }

    if (!formData.amount || parseFloat(formData.amount) <= 0) {
      toast.error('Ingresa un monto válido');
      return;
    }

    if (!formData.reference || formData.reference.length < 6) {
      toast.error('Ingresa una referencia válida (mínimo 6 dígitos)');
      return;
    }

    if (!formData.phone || formData.phone.length < 11) {
      toast.error('Ingresa un teléfono válido');
      return;
    }

    if (!formData.bankCode) {
      toast.error('Selecciona tu banco');
      return;
    }

    try {
      setSubmitting(true);
      const response = await depositsApi.createDeposit({
        systemPagoMovilId: selectedAccount.id,
        amount: parseFloat(formData.amount),
        reference: formData.reference,
        phone: formData.phone,
        bankCode: formData.bankCode
      });

      if (response.success) {
        toast.success('Depósito registrado exitosamente');
        setFormData({ amount: '', reference: '', phone: '', bankCode: '' });
        loadData();
      }
    } catch (error) {
      console.error('Error creating deposit:', error);
      toast.error(error.response?.data?.error || 'Error al registrar depósito');
    } finally {
      setSubmitting(false);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      PENDING: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Clock, label: 'Pendiente' },
      APPROVED: { bg: 'bg-green-100', text: 'text-green-700', icon: CheckCircle, label: 'Aprobado' },
      REJECTED: { bg: 'bg-red-100', text: 'text-red-700', icon: XCircle, label: 'Rechazado' }
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

  const banks = [
    { code: '0102', name: 'Banco de Venezuela' },
    { code: '0104', name: 'Banco Venezolano de Crédito' },
    { code: '0105', name: 'Banco Mercantil' },
    { code: '0108', name: 'Banco Provincial' },
    { code: '0114', name: 'Bancaribe' },
    { code: '0115', name: 'Banco Exterior' },
    { code: '0128', name: 'Banco Caroní' },
    { code: '0134', name: 'Banesco' },
    { code: '0151', name: 'Banco Fondo Común (BFC)' },
    { code: '0163', name: 'Banco del Tesoro' },
    { code: '0166', name: 'Banco Agrícola de Venezuela' },
    { code: '0168', name: 'Bancrecer' },
    { code: '0169', name: 'Mi Banco' },
    { code: '0171', name: 'Banco Activo' },
    { code: '0172', name: 'Bancamiga' },
    { code: '0173', name: 'Banco Internacional de Desarrollo' },
    { code: '0174', name: 'Banplus' },
    { code: '0175', name: 'Banco Bicentenario' },
    { code: '0177', name: 'Banco de la Fuerza Armada Nacional Bolivariana' },
    { code: '0191', name: 'Banco Nacional de Crédito (BNC)' }
  ];

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
              <h1 className="text-2xl font-bold text-gray-900">Depósitos</h1>
              <p className="text-sm text-gray-600">Realiza un depósito a tu cuenta</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Form Section */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Nuevo Depósito</h2>

            {/* System Accounts Selection */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Cuenta Destino
              </label>
              <div className="space-y-3">
                {systemAccounts.map((account) => (
                  <div
                    key={account.id}
                    onClick={() => setSelectedAccount(account)}
                    className={`border-2 rounded-lg p-4 cursor-pointer transition-all ${
                      selectedAccount?.id === account.id
                        ? 'border-blue-600 bg-blue-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-2">
                          <Building2 className="w-4 h-4 text-gray-600" />
                          <p className="font-semibold text-gray-900">{account.bankName}</p>
                        </div>
                        <div className="space-y-1 text-sm text-gray-600">
                          <div className="flex items-center gap-2">
                            <Phone className="w-4 h-4" />
                            <span>{account.phone}</span>
                          </div>
                          <div className="flex items-center gap-2">
                            <CreditCard className="w-4 h-4" />
                            <span>V-{account.cedula}</span>
                          </div>
                          <p className="text-xs text-gray-500 mt-1">{account.holderName}</p>
                        </div>
                      </div>
                      {selectedAccount?.id === account.id && (
                        <CheckCircle className="w-5 h-5 text-blue-600" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Deposit Form */}
            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Monto (Bs.)
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={formData.amount}
                  onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="0.00"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Referencia del Pago
                </label>
                <input
                  type="text"
                  value={formData.reference}
                  onChange={(e) => setFormData({ ...formData, reference: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="123456"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tu Teléfono
                </label>
                <input
                  type="tel"
                  value={formData.phone}
                  onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="04141234567"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Tu Banco
                </label>
                <select
                  value={formData.bankCode}
                  onChange={(e) => setFormData({ ...formData, bankCode: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Selecciona tu banco</option>
                  {banks.map((bank) => (
                    <option key={bank.code} value={bank.code}>
                      {bank.name}
                    </option>
                  ))}
                </select>
              </div>

              <button
                type="submit"
                disabled={submitting || !selectedAccount}
                className="w-full bg-blue-600 text-white font-semibold py-3 rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Registrando...' : 'Registrar Depósito'}
              </button>
            </form>

            <div className="mt-6 p-4 bg-blue-50 rounded-lg">
              <div className="flex gap-2">
                <AlertCircle className="w-5 h-5 text-blue-600 flex-shrink-0 mt-0.5" />
                <div className="text-sm text-blue-800">
                  <p className="font-semibold mb-1">Importante:</p>
                  <ul className="list-disc list-inside space-y-1">
                    <li>Realiza el pago móvil a la cuenta seleccionada</li>
                    <li>Ingresa la referencia exacta del pago</li>
                    <li>Tu depósito será verificado y aprobado por un administrador</li>
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Deposits History */}
          <div className="bg-white rounded-xl shadow-sm border p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-6">Mis Depósitos</h2>
            
            {myDeposits.length === 0 ? (
              <div className="text-center py-12">
                <CreditCard className="w-16 h-16 text-gray-300 mx-auto mb-4" />
                <p className="text-gray-500">No tienes depósitos registrados</p>
              </div>
            ) : (
              <div className="space-y-4">
                {myDeposits.map((deposit) => (
                  <div key={deposit.id} className="border rounded-lg p-4 hover:shadow-md transition-shadow">
                    <div className="flex justify-between items-start gap-4 mb-3">
                      <div className="flex-1 min-w-0">
                        <p className="font-bold text-xl text-gray-900 mb-2">
                          Bs. {parseFloat(deposit.amount).toLocaleString('es-VE', {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2
                          })}
                        </p>
                        <div className="flex items-start gap-2 text-sm text-gray-600">
                          <Hash className="w-4 h-4 flex-shrink-0 mt-0.5" />
                          <span className="break-all">{deposit.reference}</span>
                        </div>
                      </div>
                      <div className="flex-shrink-0">
                        {getStatusBadge(deposit.status)}
                      </div>
                    </div>

                    <div className="text-sm text-gray-600 space-y-1 pt-3 border-t">
                      <p className="font-medium">{deposit.systemPagoMovil.bankName}</p>
                      <p className="text-xs text-gray-500 flex items-center gap-1">
                        <Calendar className="w-3 h-3" />
                        {new Date(deposit.createdAt).toLocaleDateString('es-VE', {
                          day: '2-digit',
                          month: 'short',
                          year: 'numeric',
                          hour: '2-digit',
                          minute: '2-digit'
                        })}
                      </p>
                      {deposit.notes && (
                        <p className="text-xs text-gray-500 mt-2 p-2 bg-gray-50 rounded italic break-words">{deposit.notes}</p>
                      )}
                    </div>
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

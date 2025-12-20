'use client';

import { useEffect, useState } from 'react';
import withdrawalsApi from '@/lib/api/withdrawals';
import { toast } from 'sonner';
import { Search, Clock, CheckCircle, XCircle, DollarSign, User, Phone, CreditCard, AlertCircle } from 'lucide-react';

export default function AdminRetirosPage() {
  const [withdrawals, setWithdrawals] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [filters, setFilters] = useState({
    status: '',
    search: ''
  });

  useEffect(() => {
    loadWithdrawals();
  }, []);

  const loadWithdrawals = async () => {
    try {
      setLoading(true);
      const response = await withdrawalsApi.getAllWithdrawals({ limit: 100 });
      if (response.success) {
        setWithdrawals(response.data);
      }
    } catch (error) {
      console.error('Error loading withdrawals:', error);
      toast.error('Error al cargar retiros');
    } finally {
      setLoading(false);
    }
  };

  const handleProcess = async (id) => {
    if (!confirm('¿Marcar este retiro como procesando?')) return;

    try {
      setProcessing(id);
      const response = await withdrawalsApi.processWithdrawal(id);

      if (response.success) {
        toast.success('Retiro marcado como procesando');
        loadWithdrawals();
      }
    } catch (error) {
      console.error('Error processing withdrawal:', error);
      toast.error(error.response?.data?.error || 'Error al procesar retiro');
    } finally {
      setProcessing(null);
    }
  };

  const handleComplete = async (id) => {
    const reference = prompt('Ingresa la referencia del pago:');
    if (!reference) return;

    try {
      setProcessing(id);
      const response = await withdrawalsApi.completeWithdrawal(id, {
        reference,
        notes: 'Pago realizado exitosamente'
      });

      if (response.success) {
        toast.success('Retiro completado exitosamente');
        loadWithdrawals();
      }
    } catch (error) {
      console.error('Error completing withdrawal:', error);
      toast.error(error.response?.data?.error || 'Error al completar retiro');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id) => {
    const reason = prompt('Ingresa el motivo del rechazo:');
    if (!reason) return;

    try {
      setProcessing(id);
      const response = await withdrawalsApi.rejectWithdrawal(id, {
        notes: reason
      });

      if (response.success) {
        toast.success('Retiro rechazado');
        loadWithdrawals();
      }
    } catch (error) {
      console.error('Error rejecting withdrawal:', error);
      toast.error(error.response?.data?.error || 'Error al rechazar retiro');
    } finally {
      setProcessing(null);
    }
  };

  const getStatusBadge = (status) => {
    const styles = {
      PENDING: { bg: 'bg-yellow-100', text: 'text-yellow-700', icon: Clock, label: 'Pendiente' },
      PROCESSING: { bg: 'bg-blue-100', text: 'text-blue-700', icon: AlertCircle, label: 'Procesando' },
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

  const filteredWithdrawals = withdrawals.filter(withdrawal => {
    if (filters.status && withdrawal.status !== filters.status) return false;
    if (filters.search) {
      const search = filters.search.toLowerCase();
      return (
        withdrawal.user?.username?.toLowerCase().includes(search) ||
        withdrawal.pagoMovilAccount?.phone?.includes(search) ||
        withdrawal.pagoMovilAccount?.holderName?.toLowerCase().includes(search)
      );
    }
    return true;
  });

  const stats = {
    pending: withdrawals.filter(w => w.status === 'PENDING').length,
    processing: withdrawals.filter(w => w.status === 'PROCESSING').length,
    completed: withdrawals.filter(w => w.status === 'COMPLETED').length,
    rejected: withdrawals.filter(w => w.status === 'REJECTED').length,
    totalAmount: withdrawals
      .filter(w => w.status === 'COMPLETED')
      .reduce((sum, w) => sum + parseFloat(w.amount || 0), 0)
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando retiros...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gestión de Retiros</h1>
        <p className="text-gray-600">Administra las solicitudes de retiro de los jugadores</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-600 font-medium">Pendientes</p>
              <p className="text-2xl font-bold text-yellow-700">{stats.pending}</p>
            </div>
            <Clock className="w-8 h-8 text-yellow-600" />
          </div>
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">Procesando</p>
              <p className="text-2xl font-bold text-blue-700">{stats.processing}</p>
            </div>
            <AlertCircle className="w-8 h-8 text-blue-600" />
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Completados</p>
              <p className="text-2xl font-bold text-green-700">{stats.completed}</p>
            </div>
            <CheckCircle className="w-8 h-8 text-green-600" />
          </div>
        </div>

        <div className="bg-red-50 border border-red-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-red-600 font-medium">Rechazados</p>
              <p className="text-2xl font-bold text-red-700">{stats.rejected}</p>
            </div>
            <XCircle className="w-8 h-8 text-red-600" />
          </div>
        </div>

        <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-purple-600 font-medium">Total Pagado</p>
              <p className="text-2xl font-bold text-purple-700">
                Bs. {stats.totalAmount.toFixed(2)}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-purple-600" />
          </div>
        </div>
      </div>

      <div className="bg-white rounded-lg shadow-sm border">
        <div className="p-4 border-b">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-5 h-5 text-gray-400" />
              <input
                type="text"
                placeholder="Buscar por usuario, teléfono o titular..."
                value={filters.search}
                onChange={(e) => setFilters({ ...filters, search: e.target.value })}
                className="w-full pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <select
              value={filters.status}
              onChange={(e) => setFilters({ ...filters, status: e.target.value })}
              className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              <option value="">Todos los estados</option>
              <option value="PENDING">Pendientes</option>
              <option value="PROCESSING">Procesando</option>
              <option value="COMPLETED">Completados</option>
              <option value="REJECTED">Rechazados</option>
              <option value="CANCELLED">Cancelados</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Usuario
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Monto
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Cuenta Destino
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Fecha
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Estado
                </th>
                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-gray-200">
              {filteredWithdrawals.length === 0 ? (
                <tr>
                  <td colSpan="6" className="px-6 py-8 text-center text-gray-500">
                    No hay retiros para mostrar
                  </td>
                </tr>
              ) : (
                filteredWithdrawals.map((withdrawal) => (
                  <tr key={withdrawal.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="flex items-center">
                        <User className="w-4 h-4 text-gray-400 mr-2" />
                        <div>
                          <p className="text-sm font-medium text-gray-900">
                            {withdrawal.user?.username || 'N/A'}
                          </p>
                          <p className="text-xs text-gray-500">
                            {withdrawal.user?.email}
                          </p>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm font-semibold text-gray-900">
                        Bs. {parseFloat(withdrawal.amount || 0).toFixed(2)}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="space-y-1">
                        <div className="flex items-center">
                          <CreditCard className="w-4 h-4 text-gray-400 mr-1" />
                          <span className="text-sm text-gray-900">
                            {withdrawal.pagoMovilAccount?.bank || 'N/A'}
                          </span>
                        </div>
                        <div className="flex items-center">
                          <Phone className="w-4 h-4 text-gray-400 mr-1" />
                          <span className="text-sm text-gray-600">
                            {withdrawal.pagoMovilAccount?.phone || 'N/A'}
                          </span>
                        </div>
                        <p className="text-xs text-gray-500">
                          {withdrawal.pagoMovilAccount?.holderName || 'N/A'}
                        </p>
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className="text-sm text-gray-500">
                        {new Date(withdrawal.createdAt).toLocaleDateString('es-VE')}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {getStatusBadge(withdrawal.status)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm">
                      {withdrawal.status === 'PENDING' && (
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleProcess(withdrawal.id)}
                            disabled={processing === withdrawal.id}
                            className="px-3 py-1 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:bg-gray-300 transition-colors"
                          >
                            Procesar
                          </button>
                          <button
                            onClick={() => handleReject(withdrawal.id)}
                            disabled={processing === withdrawal.id}
                            className="px-3 py-1 bg-red-600 text-white rounded hover:bg-red-700 disabled:bg-gray-300 transition-colors"
                          >
                            Rechazar
                          </button>
                        </div>
                      )}
                      {withdrawal.status === 'PROCESSING' && (
                        <button
                          onClick={() => handleComplete(withdrawal.id)}
                          disabled={processing === withdrawal.id}
                          className="px-3 py-1 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-300 transition-colors"
                        >
                          Completar
                        </button>
                      )}
                      {(withdrawal.status === 'COMPLETED' || withdrawal.status === 'REJECTED') && withdrawal.notes && (
                        <p className="text-xs text-gray-500">{withdrawal.notes}</p>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

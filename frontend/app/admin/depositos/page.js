'use client';

import { useEffect, useState } from 'react';
import depositsApi from '@/lib/api/deposits';
import { toast } from 'sonner';
import { Search, Filter, CheckCircle, XCircle, Clock, DollarSign, User, Phone, Hash } from 'lucide-react';
import ResponsiveTable from '@/components/common/ResponsiveTable';

export default function AdminDepositosPage() {
  const [deposits, setDeposits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(null);
  const [filters, setFilters] = useState({
    status: '',
    search: ''
  });

  useEffect(() => {
    loadDeposits();
  }, []);

  const loadDeposits = async () => {
    try {
      setLoading(true);
      const response = await depositsApi.getAllDeposits({ limit: 100 });
      if (response.success) {
        setDeposits(response.data);
      }
    } catch (error) {
      console.error('Error loading deposits:', error);
      toast.error('Error al cargar depósitos');
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (id) => {
    if (!confirm('¿Aprobar este depósito?')) return;

    try {
      setProcessing(id);
      const response = await depositsApi.approveDeposit(id, {
        notes: 'Depósito verificado y aprobado'
      });

      if (response.success) {
        toast.success('Depósito aprobado exitosamente');
        loadDeposits();
      }
    } catch (error) {
      console.error('Error approving deposit:', error);
      toast.error(error.response?.data?.error || 'Error al aprobar depósito');
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async (id) => {
    const reason = prompt('Ingresa el motivo del rechazo:');
    if (!reason) return;

    try {
      setProcessing(id);
      const response = await depositsApi.rejectDeposit(id, {
        notes: reason
      });

      if (response.success) {
        toast.success('Depósito rechazado');
        loadDeposits();
      }
    } catch (error) {
      console.error('Error rejecting deposit:', error);
      toast.error(error.response?.data?.error || 'Error al rechazar depósito');
    } finally {
      setProcessing(null);
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

  const filteredDeposits = deposits.filter(deposit => {
    if (filters.status && deposit.status !== filters.status) return false;
    if (filters.search) {
      const search = filters.search.toLowerCase();
      return (
        deposit.user?.username?.toLowerCase().includes(search) ||
        deposit.reference?.toLowerCase().includes(search) ||
        deposit.phone?.includes(search)
      );
    }
    return true;
  });

  const stats = {
    pending: deposits.filter(d => d.status === 'PENDING').length,
    approved: deposits.filter(d => d.status === 'APPROVED').length,
    rejected: deposits.filter(d => d.status === 'REJECTED').length,
    totalAmount: deposits
      .filter(d => d.status === 'APPROVED')
      .reduce((sum, d) => sum + parseFloat(d.amount || 0), 0)
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando depósitos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Gestión de Depósitos</h1>
        <p className="text-gray-600">Administra las solicitudes de depósito de los jugadores</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-yellow-600 font-medium">Pendientes</p>
              <p className="text-2xl font-bold text-yellow-700">{stats.pending}</p>
            </div>
            <Clock className="w-8 h-8 text-yellow-600" />
          </div>
        </div>

        <div className="bg-green-50 border border-green-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-green-600 font-medium">Aprobados</p>
              <p className="text-2xl font-bold text-green-700">{stats.approved}</p>
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

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-blue-600 font-medium">Total Aprobado</p>
              <p className="text-2xl font-bold text-blue-700">
                Bs. {stats.totalAmount.toFixed(2)}
              </p>
            </div>
            <DollarSign className="w-8 h-8 text-blue-600" />
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
                placeholder="Buscar por usuario, referencia o teléfono..."
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
              <option value="APPROVED">Aprobados</option>
              <option value="REJECTED">Rechazados</option>
            </select>
          </div>
        </div>

        <ResponsiveTable
          data={filteredDeposits}
          emptyMessage="No hay depósitos para mostrar"
          emptyIcon={<DollarSign className="w-12 h-12 text-gray-400" />}
          columns={[
            {
              key: 'user',
              label: 'Usuario',
              primary: true,
              render: (d) => (
                <div className="flex items-center">
                  <User className="w-4 h-4 text-gray-400 mr-2 hidden md:block" />
                  <div>
                    <p className="text-sm font-medium text-gray-900">{d.user?.username || 'N/A'}</p>
                    <p className="text-xs text-gray-500">{d.user?.email}</p>
                  </div>
                </div>
              )
            },
            {
              key: 'amount',
              label: 'Monto',
              render: (d) => <span className="font-semibold text-gray-900">Bs. {parseFloat(d.amount || 0).toFixed(2)}</span>
            },
            {
              key: 'reference',
              label: 'Referencia',
              render: (d) => (
                <div className="flex items-center">
                  <Hash className="w-4 h-4 text-gray-400 mr-1 hidden md:block" />
                  <span className="text-sm">{d.reference}</span>
                </div>
              )
            },
            {
              key: 'phone',
              label: 'Teléfono',
              render: (d) => (
                <div className="flex items-center">
                  <Phone className="w-4 h-4 text-gray-400 mr-1 hidden md:block" />
                  <span className="text-sm">{d.phone}</span>
                </div>
              )
            },
            { key: 'bankCode', label: 'Banco' },
            {
              key: 'createdAt',
              label: 'Fecha',
              render: (d) => <span className="text-sm text-gray-500">{new Date(d.createdAt).toLocaleDateString('es-VE')}</span>
            },
            {
              key: 'status',
              label: 'Estado',
              render: (d) => getStatusBadge(d.status)
            }
          ]}
          actions={(deposit) => (
            <>
              {deposit.status === 'PENDING' ? (
                <div className="flex gap-2">
                  <button
                    onClick={() => handleApprove(deposit.id)}
                    disabled={processing === deposit.id}
                    className="px-3 py-1.5 bg-green-600 text-white text-sm rounded-lg hover:bg-green-700 disabled:bg-gray-300 transition-colors"
                  >
                    Aprobar
                  </button>
                  <button
                    onClick={() => handleReject(deposit.id)}
                    disabled={processing === deposit.id}
                    className="px-3 py-1.5 bg-red-600 text-white text-sm rounded-lg hover:bg-red-700 disabled:bg-gray-300 transition-colors"
                  >
                    Rechazar
                  </button>
                </div>
              ) : deposit.notes ? (
                <p className="text-xs text-gray-500">{deposit.notes}</p>
              ) : null}
            </>
          )}
        />
      </div>
    </div>
  );
}

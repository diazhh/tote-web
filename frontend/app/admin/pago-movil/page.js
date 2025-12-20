'use client';

import { useEffect, useState } from 'react';
import pagoMovilApi from '@/lib/api/pago-movil';
import { toast } from 'sonner';
import { Plus, Edit2, Trash2, Building2, Phone, CreditCard, User, CheckCircle, XCircle } from 'lucide-react';

export default function AdminPagoMovilPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    bankCode: '',
    bankName: '',
    phone: '',
    cedula: '',
    holderName: '',
    isActive: true,
    priority: 0
  });

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

  useEffect(() => {
    loadAccounts();
  }, []);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const response = await pagoMovilApi.getAllSystemAccounts();
      if (response.success) {
        setAccounts(response.data);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
      toast.error('Error al cargar cuentas');
    } finally {
      setLoading(false);
    }
  };

  const handleOpenModal = (account = null) => {
    if (account) {
      setEditingAccount(account);
      setFormData({
        bankCode: account.bankCode,
        bankName: account.bankName,
        phone: account.phone,
        cedula: account.cedula,
        holderName: account.holderName,
        isActive: account.isActive,
        priority: account.priority
      });
    } else {
      setEditingAccount(null);
      setFormData({
        bankCode: '',
        bankName: '',
        phone: '',
        cedula: '',
        holderName: '',
        isActive: true,
        priority: 0
      });
    }
    setShowModal(true);
  };

  const handleCloseModal = () => {
    setShowModal(false);
    setEditingAccount(null);
    setFormData({
      bankCode: '',
      bankName: '',
      phone: '',
      cedula: '',
      holderName: '',
      isActive: true,
      priority: 0
    });
  };

  const handleBankChange = (code) => {
    const bank = banks.find(b => b.code === code);
    setFormData({
      ...formData,
      bankCode: code,
      bankName: bank ? bank.name : ''
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.bankCode || !formData.phone || !formData.cedula || !formData.holderName) {
      toast.error('Completa todos los campos');
      return;
    }

    try {
      setSubmitting(true);
      let response;
      
      if (editingAccount) {
        response = await pagoMovilApi.updateSystemAccount(editingAccount.id, formData);
      } else {
        response = await pagoMovilApi.createSystemAccount(formData);
      }

      if (response.success) {
        toast.success(editingAccount ? 'Cuenta actualizada' : 'Cuenta creada exitosamente');
        handleCloseModal();
        loadAccounts();
      }
    } catch (error) {
      console.error('Error saving account:', error);
      toast.error(error.response?.data?.error || 'Error al guardar cuenta');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta cuenta? Esta acción no se puede deshacer.')) return;

    try {
      const response = await pagoMovilApi.deleteSystemAccount(id);
      if (response.success) {
        toast.success('Cuenta eliminada');
        loadAccounts();
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error(error.response?.data?.error || 'Error al eliminar cuenta');
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando cuentas...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Cuentas Pago Móvil del Sistema</h1>
          <p className="text-gray-600">Gestiona las cuentas para recibir depósitos</p>
        </div>
        <button
          onClick={() => handleOpenModal()}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
        >
          <Plus className="w-5 h-5" />
          Nueva Cuenta
        </button>
      </div>

      {accounts.length === 0 ? (
        <div className="bg-white rounded-lg shadow-sm border p-12 text-center">
          <Building2 className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-900 mb-2">No hay cuentas configuradas</h3>
          <p className="text-gray-600 mb-4">Crea al menos una cuenta para que los jugadores puedan hacer depósitos</p>
          <button
            onClick={() => handleOpenModal()}
            className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          >
            <Plus className="w-5 h-5" />
            Crear Primera Cuenta
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {accounts.map((account) => (
            <div key={account.id} className="bg-white rounded-lg shadow-sm border p-6">
              <div className="flex justify-between items-start mb-4">
                <div className="flex items-center gap-2">
                  <Building2 className="w-5 h-5 text-gray-600" />
                  <h3 className="font-bold text-gray-900">{account.bankName}</h3>
                </div>
                {account.isActive ? (
                  <CheckCircle className="w-5 h-5 text-green-600" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-600" />
                )}
              </div>

              <div className="space-y-2 text-sm text-gray-600 mb-4">
                <div className="flex items-center gap-2">
                  <Phone className="w-4 h-4" />
                  <span>{account.phone}</span>
                </div>
                <div className="flex items-center gap-2">
                  <CreditCard className="w-4 h-4" />
                  <span>V-{account.cedula}</span>
                </div>
                <div className="flex items-center gap-2">
                  <User className="w-4 h-4" />
                  <span className="text-xs">{account.holderName}</span>
                </div>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => handleOpenModal(account)}
                  className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition-colors"
                >
                  <Edit2 className="w-4 h-4" />
                  Editar
                </button>
                <button
                  onClick={() => handleDelete(account.id)}
                  className="px-3 py-2 bg-red-100 text-red-700 rounded-lg hover:bg-red-200 transition-colors"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
            <div className="p-6 border-b">
              <h2 className="text-xl font-bold text-gray-900">
                {editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta'}
              </h2>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Banco
                </label>
                <select
                  value={formData.bankCode}
                  onChange={(e) => handleBankChange(e.target.value)}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Selecciona un banco</option>
                  {banks.map((bank) => (
                    <option key={bank.code} value={bank.code}>
                      {bank.name}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Teléfono
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
                  Cédula (sin V-)
                </label>
                <input
                  type="text"
                  value={formData.cedula}
                  onChange={(e) => setFormData({ ...formData, cedula: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="12345678"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Nombre del Titular
                </label>
                <input
                  type="text"
                  value={formData.holderName}
                  onChange={(e) => setFormData({ ...formData, holderName: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  placeholder="Juan Pérez"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  Prioridad (0 = más alta)
                </label>
                <input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => setFormData({ ...formData, priority: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  min="0"
                />
              </div>

              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="isActive"
                  checked={formData.isActive}
                  onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                  className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
                />
                <label htmlFor="isActive" className="text-sm font-medium text-gray-700">
                  Cuenta activa
                </label>
              </div>

              <div className="flex gap-3 pt-4">
                <button
                  type="button"
                  onClick={handleCloseModal}
                  className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                >
                  {submitting ? 'Guardando...' : (editingAccount ? 'Actualizar' : 'Crear')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import pagoMovilApi from '@/lib/api/pago-movil';
import { toast } from 'sonner';
import { ArrowLeft, CreditCard, Phone, Building2, Plus, Trash2, Star, Edit2, X } from 'lucide-react';

export default function CuentasPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [myAccounts, setMyAccounts] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingAccount, setEditingAccount] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  
  const [formData, setFormData] = useState({
    bank: '',
    phone: '',
    idType: 'V',
    idNumber: '',
    holderName: ''
  });

  const banks = [
    '0102 - Banco de Venezuela',
    '0104 - Banco Venezolano de Crédito',
    '0105 - Banco Mercantil',
    '0108 - Banco Provincial',
    '0114 - Bancaribe',
    '0115 - Banco Exterior',
    '0128 - Banco Caroní',
    '0134 - Banesco',
    '0151 - Banco Fondo Común (BFC)',
    '0163 - Banco del Tesoro',
    '0166 - Banco Agrícola de Venezuela',
    '0168 - Bancrecer',
    '0169 - Mi Banco',
    '0171 - Banco Activo',
    '0172 - Bancamiga',
    '0173 - Banco Internacional de Desarrollo',
    '0174 - Banplus',
    '0175 - Banco Bicentenario',
    '0177 - Banco de la Fuerza Armada Nacional Bolivariana',
    '0191 - Banco Nacional de Crédito (BNC)'
  ];

  useEffect(() => {
    const userData = localStorage.getItem('user');
    if (!userData) {
      router.push('/login');
      return;
    }
    loadAccounts();
  }, [router]);

  const loadAccounts = async () => {
    try {
      setLoading(true);
      const response = await pagoMovilApi.getMyAccounts();
      if (response.success) {
        setMyAccounts(response.data);
      }
    } catch (error) {
      console.error('Error loading accounts:', error);
      toast.error('Error al cargar cuentas');
    } finally {
      setLoading(false);
    }
  };

  const resetForm = () => {
    setFormData({
      bank: '',
      phone: '',
      idType: 'V',
      idNumber: '',
      holderName: ''
    });
    setEditingAccount(null);
    setShowForm(false);
  };

  const handleEdit = (account) => {
    setFormData({
      bank: account.bank,
      phone: account.phone,
      idType: account.idType || 'V',
      idNumber: account.idNumber,
      holderName: account.holderName
    });
    setEditingAccount(account);
    setShowForm(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!formData.bank || !formData.phone || !formData.idNumber || !formData.holderName) {
      toast.error('Completa todos los campos');
      return;
    }

    if (formData.phone.length !== 11) {
      toast.error('El teléfono debe tener 11 dígitos');
      return;
    }

    try {
      setSubmitting(true);
      let response;

      if (editingAccount) {
        response = await pagoMovilApi.updateAccount(editingAccount.id, formData);
      } else {
        response = await pagoMovilApi.createAccount(formData);
      }

      if (response.success) {
        toast.success(editingAccount ? 'Cuenta actualizada' : 'Cuenta agregada exitosamente');
        resetForm();
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
    if (!confirm('¿Estás seguro de eliminar esta cuenta?')) return;

    try {
      const response = await pagoMovilApi.deleteAccount(id);
      if (response.success) {
        toast.success('Cuenta eliminada');
        loadAccounts();
      }
    } catch (error) {
      console.error('Error deleting account:', error);
      toast.error(error.response?.data?.error || 'Error al eliminar cuenta');
    }
  };

  const handleSetDefault = async (id) => {
    try {
      const response = await pagoMovilApi.setDefaultAccount(id);
      if (response.success) {
        toast.success('Cuenta predeterminada actualizada');
        loadAccounts();
      }
    } catch (error) {
      console.error('Error setting default:', error);
      toast.error(error.response?.data?.error || 'Error al actualizar cuenta predeterminada');
    }
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <button
                onClick={() => router.push('/dashboard')}
                className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">Mis Cuentas</h1>
                <p className="text-sm text-gray-600">Gestiona tus cuentas Pago Móvil</p>
              </div>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Agregar Cuenta
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Form Modal */}
        {showForm && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
              <div className="flex justify-between items-center mb-6">
                <h2 className="text-xl font-bold text-gray-900">
                  {editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta'}
                </h2>
                <button
                  onClick={resetForm}
                  className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Banco
                  </label>
                  <select
                    value={formData.bank}
                    onChange={(e) => setFormData({ ...formData, bank: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    required
                  >
                    <option value="">Selecciona un banco</option>
                    {banks.map((bank) => (
                      <option key={bank} value={bank}>
                        {bank}
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
                    maxLength="11"
                    required
                  />
                </div>

                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Tipo
                    </label>
                    <select
                      value={formData.idType}
                      onChange={(e) => setFormData({ ...formData, idType: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      required
                    >
                      <option value="V">V</option>
                      <option value="E">E</option>
                      <option value="J">J</option>
                      <option value="G">G</option>
                    </select>
                  </div>
                  <div className="col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Cédula/RIF
                    </label>
                    <input
                      type="text"
                      value={formData.idNumber}
                      onChange={(e) => setFormData({ ...formData, idNumber: e.target.value })}
                      className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="12345678"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Titular
                  </label>
                  <input
                    type="text"
                    value={formData.holderName}
                    onChange={(e) => setFormData({ ...formData, holderName: e.target.value })}
                    className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    placeholder="Nombre completo"
                    required
                  />
                </div>

                <div className="flex gap-3 pt-4">
                  <button
                    type="button"
                    onClick={resetForm}
                    className="flex-1 px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    disabled={submitting}
                    className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
                  >
                    {submitting ? 'Guardando...' : 'Guardar'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Accounts List */}
        {myAccounts.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm border p-12 text-center">
            <CreditCard className="w-16 h-16 text-gray-300 mx-auto mb-4" />
            <h3 className="text-lg font-semibold text-gray-900 mb-2">No tienes cuentas registradas</h3>
            <p className="text-gray-600 mb-6">Agrega una cuenta Pago Móvil para poder realizar retiros</p>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-6 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-5 h-5" />
              Agregar Primera Cuenta
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {myAccounts.map((account) => (
              <div
                key={account.id}
                className="bg-white rounded-xl shadow-sm border p-6 hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="bg-blue-100 p-3 rounded-lg">
                        <Building2 className="w-6 h-6 text-blue-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900">{account.bank}</h3>
                          {account.isDefault && (
                            <span className="inline-flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-semibold">
                              <Star className="w-3 h-3 fill-current" />
                              Predeterminada
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-gray-600">{account.holderName}</p>
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-4 text-sm">
                      <div className="flex items-center gap-2 text-gray-600">
                        <Phone className="w-4 h-4" />
                        <span>{account.phone}</span>
                      </div>
                      <div className="flex items-center gap-2 text-gray-600">
                        <CreditCard className="w-4 h-4" />
                        <span>{account.idType}-{account.idNumber}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    {!account.isDefault && (
                      <button
                        onClick={() => handleSetDefault(account.id)}
                        className="p-2 text-gray-600 hover:bg-gray-100 rounded-lg transition-colors"
                        title="Marcar como predeterminada"
                      >
                        <Star className="w-5 h-5" />
                      </button>
                    )}
                    <button
                      onClick={() => handleEdit(account)}
                      className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                      title="Editar"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => handleDelete(account.id)}
                      className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                      title="Eliminar"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

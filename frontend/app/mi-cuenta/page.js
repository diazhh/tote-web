'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, User, Mail, Phone, CheckCircle, XCircle, CreditCard, Plus, Trash2, Star, Edit2, X, Building2, Calendar, Save, Loader2, AlertTriangle, Check } from 'lucide-react';
import { toast } from 'sonner';
import playerApi from '@/lib/api/player';
import pagoMovilApi from '@/lib/api/pago-movil';
import authAPI from '@/lib/api/auth';
import WhatsAppVerification from '@/components/player/WhatsAppVerification';

export default function MiCuentaPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [profile, setProfile] = useState(null);

  // Profile editing
  const [editingField, setEditingField] = useState(null); // 'username' | 'email' | 'phone'
  const [editValues, setEditValues] = useState({});
  const [savingProfile, setSavingProfile] = useState(false);
  const [usernameStatus, setUsernameStatus] = useState(null); // null | 'checking' | 'available' | 'taken'
  const [usernameTimer, setUsernameTimer] = useState(null);

  // Bank accounts
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
    const userObj = JSON.parse(userData);
    if (userObj.role === 'ADMIN' || userObj.role === 'OPERATOR') {
      router.push('/admin');
      return;
    }
    loadData();
  }, [router]);

  const loadData = async () => {
    try {
      setLoading(true);
      const [profileRes, accountsRes] = await Promise.all([
        playerApi.getProfile(),
        pagoMovilApi.getMyAccounts()
      ]);

      if (profileRes.success) {
        setProfile(profileRes.data);
      }
      if (accountsRes.success) {
        setMyAccounts(accountsRes.data);
      }
    } catch (error) {
      console.error('Error loading data:', error);
      toast.error('Error al cargar datos');
    } finally {
      setLoading(false);
    }
  };

  // Profile editing handlers
  const startEditing = (field) => {
    setEditingField(field);
    setEditValues({ ...editValues, [field]: profile?.[field] || '' });
    setUsernameStatus(null);
  };

  const cancelEditing = () => {
    setEditingField(null);
    setUsernameStatus(null);
    if (usernameTimer) clearTimeout(usernameTimer);
  };

  const handleEditChange = (field, value) => {
    setEditValues({ ...editValues, [field]: value });
    if (field === 'username') {
      setUsernameStatus(null);
      if (usernameTimer) clearTimeout(usernameTimer);
      if (value && value !== profile?.username && value.length >= 3) {
        const timer = setTimeout(async () => {
          setUsernameStatus('checking');
          try {
            const res = await authAPI.checkUsername(value);
            setUsernameStatus(res.available ? 'available' : 'taken');
          } catch {
            setUsernameStatus(null);
          }
        }, 500);
        setUsernameTimer(timer);
      }
    }
  };

  const saveField = async (field) => {
    const value = editValues[field];
    if (value === profile?.[field]) {
      cancelEditing();
      return;
    }
    if (field === 'username' && usernameStatus === 'taken') {
      toast.error('Ese nombre de usuario ya esta en uso');
      return;
    }
    try {
      setSavingProfile(true);
      const res = await authAPI.updateProfile({ [field]: value });
      if (res.success) {
        setProfile(res.data);
        // Update localStorage
        const stored = JSON.parse(localStorage.getItem('user') || '{}');
        if (field === 'username') stored.username = value;
        if (field === 'email') stored.email = value;
        if (field === 'phone') stored.phone = value;
        localStorage.setItem('user', JSON.stringify(stored));

        toast.success('Datos actualizados');
        if (field === 'email' && value !== profile?.email) {
          toast.info('Debes verificar tu nuevo correo electronico', { duration: 5000 });
        }
        if (field === 'phone' && value !== profile?.phone) {
          toast.info('Debes verificar tu nuevo WhatsApp', { duration: 5000 });
        }
        cancelEditing();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al guardar');
    } finally {
      setSavingProfile(false);
    }
  };

  // Bank account handlers
  const resetForm = () => {
    setFormData({ bank: '', phone: '', idType: 'V', idNumber: '', holderName: '' });
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
      toast.error('El telefono debe tener 11 digitos');
      return;
    }
    try {
      setSubmitting(true);
      const [bankCode, ...bankNameParts] = formData.bank.split(' - ');
      const payload = {
        bankCode: bankCode.trim(),
        bankName: bankNameParts.join(' - ').trim(),
        phone: formData.phone,
        cedula: formData.idNumber,
        holderName: formData.holderName,
        isDefault: formData.isDefault || false,
      };
      let response;
      if (editingAccount) {
        response = await pagoMovilApi.updateAccount(editingAccount.id, payload);
      } else {
        response = await pagoMovilApi.createAccount(payload);
      }
      if (response.success) {
        toast.success(editingAccount ? 'Cuenta actualizada' : 'Cuenta agregada');
        resetForm();
        loadData();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al guardar cuenta');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('Estas seguro de eliminar esta cuenta?')) return;
    try {
      const response = await pagoMovilApi.deleteAccount(id);
      if (response.success) {
        toast.success('Cuenta eliminada');
        loadData();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al eliminar cuenta');
    }
  };

  const handleSetDefault = async (id) => {
    try {
      const response = await pagoMovilApi.setDefaultAccount(id);
      if (response.success) {
        toast.success('Cuenta predeterminada actualizada');
        loadData();
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al actualizar');
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
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => router.push('/dashboard')}
              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Mi Cuenta</h1>
              <p className="text-sm text-gray-600">Gestiona tu perfil y configuracion</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 py-8 space-y-6">

        {/* Datos Personales */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center gap-3 mb-6">
            <div className="w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center">
              <User className="w-5 h-5 text-blue-600" />
            </div>
            <h2 className="text-lg font-bold text-gray-900">Datos Personales</h2>
          </div>

          <div className="space-y-4">
            {/* Username */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500 mb-1">Usuario</p>
                {editingField !== 'username' && (
                  <button onClick={() => startEditing('username')} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {editingField === 'username' ? (
                <div className="space-y-2">
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={editValues.username || ''}
                      onChange={(e) => handleEditChange('username', e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="Nombre de usuario"
                      autoFocus
                    />
                    <button
                      onClick={() => saveField('username')}
                      disabled={savingProfile || usernameStatus === 'taken' || usernameStatus === 'checking'}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition disabled:opacity-50"
                    >
                      {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button onClick={cancelEditing} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {usernameStatus === 'checking' && (
                    <p className="text-xs text-gray-500 flex items-center gap-1"><Loader2 className="w-3 h-3 animate-spin" /> Verificando disponibilidad...</p>
                  )}
                  {usernameStatus === 'available' && (
                    <p className="text-xs text-green-600 flex items-center gap-1"><CheckCircle className="w-3 h-3" /> Disponible</p>
                  )}
                  {usernameStatus === 'taken' && (
                    <p className="text-xs text-red-600 flex items-center gap-1"><XCircle className="w-3 h-3" /> Ya esta en uso</p>
                  )}
                </div>
              ) : (
                <p className="font-semibold text-gray-900">{profile?.username}</p>
              )}
            </div>

            {/* Email */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <p className="text-xs text-gray-500">Correo Electronico</p>
                  {profile?.email && editingField !== 'email' && (
                    profile?.emailVerified ? (
                      <span className="flex items-center gap-1 text-xs text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                        <CheckCircle className="w-3 h-3" /> Verificado
                      </span>
                    ) : (
                      <button
                        onClick={() => router.push('/verify-email')}
                        className="flex items-center gap-1 text-xs text-amber-600 bg-amber-50 px-2 py-0.5 rounded-full hover:bg-amber-100 transition"
                      >
                        <XCircle className="w-3 h-3" /> Verificar
                      </button>
                    )
                  )}
                </div>
                {editingField !== 'email' && (
                  <button onClick={() => startEditing('email')} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {editingField === 'email' ? (
                <div className="space-y-2 mt-1">
                  <div className="flex gap-2">
                    <input
                      type="email"
                      value={editValues.email || ''}
                      onChange={(e) => handleEditChange('email', e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="correo@ejemplo.com"
                      autoFocus
                    />
                    <button
                      onClick={() => saveField('email')}
                      disabled={savingProfile}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition disabled:opacity-50"
                    >
                      {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button onClick={cancelEditing} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {editValues.email !== profile?.email && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Deberas verificar tu nuevo correo
                    </p>
                  )}
                </div>
              ) : (
                <p className="font-semibold text-gray-900 mt-1">{profile?.email || 'No registrado'}</p>
              )}
            </div>

            {/* Phone */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between">
                <p className="text-xs text-gray-500">Telefono</p>
                {editingField !== 'phone' && (
                  <button onClick={() => startEditing('phone')} className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition">
                    <Edit2 className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
              {editingField === 'phone' ? (
                <div className="space-y-2 mt-1">
                  <div className="flex gap-2">
                    <input
                      type="tel"
                      value={editValues.phone || ''}
                      onChange={(e) => handleEditChange('phone', e.target.value)}
                      className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                      placeholder="04141234567"
                      autoFocus
                    />
                    <button
                      onClick={() => saveField('phone')}
                      disabled={savingProfile}
                      className="p-1.5 text-green-600 hover:bg-green-50 rounded-lg transition disabled:opacity-50"
                    >
                      {savingProfile ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
                    </button>
                    <button onClick={cancelEditing} className="p-1.5 text-gray-400 hover:bg-gray-100 rounded-lg transition">
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  {editValues.phone !== profile?.phone && editValues.phone && (
                    <p className="text-xs text-amber-600 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" /> Deberas verificar tu WhatsApp de nuevo
                    </p>
                  )}
                </div>
              ) : (
                <p className="font-semibold text-gray-900 mt-1">{profile?.phone || 'No registrado'}</p>
              )}
            </div>

            {/* Member since (read-only) */}
            <div className="p-4 bg-gray-50 rounded-lg">
              <p className="text-xs text-gray-500 mb-1">Miembro desde</p>
              <p className="font-semibold text-gray-900">
                {profile?.createdAt ? new Date(profile.createdAt).toLocaleDateString('es-VE', {
                  day: '2-digit', month: 'long', year: 'numeric'
                }) : '-'}
              </p>
            </div>
          </div>
        </div>

        {/* Balance */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="p-4 bg-green-50 rounded-lg text-center">
              <p className="text-xs text-green-600 mb-1">Balance Disponible</p>
              <p className="text-2xl font-bold text-green-700">
                Bs. {(profile?.availableBalance || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="p-4 bg-yellow-50 rounded-lg text-center">
              <p className="text-xs text-yellow-600 mb-1">Balance Bloqueado</p>
              <p className="text-2xl font-bold text-yellow-700">
                Bs. {(profile?.blockedBalance || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
            <div className="p-4 bg-blue-50 rounded-lg text-center">
              <p className="text-xs text-blue-600 mb-1">Balance Total</p>
              <p className="text-2xl font-bold text-blue-700">
                Bs. {(profile?.balance || 0).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>
        </div>

        {/* WhatsApp Verification */}
        <div>
          <WhatsAppVerification
            user={profile}
            onUpdate={loadData}
          />
        </div>

        {/* Cuentas Bancarias */}
        <div className="bg-white rounded-xl shadow-sm border p-6">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 bg-purple-100 rounded-full flex items-center justify-center">
                <CreditCard className="w-5 h-5 text-purple-600" />
              </div>
              <h2 className="text-lg font-bold text-gray-900">Cuentas Pago Movil</h2>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="inline-flex items-center gap-2 px-3 py-1.5 bg-blue-600 text-white text-sm rounded-lg hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-4 h-4" />
              Agregar
            </button>
          </div>

          {myAccounts.length === 0 ? (
            <div className="text-center py-8">
              <CreditCard className="w-12 h-12 text-gray-300 mx-auto mb-3" />
              <p className="text-gray-500 text-sm">No tienes cuentas registradas</p>
              <p className="text-gray-400 text-xs mt-1">Agrega una cuenta para poder realizar retiros</p>
            </div>
          ) : (
            <div className="space-y-3">
              {myAccounts.map((account) => (
                <div key={account.id} className="border rounded-lg p-4 hover:shadow-sm transition-shadow">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-2">
                        <Building2 className="w-4 h-4 text-gray-500" />
                        <span className="font-semibold text-gray-900 text-sm">{account.bank}</span>
                        {account.isDefault && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
                            <Star className="w-3 h-3 fill-current" /> Default
                          </span>
                        )}
                      </div>
                      <div className="flex flex-wrap gap-4 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Phone className="w-3 h-3" /> {account.phone}
                        </span>
                        <span>{account.idType}-{account.idNumber}</span>
                        <span>{account.holderName}</span>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {!account.isDefault && (
                        <button onClick={() => handleSetDefault(account.id)} className="p-1.5 text-gray-400 hover:text-yellow-600 hover:bg-yellow-50 rounded transition" title="Predeterminada">
                          <Star className="w-4 h-4" />
                        </button>
                      )}
                      <button onClick={() => handleEdit(account)} className="p-1.5 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded transition" title="Editar">
                        <Edit2 className="w-4 h-4" />
                      </button>
                      <button onClick={() => handleDelete(account.id)} className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded transition" title="Eliminar">
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>

      {/* Bank Account Form Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-md w-full p-6">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-bold text-gray-900">
                {editingAccount ? 'Editar Cuenta' : 'Nueva Cuenta'}
              </h2>
              <button onClick={resetForm} className="p-2 hover:bg-gray-100 rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Banco</label>
                <select
                  value={formData.bank}
                  onChange={(e) => setFormData({ ...formData, bank: e.target.value })}
                  className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  required
                >
                  <option value="">Selecciona un banco</option>
                  {banks.map((bank) => (
                    <option key={bank} value={bank}>{bank}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Telefono</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Tipo</label>
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
                  <label className="block text-sm font-medium text-gray-700 mb-2">Cedula/RIF</label>
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
                <label className="block text-sm font-medium text-gray-700 mb-2">Titular</label>
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
    </div>
  );
}

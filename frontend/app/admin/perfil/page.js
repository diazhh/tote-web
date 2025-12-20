'use client';

import { useState } from 'react';
import useAuthStore from '@/lib/stores/authStore';
import authAPI from '@/lib/api/auth';
import { toast } from 'sonner';
import { User, Mail, Lock, Edit2, Check, X, Loader2 } from 'lucide-react';

export default function PerfilPage() {
  const { user, setUser } = useAuthStore();
  const [editingField, setEditingField] = useState(null);
  const [saving, setSaving] = useState(false);
  
  const [formData, setFormData] = useState({
    email: user?.email || '',
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });

  const handleSaveEmail = async () => {
    setSaving(true);
    try {
      const response = await authAPI.updateProfile({ email: formData.email || null });
      if (response.success) {
        toast.success('Email actualizado');
        if (response.data) setUser(response.data);
        setEditingField(null);
      } else {
        toast.error(response.error || 'Error al actualizar');
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al actualizar');
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async () => {
    if (formData.newPassword !== formData.confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }
    if (formData.newPassword.length < 6) {
      toast.error('Mínimo 6 caracteres');
      return;
    }
    setSaving(true);
    try {
      const response = await authAPI.changePassword(formData.currentPassword, formData.newPassword);
      if (response.success) {
        toast.success('Contraseña actualizada');
        setFormData({ ...formData, currentPassword: '', newPassword: '', confirmPassword: '' });
        setEditingField(null);
      } else {
        toast.error(response.error || 'Error al cambiar contraseña');
      }
    } catch (error) {
      toast.error(error.response?.data?.error || 'Contraseña actual incorrecta');
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditingField(null);
    setFormData({
      email: user?.email || '',
      currentPassword: '',
      newPassword: '',
      confirmPassword: ''
    });
  };

  return (
    <div className="max-w-2xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-gray-900">Mi Perfil</h1>
        <p className="text-gray-600 mt-1">Gestiona tu información personal</p>
      </div>

      <div className="bg-white rounded-xl shadow-sm border">
        {/* Avatar y nombre */}
        <div className="p-6 border-b bg-gradient-to-r from-blue-50 to-indigo-50 rounded-t-xl">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-2xl font-bold">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-semibold text-gray-900">{user?.username}</h2>
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mt-1">
                {user?.role}
              </span>
            </div>
          </div>
        </div>

        {/* Campos editables */}
        <div className="divide-y">
          {/* Username - No editable */}
          <div className="p-4 lg:p-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                  <User className="w-5 h-5 text-gray-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">Usuario</p>
                  <p className="font-medium text-gray-900">{user?.username}</p>
                </div>
              </div>
              <span className="text-xs text-gray-400">No editable</span>
            </div>
          </div>

          {/* Email - Editable */}
          <div className="p-4 lg:p-6">
            {editingField === 'email' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-100 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-blue-600" />
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-gray-500 mb-1">Email</p>
                    <input
                      type="email"
                      value={formData.email}
                      onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                      className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                      placeholder="tu@email.com"
                      autoFocus
                    />
                  </div>
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={cancelEdit} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm flex items-center gap-1">
                    <X className="w-4 h-4" /> Cancelar
                  </button>
                  <button onClick={handleSaveEmail} disabled={saving} className="px-3 py-1.5 bg-blue-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-blue-700 disabled:opacity-50">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Guardar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                    <Mail className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Email</p>
                    <p className="font-medium text-gray-900">{user?.email || <span className="text-gray-400">No configurado</span>}</p>
                  </div>
                </div>
                <button onClick={() => setEditingField('email')} className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition">
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>

          {/* Contraseña - Editable */}
          <div className="p-4 lg:p-6">
            {editingField === 'password' ? (
              <div className="space-y-3">
                <div className="flex items-center gap-3 mb-3">
                  <div className="w-10 h-10 rounded-lg bg-green-100 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-green-600" />
                  </div>
                  <p className="text-sm font-medium text-gray-700">Cambiar contraseña</p>
                </div>
                <div className="space-y-3 pl-13">
                  <input
                    type="password"
                    value={formData.currentPassword}
                    onChange={(e) => setFormData({ ...formData, currentPassword: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Contraseña actual"
                  />
                  <input
                    type="password"
                    value={formData.newPassword}
                    onChange={(e) => setFormData({ ...formData, newPassword: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Nueva contraseña (mín. 6 caracteres)"
                  />
                  <input
                    type="password"
                    value={formData.confirmPassword}
                    onChange={(e) => setFormData({ ...formData, confirmPassword: e.target.value })}
                    className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                    placeholder="Confirmar nueva contraseña"
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button onClick={cancelEdit} className="px-3 py-1.5 text-gray-600 hover:bg-gray-100 rounded-lg text-sm flex items-center gap-1">
                    <X className="w-4 h-4" /> Cancelar
                  </button>
                  <button onClick={handleChangePassword} disabled={saving || !formData.currentPassword || !formData.newPassword} className="px-3 py-1.5 bg-green-600 text-white rounded-lg text-sm flex items-center gap-1 hover:bg-green-700 disabled:opacity-50">
                    {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />} Cambiar
                  </button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-lg bg-gray-100 flex items-center justify-center">
                    <Lock className="w-5 h-5 text-gray-600" />
                  </div>
                  <div>
                    <p className="text-sm text-gray-500">Contraseña</p>
                    <p className="font-medium text-gray-900">••••••••</p>
                  </div>
                </div>
                <button onClick={() => setEditingField('password')} className="p-2 text-gray-400 hover:text-green-600 hover:bg-green-50 rounded-lg transition">
                  <Edit2 className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

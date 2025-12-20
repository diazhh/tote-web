'use client';

import { useState } from 'react';
import useAuthStore from '@/lib/stores/authStore';
import { toast } from 'sonner';
import { Key, User, Save } from 'lucide-react';

export default function AccountTab() {
  const { user, changePassword } = useAuthStore();
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: ''
  });
  const [loading, setLoading] = useState(false);

  const handlePasswordChange = async (e) => {
    e.preventDefault();

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    setLoading(true);
    const result = await changePassword(passwordForm.currentPassword, passwordForm.newPassword);
    setLoading(false);

    if (result.success) {
      toast.success('Contraseña actualizada correctamente');
      setPasswordForm({
        currentPassword: '',
        newPassword: '',
        confirmPassword: ''
      });
    } else {
      toast.error(result.error || 'Error al cambiar la contraseña');
    }
  };

  return (
    <div className="space-y-6 max-w-2xl">
      {/* User Info */}
      <div>
        <div className="flex items-center space-x-3 mb-4">
          <User className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">Información de Usuario</h2>
        </div>
        
        <div className="space-y-3 bg-gray-50 rounded-lg p-4">
          <div className="flex items-center justify-between py-2 border-b border-gray-200">
            <span className="text-sm text-gray-600">Usuario:</span>
            <span className="text-sm font-medium text-gray-900">{user?.username}</span>
          </div>
          <div className="flex items-center justify-between py-2 border-b border-gray-200">
            <span className="text-sm text-gray-600">Email:</span>
            <span className="text-sm font-medium text-gray-900">{user?.email || 'No configurado'}</span>
          </div>
          <div className="flex items-center justify-between py-2">
            <span className="text-sm text-gray-600">Rol:</span>
            <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
              user?.role === 'ADMIN' ? 'bg-purple-100 text-purple-800' :
              user?.role === 'OPERATOR' ? 'bg-blue-100 text-blue-800' :
              'bg-gray-100 text-gray-800'
            }`}>
              {user?.role}
            </span>
          </div>
        </div>
      </div>

      {/* Change Password */}
      <div>
        <div className="flex items-center space-x-3 mb-4">
          <Key className="w-5 h-5 text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900">Cambiar Contraseña</h2>
        </div>

        <form onSubmit={handlePasswordChange} className="space-y-4">
          <div>
            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700 mb-2">
              Contraseña Actual
            </label>
            <input
              id="currentPassword"
              type="password"
              value={passwordForm.currentPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, currentPassword: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
              disabled={loading}
            />
          </div>

          <div>
            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700 mb-2">
              Nueva Contraseña
            </label>
            <input
              id="newPassword"
              type="password"
              value={passwordForm.newPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, newPassword: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
              disabled={loading}
              minLength={6}
            />
          </div>

          <div>
            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700 mb-2">
              Confirmar Nueva Contraseña
            </label>
            <input
              id="confirmPassword"
              type="password"
              value={passwordForm.confirmPassword}
              onChange={(e) => setPasswordForm({ ...passwordForm, confirmPassword: e.target.value })}
              className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none"
              required
              disabled={loading}
              minLength={6}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Save className="w-4 h-4 mr-2" />
            {loading ? 'Guardando...' : 'Guardar Cambios'}
          </button>
        </form>
      </div>

      {/* System Info */}
      <div>
        <h2 className="text-lg font-semibold text-gray-900 mb-4">Información del Sistema</h2>
        <div className="space-y-2 text-sm text-gray-600 bg-gray-50 rounded-lg p-4">
          <p>• Backend API: {process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000'}</p>
          <p>• Versión: 1.0.0</p>
        </div>
      </div>
    </div>
  );
}

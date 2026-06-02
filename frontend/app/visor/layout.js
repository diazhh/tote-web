'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useAuthStore from '@/lib/stores/authStore';
import { LogOut, Eye } from 'lucide-react';

/**
 * Layout dedicado para el rol VIEWER (visor). Sin sidebar admin — solo el
 * header con username + logout. Redirige a /login o al home natural según el rol.
 */
export default function VisorLayout({ children }) {
  const router = useRouter();
  const { isAuthenticated, logout, checkAuth } = useAuthStore();
  const [user, setUser] = useState(null);

  useEffect(() => {
    const verify = async () => {
      const isValid = await checkAuth();
      if (!isValid) {
        router.push('/login');
        return;
      }
      const userData = localStorage.getItem('user');
      if (userData) {
        const userObj = JSON.parse(userData);
        setUser(userObj);
        if (userObj.role !== 'VIEWER') {
          // Si no es visor, redirigir a su home natural.
          if (userObj.role === 'PLAYER') router.push('/dashboard');
          else if (userObj.role === 'PROVIDER') router.push('/proveedor');
          else if (userObj.role === 'FISCALIZADOR') router.push('/fiscalizar');
          else router.push('/admin');
        }
      }
    };
    verify();
  }, [checkAuth, router]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  if (!isAuthenticated || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  if (user.role !== 'VIEWER') return null;

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 bg-blue-600 rounded-lg flex items-center justify-center">
              <Eye className="w-4 h-4 text-white" />
            </div>
            <div>
              <p className="text-sm font-semibold text-gray-900">Reporte de Ventas</p>
              <p className="text-xs text-gray-500">{user.username}</p>
            </div>
          </div>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 rounded-lg"
          >
            <LogOut className="w-4 h-4" /> Salir
          </button>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-4 py-6">{children}</main>
    </div>
  );
}

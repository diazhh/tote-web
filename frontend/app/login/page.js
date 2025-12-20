'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useAuthStore from '@/lib/stores/authStore';
import { toast } from 'sonner';

export default function LoginPage() {
  const router = useRouter();
  const { login, isAuthenticated, isLoading, error, clearError } = useAuthStore();
  
  const [formData, setFormData] = useState({
    username: '',
    password: ''
  });

  // Redirigir si ya está autenticado
  useEffect(() => {
    if (isAuthenticated) {
      router.push('/admin');
    }
  }, [isAuthenticated, router]);

  // Mostrar errores
  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!formData.username || !formData.password) {
      toast.error('Por favor completa todos los campos');
      return;
    }

    const result = await login(formData.username, formData.password);
    
    if (result.success) {
      toast.success('¡Bienvenido!');
      router.push('/admin');
    }
  };

  const handleChange = (e) => {
    setFormData({
      ...formData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100">
      <div className="max-w-md w-full mx-4">
        <div className="bg-white rounded-2xl shadow-xl p-8">
          {/* Header */}
          <div className="text-center mb-8">
            <h1 className="text-3xl font-bold text-gray-900 mb-2">
              Totalizador de Loterías
            </h1>
            <p className="text-gray-600">Panel de Administración</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} method="post" className="space-y-6">
            <div>
              <label htmlFor="username" className="block text-sm font-medium text-gray-700 mb-2">
                Usuario
              </label>
              <input
                id="username"
                name="username"
                type="text"
                autoComplete="username"
                required
                value={formData.username}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                placeholder="Ingresa tu usuario"
                disabled={isLoading}
              />
            </div>

            <div>
              <label htmlFor="password" className="block text-sm font-medium text-gray-700 mb-2">
                Contraseña
              </label>
              <input
                id="password"
                name="password"
                type="password"
                autoComplete="current-password"
                required
                value={formData.password}
                onChange={handleChange}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                placeholder="Ingresa tu contraseña"
                disabled={isLoading}
              />
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-blue-600 hover:bg-blue-700 text-white font-semibold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
            </button>
          </form>

          {/* Footer */}
          <div className="mt-6 text-center">
            <a
              href="/"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium"
            >
              ← Volver al inicio
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

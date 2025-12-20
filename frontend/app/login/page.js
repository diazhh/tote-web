'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useAuthStore from '@/lib/stores/authStore';
import { toast } from 'sonner';
import { User, Mail, Lock, Phone, LogIn, UserPlus } from 'lucide-react';

export default function LoginPage() {
  const router = useRouter();
  const { login, register, isAuthenticated, isLoading, error, clearError } = useAuthStore();
  const [activeTab, setActiveTab] = useState('login');
  
  const [loginData, setLoginData] = useState({
    username: '',
    password: ''
  });

  const [registerData, setRegisterData] = useState({
    username: '',
    email: '',
    password: '',
    confirmPassword: '',
    phone: ''
  });

  // Redirigir si ya está autenticado
  useEffect(() => {
    if (isAuthenticated) {
      const user = JSON.parse(localStorage.getItem('user') || '{}');
      if (user.role === 'ADMIN' || user.role === 'OPERATOR') {
        router.push('/admin');
      } else if (user.role === 'TAQUILLA_ADMIN') {
        router.push('/admin/depositos');
      } else if (user.role === 'PLAYER') {
        router.push('/dashboard');
      }
    }
  }, [isAuthenticated, router]);

  // Mostrar errores
  useEffect(() => {
    if (error) {
      toast.error(error);
      clearError();
    }
  }, [error, clearError]);

  const handleLoginSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!loginData.username || !loginData.password) {
      toast.error('Por favor completa todos los campos');
      return;
    }

    const result = await login(loginData.username, loginData.password);
    
    if (result.success) {
      toast.success('¡Bienvenido!');
      const user = result.user || JSON.parse(localStorage.getItem('user') || '{}');
      if (user.role === 'ADMIN' || user.role === 'OPERATOR') {
        router.push('/admin');
      } else if (user.role === 'TAQUILLA_ADMIN') {
        router.push('/admin/depositos');
      } else if (user.role === 'PLAYER') {
        router.push('/dashboard');
      }
    }
  };

  const handleRegisterSubmit = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!registerData.username || !registerData.email || !registerData.password) {
      toast.error('Por favor completa todos los campos obligatorios');
      return;
    }

    if (registerData.password.length < 6) {
      toast.error('La contraseña debe tener al menos 6 caracteres');
      return;
    }

    if (registerData.password !== registerData.confirmPassword) {
      toast.error('Las contraseñas no coinciden');
      return;
    }

    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(registerData.email)) {
      toast.error('Por favor ingresa un email válido');
      return;
    }

    const result = await register(
      registerData.username,
      registerData.email,
      registerData.password,
      registerData.phone || null
    );
    
    if (result.success) {
      toast.success('¡Registro exitoso! Bienvenido');
      router.push('/dashboard');
    }
  };

  const handleLoginChange = (e) => {
    setLoginData({
      ...loginData,
      [e.target.name]: e.target.value
    });
  };

  const handleRegisterChange = (e) => {
    setRegisterData({
      ...registerData,
      [e.target.name]: e.target.value
    });
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 via-indigo-50 to-purple-50 py-12 px-4">
      <div className="max-w-md w-full">
        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-gradient-to-r from-blue-600 to-purple-600 text-white p-8 text-center">
            <div className="w-16 h-16 bg-white/20 backdrop-blur-sm rounded-full flex items-center justify-center mx-auto mb-4">
              <User className="h-8 w-8" />
            </div>
            <h1 className="text-3xl font-bold mb-2">
              Totalizador
            </h1>
            <p className="text-white/90">Loterías en Línea</p>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-gray-200">
            <button
              onClick={() => setActiveTab('login')}
              className={`flex-1 py-4 px-6 text-center font-medium transition-all ${
                activeTab === 'login'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <LogIn className="h-5 w-5" />
                <span>Iniciar Sesión</span>
              </div>
            </button>
            <button
              onClick={() => setActiveTab('register')}
              className={`flex-1 py-4 px-6 text-center font-medium transition-all ${
                activeTab === 'register'
                  ? 'text-blue-600 border-b-2 border-blue-600 bg-blue-50'
                  : 'text-gray-500 hover:text-gray-700 hover:bg-gray-50'
              }`}
            >
              <div className="flex items-center justify-center gap-2">
                <UserPlus className="h-5 w-5" />
                <span>Registrarse</span>
              </div>
            </button>
          </div>

          <div className="p-8">
            {/* Login Form */}
            {activeTab === 'login' && (
              <form onSubmit={handleLoginSubmit} method="post" className="space-y-5">
                <div>
                  <label htmlFor="login-username" className="block text-sm font-medium text-gray-700 mb-2">
                    Usuario
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="login-username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      required
                      value={loginData.username}
                      onChange={handleLoginChange}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                      placeholder="Ingresa tu usuario"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="login-password" className="block text-sm font-medium text-gray-700 mb-2">
                    Contraseña
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="login-password"
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      value={loginData.password}
                      onChange={handleLoginChange}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                      placeholder="Ingresa tu contraseña"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
                >
                  {isLoading ? 'Iniciando sesión...' : 'Iniciar Sesión'}
                </button>
              </form>
            )}

            {/* Register Form */}
            {activeTab === 'register' && (
              <form onSubmit={handleRegisterSubmit} method="post" className="space-y-5">
                <div>
                  <label htmlFor="register-username" className="block text-sm font-medium text-gray-700 mb-2">
                    Usuario <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <User className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="register-username"
                      name="username"
                      type="text"
                      autoComplete="username"
                      required
                      value={registerData.username}
                      onChange={handleRegisterChange}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                      placeholder="Elige un nombre de usuario"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="register-email" className="block text-sm font-medium text-gray-700 mb-2">
                    Email <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Mail className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="register-email"
                      name="email"
                      type="email"
                      autoComplete="email"
                      required
                      value={registerData.email}
                      onChange={handleRegisterChange}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                      placeholder="tu@email.com"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="register-phone" className="block text-sm font-medium text-gray-700 mb-2">
                    Teléfono (opcional)
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Phone className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="register-phone"
                      name="phone"
                      type="tel"
                      autoComplete="tel"
                      value={registerData.phone}
                      onChange={handleRegisterChange}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                      placeholder="04XX-XXXXXXX"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="register-password" className="block text-sm font-medium text-gray-700 mb-2">
                    Contraseña <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="register-password"
                      name="password"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={registerData.password}
                      onChange={handleRegisterChange}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                      placeholder="Mínimo 6 caracteres"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div>
                  <label htmlFor="register-confirm-password" className="block text-sm font-medium text-gray-700 mb-2">
                    Confirmar Contraseña <span className="text-red-500">*</span>
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                      <Lock className="h-5 w-5 text-gray-400" />
                    </div>
                    <input
                      id="register-confirm-password"
                      name="confirmPassword"
                      type="password"
                      autoComplete="new-password"
                      required
                      value={registerData.confirmPassword}
                      onChange={handleRegisterChange}
                      className="w-full pl-10 pr-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition"
                      placeholder="Repite tu contraseña"
                      disabled={isLoading}
                    />
                  </div>
                </div>

                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3">
                  <p className="text-xs text-gray-600">
                    Al registrarte, aceptas nuestros términos y condiciones. Tu cuenta será creada como jugador.
                  </p>
                </div>

                <button
                  type="submit"
                  disabled={isLoading}
                  className="w-full bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white font-semibold py-3 px-4 rounded-lg transition duration-200 disabled:opacity-50 disabled:cursor-not-allowed shadow-lg hover:shadow-xl"
                >
                  {isLoading ? 'Registrando...' : 'Crear Cuenta'}
                </button>
              </form>
            )}
          </div>

          {/* Footer */}
          <div className="px-8 pb-8 text-center">
            <a
              href="/"
              className="text-sm text-blue-600 hover:text-blue-700 font-medium inline-flex items-center gap-1"
            >
              ← Volver al inicio
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}

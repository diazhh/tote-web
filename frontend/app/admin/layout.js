'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import useAuthStore from '@/lib/stores/authStore';
import { LayoutDashboard, Trophy, Calendar, Settings, LogOut, Users, MessageSquare, Send, Instagram, Facebook, Music, Bot, Menu, X, PauseCircle, DollarSign } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, logout, checkAuth } = useAuthStore();
  const [sidebarOpen, setSidebarOpen] = useState(false);

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
        if (userObj.role === 'PLAYER') {
          router.push('/dashboard');
        }
      }
    };
    verify();
  }, [checkAuth, router]);

  const handleLogout = () => {
    logout();
    router.push('/login');
  };

  if (!isAuthenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Verificando sesión...</p>
        </div>
      </div>
    );
  }

  const navigation = [
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard, excludeForTaquilla: true },
    { name: 'Sorteos', href: '/admin/sorteos', icon: Trophy, excludeForTaquilla: true },
    { name: 'Juegos', href: '/admin/juegos', icon: Calendar, excludeForTaquilla: true },
    { name: 'Depósitos', href: '/admin/depositos', icon: DollarSign, taquillaAccess: true },
    { name: 'Retiros', href: '/admin/retiros', icon: DollarSign, taquillaAccess: true },
    { name: 'Cuentas Sistema', href: '/admin/cuentas-sistema', icon: DollarSign, taquillaAccess: true },
    { name: 'Jugadores', href: '/admin/jugadores', icon: Users, taquillaAccess: true },
    { name: 'Tickets', href: '/admin/tickets', icon: Trophy, taquillaAccess: true },
    { name: 'Reportes Taquilla', href: '/admin/reportes-taquilla', icon: LayoutDashboard, taquillaAccess: true },
    { name: 'Cuentas Pago Móvil', href: '/admin/pago-movil', icon: DollarSign, excludeForTaquilla: true },
    { name: 'Pausas y Emergencia', href: '/admin/pausas', icon: PauseCircle, adminOnly: true },
    { name: 'Usuarios', href: '/admin/usuarios', icon: Users, adminOnly: true },
    { name: 'Bots Admin', href: '/admin/bots-admin', icon: Bot, adminOnly: true },
    { 
      name: 'Canales', 
      icon: MessageSquare,
      isSection: true,
      excludeForTaquilla: true,
      children: [
        { name: 'WhatsApp', href: '/admin/whatsapp', icon: MessageSquare },
        { name: 'Telegram', href: '/admin/telegram', icon: Send },
        { name: 'Instagram', href: '/admin/instagram', icon: Instagram },
        { name: 'Facebook', href: '/admin/facebook', icon: Facebook },
        { name: 'TikTok', href: '/admin/tiktok', icon: Music },
      ]
    },
    { name: 'Configuración', href: '/admin/configuracion', icon: Settings, excludeForTaquilla: true },
  ];

  const filteredNav = navigation.filter(item => {
    // Filter for TAQUILLA_ADMIN: only show taquilla-related items
    if (user?.role === 'TAQUILLA_ADMIN') {
      return item.taquillaAccess === true;
    }
    // Filter for ADMIN: show everything except items that require adminOnly if not ADMIN
    if (item.adminOnly && user?.role !== 'ADMIN') {
      return false;
    }
    // For ADMIN and OPERATOR: exclude items marked as taquilla-only
    if (item.excludeForTaquilla && user?.role === 'TAQUILLA_ADMIN') {
      return false;
    }
    return true;
  });

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 bg-gray-600 bg-opacity-75 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <div className="flex h-screen">
        {/* Sidebar */}
        <div className={`
          fixed inset-y-0 left-0 z-50 w-64 bg-white border-r border-gray-200 transform transition-transform duration-300 ease-in-out lg:translate-x-0 lg:static lg:inset-0 lg:flex-shrink-0 flex flex-col
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
        `}>
        {/* Logo */}
        <div className="h-16 flex items-center justify-between px-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">Totalizador</h1>
          <button
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* User Info */}
        <div className="p-4 border-b border-gray-200">
          <Link href="/admin/perfil" className="flex items-center space-x-3 hover:bg-gray-50 rounded-lg p-2 -m-2 transition">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.username}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.role} • Ver perfil
              </p>
            </div>
          </Link>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {filteredNav.map((item) => {
            if (item.isSection && item.children) {
              // Render section with children
              return (
                <div key={item.name} className="space-y-1">
                  <div className="flex items-center px-3 py-2 text-xs font-semibold text-gray-500 uppercase tracking-wider">
                    <item.icon className="w-4 h-4 mr-2" />
                    {item.name}
                  </div>
                  {item.children.map((child) => {
                    const ChildIcon = child.icon;
                    const isActive = pathname === child.href;
                    
                    return (
                      <Link
                        key={child.name}
                        href={child.href}
                        onClick={() => setSidebarOpen(false)}
                        className={`flex items-center px-6 py-2 text-sm font-medium rounded-lg transition ml-4 ${
                          isActive
                            ? 'bg-blue-50 text-blue-700'
                            : 'text-gray-700 hover:bg-gray-50'
                        }`}
                      >
                        <ChildIcon className="w-4 h-4 mr-3" />
                        {child.name}
                      </Link>
                    );
                  })}
                </div>
              );
            } else {
              // Render regular navigation item
              const Icon = item.icon;
              const isActive = pathname === item.href;
              
              return (
                <Link
                  key={item.name}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center px-3 py-2 text-sm font-medium rounded-lg transition ${
                    isActive
                      ? 'bg-blue-50 text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  <Icon className="w-5 h-5 mr-3" />
                  {item.name}
                </Link>
              );
            }
          })}
        </nav>

        {/* Logout */}
        <div className="p-4 border-t border-gray-200 flex-shrink-0">
          <button
            onClick={handleLogout}
            className="flex items-center w-full px-3 py-2 text-sm font-medium text-red-700 hover:bg-red-50 rounded-lg transition"
          >
            <LogOut className="w-5 h-5 mr-3" />
            Cerrar Sesión
          </button>
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0 overflow-hidden">
        {/* Top Bar */}
        <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-4 lg:px-8 flex-shrink-0">
          <div className="flex items-center">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-2 rounded-md text-gray-400 hover:text-gray-500 hover:bg-gray-100 mr-4"
            >
              <Menu className="w-6 h-6" />
            </button>
            <h2 className="text-lg font-semibold text-gray-900">
              Panel de Administración
            </h2>
          </div>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium hidden sm:block"
          >
            Ver sitio público →
          </a>
        </div>

        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-y-auto">
          {children}
        </main>
      </div>
      </div>
    </div>
  );
}

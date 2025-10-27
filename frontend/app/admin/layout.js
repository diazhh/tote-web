'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import useAuthStore from '@/lib/stores/authStore';
import { LayoutDashboard, Trophy, Calendar, Settings, LogOut, Users, MessageSquare, Send, Instagram, Facebook, Music } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isAuthenticated, logout, checkAuth } = useAuthStore();

  useEffect(() => {
    const verify = async () => {
      const isValid = await checkAuth();
      if (!isValid) {
        router.push('/login');
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
    { name: 'Dashboard', href: '/admin', icon: LayoutDashboard },
    { name: 'Sorteos', href: '/admin/sorteos', icon: Trophy },
    { name: 'Juegos', href: '/admin/juegos', icon: Calendar },
    { name: 'Usuarios', href: '/admin/usuarios', icon: Users, adminOnly: true },
    { 
      name: 'Canales', 
      icon: MessageSquare,
      isSection: true,
      children: [
        { name: 'WhatsApp', href: '/admin/whatsapp', icon: MessageSquare },
        { name: 'Telegram', href: '/admin/telegram', icon: Send },
        { name: 'Instagram', href: '/admin/instagram', icon: Instagram },
        { name: 'Facebook', href: '/admin/facebook', icon: Facebook },
        { name: 'TikTok', href: '/admin/tiktok', icon: Music },
      ]
    },
    { name: 'Configuración', href: '/admin/configuracion', icon: Settings },
  ];

  const filteredNav = navigation.filter(item => 
    !item.adminOnly || user?.role === 'ADMIN'
  );

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Sidebar */}
      <div className="fixed inset-y-0 left-0 w-64 bg-white border-r border-gray-200">
        {/* Logo */}
        <div className="h-16 flex items-center px-6 border-b border-gray-200">
          <h1 className="text-xl font-bold text-gray-900">Totalizador</h1>
        </div>

        {/* User Info */}
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-10 h-10 rounded-full bg-blue-600 flex items-center justify-center text-white font-semibold">
              {user?.username?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 truncate">
                {user?.username}
              </p>
              <p className="text-xs text-gray-500 truncate">
                {user?.role}
              </p>
            </div>
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 px-3 py-4 space-y-1">
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
        <div className="p-4 border-t border-gray-200">
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
      <div className="pl-64">
        {/* Top Bar */}
        <div className="h-16 bg-white border-b border-gray-200 flex items-center justify-between px-8">
          <h2 className="text-lg font-semibold text-gray-900">
            Panel de Administración
          </h2>
          <a
            href="/"
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 hover:text-blue-700 font-medium"
          >
            Ver sitio público →
          </a>
        </div>

        {/* Page Content */}
        <main className="p-8">
          {children}
        </main>
      </div>
    </div>
  );
}

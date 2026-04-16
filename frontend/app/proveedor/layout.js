'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

export default function ProviderLayout({ children }) {
  const router = useRouter();
  const pathname = usePathname();
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('accessToken');
    const userRaw = localStorage.getItem('user');
    let user = null;
    try { user = userRaw ? JSON.parse(userRaw) : null; } catch {}
    if (!token || !user || user.role !== 'PROVIDER') {
      router.replace('/login');
      return;
    }
    fetch(new URL('/api/portal/me', API_URL).toString(), { headers: { 'Authorization': `Bearer ${token}` } })
      .then(r => r.ok ? r.json() : Promise.reject(r))
      .then(data => { setMe(data); setReady(true); })
      .catch(() => router.replace('/login'));
  }, [router]);

  const logout = () => {
    localStorage.removeItem('accessToken');
    localStorage.removeItem('user');
    document.cookie = 'accessToken=; path=/; max-age=0';
    router.replace('/login');
  };

  if (!ready) return <div className="p-8 text-gray-500">Cargando...</div>;

  const nav = [
    { href: '/proveedor/tickets', label: 'Tickets' },
    { href: '/proveedor/sorteos', label: 'Sorteos' },
  ];

  return (
    <div className="min-h-screen flex bg-gray-50">
      <aside className="w-56 bg-white border-r p-4 flex flex-col">
        <div className="mb-6">
          <div className="text-xs text-gray-500">Portal</div>
          <div className="font-semibold text-gray-900">{me?.apiSystem?.name}</div>
          <div className="text-xs text-gray-400 mt-1">{me?.user?.username}</div>
        </div>
        <nav className="flex-1 space-y-1">
          {nav.map(n => (
            <Link key={n.href} href={n.href}
              className={`block px-3 py-2 rounded text-sm transition-colors ${
                pathname?.startsWith(n.href)
                  ? 'bg-blue-100 text-blue-700 font-medium'
                  : 'text-gray-700 hover:bg-gray-100'
              }`}>
              {n.label}
            </Link>
          ))}
        </nav>
        <button onClick={logout}
          className="mt-4 px-3 py-2 text-sm bg-gray-200 hover:bg-gray-300 text-gray-700 rounded">
          Cerrar sesión
        </button>
      </aside>
      <main className="flex-1 p-6">{children}</main>
    </div>
  );
}

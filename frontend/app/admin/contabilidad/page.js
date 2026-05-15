'use client';

// /admin/contabilidad — tab switcher root (D-05).
//
// Per Next.js App Router conventions + planner recommendation, each sub-tab
// is its own route. Clicking a tab navigates with router.push so deep links
// and the browser back button work correctly. The default landing tab is
// "asientos" per D-05.

import { useEffect } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';

const TABS = [
  { key: 'asientos',   label: 'Asientos',   href: '/admin/contabilidad/asientos' },
  { key: 'tasas',      label: 'Tasas',      href: '/admin/contabilidad/tasas' },
  { key: 'categorias', label: 'Categorías', href: '/admin/contabilidad/categorias' },
  { key: 'pagos',      label: 'Pagos',      href: '/admin/contabilidad/pagos' },
];

export default function ContabilidadPage() {
  const router = useRouter();
  const pathname = usePathname();

  // Redirect /admin/contabilidad → /admin/contabilidad/asientos (D-05 default).
  useEffect(() => {
    if (pathname === '/admin/contabilidad') {
      router.replace('/admin/contabilidad/asientos');
    }
  }, [pathname, router]);

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Contabilidad</h1>
        <p className="text-sm text-gray-500">
          Asientos, tasas de cambio, categorías y pagos
        </p>
      </div>
      <nav className="flex gap-2 border-b border-gray-200">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className="px-4 py-2 text-sm font-medium text-gray-600 hover:text-blue-700 hover:border-blue-300 border-b-2 border-transparent"
          >
            {tab.label}
          </Link>
        ))}
      </nav>
      <p className="text-sm text-gray-400">Redirigiendo…</p>
    </div>
  );
}

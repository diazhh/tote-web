'use client';

import Link from 'next/link';

export const TABS = [
  { key: 'home',           label: 'Resumen',        href: '/admin/contabilidad' },
  { key: 'asientos',       label: 'Asientos',       href: '/admin/contabilidad/asientos' },
  { key: 'transferencias', label: 'Transferencias', href: '/admin/contabilidad/transferencias' },
  { key: 'pagos',          label: 'Pagos',          href: '/admin/contabilidad/pagos' },
  { key: 'tasas',          label: 'Tasas',          href: '/admin/contabilidad/tasas' },
  { key: 'categorias',     label: 'Categorías',     href: '/admin/contabilidad/categorias' },
  { key: 'cuentas',        label: 'Cuentas',        href: '/admin/contabilidad/cuentas' },
  { key: 'reportes',       label: 'Reportes',       href: '/admin/contabilidad/reportes' },
];

export default function ContabilidadTabs({ active }) {
  return (
    <nav className="flex gap-2 border-b border-gray-200 overflow-x-auto whitespace-nowrap">
      {TABS.map((t) => (
        <Link
          key={t.key}
          href={t.href}
          className={`px-4 py-2 text-sm font-medium border-b-2 ${
            t.key === active
              ? 'text-blue-700 border-blue-600'
              : 'text-gray-600 border-transparent hover:text-blue-700'
          }`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}

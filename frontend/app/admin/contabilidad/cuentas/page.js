'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { fetchAccounts } from '@/lib/api/contabilidad';
import { formatBsF } from '@/components/contabilidad/MoneyBadge';
import ContabilidadTabs from '@/components/contabilidad/ContabilidadTabs';

export default function CuentasPage() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);

  useEffect(() => {
    setLoading(true);
    fetchAccounts({ includeInactive })
      .then((r) => setAccounts(Array.isArray(r?.data) ? r.data : []))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [includeInactive]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Contabilidad</h1>
          <p className="text-sm text-gray-500">Cuentas y billeteras</p>
        </div>
        <Link href="/admin/contabilidad/cuentas/nueva"
          className="min-h-11 px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700">
          + Nueva cuenta
        </Link>
      </div>

      <ContabilidadTabs active="cuentas" />

      <label className="flex items-center gap-2 text-sm text-gray-700">
        <input type="checkbox" checked={includeInactive} onChange={(e) => setIncludeInactive(e.target.checked)} />
        Incluir inactivas
      </label>

      {loading && <p className="text-sm text-gray-500">Cargando…</p>}
      {!loading && accounts.length === 0 && <p className="text-sm text-gray-400">Sin cuentas</p>}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {accounts.map((a) => (
          <Link key={a.id} href={`/admin/contabilidad/cuentas/${a.id}`}
            className="block bg-white shadow rounded-lg p-4 hover:shadow-md transition">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="font-bold text-gray-900">{a.name}</h3>
                <p className="text-xs text-gray-500">Inicio: {String(a.openingDate).slice(0, 10)}</p>
              </div>
              <span className="text-xs px-2 py-0.5 rounded-full bg-gray-100 text-gray-700">{a.currency}</span>
            </div>
            <div className="mt-3">
              <p className="text-xs text-gray-500">Saldo actual</p>
              <p className="text-2xl font-mono font-bold text-gray-900">
                {formatBsF(a.currentBalance)} <span className="text-sm text-gray-500">{a.currency}</span>
              </p>
            </div>
            {!a.isActive && (
              <p className="mt-2 text-xs text-red-600">Inactiva</p>
            )}
          </Link>
        ))}
      </div>
    </div>
  );
}

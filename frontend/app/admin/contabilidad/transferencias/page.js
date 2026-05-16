'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import { fetchTransfers, fetchAccounts } from '@/lib/api/contabilidad';
import { formatBsF, StatusBadge } from '@/components/contabilidad/MoneyBadge';
import ContabilidadTabs from '@/components/contabilidad/ContabilidadTabs';

export default function TransferenciasListPage() {
  const router = useRouter();
  const [transfers, setTransfers] = useState([]);
  const [accounts, setAccounts] = useState([]);
  const [filters, setFilters] = useState({ from: '', to: '', accountId: '' });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    fetchAccounts({ includeInactive: true }).then((r) => setAccounts(r?.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setLoading(true);
    fetchTransfers(filters)
      .then((r) => setTransfers(r?.data || []))
      .catch((e) => toast.error(e.message))
      .finally(() => setLoading(false));
  }, [filters]);

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-bold text-gray-900">Transferencias</h1>
          <p className="text-sm text-gray-500">Movimientos entre cuentas</p>
        </div>
        <Link href="/admin/contabilidad/transferencias/nueva"
          className="min-h-11 px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700">
          + Nueva
        </Link>
      </div>

      <ContabilidadTabs active="transferencias" />

      <details open className="bg-white shadow rounded-lg">
        <summary className="cursor-pointer px-4 py-3 text-sm font-medium text-gray-700 list-none">Filtros</summary>
        <div className="px-4 pb-4 grid grid-cols-1 md:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Desde</label>
            <input type="date" value={filters.from} onChange={(e) => setFilters({ ...filters, from: e.target.value })}
              className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Hasta</label>
            <input type="date" value={filters.to} onChange={(e) => setFilters({ ...filters, to: e.target.value })}
              className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md" />
          </div>
          <div>
            <label className="block text-xs font-medium text-gray-700 mb-1">Cuenta</label>
            <select value={filters.accountId} onChange={(e) => setFilters({ ...filters, accountId: e.target.value })}
              className="w-full min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md">
              <option value="">Todas</option>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
            </select>
          </div>
        </div>
      </details>

      {loading && <p className="text-sm text-gray-500">Cargando…</p>}
      {!loading && transfers.length === 0 && <p className="text-sm text-gray-400">Sin transferencias</p>}

      <div className="space-y-2">
        {transfers.map((t) => (
          <div key={t.id} onClick={() => router.push(`/admin/contabilidad/transferencias/${t.id}`)}
            className="bg-white shadow rounded-lg p-4 cursor-pointer hover:shadow-md">
            <div className="flex items-start justify-between gap-2 mb-2">
              <p className="text-sm text-gray-600">{String(t.transferDate).slice(0, 10)}</p>
              <StatusBadge entry={t} />
            </div>
            <div className="text-sm text-gray-900">
              <span className="font-medium">{t.fromAccount?.name}</span>
              {' → '}
              <span className="font-medium">{t.toAccount?.name}</span>
            </div>
            <p className="text-xl font-mono font-bold text-gray-900 mt-1">
              {formatBsF(t.amountFrom)} {t.fromAccount?.currency}
              {t.fromAccount?.currency !== t.toAccount?.currency &&
                <span className="text-sm text-gray-500"> ≈ {formatBsF(t.amountTo)} {t.toAccount?.currency}</span>
              }
            </p>
            <p className="text-sm text-gray-700 mt-1 line-clamp-2">{t.description}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

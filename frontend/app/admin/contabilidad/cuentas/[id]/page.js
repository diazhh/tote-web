'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import { useParams } from 'next/navigation';
import { toast } from 'sonner';
import {
  fetchAccount, updateAccount, deactivateAccount, reactivateAccount,
  fetchEntries,
} from '@/lib/api/contabilidad';
import { formatBsF, TypeBadge } from '@/components/contabilidad/MoneyBadge';

export default function CuentaDetailPage() {
  const { id } = useParams();
  const [account, setAccount] = useState(null);
  const [entries, setEntries] = useState([]);
  const [editName, setEditName] = useState('');
  const [savingName, setSavingName] = useState(false);

  const load = useCallback(async () => {
    try {
      const r = await fetchAccount(id);
      setAccount(r.data);
      setEditName(r.data.name);
      const eRes = await fetchEntries({ accountId: id });
      setEntries(Array.isArray(eRes?.data) ? eRes.data.slice(0, 30) : []);
    } catch (err) {
      toast.error(err.message);
    }
  }, [id]);

  useEffect(() => { if (id) load(); }, [id, load]);

  async function saveName() {
    setSavingName(true);
    try {
      await updateAccount(id, { name: editName });
      toast.success('Cuenta actualizada');
      await load();
    } catch (err) {
      toast.error(err.message);
    } finally { setSavingName(false); }
  }

  async function toggleActive() {
    try {
      if (account.isActive) await deactivateAccount(id);
      else await reactivateAccount(id);
      toast.success('Estado actualizado');
      await load();
    } catch (err) {
      toast.error(err.message);
    }
  }

  if (!account) return <p className="text-sm text-gray-500">Cargando…</p>;

  return (
    <div className="space-y-4 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-900">{account.name}</h1>
        <Link href="/admin/contabilidad/cuentas" className="text-sm text-blue-700 hover:underline">← Volver</Link>
      </div>

      <section className="bg-white shadow rounded-lg p-4 space-y-2">
        <div>
          <p className="text-xs text-gray-500">Saldo actual</p>
          <p className="text-3xl font-mono font-bold text-gray-900">
            {formatBsF(account.currentBalance)} <span className="text-base text-gray-500">{account.currency}</span>
          </p>
        </div>
        <div className="text-sm text-gray-600">
          Saldo inicial: <span className="font-mono">{formatBsF(account.openingBalance)} {account.currency}</span>
          {' · '}desde {String(account.openingDate).slice(0, 10)}
        </div>
        <div className="text-sm">
          Estado: {account.isActive
            ? <span className="text-green-700 font-medium">Activa</span>
            : <span className="text-red-700 font-medium">Inactiva</span>}
        </div>
      </section>

      <section className="bg-white shadow rounded-lg p-4 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Configuración</h2>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Nombre</label>
          <div className="flex gap-2">
            <input className="flex-1 min-h-11 px-2 py-2 text-sm border border-gray-300 rounded-md"
              value={editName} onChange={(e) => setEditName(e.target.value)} />
            <button onClick={saveName} disabled={savingName || editName === account.name}
              className="min-h-11 px-3 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50">
              {savingName ? 'Guardando…' : 'Guardar'}
            </button>
          </div>
        </div>
        <button onClick={toggleActive}
          className={`min-h-11 px-4 py-2 text-sm text-white rounded-md ${account.isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'}`}>
          {account.isActive ? 'Desactivar cuenta' : 'Reactivar cuenta'}
        </button>
        {account.isActive && (
          <p className="text-xs text-gray-500">Sólo se permite desactivar si el saldo es 0.</p>
        )}
      </section>

      <section className="bg-white shadow rounded-lg p-4">
        <h2 className="text-base font-semibold text-gray-900 mb-2">Últimos movimientos</h2>
        {entries.length === 0 ? (
          <p className="text-sm text-gray-400">Sin movimientos</p>
        ) : (
          <ul className="divide-y divide-gray-100">
            {entries.map((e) => (
              <li key={e.id}>
                <Link href={`/admin/contabilidad/asientos/${e.id}`}
                  className="flex items-center justify-between py-2 hover:bg-gray-50 -mx-2 px-2 rounded">
                  <div className="flex items-center gap-2 min-w-0">
                    <TypeBadge type={e.type} />
                    <div className="min-w-0">
                      <p className="text-sm text-gray-900 truncate">{e.description}</p>
                      <p className="text-xs text-gray-500">{String(e.entryDate).slice(0, 10)} · {e.category?.name}</p>
                    </div>
                  </div>
                  <p className="text-sm font-mono text-gray-900 whitespace-nowrap ml-2">{formatBsF(e.amountBsF)}</p>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

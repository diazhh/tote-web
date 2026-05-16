'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { fetchAccounts, fetchCashFlow } from '@/lib/api/contabilidad';
import { formatBsF } from '@/components/contabilidad/MoneyBadge';
import ContabilidadTabs from '@/components/contabilidad/ContabilidadTabs';

function isoDate(d) { return new Date(d).toISOString().slice(0, 10); }

function isoWeekRange() {
  const date = new Date();
  const day = date.getDay() || 7;
  if (day !== 1) date.setDate(date.getDate() - (day - 1));
  const sunday = new Date(date);
  sunday.setDate(date.getDate() + 6);
  return { from: isoDate(date), to: isoDate(sunday) };
}

export default function ContabilidadHome() {
  const [accounts, setAccounts] = useState([]);
  const [today, setToday] = useState(null);
  const [week, setWeek] = useState(null);

  useEffect(() => {
    fetchAccounts().then((r) => setAccounts(r?.data || [])).catch((e) => toast.error(e.message));
    const todayStr = isoDate(new Date());
    fetchCashFlow({ from: todayStr, to: todayStr }).then((r) => setToday(r.data)).catch(() => {});
    const w = isoWeekRange();
    fetchCashFlow({ from: w.from, to: w.to }).then((r) => setWeek({ ...r.data, range: w })).catch(() => {});
  }, []);

  return (
    <div className="space-y-4 pb-20">
      <div className="flex items-start justify-between">
        <h1 className="text-xl font-bold text-gray-900">Contabilidad</h1>
        <Link href="/admin/contabilidad/asientos/nueva"
          className="min-h-11 px-4 py-2 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700">
          + Nuevo
        </Link>
      </div>

      <ContabilidadTabs active="home" />

      <section>
        <h2 className="text-sm font-semibold text-gray-700 mb-2">Saldos actuales</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {accounts.map((a) => (
            <Link key={a.id} href={`/admin/contabilidad/cuentas/${a.id}`}
              className="bg-white shadow rounded-lg p-3 hover:shadow-md">
              <p className="text-xs text-gray-500">{a.name}</p>
              <p className="text-xl font-mono font-bold text-gray-900 mt-1">
                {formatBsF(a.currentBalance)} <span className="text-xs text-gray-500">{a.currency}</span>
              </p>
            </Link>
          ))}
        </div>
      </section>

      {today && (
        <section className="bg-white shadow rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700">Hoy · {isoDate(new Date())}</h2>
          {Object.entries(today.byCurrency).map(([cur, b]) => (
            <div key={cur} className="mt-2 text-sm">
              <p className="text-xs text-gray-500">{cur}</p>
              <div className="flex gap-4 text-sm font-mono">
                <span className="text-green-700">+{formatBsF(b.entradas)}</span>
                <span className="text-red-700">−{formatBsF(b.salidas)}</span>
                <span className="font-bold">= {Number(b.neto) >= 0 ? '+' : ''}{formatBsF(b.neto)}</span>
              </div>
            </div>
          ))}
        </section>
      )}

      {week && (
        <section className="bg-white shadow rounded-lg p-4">
          <h2 className="text-sm font-semibold text-gray-700">Esta semana · {week.range.from} – {week.range.to}</h2>
          {Object.entries(week.byCurrency).map(([cur, b]) => (
            <div key={cur} className="mt-2">
              <p className="text-xs text-gray-500">{cur}</p>
              <div className="flex gap-4 text-sm font-mono">
                <span className="text-green-700">Entradas: +{formatBsF(b.entradas)}</span>
                <span className="text-red-700">Salidas: −{formatBsF(b.salidas)}</span>
              </div>
              <p className="text-lg font-mono font-bold mt-1">Neto: {Number(b.neto) >= 0 ? '+' : ''}{formatBsF(b.neto)} {cur}</p>
            </div>
          ))}
          <Link href="/admin/contabilidad/reportes" className="text-sm text-blue-700 hover:underline mt-2 inline-block">
            Ver reportes →
          </Link>
        </section>
      )}

      <Link href="/admin/contabilidad/asientos/nueva"
        className="md:hidden fixed bottom-6 right-6 w-14 h-14 rounded-full bg-blue-600 hover:bg-blue-700 text-white text-3xl flex items-center justify-center shadow-lg z-40">
        +
      </Link>
    </div>
  );
}

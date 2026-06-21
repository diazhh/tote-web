'use client';
import { useEffect, useState, useMemo } from 'react';
import api from '@/lib/api/axios';
import { filterNumbers } from '../lib/filter-numbers';
import NumberSheet from './NumberSheet';

const fmt = (n) => 'Bs ' + Number(n || 0).toLocaleString('es-VE');

export default function Monitor({ game, draw, editable, role }) {
  const [items, setItems] = useState([]);
  const [caidas, setCaidas] = useState([]);
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState('all');
  const [sel, setSel] = useState(null);
  const [error, setError] = useState(null);

  async function load() {
    try {
      const [itemsRes, caidasRes, lastRes] = await Promise.all([
        api.get(`/monitor/items/${draw.id}`),
        api.get(`/monitor/caidas/${draw.id}`).catch(() => ({ data: { caidas: [] } })),
        api.get('/monitor/items-last-drawn', { params: { gameId: game.id } }).catch(() => ({ data: { items: [] } })),
      ]);
      const itemData = itemsRes.data?.data?.items || itemsRes.data?.items || [];
      const caidaData = caidasRes.data?.data?.caidas || caidasRes.data?.caidas || [];
      const lastMap = new Map((lastRes.data?.items || lastRes.data?.data?.items || []).map((x) => [x.number, x.daysAgo]));
      const caidaSet = new Set(caidaData.map((c) => c.number));
      setItems(itemData.map((it) => ({ ...it, daysAgo: lastMap.get(it.number) ?? it.daysAgo, caida: caidaSet.has(it.number) })));
      setCaidas(caidaData);
    } catch {
      setError('No se pudo cargar el monitor. Reintenta desde el bot.');
    }
  }
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [draw]);

  const list = useMemo(() => filterNumbers(items, { q, filter }).slice(0, 60), [items, q, filter]);

  return (
    <div style={{ padding: 14 }}>
      {error && <div style={{ background: '#3a1f1f', color: '#ff5c5c', padding: 10, borderRadius: 11, marginBottom: 12 }}>{error}</div>}
      {!editable && <div style={{ background: '#33271a', color: '#ffce85', padding: 10, borderRadius: 11, marginBottom: 12 }}>👁️ Sorteo sorteado — solo lectura</div>}
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar número o nombre…"
        style={{ width: '100%', background: '#232e3c', color: '#fff', border: 0, borderRadius: 10, padding: 11, marginBottom: 10 }} />
      <div style={{ display: 'flex', gap: 7, overflowX: 'auto', marginBottom: 10 }}>
        {[['all','Todos'],['tk','Con ventas'],['risk','Riesgo'],['caida','Caídas'],['dias','Por días']].map(([k, lbl]) => (
          <button key={k} onClick={() => setFilter(k)} style={{ flex: 'none', padding: '6px 12px', borderRadius: 20, border: 0,
            background: filter === k ? '#2ea6ff' : '#232e3c', color: filter === k ? '#fff' : '#7d8b99' }}>{lbl}</button>
        ))}
      </div>
      {list.map((it) => (
        <div key={it.number} onClick={() => setSel(it)}
          style={{ background: '#1d2733', borderLeft: '3px solid ' + (it.caida ? '#b388ff' : (it.percentageOfSales >= 70 ? '#ff5c5c' : '#2b3947')),
                   borderRadius: 12, padding: 11, marginBottom: 8, display: 'flex', gap: 12, alignItems: 'center' }}>
          <div style={{ minWidth: 46, textAlign: 'center' }}>
            <div style={{ fontSize: 20, fontWeight: 800 }}>{it.number}</div>
            {it.name && <div style={{ fontSize: 10, color: '#7d8b99' }}>{it.name}</div>}
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontWeight: 700 }}>{it.totalAmount ? fmt(it.totalAmount) : '—'}</div>
            <div style={{ fontSize: 11, color: '#86a7c4' }}>↘ hace {it.daysAgo ?? '?'} d{it.tripletaCount ? ` · ▣ ${it.tripletaCount}` : ''}</div>
          </div>
          <div style={{ fontWeight: 800, color: it.percentageOfSales >= 70 ? '#ff5c5c' : '#4dd07a' }}>{it.totalAmount ? `${Math.round(it.percentageOfSales)}%` : ''}</div>
        </div>
      ))}
      {sel && <NumberSheet item={sel} draw={draw} game={game} editable={editable} role={role} onClose={() => setSel(null)} onChanged={() => { setSel(null); load(); }} />}
    </div>
  );
}

'use client';
import { useEffect, useState } from 'react';
import api from '@/lib/api/axios';
import { orderDraws } from '../lib/order-draws';

function todayYMD() { return new Date().toISOString().slice(0, 10); }
function nowHHMM() { return new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }); }

export default function DrawPicker({ game, onPick }) {
  const [groups, setGroups] = useState({ upcoming: [], past: [] });
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const ymd = todayYMD();
      const { data } = await api.get('/draws', { params: { gameId: game.id, dateFrom: ymd, dateTo: ymd } });
      const draws = data?.data || data?.draws || data || [];
      setGroups(orderDraws(Array.isArray(draws) ? draws : [], nowHHMM()));
      setLoading(false);
    })();
  }, [game]);

  if (loading) return <div style={{ padding: 24 }}>Cargando sorteos…</div>;
  const Btn = (d, editable) => (
    <button key={d.id} onClick={() => onPick(d, editable)}
      style={{ width: '100%', textAlign: 'left', background: editable ? '#1b2c3d' : '#1d2733',
               color: '#fff', border: '1px solid ' + (editable ? '#2ea6ff' : '#2b3947'),
               borderRadius: 14, padding: 14, marginBottom: 9 }}>
      <b style={{ fontSize: 18 }}>{(d.drawTime || '').slice(0, 5)}</b>
      <span style={{ marginLeft: 10, color: '#7d8b99' }}>{editable ? d.status : 'Sorteado · solo lectura'}</span>
    </button>
  );
  return (
    <div style={{ padding: 14 }}>
      <h4 style={{ color: '#7d8b99' }}>Sorteos · {game.name}</h4>
      {groups.upcoming.map((d) => Btn(d, true))}
      {groups.past.length > 0 && <div style={{ color: '#7d8b99', fontSize: 11, margin: '14px 4px' }}>ANTERIORES · SOLO LECTURA</div>}
      {groups.past.map((d) => Btn(d, false))}
    </div>
  );
}

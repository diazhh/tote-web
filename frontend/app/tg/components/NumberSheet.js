'use client';
import { useState } from 'react';
import api from '@/lib/api/axios';
import { showConfirm, haptic } from '../lib/telegram';

export default function NumberSheet({ item, draw, game, editable, role, onClose, onChanged }) {
  const isAdmin = role === 'ADMIN';
  const [actionError, setActionError] = useState(null);
  const [busy, setBusy] = useState(false);

  // Runs an async action with shared error/feedback handling. Used by
  // preselect (and the quota/block actions in Task 7).
  async function runAction(fn) {
    setActionError(null);
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      haptic('error');
      setActionError('No se pudo completar la acción. Reintenta desde el bot.');
    } finally {
      setBusy(false);
    }
  }

  async function preselect() {
    const ok = await showConfirm(`Marcar ${item.number}${item.name ? ' · ' + item.name : ''} como pre-ganador del sorteo de las ${(draw.drawTime || '').slice(0, 5)}. Se notificará a los demás administradores.`);
    if (!ok) return;
    await runAction(async () => {
      await api.post(`/draws/${draw.id}/change-winner`, { newWinnerItemId: item.gameItemId || item.itemId });
      haptic('success');
      onChanged();
    });
  }

  return (
    <div onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,.55)', display: 'flex', alignItems: 'flex-end', zIndex: 40 }}>
      <div style={{ width: '100%', background: '#232e3c', borderRadius: '18px 18px 0 0', padding: '14px 16px 24px' }}>
        <div style={{ fontWeight: 800, fontSize: 22 }}>{item.number} {item.name}</div>
        <div style={{ color: '#7d8b99', fontSize: 13, marginBottom: 12 }}>
          {item.totalAmount ? `Apostado Bs ${Number(item.totalAmount).toLocaleString('es-VE')} · ${Math.round(item.percentageOfSales)}%` : 'Sin ventas'} · hace {item.daysAgo ?? '?'} días
        </div>
        {actionError && <div style={{ background: '#3a1f1f', color: '#ff5c5c', padding: 10, borderRadius: 10, marginBottom: 10 }}>{actionError}</div>}
        {!editable ? (
          <div style={{ color: '#9fb0c0', textAlign: 'center', padding: 16 }}>👁️ Sorteo sorteado — solo lectura.</div>
        ) : (
          <>
            <button onClick={preselect} disabled={busy} style={btn}>⭐ Preseleccionar este número</button>
            {/* Cupo/bloqueo: Task 7 (solo ADMIN) */}
            {isAdmin && <div id="quota-actions" />}
          </>
        )}
      </div>
    </div>
  );
}
const btn = { width: '100%', textAlign: 'left', background: '#1d2733', color: '#fff', border: '1px solid #2b3947', borderRadius: 10, padding: 15, marginBottom: 8, fontSize: 16 };

'use client';
import { useEffect } from 'react';
import { useSession } from './store';
import { tgReady } from './lib/telegram';

export default function TgHome() {
  const { status, session, error, authenticate } = useSession();
  useEffect(() => { tgReady(); authenticate(); }, [authenticate]);

  if (status === 'loading' || status === 'idle') return <div style={{ padding: 24 }}>Cargando…</div>;
  if (status === 'error') return <div style={{ padding: 24, color: '#ff5c5c' }}>{error}</div>;

  return (
    <div style={{ padding: 16 }}>
      <h3>Hola, {session.user.name} ({session.user.role})</h3>
      <p style={{ color: '#7d8b99' }}>Tus juegos:</p>
      <ul>{session.games.map((g) => <li key={g.id}>{g.name}</li>)}</ul>
    </div>
  );
}

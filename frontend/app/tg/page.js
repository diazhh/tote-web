'use client';
import { useEffect, useState } from 'react';
import { useSession } from './store';
import { tgReady, setBackButton } from './lib/telegram';
import GamePicker from './components/GamePicker';
import DrawPicker from './components/DrawPicker';
import Monitor from './components/Monitor';

export default function TgHome() {
  const { status, session, error, authenticate } = useSession();
  const [view, setView] = useState('games'); // games | draws | monitor
  const [game, setGame] = useState(null);
  const [draw, setDraw] = useState(null);
  const [editable, setEditable] = useState(false);

  useEffect(() => { tgReady(); authenticate(); }, [authenticate]);
  useEffect(() => {
    if (view === 'games') setBackButton(null);
    if (view === 'draws') setBackButton(() => setView('games'));
    if (view === 'monitor') setBackButton(() => setView('draws'));
  }, [view]);

  if (status !== 'ok') return <div style={{ padding: 24, color: status === 'error' ? '#ff5c5c' : '#fff' }}>{status === 'error' ? error : 'Cargando…'}</div>;
  if (view === 'games') return <GamePicker games={session.games} onPick={(g) => { setGame(g); setView('draws'); }} />;
  if (view === 'draws') return <DrawPicker game={game} onPick={(d, ed) => { setDraw(d); setEditable(ed); setView('monitor'); }} />;
  return <Monitor game={game} draw={draw} editable={editable} role={session.user.role} />;
}

'use client';
export default function GamePicker({ games, onPick }) {
  return (
    <div style={{ padding: 14 }}>
      <h4 style={{ color: '#7d8b99', textTransform: 'uppercase', fontSize: 13 }}>Tus juegos</h4>
      {games.map((g) => (
        <button key={g.id} onClick={() => onPick(g)}
          style={{ width: '100%', textAlign: 'left', background: '#1d2733', color: '#fff',
                   border: '1px solid #2b3947', borderRadius: 14, padding: 16, marginBottom: 10, fontSize: 16 }}>
          {g.name}
        </button>
      ))}
    </div>
  );
}

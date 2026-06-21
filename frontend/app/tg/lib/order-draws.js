export function isEditable(draw) { return draw.status !== 'DRAWN'; }

/** Separa sorteos en upcoming (próximo primero) y past (sorteados, más reciente primero). */
export function orderDraws(draws, nowHHMM) {
  const now = nowHHMM; // 'HH:MM'
  const hhmm = (d) => (d.drawTime || '').slice(0, 5);
  const upcoming = draws.filter((d) => d.status !== 'DRAWN' && hhmm(d) >= now)
    .sort((a, b) => hhmm(a).localeCompare(hhmm(b)));
  const past = draws.filter((d) => d.status === 'DRAWN' || hhmm(d) < now)
    .sort((a, b) => hhmm(b).localeCompare(hhmm(a)));
  return { upcoming, past };
}

export function filterNumbers(items, { q = '', filter = 'all' } = {}) {
  const needle = q.toLowerCase().trim();
  let out = items.filter((it) => {
    if (needle && !(String(it.number).includes(needle) || (it.name || '').toLowerCase().includes(needle))) return false;
    if (filter === 'tk') return it.totalAmount > 0;
    if (filter === 'risk') return (it.percentageOfSales || 0) >= 70;
    if (filter === 'caida') return !!it.caida;
    return true;
  });
  if (filter === 'dias') out = [...out].sort((a, b) => (b.daysAgo || 0) - (a.daysAgo || 0));
  else out = [...out].sort((a, b) => (b.totalAmount || 0) - (a.totalAmount || 0));
  return out;
}

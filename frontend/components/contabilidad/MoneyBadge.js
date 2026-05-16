'use client';

const TYPE_LABELS = {
  INCOME: { label: 'Ingreso', cls: 'bg-green-100 text-green-800' },
  EXPENSE: { label: 'Gasto', cls: 'bg-red-100 text-red-800' },
  PAYMENT: { label: 'Pago', cls: 'bg-blue-100 text-blue-800' },
  TRANSFER: { label: 'Transferencia', cls: 'bg-purple-100 text-purple-800' },
};

export function TypeBadge({ type }) {
  const cfg = TYPE_LABELS[type] || { label: type, cls: 'bg-gray-100 text-gray-700' };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      {cfg.label}
    </span>
  );
}

export function StatusBadge({ entry }) {
  if (entry.reversedById) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Reversado</span>;
  }
  if (entry.reversesId) {
    return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Reversión</span>;
  }
  return <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Activo</span>;
}

export function formatBsF(value, opts = { decimals: 2 }) {
  if (value === null || value === undefined) return '—';
  return Number(value).toLocaleString('es-VE', {
    minimumFractionDigits: opts.decimals,
    maximumFractionDigits: opts.decimals,
  });
}

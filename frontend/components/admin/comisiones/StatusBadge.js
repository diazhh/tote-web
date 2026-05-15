'use client';

// DRAFT / CONFIRMED / ADJUSTED pill — mirrors the StatusBadge shape used in
// frontend/app/admin/proveedores/logs/page.js (lines 8-27). Labels in Spanish
// per the rest of the admin UI.

const STATUS_STYLES = {
  DRAFT:     'bg-yellow-100 text-yellow-800',
  CONFIRMED: 'bg-green-100 text-green-800',
  ADJUSTED:  'bg-orange-100 text-orange-800',
};

const STATUS_LABELS = {
  DRAFT:     'Borrador',
  CONFIRMED: 'Confirmada',
  ADJUSTED:  'Ajustada',
};

export default function StatusBadge({ status }) {
  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
        STATUS_STYLES[status] || 'bg-gray-100 text-gray-800'
      }`}
    >
      {STATUS_LABELS[status] || status}
    </span>
  );
}

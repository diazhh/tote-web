'use client';

/**
 * ResponsiveTable - Shows table on desktop, cards on mobile
 * 
 * Usage:
 * <ResponsiveTable
 *   data={items}
 *   columns={[
 *     { key: 'name', label: 'Nombre', primary: true },
 *     { key: 'status', label: 'Estado', render: (item) => <Badge>{item.status}</Badge> },
 *     { key: 'amount', label: 'Monto', align: 'right' }
 *   ]}
 *   actions={(item) => <button>Edit</button>}
 *   onRowClick={(item) => handleClick(item)}
 *   emptyMessage="No hay datos"
 *   emptyIcon={<Icon />}
 * />
 */

export default function ResponsiveTable({
  data = [],
  columns = [],
  actions,
  onRowClick,
  emptyMessage = 'No hay datos para mostrar',
  emptyIcon,
  loading = false,
  loadingMessage = 'Cargando...',
  rowClassName,
  cardClassName,
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">{loadingMessage}</p>
        </div>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="text-center py-12">
        {emptyIcon && <div className="flex justify-center mb-4">{emptyIcon}</div>}
        <p className="text-gray-600">{emptyMessage}</p>
      </div>
    );
  }

  const primaryColumn = columns.find(c => c.primary) || columns[0];
  const secondaryColumns = columns.filter(c => c !== primaryColumn);

  const getValue = (item, column) => {
    if (column.render) {
      return column.render(item);
    }
    const keys = column.key.split('.');
    let value = item;
    for (const key of keys) {
      value = value?.[key];
    }
    return value ?? '-';
  };

  return (
    <>
      {/* Desktop Table - hidden on mobile */}
      <div className="hidden md:block overflow-x-auto">
        <table className="min-w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              {columns.map((column, idx) => (
                <th
                  key={idx}
                  className={`px-4 py-3 text-xs font-medium text-gray-500 uppercase tracking-wider ${
                    column.align === 'right' ? 'text-right' : 
                    column.align === 'center' ? 'text-center' : 'text-left'
                  }`}
                >
                  {column.label}
                </th>
              ))}
              {actions && (
                <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                  Acciones
                </th>
              )}
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {data.map((item, rowIdx) => (
              <tr
                key={item.id || rowIdx}
                className={`hover:bg-gray-50 ${onRowClick ? 'cursor-pointer' : ''} ${
                  typeof rowClassName === 'function' ? rowClassName(item) : rowClassName || ''
                }`}
                onClick={() => onRowClick?.(item)}
              >
                {columns.map((column, colIdx) => (
                  <td
                    key={colIdx}
                    className={`px-4 py-4 whitespace-nowrap text-sm ${
                      column.align === 'right' ? 'text-right' : 
                      column.align === 'center' ? 'text-center' : 'text-left'
                    } ${column.className || ''}`}
                  >
                    {getValue(item, column)}
                  </td>
                ))}
                {actions && (
                  <td className="px-4 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div onClick={(e) => e.stopPropagation()}>
                      {actions(item)}
                    </div>
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Cards - hidden on desktop */}
      <div className="md:hidden space-y-3 p-3">
        {data.map((item, idx) => (
          <div
            key={item.id || idx}
            className={`bg-white border border-gray-200 rounded-lg shadow-sm overflow-hidden ${
              onRowClick ? 'cursor-pointer active:bg-gray-50' : ''
            } ${typeof cardClassName === 'function' ? cardClassName(item) : cardClassName || ''}`}
            onClick={() => onRowClick?.(item)}
          >
            {/* Card Header - Primary Column */}
            <div className="px-4 py-3 bg-gray-50 border-b border-gray-200">
              <div className="flex items-center justify-between">
                <div className="font-medium text-gray-900">
                  {primaryColumn.mobileLabel || primaryColumn.label}
                </div>
                <div className="text-sm">
                  {getValue(item, primaryColumn)}
                </div>
              </div>
            </div>

            {/* Card Body - Secondary Columns */}
            <div className="px-4 py-3 space-y-2">
              {secondaryColumns.map((column, colIdx) => (
                <div key={colIdx} className="flex items-center justify-between text-sm">
                  <span className="text-gray-500">{column.mobileLabel || column.label}</span>
                  <span className={`font-medium ${column.className || 'text-gray-900'}`}>
                    {getValue(item, column)}
                  </span>
                </div>
              ))}
            </div>

            {/* Card Footer - Actions */}
            {actions && (
              <div 
                className="px-4 py-3 bg-gray-50 border-t border-gray-200"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-end gap-2">
                  {actions(item)}
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

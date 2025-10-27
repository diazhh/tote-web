import { FileQuestion } from 'lucide-react';

/**
 * Empty state component
 * @param {Object} props
 * @param {string} props.title - Title
 * @param {string} props.description - Description
 * @param {React.ReactNode} props.icon - Custom icon
 */
export default function EmptyState({ 
  title = 'No hay datos', 
  description = 'No se encontraron resultados',
  icon 
}) {
  return (
    <div className="flex flex-col items-center justify-center py-12 text-center">
      {icon || <FileQuestion className="h-16 w-16 text-gray-400 mb-4" />}
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-sm text-gray-500 max-w-md">{description}</p>
    </div>
  );
}

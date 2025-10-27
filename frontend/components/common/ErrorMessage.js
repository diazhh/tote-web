import { AlertCircle } from 'lucide-react';

export default function ErrorMessage({ message, title = 'Error' }) {
  return (
    <div className="bg-red-50 border border-red-200 rounded-lg p-4 max-w-md">
      <div className="flex items-start gap-3">
        <AlertCircle className="h-5 w-5 text-red-600 flex-shrink-0 mt-0.5" />
        <div>
          <h3 className="text-sm font-semibold text-red-900">{title}</h3>
          <p className="text-sm text-red-700 mt-1">{message}</p>
        </div>
      </div>
    </div>
  );
}

'use client';

import FacebookInstanceManager from '@/components/admin/FacebookInstanceManager';

export default function FacebookPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Facebook</h1>
        <p className="text-gray-600 mt-2">
          Gestiona las instancias de Facebook Messenger API para envío de resultados de sorteos.
        </p>
      </div>

      <FacebookInstanceManager />
    </div>
  );
}

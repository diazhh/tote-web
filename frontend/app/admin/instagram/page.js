'use client';

import InstagramInstanceManager from '@/components/admin/InstagramInstanceManager';

export default function InstagramPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Instagram</h1>
        <p className="text-gray-600 mt-2">
          Gestiona las instancias de Instagram Basic Display API para integración con sorteos.
        </p>
      </div>

      <InstagramInstanceManager />
    </div>
  );
}

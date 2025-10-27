'use client';

import TikTokInstanceManager from '@/components/admin/TikTokInstanceManager';

export default function TikTokPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">TikTok</h1>
        <p className="text-gray-600 mt-2">
          Gestiona las instancias de TikTok for Business API para integración con sorteos.
        </p>
      </div>

      <TikTokInstanceManager />
    </div>
  );
}

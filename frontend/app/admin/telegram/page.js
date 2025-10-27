'use client';

import TelegramInstanceManager from '@/components/admin/TelegramInstanceManager';

export default function TelegramPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-gray-900">Telegram</h1>
        <p className="text-gray-600 mt-2">
          Gestiona las instancias de bots de Telegram para envío de resultados de sorteos.
        </p>
      </div>

      <TelegramInstanceManager />
    </div>
  );
}

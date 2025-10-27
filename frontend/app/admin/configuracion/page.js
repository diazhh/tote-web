'use client';

import GamesTab from '@/components/admin/config/GamesTab';

export default function ConfiguracionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-600 mt-1">Selecciona un juego para gestionarlo en detalle</p>
      </div>

      <div className="bg-white rounded-lg shadow p-6">
        <GamesTab />
      </div>
    </div>
  );
}

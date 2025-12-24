'use client';

import GamesTab from '@/components/admin/config/GamesTab';
import TelegramLinkCard from '@/components/admin/TelegramLinkCard';
import BetSimulatorControl from '@/components/admin/config/BetSimulatorControl';

export default function ConfiguracionPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Configuración</h1>
        <p className="text-gray-600 mt-1">Configuración del sistema</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 lg:gap-6">
        {/* Vinculación de Telegram */}
        <div className="lg:col-span-1 space-y-4">
          <TelegramLinkCard />
          <BetSimulatorControl />
        </div>

        {/* Juegos */}
        <div className="lg:col-span-2">
          <div className="bg-white rounded-lg shadow p-4 lg:p-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-4">Juegos</h2>
            <GamesTab />
          </div>
        </div>
      </div>
    </div>
  );
}

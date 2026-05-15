'use client';

import { useState } from 'react';
import SettlementsTab from '@/components/admin/comisiones/SettlementsTab';
import LedgerTab from '@/components/admin/comisiones/LedgerTab';

export default function ComisionesPage() {
  // Default tab is Liquidaciones (settlements) per D-05.
  const [activeTab, setActiveTab] = useState('settlements');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Comisiones</h1>
        <p className="text-gray-600 mt-1 text-sm">
          Liquidaciones semanales por proveedor y ledger detallado por sorteo.
        </p>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('settlements')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'settlements'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Liquidaciones
          </button>
          <button
            onClick={() => setActiveTab('ledger')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'ledger'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Ledger
          </button>
        </nav>
      </div>

      {activeTab === 'settlements' && <SettlementsTab />}
      {activeTab === 'ledger' && <LedgerTab />}
    </div>
  );
}

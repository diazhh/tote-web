'use client';

import { useEffect, useState } from 'react';
import { useParams } from 'next/navigation';
import Link from 'next/link';
import { Plus, ArrowLeft } from 'lucide-react';
import { listConfigs } from '@/lib/api/commissions';
import NewConfigModal from '@/components/admin/comisiones/NewConfigModal';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

function fmtDate(iso) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleString('es-VE');
  } catch {
    return String(iso);
  }
}

export default function ProveedorComisionesPage() {
  const params = useParams();
  const apiSystemId = params?.id;

  const [systemName, setSystemName] = useState('');
  const [configs, setConfigs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');
    try {
      const token = localStorage.getItem('accessToken');
      // Lightweight provider lookup for the header label. Existing endpoint:
      // GET /providers/systems returns the full list — we filter client-side.
      const sysRes = await fetch(`${API_URL}/providers/systems`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const sysList = await sysRes.json().catch(() => []);
      const match = Array.isArray(sysList)
        ? sysList.find((s) => s.id === apiSystemId)
        : null;
      setSystemName(match?.name || apiSystemId);

      const data = await listConfigs(apiSystemId);
      const list = Array.isArray(data) ? data : data?.data || [];
      // Controller returns rows newest effectiveFrom first.
      setConfigs(list);
    } catch (err) {
      setError(err.message || 'Error cargando configuraciones');
      setConfigs([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (apiSystemId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiSystemId]);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-2 text-sm text-gray-500">
        <Link
          href="/admin/proveedores"
          className="inline-flex items-center hover:text-gray-700"
        >
          <ArrowLeft className="w-4 h-4 mr-1" /> Volver a Proveedores
        </Link>
      </div>

      <div className="flex justify-between items-center flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">
            Comisiones — {systemName}
          </h1>
          <p className="text-gray-600 mt-1 text-sm">
            Historial append-only de configuraciones de comisión. Cada nueva
            configuración crea una versión efectiva desde un instante en el
            tiempo; las versiones anteriores quedan preservadas.
          </p>
        </div>
        <button
          onClick={() => setShowModal(true)}
          className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
        >
          <Plus className="w-4 h-4 mr-2" />
          Nueva configuración
        </button>
      </div>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-40">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          </div>
        ) : error ? (
          <div className="p-6 text-center text-red-600 text-sm">{error}</div>
        ) : configs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-lg font-medium">Sin configuraciones</p>
            <p className="text-sm mt-1">
              Crea la primera configuración para activar el cómputo automático
              de comisiones.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Efectivo desde
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tipo de fórmula
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tasa ventas
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Tasa utilidad
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Brackets
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Notas
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Creado por
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {configs.map((cfg, idx) => (
                  <tr
                    key={cfg.id}
                    className={idx === 0 ? 'bg-green-50 hover:bg-green-100' : 'hover:bg-gray-50'}
                  >
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                      {fmtDate(cfg.effectiveFrom)}
                      {idx === 0 && (
                        <span className="ml-2 inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-200 text-green-900">
                          Vigente
                        </span>
                      )}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-xs font-mono">
                      {cfg.formulaType}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono">
                      {cfg.salesRate ?? '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-mono">
                      {cfg.utilityRate ?? '—'}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-right">
                      {Array.isArray(cfg.tiers) ? cfg.tiers.length : 0}
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-600 max-w-xs truncate">
                      {cfg.notes || ''}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {cfg.createdBy?.email || cfg.createdById || '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {showModal && (
        <NewConfigModal
          apiSystemId={apiSystemId}
          onClose={() => setShowModal(false)}
          onCreated={load}
        />
      )}
    </div>
  );
}

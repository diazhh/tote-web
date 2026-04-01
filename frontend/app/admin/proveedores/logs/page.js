'use client';

import { useState, useEffect } from 'react';
import { Eye, ChevronLeft, ChevronRight, RefreshCw } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

const STATUS_STYLES = {
  DISCOVERED: 'bg-yellow-100 text-yellow-800',
  PROCESSED:  'bg-green-100 text-green-800',
  DUPLICATE:  'bg-gray-100 text-gray-800',
  FAILED:     'bg-red-100 text-red-800',
};
const STATUS_LABELS = {
  DISCOVERED: 'Descubierto',
  PROCESSED:  'Procesado',
  DUPLICATE:  'Duplicado',
  FAILED:     'Fallido',
};

function StatusBadge({ status }) {
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${STATUS_STYLES[status] || 'bg-gray-100 text-gray-800'}`}>
      {STATUS_LABELS[status] || status}
    </span>
  );
}

function LogInspectorModal({ log, onClose }) {
  let parsedPayload = null;
  let parseError = false;
  try {
    parsedPayload = JSON.parse(log.rawPayload);
  } catch {
    parseError = true;
  }

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-white rounded-lg p-4 sm:p-6 max-w-3xl w-full mx-2 sm:mx-0 max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
        <h2 className="text-xl font-bold mb-4">Inspector de Payload</h2>

        <div className="space-y-4">
          {/* Metadata */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 sm:gap-4 text-sm">
            <div><strong>Proveedor:</strong> {log.apiSystem?.name || log.apiSystemId}</div>
            <div><strong>Status:</strong> <StatusBadge status={log.status} /></div>
            <div><strong>Fecha:</strong> {new Date(log.createdAt).toLocaleString('es-VE')}</div>
            <div><strong>ID:</strong> <span className="font-mono text-xs">{log.id}</span></div>
            {log.errorMessage && (
              <div className="col-span-2 text-red-600">
                <strong>Error:</strong> {log.errorMessage}
              </div>
            )}
          </div>

          {/* Payload — LOGS-03 */}
          <div>
            <h3 className="font-medium mb-2 text-gray-700">Payload Raw</h3>
            <pre className="bg-gray-100 p-3 sm:p-4 rounded-lg text-[11px] sm:text-xs overflow-x-auto whitespace-pre-wrap break-words max-h-64">
              {parseError ? log.rawPayload : JSON.stringify(parsedPayload, null, 2)}
            </pre>
          </div>

          {/* Headers — LOGS-04 */}
          <div>
            <h3 className="font-medium mb-2 text-gray-700">Headers</h3>
            {log.headers ? (
              <pre className="bg-gray-100 p-3 sm:p-4 rounded-lg text-[11px] sm:text-xs overflow-x-auto whitespace-pre-wrap break-words max-h-48">
                {JSON.stringify(log.headers, null, 2)}
              </pre>
            ) : (
              <p className="text-sm text-gray-400 italic">Sin headers registrados</p>
            )}
          </div>
        </div>

        <div className="flex justify-end mt-6">
          <button
            onClick={onClose}
            className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
          >
            Cerrar
          </button>
        </div>
      </div>
    </div>
  );
}

export default function WebhookLogsPage() {
  const [logs, setLogs] = useState([]);
  const [systems, setSystems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [pagination, setPagination] = useState({ page: 1, limit: 50, total: 0, totalPages: 1, hasNext: false, hasPrev: false });
  const [selectedLog, setSelectedLog] = useState(null);
  const [apiSystemIdFilter, setApiSystemIdFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Fetch systems list once for the filter dropdown
  useEffect(() => {
    const token = localStorage.getItem('token');
    const headers = { 'Authorization': `Bearer ${token}` };
    fetch(`${API_URL}/providers/systems`, { headers })
      .then(r => r.json())
      .then(data => setSystems(Array.isArray(data) ? data : []))
      .catch(() => setSystems([]));
  }, []);

  // Fetch logs whenever page or filters change
  useEffect(() => {
    fetchLogs(pagination.page, apiSystemIdFilter, statusFilter);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pagination.page, apiSystemIdFilter, statusFilter]);

  const fetchLogs = async (page, apiSystemId, status) => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = { 'Authorization': `Bearer ${token}` };
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (apiSystemId) params.set('apiSystemId', apiSystemId);
      if (status) params.set('status', status);
      const res = await fetch(`${API_URL}/providers/webhook-logs?${params}`, { headers });
      const json = await res.json();
      setLogs(Array.isArray(json.data) ? json.data : []);
      if (json.pagination) {
        setPagination(prev => ({ ...prev, ...json.pagination }));
      }
    } catch (err) {
      console.error('Error cargando logs:', err);
      setLogs([]);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (setter) => (e) => {
    setter(e.target.value);
    // Reset page to 1 on filter change
    setPagination(prev => ({ ...prev, page: 1 }));
  };

  const setPage = (updater) => {
    setPagination(prev => {
      const next = typeof updater === 'function' ? updater(prev) : { ...prev, page: updater };
      return { ...prev, page: next.page };
    });
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proveedores</h1>
          <p className="text-gray-600 mt-1">Logs de webhooks recibidos</p>
        </div>
        <button
          onClick={() => fetchLogs(pagination.page, apiSystemIdFilter, statusFilter)}
          className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar
        </button>
      </div>

      {/* Tab navigation — mirrors proveedores/page.js; uses links not state */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <a
            href="/admin/proveedores"
            className="py-4 px-1 border-b-2 font-medium text-sm border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          >
            Configuraciones
          </a>
          <a
            href="/admin/proveedores"
            className="py-4 px-1 border-b-2 font-medium text-sm border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          >
            Sistemas
          </a>
          <a
            href="/admin/proveedores/logs"
            className="py-4 px-1 border-b-2 font-medium text-sm border-blue-500 text-blue-600"
          >
            Logs de Webhook
          </a>
        </nav>
      </div>

      {/* Filters — LOGS-02 */}
      <div className="bg-white rounded-lg shadow p-4">
        <div className="flex flex-wrap gap-2 sm:gap-4 items-center">
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Proveedor:</label>
            <select
              value={apiSystemIdFilter}
              onChange={handleFilterChange(setApiSystemIdFilter)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos</option>
              {systems.map(s => (
                <option key={s.id} value={s.id}>{s.name}</option>
              ))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <label className="text-sm font-medium text-gray-700">Status:</label>
            <select
              value={statusFilter}
              onChange={handleFilterChange(setStatusFilter)}
              className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">Todos</option>
              <option value="DISCOVERED">Descubierto</option>
              <option value="PROCESSED">Procesado</option>
              <option value="DUPLICATE">Duplicado</option>
              <option value="FAILED">Fallido</option>
            </select>
          </div>
          {(apiSystemIdFilter || statusFilter) && (
            <button
              onClick={() => {
                setApiSystemIdFilter('');
                setStatusFilter('');
                setPagination(prev => ({ ...prev, page: 1 }));
              }}
              className="text-sm text-gray-500 hover:text-gray-700 underline"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Table — LOGS-01 */}
      <div className="bg-white rounded-lg shadow overflow-hidden">
        {loading ? (
          <div className="flex items-center justify-center h-48">
            <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-blue-600"></div>
          </div>
        ) : logs.length === 0 ? (
          <div className="p-8 text-center text-gray-500">
            <p className="text-lg font-medium">No hay logs disponibles</p>
            <p className="text-sm mt-1">Los webhooks recibidos apareceran aqui</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Proveedor</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Fecha</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Payload (preview)</th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Accion</th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {logs.map(log => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900">
                      {log.apiSystem?.name || log.apiSystemId}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {new Date(log.createdAt).toLocaleString('es-VE')}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <StatusBadge status={log.status} />
                    </td>
                    <td className="px-6 py-4 text-sm text-gray-500 font-mono max-w-xs">
                      <span className="truncate block">
                        {log.rawPayload.length > 80 ? `${log.rawPayload.slice(0, 80)}\u2026` : log.rawPayload}
                      </span>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                      <button
                        onClick={() => setSelectedLog(log)}
                        className="inline-flex items-center px-3 py-1.5 border border-gray-300 rounded-lg text-xs font-medium text-gray-700 hover:bg-gray-50"
                        title="Inspeccionar payload"
                      >
                        <Eye className="w-3.5 h-3.5 mr-1" />
                        Inspeccionar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination */}
        {pagination.totalPages > 1 && (
          <div className="px-6 py-4 border-t border-gray-200 flex items-center justify-between">
            <div className="text-sm text-gray-600">
              Mostrando {((pagination.page - 1) * pagination.limit) + 1}&ndash;{Math.min(pagination.page * pagination.limit, pagination.total)} de {pagination.total} logs
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setPage(prev => ({ ...prev, page: prev.page - 1 }))}
                disabled={!pagination.hasPrev}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-5 h-5" />
              </button>
              <span className="px-4 py-2 text-sm text-gray-700">
                Pagina {pagination.page} de {pagination.totalPages}
              </span>
              <button
                onClick={() => setPage(prev => ({ ...prev, page: prev.page + 1 }))}
                disabled={!pagination.hasNext}
                className="p-2 rounded-lg border border-gray-300 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Inspector modal — LOGS-03 + LOGS-04 */}
      {selectedLog && (
        <LogInspectorModal
          log={selectedLog}
          onClose={() => setSelectedLog(null)}
        />
      )}
    </div>
  );
}

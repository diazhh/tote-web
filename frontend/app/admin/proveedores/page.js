'use client';

import { useState, useEffect } from 'react';
import { Plus, Edit, Trash2, Power, PowerOff, TestTube, BarChart3, RefreshCw } from 'lucide-react';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000';

export default function ProveedoresPage() {
  const [systems, setSystems] = useState([]);
  const [configurations, setConfigurations] = useState([]);
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('configurations');
  const [showSystemModal, setShowSystemModal] = useState(false);
  const [showConfigModal, setShowConfigModal] = useState(false);
  const [editingSystem, setEditingSystem] = useState(null);
  const [editingConfig, setEditingConfig] = useState(null);
  const [testResult, setTestResult] = useState(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      setLoading(true);
      const token = localStorage.getItem('token');
      const headers = {
        'Authorization': `Bearer ${token}`,
        'Content-Type': 'application/json'
      };

      const [systemsRes, configurationsRes, gamesRes] = await Promise.all([
        fetch(`${API_URL}/providers/systems`, { headers }),
        fetch(`${API_URL}/providers/configurations`, { headers }),
        fetch(`${API_URL}/games`, { headers })
      ]);

      const systemsData = await systemsRes.json();
      const configurationsData = await configurationsRes.json();
      const gamesData = await gamesRes.json();

      setSystems(Array.isArray(systemsData) ? systemsData : []);
      setConfigurations(Array.isArray(configurationsData) ? configurationsData : []);
      setGames(Array.isArray(gamesData) ? gamesData : []);
    } catch (error) {
      console.error('Error cargando datos:', error);
      setSystems([]);
      setConfigurations([]);
      setGames([]);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSystem = async (formData) => {
    try {
      const token = localStorage.getItem('token');
      const url = editingSystem 
        ? `${API_URL}/providers/systems/${editingSystem.id}`
        : `${API_URL}/providers/systems`;
      
      const response = await fetch(url, {
        method: editingSystem ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        await loadData();
        setShowSystemModal(false);
        setEditingSystem(null);
      }
    } catch (error) {
      console.error('Error guardando sistema:', error);
    }
  };

  const handleDeleteSystem = async (id) => {
    if (!confirm('¿Está seguro de eliminar este sistema? Se eliminarán todas sus configuraciones.')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/providers/systems/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        await loadData();
      }
    } catch (error) {
      console.error('Error eliminando sistema:', error);
    }
  };

  const handleSaveConfiguration = async (formData) => {
    try {
      const token = localStorage.getItem('token');
      const url = editingConfig 
        ? `${API_URL}/providers/configurations/${editingConfig.id}`
        : `${API_URL}/providers/configurations`;
      
      const response = await fetch(url, {
        method: editingConfig ? 'PUT' : 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(formData)
      });

      if (response.ok) {
        await loadData();
        setShowConfigModal(false);
        setEditingConfig(null);
      }
    } catch (error) {
      console.error('Error guardando configuración:', error);
    }
  };

  const handleDeleteConfiguration = async (id) => {
    if (!confirm('¿Está seguro de eliminar esta configuración?')) {
      return;
    }

    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/providers/configurations/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });

      if (response.ok) {
        await loadData();
      }
    } catch (error) {
      console.error('Error eliminando configuración:', error);
    }
  };

  const handleToggleActive = async (id, currentStatus) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/providers/configurations/${id}`, {
        method: 'PUT',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ isActive: !currentStatus })
      });

      if (response.ok) {
        await loadData();
      }
    } catch (error) {
      console.error('Error actualizando estado:', error);
    }
  };

  const handleTestConfiguration = async (id) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/providers/configurations/${id}/test`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json'
        }
      });

      const result = await response.json();
      setTestResult(result);
    } catch (error) {
      console.error('Error probando configuración:', error);
      setTestResult({ success: false, error: error.message });
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Proveedores Externos</h1>
          <p className="text-gray-600 mt-1">Gestión de sistemas API y configuraciones de integración</p>
        </div>
        <button
          onClick={loadData}
          className="flex items-center px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200"
        >
          <RefreshCw className="w-4 h-4 mr-2" />
          Actualizar
        </button>
      </div>

      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <button
            onClick={() => setActiveTab('configurations')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'configurations'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Configuraciones ({configurations.length})
          </button>
          <button
            onClick={() => setActiveTab('systems')}
            className={`py-4 px-1 border-b-2 font-medium text-sm ${
              activeTab === 'systems'
                ? 'border-blue-500 text-blue-600'
                : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
            }`}
          >
            Sistemas ({systems.length})
          </button>
        </nav>
      </div>

      {activeTab === 'configurations' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => {
                setEditingConfig(null);
                setShowConfigModal(true);
              }}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nueva Configuración
            </button>
          </div>

          <div className="grid gap-4">
            {Array.isArray(configurations) && configurations.length > 0 ? (
              configurations.map((config) => (
                <div key={config.id} className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-semibold text-gray-900">{config.name}</h3>
                        <span className={`px-2 py-1 text-xs font-medium rounded ${
                          config.type === 'PLANNING' 
                            ? 'bg-purple-100 text-purple-700' 
                            : 'bg-green-100 text-green-700'
                        }`}>
                          {config.type}
                        </span>
                        <span className={`px-2 py-1 text-xs font-medium rounded ${
                          config.isActive 
                            ? 'bg-green-100 text-green-700' 
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {config.isActive ? 'Activa' : 'Inactiva'}
                        </span>
                      </div>
                      <div className="mt-2 space-y-1 text-sm text-gray-600">
                        <p><strong>Sistema:</strong> {config.apiSystem.name}</p>
                        <p><strong>Juego:</strong> {config.game.name}</p>
                        <p><strong>URL Base:</strong> <code className="bg-gray-100 px-2 py-1 rounded">{config.baseUrl}</code></p>
                        <p><strong>Token:</strong> <code className="bg-gray-100 px-2 py-1 rounded">{config.token.substring(0, 20)}...</code></p>
                        {config.tripletaUrl && (
                          <>
                            <p className="mt-2"><strong>Tripleta URL:</strong> <code className="bg-purple-100 px-2 py-1 rounded">{config.tripletaUrl}</code></p>
                            <p><strong>Tripleta Token:</strong> <code className="bg-purple-100 px-2 py-1 rounded">{config.tripletaToken?.substring(0, 20)}...</code></p>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleTestConfiguration(config.id)}
                        className="p-2 text-blue-600 hover:bg-blue-50 rounded"
                        title="Probar conexión"
                      >
                        <TestTube className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(config.id, config.isActive)}
                        className={`p-2 rounded ${
                          config.isActive 
                            ? 'text-green-600 hover:bg-green-50' 
                            : 'text-gray-400 hover:bg-gray-50'
                        }`}
                        title={config.isActive ? 'Desactivar' : 'Activar'}
                      >
                        {config.isActive ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
                      </button>
                      <button
                        onClick={() => {
                          setEditingConfig(config);
                          setShowConfigModal(true);
                        }}
                        className="p-2 text-gray-600 hover:bg-gray-50 rounded"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteConfiguration(config.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                No hay configuraciones disponibles
              </div>
            )}
          </div>
        </div>
      )}

      {activeTab === 'systems' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => {
                setEditingSystem(null);
                setShowSystemModal(true);
              }}
              className="flex items-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <Plus className="w-4 h-4 mr-2" />
              Nuevo Sistema
            </button>
          </div>

          <div className="grid gap-4">
            {Array.isArray(systems) && systems.length > 0 ? (
              systems.map((system) => (
                <div key={system.id} className="bg-white border border-gray-200 rounded-lg p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <h3 className="text-lg font-semibold text-gray-900">{system.name}</h3>
                      {system.description && (
                        <p className="mt-1 text-sm text-gray-600">{system.description}</p>
                      )}
                      <p className="mt-2 text-sm text-gray-500">
                        {system.configurations.length} configuración(es)
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => {
                          setEditingSystem(system);
                          setShowSystemModal(true);
                        }}
                        className="p-2 text-gray-600 hover:bg-gray-50 rounded"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteSystem(system.id)}
                        className="p-2 text-red-600 hover:bg-red-50 rounded"
                        disabled={system.configurations.length > 0}
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-8 text-gray-500">
                No hay sistemas disponibles
              </div>
            )}
          </div>
        </div>
      )}

      {showSystemModal && (
        <SystemModal
          system={editingSystem}
          onClose={() => {
            setShowSystemModal(false);
            setEditingSystem(null);
          }}
          onSave={handleSaveSystem}
        />
      )}

      {showConfigModal && (
        <ConfigurationModal
          configuration={editingConfig}
          systems={systems}
          games={games}
          onClose={() => {
            setShowConfigModal(false);
            setEditingConfig(null);
          }}
          onSave={handleSaveConfiguration}
        />
      )}

      {testResult && (
        <TestResultModal
          result={testResult}
          onClose={() => setTestResult(null)}
        />
      )}
    </div>
  );
}

function SystemModal({ system, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: system?.name || '',
    description: system?.description || ''
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-md w-full">
        <h2 className="text-xl font-bold mb-4">
          {system ? 'Editar Sistema' : 'Nuevo Sistema'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Descripción
            </label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              rows={3}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function ConfigurationModal({ configuration, systems, games, onClose, onSave }) {
  const [formData, setFormData] = useState({
    name: configuration?.name || '',
    apiSystemId: configuration?.apiSystemId || '',
    gameId: configuration?.gameId || '',
    type: configuration?.type || 'PLANNING',
    baseUrl: configuration?.baseUrl || '',
    token: configuration?.token || '',
    tripletaUrl: configuration?.tripletaUrl || '',
    tripletaToken: configuration?.tripletaToken || '',
    isActive: configuration?.isActive !== undefined ? configuration.isActive : true
  });

  const handleSubmit = (e) => {
    e.preventDefault();
    onSave(formData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">
          {configuration ? 'Editar Configuración' : 'Nueva Configuración'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Nombre *
            </label>
            <input
              type="text"
              value={formData.name}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Sistema *
              </label>
              <select
                value={formData.apiSystemId}
                onChange={(e) => setFormData({ ...formData, apiSystemId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              >
                <option value="">Seleccionar...</option>
                {systems.map((system) => (
                  <option key={system.id} value={system.id}>
                    {system.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Juego *
              </label>
              <select
                value={formData.gameId}
                onChange={(e) => setFormData({ ...formData, gameId: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                required
              >
                <option value="">Seleccionar...</option>
                {games.map((game) => (
                  <option key={game.id} value={game.id}>
                    {game.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Tipo *
            </label>
            <select
              value={formData.type}
              onChange={(e) => setFormData({ ...formData, type: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
            >
              <option value="PLANNING">PLANNING - Planificación de sorteos</option>
              <option value="SALES">SALES - Ventas/Tickets</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              URL Base *
            </label>
            <input
              type="text"
              value={formData.baseUrl}
              onChange={(e) => setFormData({ ...formData, baseUrl: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
              placeholder="https://api.ejemplo.com/endpoint/"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Token *
            </label>
            <input
              type="text"
              value={formData.token}
              onChange={(e) => setFormData({ ...formData, token: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
              required
            />
          </div>
          
          <div className="border-t pt-4 mt-4">
            <h3 className="text-sm font-semibold text-gray-900 mb-3 flex items-center">
              <span className="bg-purple-100 text-purple-700 px-2 py-1 rounded text-xs mr-2">TRIPLETA</span>
              Configuración Opcional
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  URL Tripleta
                </label>
                <input
                  type="text"
                  value={formData.tripletaUrl}
                  onChange={(e) => setFormData({ ...formData, tripletaUrl: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                  placeholder="https://api.ejemplo.com/tripleta/"
                />
                <p className="text-xs text-gray-500 mt-1">URL específica para obtener tickets de tripleta</p>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Token Tripleta
                </label>
                <input
                  type="text"
                  value={formData.tripletaToken}
                  onChange={(e) => setFormData({ ...formData, tripletaToken: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
                  placeholder="Token de autenticación para tripleta"
                />
                <p className="text-xs text-gray-500 mt-1">Token específico para la API de tripleta</p>
              </div>
            </div>
          </div>

          <div className="flex items-center">
            <input
              type="checkbox"
              id="isActive"
              checked={formData.isActive}
              onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
              className="w-4 h-4 text-blue-600 border-gray-300 rounded"
            />
            <label htmlFor="isActive" className="ml-2 text-sm text-gray-700">
              Configuración activa
            </label>
          </div>
          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg hover:bg-gray-200"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-white bg-blue-600 rounded-lg hover:bg-blue-700"
            >
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function TestResultModal({ result, onClose }) {
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-6 max-w-2xl w-full max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">Resultado de Prueba</h2>
        <div className="space-y-4">
          <div className={`p-4 rounded-lg ${result.success ? 'bg-green-50' : 'bg-red-50'}`}>
            <p className={`font-medium ${result.success ? 'text-green-800' : 'text-red-800'}`}>
              {result.success ? '✓ Conexión exitosa' : '✗ Error en la conexión'}
            </p>
            {result.testUrl && (
              <p className="text-sm text-gray-600 mt-1">URL: {result.testUrl}</p>
            )}
          </div>
          {result.error && (
            <div className="bg-red-50 p-4 rounded-lg">
              <p className="text-sm text-red-800">{result.error}</p>
            </div>
          )}
          {result.data && (
            <div>
              <h3 className="font-medium mb-2">Respuesta:</h3>
              <pre className="bg-gray-100 p-4 rounded-lg text-xs overflow-x-auto">
                {JSON.stringify(result.data, null, 2)}
              </pre>
            </div>
          )}
        </div>
        <div className="flex justify-end mt-4">
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

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
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
  const [adapterStatuses, setAdapterStatuses] = useState({}); // { [systemId]: { adapterReady: boolean, slug: string } }
  const [systemTokens, setSystemTokens] = useState({}); // { [systemId]: true } after token generation

  useEffect(() => {
    loadData();
  }, []);

  const fetchAdapterStatuses = async (systemsList) => {
    if (!systemsList || systemsList.length === 0) return;
    const token = localStorage.getItem('token');
    const headers = { 'Authorization': `Bearer ${token}` };
    const results = await Promise.allSettled(
      systemsList.map(async (system) => {
        const res = await fetch(`${API_URL}/providers/systems/${system.id}/adapter-status`, { headers });
        const data = await res.json();
        return { id: system.id, ...data };
      })
    );
    const statuses = {};
    results.forEach((result) => {
      if (result.status === 'fulfilled') {
        statuses[result.value.id] = result.value;
      }
    });
    setAdapterStatuses(statuses);
  };

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

      const systemsList = Array.isArray(systemsData) ? systemsData : [];
      setSystems(systemsList);
      // Fire adapter status fetch in parallel (non-blocking)
      fetchAdapterStatuses(systemsList);
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

  const handleToggleSystem = async (id, currentStatus) => {
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${API_URL}/providers/systems/${id}`, {
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
      console.error('Error actualizando estado del sistema:', error);
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
          <Link
            href="/admin/proveedores/logs"
            className="py-4 px-1 border-b-2 font-medium text-sm border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
          >
            Logs de Webhook
          </Link>
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
                <div key={config.id} className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
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
                        <p><strong>URL Base:</strong> <code className="bg-gray-100 px-2 py-1 rounded break-all">{config.baseUrl}</code></p>
                        <p><strong>Token:</strong> <code className="bg-gray-100 px-2 py-1 rounded break-all">{config.token.substring(0, 20)}...</code></p>
                        {config.tripletaUrl && (
                          <>
                            <p className="mt-2"><strong>Tripleta URL:</strong> <code className="bg-purple-100 px-2 py-1 rounded break-all">{config.tripletaUrl}</code></p>
                            <p><strong>Tripleta Token:</strong> <code className="bg-purple-100 px-2 py-1 rounded break-all">{config.tripletaToken?.substring(0, 20)}...</code></p>
                          </>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleTestConfiguration(config.id)}
                        className="p-2.5 text-blue-600 hover:bg-blue-50 rounded"
                        title="Probar conexión"
                      >
                        <TestTube className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(config.id, config.isActive)}
                        className={`p-2.5 rounded ${
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
                        className="p-2.5 text-gray-600 hover:bg-gray-50 rounded"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteConfiguration(config.id)}
                        className="p-2.5 text-red-600 hover:bg-red-50 rounded"
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
                <div key={system.id} className="bg-white border border-gray-200 rounded-lg p-4 sm:p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-3 flex-wrap">
                        <h3 className="text-lg font-semibold text-gray-900">{system.name}</h3>
                        {/* ADMIN-05: mode badge */}
                        <span className={`px-2 py-1 text-xs font-medium rounded ${
                          system.mode === 'PUSH'
                            ? 'bg-blue-100 text-blue-700'
                            : 'bg-gray-100 text-gray-700'
                        }`}>
                          {system.mode || 'PULL'}
                        </span>
                        {/* Active/Paused badge */}
                        <span className={`px-2 py-1 text-xs font-medium rounded ${
                          system.isActive
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}>
                          {system.isActive ? 'Activo' : 'Pausado'}
                        </span>
                        {/* ADMIN-06: adapter status badge */}
                        {adapterStatuses[system.id] !== undefined ? (
                          <span className={`px-2 py-1 text-xs font-medium rounded ${
                            adapterStatuses[system.id].adapterReady
                              ? 'bg-green-100 text-green-700'
                              : 'bg-orange-100 text-orange-700'
                          }`}>
                            {adapterStatuses[system.id].adapterReady ? 'Adapter Ready' : 'Discovery'}
                          </span>
                        ) : (
                          <span className="px-2 py-1 text-xs font-medium rounded bg-gray-50 text-gray-400">
                            ...
                          </span>
                        )}
                      </div>
                      {system.description && (
                        <p className="mt-1 text-sm text-gray-600">{system.description}</p>
                      )}
                      {system.slug && (
                        <p className="mt-1 text-xs text-gray-400 font-mono">{API_URL}/webhooks/{system.slug}</p>
                      )}
                      <p className="mt-2 text-sm text-gray-500">
                        {system.configurations.length} configuración(es)
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => handleToggleSystem(system.id, system.isActive)}
                        className={`p-2.5 rounded ${
                          system.isActive
                            ? 'text-orange-600 hover:bg-orange-50'
                            : 'text-green-600 hover:bg-green-50'
                        }`}
                        title={system.isActive ? 'Pausar proveedor' : 'Activar proveedor'}
                      >
                        {system.isActive ? <Power className="w-5 h-5" /> : <PowerOff className="w-5 h-5" />}
                      </button>
                      <button
                        onClick={() => {
                          setEditingSystem(system);
                          setShowSystemModal(true);
                        }}
                        className="p-2.5 text-gray-600 hover:bg-gray-50 rounded"
                      >
                        <Edit className="w-5 h-5" />
                      </button>
                      <button
                        onClick={() => handleDeleteSystem(system.id)}
                        className="p-2.5 text-red-600 hover:bg-red-50 rounded"
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
          apiUrl={API_URL}
          hasToken={!!systemTokens[editingSystem?.id]}
          onTokenGenerated={(id) => setSystemTokens((prev) => ({ ...prev, [id]: true }))}
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

function PortalUserSection({ systemId }) {
  const [status, setStatus] = useState({ loading: true, exists: false, user: null });
  const [mode, setMode] = useState('idle'); // 'idle' | 'creating' | 'resetting'
  const [form, setForm] = useState({ username: '', password: '' });
  const [msg, setMsg] = useState('');

  const load = async () => {
    setStatus({ loading: true, exists: false, user: null });
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/providers/systems/${systemId}/portal-user`, {
        headers: { 'Authorization': `Bearer ${token}` },
      });
      const data = await res.json();
      setStatus({ loading: false, exists: !!data.exists, user: data.user || null });
    } catch {
      setStatus({ loading: false, exists: false, user: null });
    }
  };

  useEffect(() => {
    if (systemId) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [systemId]);

  const onCreate = async () => {
    setMsg('');
    if (!form.username || form.username.length < 3) {
      setMsg('Username mínimo 3 caracteres');
      return;
    }
    if (!form.password || form.password.length < 10) {
      setMsg('Password mínimo 10 caracteres');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/providers/systems/${systemId}/portal-user`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || 'Error creando usuario');
        return;
      }
      setMsg(`Usuario creado: ${data.username || form.username}`);
      setMode('idle');
      setForm({ username: '', password: '' });
      load();
    } catch (err) {
      setMsg('Error de red creando usuario');
    }
  };

  const onReset = async () => {
    setMsg('');
    if (!form.password || form.password.length < 10) {
      setMsg('Password mínimo 10 caracteres');
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${API_URL}/providers/systems/${systemId}/portal-user/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
        body: JSON.stringify({ password: form.password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setMsg(data.error || 'Error reseteando contraseña');
        return;
      }
      setMsg('Contraseña reseteada exitosamente');
      setMode('idle');
      setForm({ username: '', password: '' });
    } catch (err) {
      setMsg('Error de red reseteando contraseña');
    }
  };

  if (status.loading) {
    return (
      <div className="border-t pt-4 mt-4">
        <h3 className="text-sm font-semibold text-gray-900 mb-3">Acceso al portal</h3>
        <div className="text-sm text-gray-500 py-2">Cargando acceso al portal...</div>
      </div>
    );
  }

  return (
    <div className="border-t pt-4 mt-4">
      <h3 className="text-sm font-semibold text-gray-900 mb-3">Acceso al portal</h3>

      {!status.exists && mode === 'idle' && (
        <div className="space-y-2">
          <p className="text-sm text-gray-600">Sin usuario portal configurado.</p>
          <button
            type="button"
            onClick={() => { setMode('creating'); setMsg(''); }}
            className="px-3 py-2 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Crear usuario portal
          </button>
        </div>
      )}

      {!status.exists && mode === 'creating' && (
        <div className="space-y-2 border border-gray-200 p-3 rounded-lg bg-gray-50">
          <input
            placeholder="Username"
            value={form.username}
            onChange={(e) => setForm({ ...form, username: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm"
          />
          <input
            placeholder="Password (mínimo 10 caracteres)"
            type="text"
            value={form.password}
            onChange={(e) => setForm({ ...form, password: e.target.value })}
            className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onCreate}
              className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
            >
              Crear
            </button>
            <button
              type="button"
              onClick={() => { setMode('idle'); setForm({ username: '', password: '' }); setMsg(''); }}
              className="px-3 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {status.exists && status.user && (
        <div className="space-y-2">
          <p className="text-sm">
            Usuario: <strong className="font-mono">{status.user.username}</strong>
            {!status.user.isActive && (
              <span className="ml-2 text-red-600 text-xs">(desactivado)</span>
            )}
          </p>
          {mode === 'idle' && (
            <button
              type="button"
              onClick={() => { setMode('resetting'); setMsg(''); }}
              className="px-3 py-2 text-sm bg-yellow-600 text-white rounded-lg hover:bg-yellow-700"
            >
              Resetear contraseña
            </button>
          )}
          {mode === 'resetting' && (
            <div className="space-y-2 border border-gray-200 p-3 rounded-lg bg-gray-50">
              <input
                placeholder="Nueva password (mínimo 10)"
                type="text"
                value={form.password}
                onChange={(e) => setForm({ ...form, password: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm font-mono"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onReset}
                  className="px-3 py-2 text-sm bg-green-600 text-white rounded-lg hover:bg-green-700"
                >
                  Resetear
                </button>
                <button
                  type="button"
                  onClick={() => { setMode('idle'); setForm({ username: '', password: '' }); setMsg(''); }}
                  className="px-3 py-2 text-sm bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300"
                >
                  Cancelar
                </button>
              </div>
            </div>
          )}
        </div>
      )}

      {msg && <p className="text-sm mt-2 text-blue-700">{msg}</p>}
    </div>
  );
}

function SystemModal({ system, onClose, onSave, apiUrl, hasToken, onTokenGenerated }) {
  const generateSlug = (name) =>
    name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  const [formData, setFormData] = useState({
    name: system?.name || '',
    description: system?.description || '',
    slug: system?.slug || '',
    mode: system?.mode || 'PULL',
    isActive: system?.isActive !== undefined ? system.isActive : true,
    _slugManuallyEdited: !!system?.slug,
  });
  const [tokenJustGenerated, setTokenJustGenerated] = useState(null);
  const [generatingToken, setGeneratingToken] = useState(false);

  // Reset token when modal switches to a different system
  useEffect(() => {
    setTokenJustGenerated(null);
  }, [system]);

  const handleNameChange = (e) => {
    const name = e.target.value;
    setFormData((prev) => ({
      ...prev,
      name,
      slug: prev._slugManuallyEdited ? prev.slug : generateSlug(name),
    }));
  };

  const handleSlugChange = (e) => {
    setFormData((prev) => ({ ...prev, slug: e.target.value, _slugManuallyEdited: true }));
  };

  const handleGenerateToken = async () => {
    if (!system?.id) return;
    setGeneratingToken(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch(`${apiUrl}/providers/systems/${system.id}/generate-token`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}`, 'Content-Type': 'application/json' },
      });
      const data = await res.json();
      if (data.webhookToken) {
        setTokenJustGenerated(data.webhookToken);
        if (onTokenGenerated) onTokenGenerated(system.id);
      }
    } catch (err) {
      console.error('Error generando token:', err);
    } finally {
      setGeneratingToken(false);
    }
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    // Strip private flag before saving
    const { _slugManuallyEdited, ...submitData } = formData;
    onSave(submitData);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
      <div className="bg-white rounded-lg p-4 sm:p-6 max-w-lg w-full mx-2 sm:mx-0 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">
          {system ? 'Editar Sistema' : 'Nuevo Sistema'}
        </h2>
        <form onSubmit={handleSubmit} className="space-y-4">
          {/* Nombre */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Nombre *</label>
            <input
              type="text"
              value={formData.name}
              onChange={handleNameChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              required
            />
          </div>

          {/* Descripcion */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripcion</label>
            <textarea
              value={formData.description}
              onChange={(e) => setFormData({ ...formData, description: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
              rows={2}
            />
          </div>

          {/* Slug — ADMIN-02 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Slug *{' '}
              <span className="text-xs text-gray-400 font-normal">
                (URL: {API_URL}/webhooks/{formData.slug || '...'})
              </span>
            </label>
            <input
              type="text"
              value={formData.slug}
              onChange={handleSlugChange}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg font-mono text-sm"
              placeholder="mi-proveedor"
              required
            />
            {system && (
              <p className="text-xs text-amber-600 mt-1">
                Cambiar el slug rompera integraciones existentes que apunten al slug anterior.
              </p>
            )}
          </div>

          {/* Modo — ADMIN-01 */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Modo</label>
            <select
              value={formData.mode}
              onChange={(e) => setFormData({ ...formData, mode: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg"
            >
              <option value="PULL">PULL — Este sistema consulta al proveedor</option>
              <option value="PUSH">PUSH — El proveedor envia webhooks</option>
            </select>
          </div>

          {/* isActive toggle — only on edit */}
          {system && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="systemIsActive"
                checked={formData.isActive}
                onChange={(e) => setFormData({ ...formData, isActive: e.target.checked })}
                className="w-4 h-4 text-blue-600 border-gray-300 rounded"
              />
              <label htmlFor="systemIsActive" className="text-sm text-gray-700">
                Sistema activo
              </label>
            </div>
          )}

          {/* Token panel — ADMIN-03, ADMIN-04 — only for PUSH mode */}
          {formData.mode === 'PUSH' && (
            <div className="border-t pt-4 mt-4">
              <h3 className="text-sm font-semibold text-gray-900 mb-3">Token de Webhook</h3>

              {tokenJustGenerated ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-3">
                  <p className="text-xs text-yellow-800 font-medium mb-2">
                    Copia este token ahora — no se mostrara de nuevo
                  </p>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono break-all text-yellow-900">
                      {tokenJustGenerated}
                    </code>
                    <button
                      type="button"
                      onClick={() => navigator.clipboard.writeText(tokenJustGenerated)}
                      className="shrink-0 px-2 py-1 text-xs bg-yellow-200 text-yellow-900 rounded hover:bg-yellow-300"
                    >
                      Copiar
                    </button>
                  </div>
                </div>
              ) : hasToken ? (
                <p className="text-sm text-gray-500 font-mono mb-3">
                  ••••••••••••••••<span className="text-gray-700">(token configurado)</span>
                </p>
              ) : (
                <p className="text-sm text-gray-400 italic mb-3">Sin token generado</p>
              )}

              {/* Only show generate button for existing systems (need an id) */}
              {system && (
                <button
                  type="button"
                  onClick={handleGenerateToken}
                  disabled={generatingToken}
                  className="px-3 py-2 text-sm bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 disabled:opacity-50"
                >
                  {generatingToken
                    ? 'Generando...'
                    : hasToken || tokenJustGenerated
                    ? 'Regenerar Token'
                    : 'Generar Token'}
                </button>
              )}
              {!system && (
                <p className="text-xs text-gray-400 italic">
                  Guarda el sistema primero para generar un token.
                </p>
              )}

              {/* Endpoint info — show when PUSH provider has slug */}
              {formData.slug && (hasToken || tokenJustGenerated) && (
                <div className="bg-gray-50 border border-gray-200 rounded-lg p-3 mt-4">
                  <h4 className="text-xs font-semibold text-gray-700 mb-2 uppercase tracking-wide">
                    Datos de integracion para el proveedor
                  </h4>
                  <div className="space-y-2 text-xs font-mono">
                    <div>
                      <span className="text-gray-500">Metodo:</span>{' '}
                      <span className="text-green-700 font-bold">POST</span>
                    </div>
                    <div>
                      <span className="text-gray-500">URL:</span>{' '}
                      <code className="bg-white px-1.5 py-0.5 rounded border text-blue-700 break-all">
                        {API_URL}/webhooks/{formData.slug}
                      </code>
                      <button
                        type="button"
                        onClick={() => navigator.clipboard.writeText(`${API_URL}/webhooks/${formData.slug}`)}
                        className="ml-2 px-1.5 py-0.5 text-[10px] bg-gray-200 text-gray-600 rounded hover:bg-gray-300"
                      >
                        Copiar
                      </button>
                    </div>
                    <div>
                      <span className="text-gray-500">Header:</span>{' '}
                      <code className="bg-white px-1.5 py-0.5 rounded border text-purple-700">
                        X-Webhook-Token: {'<token>'}
                      </code>
                    </div>
                    <div>
                      <span className="text-gray-500">Content-Type:</span>{' '}
                      <code className="bg-white px-1.5 py-0.5 rounded border text-gray-700">
                        application/json
                      </code>
                    </div>
                  </div>
                  <p className="text-[10px] text-gray-400 mt-2">
                    El proveedor debe enviar las jugadas como JSON en el body del POST.
                    Sin adapter configurado, el payload se guardara en el log para inspeccion.
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Portal user management — only for existing PUSH systems (C2) */}
          {system?.id && formData.mode === 'PUSH' && (
            <PortalUserSection systemId={system.id} />
          )}

          <div className="flex justify-end gap-2 pt-2">
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
      <div className="bg-white rounded-lg p-4 sm:p-6 max-w-2xl w-full mx-2 sm:mx-0 max-h-[90vh] overflow-y-auto">
        <h2 className="text-xl font-bold mb-4">
          {configuration ? 'Editar Configuracion' : 'Nueva Configuracion'}
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
              <option value="PLANNING">PLANNING - Planificacion de sorteos</option>
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
              Configuracion Opcional
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
                <p className="text-xs text-gray-500 mt-1">URL especifica para obtener tickets de tripleta</p>
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
                  placeholder="Token de autenticacion para tripleta"
                />
                <p className="text-xs text-gray-500 mt-1">Token especifico para la API de tripleta</p>
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
              Configuracion activa
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
              {result.success ? 'Conexion exitosa' : 'Error en la conexion'}
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

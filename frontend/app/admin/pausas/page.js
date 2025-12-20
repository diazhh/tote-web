'use client';

import { useState, useEffect } from 'react';
import { format } from 'date-fns';
import { es } from 'date-fns/locale';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

function getAuthHeaders() {
  const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
  return {
    'Content-Type': 'application/json',
    ...(token && { 'Authorization': `Bearer ${token}` })
  };
}

export default function PausasPage() {
  const [games, setGames] = useState([]);
  const [pauses, setPauses] = useState([]);
  const [emergencyStop, setEmergencyStop] = useState({ enabled: false });
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showForm, setShowForm] = useState(false);
  
  const [newPause, setNewPause] = useState({
    gameId: '',
    startDate: '',
    endDate: '',
    reason: ''
  });

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    try {
      setLoading(true);
      await Promise.all([
        fetchGames(),
        fetchPauses(),
        fetchEmergencyStop()
      ]);
    } catch (error) {
      console.error('Error al cargar datos:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchGames = async () => {
    const res = await fetch(`${API_URL}/api/games`, {
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      setGames(data.data);
    }
  };

  const fetchPauses = async () => {
    const res = await fetch(`${API_URL}/api/pauses?isActive=true`, {
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      setPauses(data.data);
    }
  };

  const fetchEmergencyStop = async () => {
    const res = await fetch(`${API_URL}/api/system/emergency-stop`, {
      headers: getAuthHeaders()
    });
    const data = await res.json();
    if (data.success) {
      setEmergencyStop(data.data);
    }
  };

  const handleCreatePause = async (e) => {
    e.preventDefault();
    
    if (!newPause.gameId || !newPause.startDate || !newPause.endDate) {
      alert('Por favor completa todos los campos obligatorios');
      return;
    }

    try {
      setCreating(true);
      const res = await fetch(`${API_URL}/api/pauses`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify(newPause)
      });

      const data = await res.json();
      
      if (data.success) {
        alert('Pausa creada exitosamente');
        setShowForm(false);
        setNewPause({ gameId: '', startDate: '', endDate: '', reason: '' });
        fetchPauses();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      alert('Error al crear pausa');
      console.error(error);
    } finally {
      setCreating(false);
    }
  };

  const handleDeletePause = async (pauseId) => {
    if (!confirm('¿Estás seguro de eliminar esta pausa?')) return;

    try {
      const res = await fetch(`${API_URL}/api/pauses/${pauseId}`, {
        method: 'DELETE',
        headers: getAuthHeaders()
      });

      const data = await res.json();
      
      if (data.success) {
        alert('Pausa eliminada');
        fetchPauses();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      alert('Error al eliminar pausa');
      console.error(error);
    }
  };

  const handleToggleEmergencyStop = async () => {
    const action = emergencyStop.enabled ? 'disable' : 'enable';
    const confirmMsg = emergencyStop.enabled 
      ? '¿Desactivar la parada de emergencia? El sistema volverá a funcionar normalmente.'
      : '⚠️ ¿ACTIVAR PARADA DE EMERGENCIA? Esto detendrá TODOS los sorteos y publicaciones hasta que se reactive.';
    
    if (!confirm(confirmMsg)) return;

    try {
      const reason = !emergencyStop.enabled 
        ? prompt('Razón de la parada de emergencia:') 
        : null;

      const res = await fetch(`${API_URL}/api/system/emergency-stop/${action}`, {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ reason })
      });

      const data = await res.json();
      
      if (data.success) {
        alert(data.message);
        fetchEmergencyStop();
      } else {
        alert(`Error: ${data.error}`);
      }
    } catch (error) {
      alert('Error al cambiar estado de emergencia');
      console.error(error);
    }
  };

  if (loading) {
    return (
      <div className="p-6">
        <p>Cargando...</p>
      </div>
    );
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <h1 className="text-3xl font-bold mb-6">Control de Pausas y Emergencia</h1>

      {/* Parada de Emergencia */}
      <div className={`mb-8 p-6 rounded-lg border-2 ${emergencyStop.enabled ? 'bg-red-50 border-red-500' : 'bg-gray-50 border-gray-300'}`}>
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-2xl font-bold flex items-center gap-2">
              🚨 Parada de Emergencia
              {emergencyStop.enabled && <span className="text-red-600 animate-pulse">ACTIVA</span>}
            </h2>
            <p className="text-sm text-gray-600 mt-1">
              {emergencyStop.enabled 
                ? 'El sistema está detenido. No se generarán, cerrarán, ejecutarán ni publicarán sorteos.'
                : 'El sistema está funcionando normalmente.'}
            </p>
          </div>
          <button
            onClick={handleToggleEmergencyStop}
            className={`px-6 py-3 rounded-lg font-bold text-white transition-colors ${
              emergencyStop.enabled 
                ? 'bg-green-600 hover:bg-green-700' 
                : 'bg-red-600 hover:bg-red-700'
            }`}
          >
            {emergencyStop.enabled ? '✅ Reactivar Sistema' : '🛑 Activar Parada'}
          </button>
        </div>
        
        {emergencyStop.enabled && emergencyStop.reason && (
          <div className="mt-4 p-3 bg-white rounded border border-red-200">
            <p className="text-sm"><strong>Razón:</strong> {emergencyStop.reason}</p>
            {emergencyStop.activatedAt && (
              <p className="text-xs text-gray-500 mt-1">
                Activada: {new Date(emergencyStop.activatedAt).toLocaleString('es-VE')}
              </p>
            )}
          </div>
        )}
      </div>

      {/* Pausas Programadas */}
      <div className="bg-white rounded-lg shadow p-6">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-xl font-bold">Pausas Programadas por Fecha</h2>
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
          >
            {showForm ? 'Cancelar' : '+ Nueva Pausa'}
          </button>
        </div>

        {showForm && (
          <form onSubmit={handleCreatePause} className="mb-6 p-4 bg-gray-50 rounded-lg">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Juego *</label>
                <select
                  value={newPause.gameId}
                  onChange={(e) => setNewPause({ ...newPause, gameId: e.target.value })}
                  className="w-full p-2 border rounded"
                  required
                >
                  <option value="">Seleccionar juego</option>
                  {games.map(game => (
                    <option key={game.id} value={game.id}>{game.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Razón</label>
                <input
                  type="text"
                  value={newPause.reason}
                  onChange={(e) => setNewPause({ ...newPause, reason: e.target.value })}
                  placeholder="Ej: Fiestas de Año Nuevo"
                  className="w-full p-2 border rounded"
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Fecha Inicio *</label>
                <input
                  type="datetime-local"
                  value={newPause.startDate}
                  onChange={(e) => setNewPause({ ...newPause, startDate: e.target.value })}
                  className="w-full p-2 border rounded"
                  required
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Fecha Fin *</label>
                <input
                  type="datetime-local"
                  value={newPause.endDate}
                  onChange={(e) => setNewPause({ ...newPause, endDate: e.target.value })}
                  className="w-full p-2 border rounded"
                  required
                />
              </div>
            </div>

            <div className="mt-4 flex gap-2">
              <button
                type="submit"
                disabled={creating}
                className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:bg-gray-400"
              >
                {creating ? 'Creando...' : 'Crear Pausa'}
              </button>
            </div>
          </form>
        )}

        {/* Lista de Pausas */}
        <div className="space-y-3">
          {pauses.length === 0 ? (
            <p className="text-gray-500 text-center py-8">No hay pausas programadas</p>
          ) : (
            pauses.map(pause => (
              <div key={pause.id} className="border rounded-lg p-4 hover:bg-gray-50">
                <div className="flex justify-between items-start">
                  <div className="flex-1">
                    <h3 className="font-bold text-lg">{pause.game.name}</h3>
                    {pause.reason && (
                      <p className="text-sm text-gray-600 mt-1">{pause.reason}</p>
                    )}
                    <div className="mt-2 text-sm text-gray-500">
                      <p>
                        📅 <strong>Desde:</strong> {format(new Date(pause.startDate), "dd 'de' MMMM yyyy, HH:mm", { locale: es })}
                      </p>
                      <p>
                        📅 <strong>Hasta:</strong> {format(new Date(pause.endDate), "dd 'de' MMMM yyyy, HH:mm", { locale: es })}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => handleDeletePause(pause.id)}
                    className="px-3 py-1 text-sm bg-red-100 text-red-700 rounded hover:bg-red-200"
                  >
                    Eliminar
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Información */}
      <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
        <h3 className="font-bold mb-2">ℹ️ Información</h3>
        <ul className="text-sm space-y-1 text-gray-700">
          <li>• <strong>Parada de Emergencia:</strong> Detiene TODO el sistema inmediatamente (generación, cierre, ejecución y publicación de sorteos).</li>
          <li>• <strong>Pausas Programadas:</strong> Impiden la generación de sorteos para un juego específico en las fechas indicadas.</li>
          <li>• Las pausas programadas se verifican automáticamente cada día al generar los sorteos.</li>
          <li>• Usa pausas programadas para días festivos (31 dic, 1 ene, Navidad, etc.).</li>
        </ul>
      </div>
    </div>
  );
}

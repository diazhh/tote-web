'use client';
import { useState } from 'react';
import { Check, X, Edit2, Mail, Shield, ShieldOff, Key } from 'lucide-react';
import { toast } from 'sonner';
import { adminPlayersApi } from '@/lib/api/admin-players';

export default function ProfileTab({ player, onRefresh }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState({ username: player.username, email: player.email, phone: player.phone || '' });
  const [saving, setSaving] = useState(false);
  const [actionLoading, setActionLoading] = useState(null);

  const handleSave = async () => {
    try {
      setSaving(true);
      await adminPlayersApi.updateProfile(player.id, form);
      toast.success('Perfil actualizado');
      setEditing(false);
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al actualizar perfil');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async () => {
    if (!confirm(`¿${player.isActive ? 'Desactivar' : 'Activar'} a ${player.username}?`)) return;
    try {
      setActionLoading('status');
      await adminPlayersApi.toggleStatus(player.id);
      toast.success(`Jugador ${player.isActive ? 'desactivado' : 'activado'}`);
      onRefresh();
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error');
    } finally {
      setActionLoading(null);
    }
  };

  const handleSendResetLink = async () => {
    if (!confirm(`¿Enviar enlace de recuperación a ${player.email}?`)) return;
    try {
      setActionLoading('reset');
      await adminPlayersApi.sendResetLink(player.id);
      toast.success('Enlace de recuperación enviado');
    } catch (error) {
      toast.error(error.response?.data?.error || 'Error al enviar enlace');
    } finally {
      setActionLoading(null);
    }
  };

  const formatDate = (date) => new Date(date).toLocaleString('es-VE', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

  return (
    <div className="space-y-6">
      {/* Profile Info */}
      <div className="bg-gray-50 rounded-lg p-6">
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Información Personal</h3>
          {!editing ? (
            <button onClick={() => setEditing(true)} className="flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800">
              <Edit2 className="w-4 h-4" /> Editar
            </button>
          ) : (
            <div className="flex gap-2">
              <button onClick={() => { setEditing(false); setForm({ username: player.username, email: player.email, phone: player.phone || '' }); }}
                className="flex items-center gap-1 text-sm text-gray-600 hover:text-gray-800">
                <X className="w-4 h-4" /> Cancelar
              </button>
              <button onClick={handleSave} disabled={saving}
                className="flex items-center gap-1 text-sm text-green-600 hover:text-green-800 disabled:opacity-50">
                <Check className="w-4 h-4" /> {saving ? 'Guardando...' : 'Guardar'}
              </button>
            </div>
          )}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs text-gray-500 uppercase mb-1">Username</label>
            {editing ? (
              <input type="text" value={form.username} onChange={(e) => setForm(prev => ({ ...prev, username: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
            ) : (
              <p className="font-medium text-gray-900">{player.username}</p>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase mb-1">Email</label>
            {editing ? (
              <input type="email" value={form.email} onChange={(e) => setForm(prev => ({ ...prev, email: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
            ) : (
              <div className="flex items-center gap-2">
                <p className="font-medium text-gray-900">{player.email}</p>
                {player.emailVerified ? (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">Verificado</span>
                ) : (
                  <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded-full">No verificado</span>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase mb-1">Teléfono</label>
            {editing ? (
              <input type="text" value={form.phone} onChange={(e) => setForm(prev => ({ ...prev, phone: e.target.value }))}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500" />
            ) : (
              <div className="flex items-center gap-2">
                <p className="font-medium text-gray-900">{player.phone || '-'}</p>
                {player.whatsappVerified && (
                  <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded-full">WhatsApp ✓</span>
                )}
              </div>
            )}
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase mb-1">Fecha de Registro</label>
            <p className="font-medium text-gray-900">{formatDate(player.createdAt)}</p>
          </div>
        </div>
      </div>

      {/* Actions */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Acciones</h3>
        <div className="flex flex-wrap gap-3">
          <button
            onClick={handleToggleStatus}
            disabled={actionLoading === 'status'}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-white ${player.isActive ? 'bg-red-600 hover:bg-red-700' : 'bg-green-600 hover:bg-green-700'} disabled:opacity-50`}
          >
            {player.isActive ? <ShieldOff className="w-4 h-4" /> : <Shield className="w-4 h-4" />}
            {actionLoading === 'status' ? 'Procesando...' : player.isActive ? 'Desactivar Cuenta' : 'Activar Cuenta'}
          </button>

          <button
            onClick={handleSendResetLink}
            disabled={actionLoading === 'reset'}
            className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
          >
            <Key className="w-4 h-4" />
            {actionLoading === 'reset' ? 'Enviando...' : 'Enviar Enlace de Recuperación'}
          </button>
        </div>
      </div>

      {/* Status Info */}
      <div className="bg-gray-50 rounded-lg p-6">
        <h3 className="text-lg font-semibold mb-4">Estado de la Cuenta</h3>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <div>
            <label className="block text-xs text-gray-500 uppercase mb-1">Estado</label>
            <span className={`px-3 py-1 text-sm font-semibold rounded-full ${player.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
              {player.isActive ? 'Activo' : 'Inactivo'}
            </span>
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase mb-1">Email</label>
            <span className={`px-3 py-1 text-sm rounded-full ${player.emailVerified ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'}`}>
              {player.emailVerified ? 'Verificado' : 'Pendiente'}
            </span>
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase mb-1">WhatsApp</label>
            <span className={`px-3 py-1 text-sm rounded-full ${player.whatsappVerified ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'}`}>
              {player.whatsappVerified ? 'Verificado' : 'No verificado'}
            </span>
          </div>
          <div>
            <label className="block text-xs text-gray-500 uppercase mb-1">Rol</label>
            <span className="px-3 py-1 text-sm bg-blue-100 text-blue-700 rounded-full">{player.role || 'PLAYER'}</span>
          </div>
        </div>
      </div>
    </div>
  );
}

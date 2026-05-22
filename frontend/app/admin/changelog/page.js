'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Sparkles, Wrench, Bug, AlertTriangle, Plus, Edit2, Trash2, X, Loader2, ChevronLeft, ChevronRight, Eye, EyeOff,
} from 'lucide-react';
import { toast } from 'sonner';
import useAuthStore from '@/lib/stores/authStore';
import changelogApi from '@/lib/api/changelog';

const CATEGORIES = [
  { key: 'FEATURE',     label: 'Funcionalidad', icon: Sparkles,       color: 'bg-blue-100 text-blue-800 border-blue-200' },
  { key: 'IMPROVEMENT', label: 'Mejora',        icon: Wrench,         color: 'bg-amber-100 text-amber-800 border-amber-200' },
  { key: 'FIX',         label: 'Corrección',    icon: Bug,            color: 'bg-green-100 text-green-800 border-green-200' },
  { key: 'BREAKING',    label: 'Cambio mayor',  icon: AlertTriangle,  color: 'bg-red-100 text-red-800 border-red-200' },
];
const CAT_BY_KEY = Object.fromEntries(CATEGORIES.map((c) => [c.key, c]));

const SEEN_KEY = 'lastSeenChangelogAt';

function fmtDateTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  return d.toLocaleString('es-VE', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

export default function ChangelogPage() {
  const { user } = useAuthStore();
  const isAdmin = user?.role === 'ADMIN';

  const [loading, setLoading] = useState(true);
  const [entries, setEntries] = useState([]);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [includeDrafts, setIncludeDrafts] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState(null); // null = creando

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await changelogApi.list({ page, pageSize: 25, includeDrafts: includeDrafts && isAdmin });
      if (res?.success) {
        setEntries(res.data.entries || []);
        setTotalPages(res.data.totalPages || 1);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error cargando changelog');
    } finally {
      setLoading(false);
    }
  }, [page, includeDrafts, isAdmin]);

  useEffect(() => { load(); }, [load]);

  // Marca todo como visto: la fecha más reciente entre las entradas cargadas.
  useEffect(() => {
    if (entries.length === 0) return;
    const mostRecent = entries.reduce((max, e) => {
      const d = new Date(e.publishedAt).getTime();
      return d > max ? d : max;
    }, 0);
    if (mostRecent > 0) {
      try {
        localStorage.setItem(SEEN_KEY, new Date(mostRecent).toISOString());
        // Notificar a otros componentes (sidebar) que escuchen storage events.
        window.dispatchEvent(new Event('changelog:seen'));
      } catch {}
    }
  }, [entries]);

  const openCreate = () => { setEditing(null); setEditorOpen(true); };
  const openEdit = (entry) => { setEditing(entry); setEditorOpen(true); };

  const handleDelete = async (entry) => {
    if (!confirm(`¿Eliminar "${entry.title}"?`)) return;
    try {
      await changelogApi.remove(entry.id);
      toast.success('Entrada eliminada');
      load();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error eliminando');
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Novedades del sistema</h1>
          <p className="text-sm text-gray-500 mt-0.5">Bitácora de funcionalidades, mejoras y correcciones.</p>
        </div>
        {isAdmin && (
          <div className="flex items-center gap-2">
            <label className="flex items-center gap-2 text-sm text-gray-600">
              <input
                type="checkbox"
                checked={includeDrafts}
                onChange={(e) => { setPage(1); setIncludeDrafts(e.target.checked); }}
                className="w-4 h-4 text-blue-600 rounded"
              />
              Mostrar borradores
            </label>
            <button
              onClick={openCreate}
              className="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm"
            >
              <Plus className="w-4 h-4" /> Nueva entrada
            </button>
          </div>
        )}
      </div>

      {/* Timeline */}
      {loading ? (
        <div className="flex justify-center py-16">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : entries.length === 0 ? (
        <div className="bg-white rounded-xl border border-gray-100 p-10 text-center text-sm text-gray-400">
          Aún no hay entradas.
        </div>
      ) : (
        <ol className="relative border-l-2 border-gray-200 ml-3 space-y-6">
          {entries.map((entry) => {
            const cat = CAT_BY_KEY[entry.category] || CAT_BY_KEY.IMPROVEMENT;
            const Icon = cat.icon;
            return (
              <li key={entry.id} className="ml-6">
                <span className={`absolute -left-[13px] w-6 h-6 rounded-full flex items-center justify-center ring-4 ring-white ${cat.color}`}>
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-4">
                  <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2 mb-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-medium border ${cat.color}`}>
                          {cat.label}
                        </span>
                        {!entry.isPublished && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-medium bg-gray-100 text-gray-700 border border-gray-200">
                            Borrador
                          </span>
                        )}
                        <span className="text-xs text-gray-400">{fmtDateTime(entry.publishedAt)}</span>
                        {entry.createdBy?.username && (
                          <span className="text-xs text-gray-400">· {entry.createdBy.username}</span>
                        )}
                      </div>
                      <h3 className="text-base font-semibold text-gray-900">{entry.title}</h3>
                    </div>
                    {isAdmin && (
                      <div className="flex items-center gap-1 self-end sm:self-start">
                        <button
                          onClick={() => openEdit(entry)}
                          className="p-1.5 text-blue-600 hover:bg-blue-50 rounded"
                          title="Editar"
                        >
                          <Edit2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(entry)}
                          className="p-1.5 text-red-600 hover:bg-red-50 rounded"
                          title="Eliminar"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  <div className="text-sm text-gray-700 whitespace-pre-wrap leading-relaxed">
                    {entry.description}
                  </div>
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded disabled:opacity-40"
          >
            <ChevronLeft className="w-4 h-4" /> Anterior
          </button>
          <span className="text-gray-500">Página {page} de {totalPages}</span>
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex items-center gap-1 px-3 py-1.5 border border-gray-200 rounded disabled:opacity-40"
          >
            Siguiente <ChevronRight className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Editor modal */}
      {editorOpen && (
        <ChangelogEditorModal
          entry={editing}
          onClose={() => { setEditorOpen(false); setEditing(null); }}
          onSaved={() => { setEditorOpen(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function ChangelogEditorModal({ entry, onClose, onSaved }) {
  const isEdit = !!entry;
  const [title, setTitle] = useState(entry?.title || '');
  const [description, setDescription] = useState(entry?.description || '');
  const [category, setCategory] = useState(entry?.category || 'IMPROVEMENT');
  const [isPublished, setIsPublished] = useState(entry?.isPublished ?? true);
  const [saving, setSaving] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!title.trim() || !description.trim()) {
      toast.error('Título y descripción son requeridos');
      return;
    }
    setSaving(true);
    try {
      if (isEdit) {
        await changelogApi.update(entry.id, { title, description, category, isPublished });
        toast.success('Entrada actualizada');
      } else {
        await changelogApi.create({ title, description, category, isPublished });
        toast.success('Entrada creada');
      }
      onSaved();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Error guardando');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
        <div className="flex items-center justify-between p-4 border-b">
          <h2 className="text-lg font-semibold">{isEdit ? 'Editar entrada' : 'Nueva entrada'}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-5 h-5" />
          </button>
        </div>
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Título</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm"
              placeholder="Ej: Nuevo módulo de fiscalización"
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Categoría</label>
            <div className="grid grid-cols-2 gap-2">
              {CATEGORIES.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  onClick={() => setCategory(c.key)}
                  className={`px-3 py-2 text-xs rounded-lg border flex items-center gap-2 ${
                    category === c.key ? `${c.color} ring-2 ring-offset-1` : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <c.icon className="w-4 h-4" />
                  {c.label}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Descripción</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 text-sm font-mono"
              placeholder="Detalles del cambio. Los saltos de línea se respetan."
              required
            />
            <p className="text-xs text-gray-400 mt-1">Texto plano. Los saltos de línea se ven igual en la lista.</p>
          </div>
          <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer">
            <input
              type="checkbox"
              checked={isPublished}
              onChange={(e) => setIsPublished(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded"
            />
            {isPublished ? (
              <><Eye className="w-4 h-4 text-green-600" /> Publicada (visible para todo el staff)</>
            ) : (
              <><EyeOff className="w-4 h-4 text-gray-500" /> Borrador (solo visible para administradores)</>
            )}
          </label>
        </form>
        <div className="p-4 border-t flex justify-end gap-2 bg-gray-50">
          <button onClick={onClose} className="px-4 py-2 text-gray-700 hover:bg-gray-200 rounded-lg">
            Cancelar
          </button>
          <button
            onClick={handleSubmit}
            disabled={saving}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 flex items-center gap-2"
          >
            {saving && <Loader2 className="w-4 h-4 animate-spin" />}
            {isEdit ? 'Guardar' : 'Crear'}
          </button>
        </div>
      </div>
    </div>
  );
}

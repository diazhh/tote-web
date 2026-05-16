'use client';

// /admin/contabilidad/categorias — category CRUD grouped by appliesTo.
//
// D-02 + FIN-LEDGER-06: categories are configurable per accounting-entry type.
// Soft-deactivation only (deactivate / reactivate) — NO hard removal UI.
// Operations: create per group, rename inline, toggle isActive.

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import {
  fetchCategories,
  createCategory,
  renameCategory,
  deactivateCategory,
  reactivateCategory,
} from '@/lib/api/contabilidad';

const TABS = [
  { key: 'home',           label: 'Resumen',        href: '/admin/contabilidad' },
  { key: 'asientos',       label: 'Asientos',       href: '/admin/contabilidad/asientos' },
  { key: 'transferencias', label: 'Transferencias', href: '/admin/contabilidad/transferencias' },
  { key: 'pagos',          label: 'Pagos',          href: '/admin/contabilidad/pagos' },
  { key: 'tasas',          label: 'Tasas',          href: '/admin/contabilidad/tasas' },
  { key: 'categorias',     label: 'Categorías',     href: '/admin/contabilidad/categorias' },
  { key: 'cuentas',        label: 'Cuentas',        href: '/admin/contabilidad/cuentas' },
  { key: 'reportes',       label: 'Reportes',       href: '/admin/contabilidad/reportes' },
];

const GROUPS = [
  { key: 'INCOME',  label: 'Ingresos' },
  { key: 'EXPENSE', label: 'Egresos' },
  { key: 'PAYMENT', label: 'Pagos' },
];

export default function CategoriasPage() {
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [includeInactive, setIncludeInactive] = useState(false);
  const [newNames, setNewNames] = useState({ INCOME: '', EXPENSE: '', PAYMENT: '' });
  const [editing, setEditing] = useState({ id: null, name: '' });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchCategories({
        includeInactive: includeInactive ? 'true' : undefined,
      });
      setCategories(Array.isArray(res?.data) ? res.data : []);
    } catch (err) {
      toast.error(err.message || 'Error cargando categorías');
    } finally {
      setLoading(false);
    }
  }, [includeInactive]);

  useEffect(() => {
    load();
  }, [load]);

  const handleCreate = async (e, appliesTo) => {
    e.preventDefault();
    const name = newNames[appliesTo].trim();
    if (!name) return toast.error('Nombre requerido');
    try {
      await createCategory({ name, appliesTo });
      toast.success('Categoría creada');
      setNewNames({ ...newNames, [appliesTo]: '' });
      await load();
    } catch (err) {
      // Backend P2002 unique constraint surfaces here
      if (/already exists|exist|P2002|duplicate/i.test(err.message)) {
        toast.error('Categoría ya existe para este tipo');
      } else {
        toast.error(err.message || 'Error creando categoría');
      }
    }
  };

  const handleToggle = async (cat) => {
    try {
      if (cat.isActive) {
        await deactivateCategory(cat.id);
        toast.success('Categoría desactivada');
      } else {
        await reactivateCategory(cat.id);
        toast.success('Categoría reactivada');
      }
      await load();
    } catch (err) {
      toast.error(err.message || 'Error al cambiar estado');
    }
  };

  const handleSaveRename = async () => {
    if (!editing.name.trim()) return toast.error('Nombre requerido');
    try {
      await renameCategory(editing.id, editing.name.trim());
      toast.success('Categoría renombrada');
      setEditing({ id: null, name: '' });
      await load();
    } catch (err) {
      toast.error(err.message || 'Error renombrando');
    }
  };

  const grouped = categories.reduce((acc, c) => {
    (acc[c.appliesTo] ??= []).push(c);
    return acc;
  }, {});

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-gray-900">Contabilidad</h1>
        <p className="text-sm text-gray-500">
          Categorías (FIN-LEDGER-06 — sólo activar / desactivar)
        </p>
      </div>

      <nav className="flex gap-2 border-b border-gray-200 overflow-x-auto whitespace-nowrap">
        {TABS.map((tab) => (
          <Link
            key={tab.key}
            href={tab.href}
            className={`px-4 py-2 text-sm font-medium border-b-2 ${
              tab.key === 'categorias'
                ? 'text-blue-700 border-blue-600'
                : 'text-gray-600 border-transparent hover:text-blue-700'
            }`}
          >
            {tab.label}
          </Link>
        ))}
      </nav>

      <div className="flex items-center gap-2">
        <label className="text-sm text-gray-700 flex items-center gap-2">
          <input
            type="checkbox"
            checked={includeInactive}
            onChange={(e) => setIncludeInactive(e.target.checked)}
            className="rounded"
          />
          Incluir inactivas
        </label>
      </div>

      {loading && <p className="text-sm text-gray-500">Cargando…</p>}

      {!loading &&
        GROUPS.map((group) => {
          const list = grouped[group.key] || [];
          return (
            <section
              key={group.key}
              className="bg-white shadow rounded-lg p-4 space-y-3"
            >
              <h2 className="text-base font-semibold text-gray-900">{group.label}</h2>

              <form
                onSubmit={(e) => handleCreate(e, group.key)}
                className="flex flex-col sm:flex-row gap-2"
              >
                <input
                  type="text"
                  value={newNames[group.key]}
                  onChange={(e) =>
                    setNewNames({ ...newNames, [group.key]: e.target.value })
                  }
                  placeholder={`Nueva categoría de ${group.label.toLowerCase()}`}
                  className="flex-1 min-h-11 px-2 py-1.5 text-sm border border-gray-300 rounded-md"
                />
                <button
                  type="submit"
                  className="min-h-11 px-3 py-1.5 text-sm text-white bg-blue-600 rounded-md hover:bg-blue-700"
                >
                  Agregar
                </button>
              </form>

              {list.length === 0 && (
                <p className="text-sm text-gray-400 px-1">Sin categorías</p>
              )}

              {/* Cards en móvil */}
              <div className="md:hidden space-y-2">
                {list.map((c) => (
                  <div
                    key={c.id}
                    className="bg-gray-50 border border-gray-200 rounded-lg p-3 space-y-2"
                  >
                    <div className="flex items-start justify-between gap-2">
                      {editing.id === c.id ? (
                        <input
                          type="text"
                          value={editing.name}
                          onChange={(e) =>
                            setEditing({ ...editing, name: e.target.value })
                          }
                          className="flex-1 min-h-11 px-2 py-1 text-sm border border-gray-300 rounded-md"
                        />
                      ) : (
                        <p className="text-sm font-medium text-gray-900 break-words">
                          {c.name}
                        </p>
                      )}
                      <span
                        className={`shrink-0 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                          c.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {c.isActive ? 'Activa' : 'Inactiva'}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      {editing.id === c.id ? (
                        <>
                          <button
                            onClick={handleSaveRename}
                            className="flex-1 min-h-11 px-2 py-1 text-xs text-white bg-green-600 rounded hover:bg-green-700"
                          >
                            Guardar
                          </button>
                          <button
                            onClick={() => setEditing({ id: null, name: '' })}
                            className="flex-1 min-h-11 px-2 py-1 text-xs text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                          >
                            Cancelar
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            onClick={() => setEditing({ id: c.id, name: c.name })}
                            className="flex-1 min-h-11 px-2 py-1 text-xs text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                          >
                            Renombrar
                          </button>
                          <button
                            onClick={() => handleToggle(c)}
                            className={`flex-1 min-h-11 px-2 py-1 text-xs text-white rounded ${
                              c.isActive
                                ? 'bg-orange-600 hover:bg-orange-700'
                                : 'bg-blue-600 hover:bg-blue-700'
                            }`}
                          >
                            {c.isActive ? 'Desactivar' : 'Activar'}
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ))}
              </div>

              {/* Tabla en desktop */}
              <div className="hidden md:block overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Nombre
                      </th>
                      <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase">
                        Estado
                      </th>
                      <th className="px-3 py-2 text-right text-xs font-medium text-gray-500 uppercase">
                        Acciones
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-100">
                    {list.map((c) => (
                      <tr key={c.id} className="hover:bg-gray-50">
                        <td className="px-3 py-2 text-sm text-gray-900">
                          {editing.id === c.id ? (
                            <input
                              type="text"
                              value={editing.name}
                              onChange={(e) =>
                                setEditing({ ...editing, name: e.target.value })
                              }
                              className="min-h-11 px-2 py-1 text-sm border border-gray-300 rounded-md"
                            />
                          ) : (
                            c.name
                          )}
                        </td>
                        <td className="px-3 py-2 text-sm">
                          <span
                            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${
                              c.isActive
                                ? 'bg-green-100 text-green-800'
                                : 'bg-gray-200 text-gray-700'
                            }`}
                          >
                            {c.isActive ? 'Activa' : 'Inactiva'}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-sm text-right space-x-2">
                          {editing.id === c.id ? (
                            <>
                              <button
                                onClick={handleSaveRename}
                                className="px-2 py-1 text-xs text-white bg-green-600 rounded hover:bg-green-700"
                              >
                                Guardar
                              </button>
                              <button
                                onClick={() => setEditing({ id: null, name: '' })}
                                className="px-2 py-1 text-xs text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                              >
                                Cancelar
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                onClick={() => setEditing({ id: c.id, name: c.name })}
                                className="px-2 py-1 text-xs text-gray-700 bg-gray-100 rounded hover:bg-gray-200"
                              >
                                Renombrar
                              </button>
                              <button
                                onClick={() => handleToggle(c)}
                                className={`px-2 py-1 text-xs text-white rounded ${
                                  c.isActive
                                    ? 'bg-orange-600 hover:bg-orange-700'
                                    : 'bg-blue-600 hover:bg-blue-700'
                                }`}
                              >
                                {c.isActive ? 'Desactivar' : 'Activar'}
                              </button>
                            </>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          );
        })}
    </div>
  );
}

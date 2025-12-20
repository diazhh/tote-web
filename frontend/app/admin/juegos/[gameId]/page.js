'use client';

import { useEffect, useMemo, useState } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import gamesAPI from '@/lib/api/games';
import ItemsTab from '@/components/admin/config/ItemsTab';
import TemplatesTab from '@/components/admin/config/TemplatesTab';
import ChannelsTab from '@/components/admin/config/ChannelsTab';
import { Gamepad2, Hash, Clock, MessageSquare, CalendarDays } from 'lucide-react';
import Link from 'next/link';

export default function GameConfigPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const gameId = params?.gameId;

  const [game, setGame] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('summary');
  const [editingName, setEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState('');
  const [savingName, setSavingName] = useState(false);

  useEffect(() => {
    // initial tab from query
    const tab = searchParams.get('tab');
    if (tab) setActiveTab(tab);
  }, [searchParams]);

  useEffect(() => {
    if (!gameId) return;
    let mounted = true;
    const load = async () => {
      try {
        const response = await gamesAPI.getById(gameId);
        const data = response.data || response;
        if (mounted) {
          setGame(data);
          setNameDraft(data?.name || '');
        }
      } catch (e) {
        console.error('Error loading game:', e);
      } finally {
        if (mounted) setLoading(false);
      }
    };
    load();
    return () => { mounted = false; };
  }, [gameId]);

  const tabs = useMemo(() => ([
    { id: 'summary', name: 'Resumen', icon: Gamepad2 },
    { id: 'items', name: 'Items', icon: Hash },
    { id: 'draws', name: 'Sorteos', icon: CalendarDays },
    { id: 'channels', name: 'Canales', icon: MessageSquare },
  ]), []);

  const onSelectTab = (id) => {
    setActiveTab(id);
    const current = new URLSearchParams(Array.from(searchParams.entries()));
    if (id === 'summary') {
      current.delete('tab');
    } else {
      current.set('tab', id);
    }
    router.push(`/admin/juegos/${gameId}${current.toString() ? `?${current.toString()}` : ''}`);
  };

  const saveName = async () => {
    if (!nameDraft || !game) return;
    setSavingName(true);
    try {
      const updated = await gamesAPI.update(game.id, { name: nameDraft });
      const data = updated?.data || updated;
      setGame(prev => ({ ...prev, name: data?.name ?? nameDraft }));
      setEditingName(false);
    } catch (e) {
      console.error('Error updating game name:', e);
    } finally {
      setSavingName(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando juego...</p>
        </div>
      </div>
    );
  }

  if (!game) {
    return (
      <div className="space-y-4">
        <p className="text-gray-600">No se encontró el juego.</p>
        <Link href="/admin/configuracion" className="text-blue-600 hover:underline">Volver a configuración</Link>
      </div>
    );
  }

  const Header = () => (
    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
      <div>
        <h1 className="text-xl lg:text-2xl font-bold text-gray-900">{game.name}</h1>
        <p className="text-gray-600 mt-1">Gestiona configuración, items, plantillas, canales y sorteos</p>
      </div>
      <Link href="/admin/configuracion" className="text-sm text-blue-600 hover:underline self-start sm:self-auto">← Volver</Link>
    </div>
  );

  return (
    <div className="space-y-6">
      <Header />

      <div className="bg-white rounded-lg shadow">
        <div className="border-b border-gray-200">
          <nav className="flex -mb-px overflow-x-auto">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => onSelectTab(tab.id)}
                  className={`flex items-center px-4 lg:px-6 py-4 text-sm font-medium border-b-2 transition whitespace-nowrap flex-shrink-0 ${
                    activeTab === tab.id
                      ? 'border-blue-500 text-blue-600'
                      : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
                  }`}
                >
                  <Icon className="w-4 h-4 lg:w-5 lg:h-5 mr-2" />
                  <span className="hidden sm:inline">{tab.name}</span>
                  <span className="sm:hidden">{tab.name.slice(0, 3)}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="p-4 lg:p-6">
          {activeTab === 'summary' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Tipo</p>
                  <p className="text-lg font-semibold break-words">{game.type}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Slug</p>
                  <p className="text-lg font-mono text-sm break-all">{game.slug}</p>
                </div>
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Activo</p>
                  <p className="text-lg font-semibold">{game.isActive ? 'Sí' : 'No'}</p>
                </div>
              </div>
              <div className="bg-gray-50 rounded-lg p-4">
                <p className="text-sm text-gray-600 mb-2">Nombre del juego</p>
                {editingName ? (
                  <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                    <input
                      value={nameDraft}
                      onChange={(e) => setNameDraft(e.target.value)}
                      className="px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none flex-1"
                    />
                    <div className="flex gap-2">
                      <button
                        onClick={saveName}
                        disabled={savingName}
                        className="px-3 py-2 bg-blue-600 text-white rounded-md text-sm disabled:opacity-50"
                      >
                        {savingName ? 'Guardando...' : 'Guardar'}
                      </button>
                      <button
                        onClick={() => { setEditingName(false); setNameDraft(game.name || ''); }}
                        className="px-3 py-2 border border-gray-300 rounded-md text-sm"
                      >
                        Cancelar
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <p className="text-lg font-semibold break-words">{game.name}</p>
                    <button
                      onClick={() => setEditingName(true)}
                      className="px-3 py-2 border border-gray-300 rounded-md text-sm hover:bg-gray-100 self-start sm:self-auto"
                    >
                      Editar nombre
                    </button>
                  </div>
                )}
              </div>
              {game.description && (
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-600">Descripción</p>
                  <p className="text-gray-800 break-words">{game.description}</p>
                </div>
              )}
            </div>
          )}

          {activeTab === 'items' && (
            <ItemsTab selectedGameId={game.id} />
          )}

          {activeTab === 'draws' && (
            <TemplatesTab selectedGameId={game.id} />
          )}

          {activeTab === 'channels' && (
            <ChannelsTab gameId={game.id} />
          )}
        </div>
      </div>
    </div>
  );
}

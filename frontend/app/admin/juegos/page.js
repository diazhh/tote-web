'use client';

import { useEffect, useState } from 'react';
import publicAPI from '@/lib/api/public';
import { Gamepad2, Plus, Edit2, Eye } from 'lucide-react';
import Link from 'next/link';

export default function JuegosPage() {
  const [games, setGames] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadGames();
  }, []);

  const loadGames = async () => {
    try {
      const response = await publicAPI.getGames();
      setGames(response.data || []);
    } catch (error) {
      console.error('Error loading games:', error);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Cargando juegos...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Gestión de Juegos</h1>
          <p className="text-gray-600 mt-1">Administra los juegos del sistema</p>
        </div>
      </div>

      {/* Games Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {games.map((game) => (
          <div
            key={game.id}
            className="bg-white rounded-lg shadow hover:shadow-lg transition p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div className="w-12 h-12 bg-blue-100 rounded-lg flex items-center justify-center">
                <Gamepad2 className="w-6 h-6 text-blue-600" />
              </div>
              <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                game.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
              }`}>
                {game.isActive ? 'Activo' : 'Inactivo'}
              </span>
            </div>

            <h3 className="text-lg font-semibold text-gray-900 mb-2">
              {game.name}
            </h3>
            
            <div className="space-y-2 text-sm text-gray-600 mb-4">
              <div className="flex items-center justify-between">
                <span>Tipo:</span>
                <span className="font-medium">{game.type}</span>
              </div>
              <div className="flex items-center justify-between">
                <span>Slug:</span>
                <span className="font-mono text-xs">{game.slug}</span>
              </div>
            </div>

            <div className="flex items-center space-x-2">
              <Link
                href={`/juego/${game.slug}`}
                target="_blank"
                className="flex-1 flex items-center justify-center px-3 py-2 border border-gray-300 rounded-lg hover:bg-gray-50 transition text-sm"
              >
                <Eye className="w-4 h-4 mr-2" />
                Ver público
              </Link>
            </div>
          </div>
        ))}
      </div>

      {games.length === 0 && (
        <div className="text-center py-12 bg-white rounded-lg shadow">
          <Gamepad2 className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <p className="text-gray-600">No hay juegos configurados</p>
        </div>
      )}
    </div>
  );
}

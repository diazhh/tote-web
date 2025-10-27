import Link from 'next/link';
import { Dices, Clover, Hash } from 'lucide-react';
import EmptyState from '@/components/common/EmptyState';

/**
 * Games grid component
 * @param {Object} props
 * @param {Array} props.games - Array of games
 */
export default function GamesGrid({ games }) {
  if (!games || games.length === 0) {
    return (
      <EmptyState 
        title="No hay juegos disponibles"
        description="No se encontraron juegos activos en este momento"
      />
    );
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {games.map((game) => (
        <GameCard key={game.id} game={game} />
      ))}
    </div>
  );
}

/**
 * Individual game card
 */
function GameCard({ game }) {
  const getGameIcon = (type) => {
    switch (type) {
      case 'ANIMALITOS':
        return <Clover className="h-12 w-12" />;
      case 'TRIPLE':
        return <Hash className="h-12 w-12" />;
      case 'ROULETTE':
        return <Dices className="h-12 w-12" />;
      default:
        return <Dices className="h-12 w-12" />;
    }
  };

  const getGameColor = (type) => {
    switch (type) {
      case 'ANIMALITOS':
        return 'from-green-500 to-emerald-600';
      case 'TRIPLE':
        return 'from-blue-500 to-indigo-600';
      case 'ROULETTE':
        return 'from-red-500 to-pink-600';
      default:
        return 'from-gray-500 to-gray-600';
    }
  };

  return (
    <Link href={`/juego/${game.slug}`}>
      <div className="group relative overflow-hidden rounded-xl bg-white shadow-md hover:shadow-xl transition-all duration-300 cursor-pointer">
        {/* Gradient header */}
        <div className={`bg-gradient-to-br ${getGameColor(game.type)} p-6 text-white`}>
          <div className="flex items-center justify-between mb-4">
            {getGameIcon(game.type)}
            {game.isActive && (
              <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-xs font-medium">
                Activo
              </span>
            )}
          </div>
          <h3 className="text-2xl font-bold mb-1">{game.name}</h3>
          <p className="text-sm opacity-90">{game.description}</p>
        </div>

        {/* Content */}
        <div className="p-6">
          <div className="flex items-center justify-between text-sm">
            <div>
              <p className="text-gray-500 mb-1">Tipo</p>
              <p className="font-semibold text-gray-900">
                {game.type === 'ANIMALITOS' ? 'Animalitos' : 
                 game.type === 'TRIPLE' ? 'Triple' : 'Ruleta'}
              </p>
            </div>
            <div className="text-right">
              <p className="text-gray-500 mb-1">Opciones</p>
              <p className="font-semibold text-gray-900">
                {game._count?.items || 0}
              </p>
            </div>
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <p className="text-sm text-primary font-medium group-hover:underline">
              Ver resultados →
            </p>
          </div>
        </div>
      </div>
    </Link>
  );
}

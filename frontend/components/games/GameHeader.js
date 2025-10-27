import { ArrowLeft, Dices, Clover, Hash } from 'lucide-react';
import Link from 'next/link';

/**
 * Game header component
 * @param {Object} props
 * @param {Object} props.game - Game object
 */
export default function GameHeader({ game }) {
  const getGameIcon = (type) => {
    switch (type) {
      case 'ANIMALITOS':
        return <Clover className="h-16 w-16" />;
      case 'TRIPLE':
        return <Hash className="h-16 w-16" />;
      case 'ROULETTE':
        return <Dices className="h-16 w-16" />;
      default:
        return <Dices className="h-16 w-16" />;
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
    <div>
      <Link 
        href="/" 
        className="inline-flex items-center gap-2 text-gray-600 hover:text-gray-900 mb-4 transition-colors"
      >
        <ArrowLeft className="h-4 w-4" />
        <span>Volver al inicio</span>
      </Link>

      <div className={`bg-gradient-to-br ${getGameColor(game.type)} rounded-2xl p-8 text-white shadow-xl`}>
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-6">
            {getGameIcon(game.type)}
            <div>
              <h1 className="text-4xl font-bold mb-2">{game.name}</h1>
              <p className="text-lg opacity-90">{game.description}</p>
              <div className="flex items-center gap-4 mt-4">
                <span className="px-3 py-1 bg-white/20 backdrop-blur-sm rounded-full text-sm font-medium">
                  {game.type === 'ANIMALITOS' ? 'Animalitos' : 
                   game.type === 'TRIPLE' ? 'Triple' : 'Ruleta'}
                </span>
                {game.isActive && (
                  <span className="px-3 py-1 bg-green-500/80 backdrop-blur-sm rounded-full text-sm font-medium">
                    Activo
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState } from 'react';
import { useDrawsByDate, useNextDraws } from '@/hooks/useDraws';
import { useGames } from '@/hooks/useGames';
import { useCountdown } from '@/hooks/useCountdown';
import LoadingSpinner from '@/components/common/LoadingSpinner';
import ErrorMessage from '@/components/common/ErrorMessage';
import ImageModal from '@/components/common/ImageModal';
import { Calendar, Clock, Trophy } from 'lucide-react';
import { formatTime, formatDate } from '@/lib/utils/format';

// Componente para mostrar próximo sorteo con countdown
function NextDrawCard({ game, nextDraw }) {
  const { timeLeft } = useCountdown(nextDraw?.scheduledAt);
  
  return (
    <div className="bg-white rounded-lg shadow p-4 border-l-4 border-blue-500">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-bold text-sm text-gray-900">{game.name}</h3>
        <Clock className="h-4 w-4 text-gray-400" />
      </div>
      {nextDraw ? (
        <div className="space-y-1">
          <div className="text-xs text-gray-600">
            Próximo: <span className="font-semibold">{formatTime(nextDraw.scheduledAt)}</span>
          </div>
          <div className="text-xs text-blue-600 font-medium">
            {timeLeft}
          </div>
        </div>
      ) : (
        <div className="text-xs text-gray-400">Sin sorteos próximos</div>
      )}
    </div>
  );
}

export default function HomePage() {
  const [selectedDate, setSelectedDate] = useState(new Date().toISOString().split('T')[0]);
  const [selectedGame, setSelectedGame] = useState(null);
  const [selectedDraw, setSelectedDraw] = useState(null);
  const [selectedImageUrl, setSelectedImageUrl] = useState(null);
  
  const { games, isLoading: gamesLoading, error: gamesError } = useGames();
  const { draws: dateDraws, isLoading: drawsLoading, error: drawsError } = useDrawsByDate(selectedDate);
  const { nextDraws } = useNextDraws(10);

  if (gamesLoading || drawsLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (gamesError || drawsError) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4">
        <ErrorMessage message={gamesError || drawsError} />
      </div>
    );
  }

  // Group draws by game
  const drawsByGame = (dateDraws || []).reduce((acc, draw) => {
    const gameId = draw.game?.id;
    if (!gameId) return acc;
    if (!acc[gameId]) {
      acc[gameId] = {
        game: draw.game,
        draws: []
      };
    }
    acc[gameId].draws.push(draw);
    return acc;
  }, {});

  // Get next draw per game
  const nextDrawPerGame = {};
  (nextDraws || []).forEach(draw => {
    const gameId = draw.game?.id;
    if (gameId && !nextDrawPerGame[gameId]) {
      nextDrawPerGame[gameId] = draw;
    }
  });

  const filteredDraws = selectedGame 
    ? drawsByGame[selectedGame]?.draws || []
    : dateDraws || [];

  // Debug: Ver qué datos tenemos
  console.log('Filtered draws:', filteredDraws.length);
  console.log('Sample draw:', filteredDraws[0]);

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Compact Header */}
      <header className="bg-gradient-to-r from-blue-600 to-purple-600 text-white py-6 shadow-lg">
        <div className="container mx-auto px-4">
          <h1 className="text-3xl font-bold">🎰 Totalizador</h1>
          <p className="text-sm text-white/80 mt-1">Resultados en tiempo real</p>
        </div>
      </header>

      <div className="container mx-auto px-4 py-6">
        {/* Next Draws - Compact */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
          {games.map(game => {
            const nextDraw = nextDrawPerGame[game.id];
            return (
              <NextDrawCard key={game.id} game={game} nextDraw={nextDraw} />
            );
          })}
        </div>

        {/* Filters */}
        <div className="bg-white rounded-lg shadow p-4 mb-6">
          <div className="flex flex-wrap gap-4 items-center">
            <div className="flex items-center gap-2">
              <Calendar className="h-5 w-5 text-gray-400" />
              <input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="border border-gray-300 rounded px-3 py-1.5 text-sm"
              />
              <button
                onClick={() => setSelectedDate(new Date().toISOString().split('T')[0])}
                className="px-3 py-1.5 rounded text-sm font-medium bg-gray-100 text-gray-700 hover:bg-gray-200 transition"
              >
                Hoy
              </button>
            </div>
            <div className="flex gap-2 flex-wrap">
              <button
                onClick={() => setSelectedGame(null)}
                className={`px-4 py-1.5 rounded text-sm font-medium transition ${
                  !selectedGame 
                    ? 'bg-blue-600 text-white' 
                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                Todos
              </button>
              {games.map(game => (
                <button
                  key={game.id}
                  onClick={() => setSelectedGame(game.id)}
                  className={`px-4 py-1.5 rounded text-sm font-medium transition ${
                    selectedGame === game.id
                      ? 'bg-blue-600 text-white'
                      : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                  }`}
                >
                  {game.name}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Results Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredDraws.length === 0 ? (
            <div className="col-span-full bg-white rounded-lg shadow p-8 text-center text-gray-500">
              No hay sorteos para mostrar
            </div>
          ) : (
            filteredDraws.map((draw) => {
              const isDrawn = draw.status === 'DRAWN' || draw.status === 'PUBLISHED';
              // Mostrar imágenes para todos los juegos que tengan imageUrl
              const hasImages = draw.game?.slug === 'lotoanimalito' || draw.game?.slug === 'lottopantera' || draw.game?.slug === 'triple-pantera';
              const drawImageUrl = draw.imageUrl && hasImages
                ? `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001'}${draw.imageUrl}`
                : null;
              
              // Debug URL construction
              if (isDrawn && draw.imageUrl) {
                console.log('Image URL:', {
                  slug: draw.game?.slug,
                  hasImages,
                  imageUrl: draw.imageUrl,
                  finalUrl: drawImageUrl
                });
              }
              
              return (
                <div key={draw.id} className="bg-white rounded-lg shadow hover:shadow-lg transition-shadow overflow-hidden">
                  {/* Card Header */}
                  <div className="p-4 border-b bg-gradient-to-r from-blue-50 to-purple-50">
                    <div className="flex items-center justify-between mb-2">
                      <h3 className="font-bold text-sm text-gray-900">{draw.game?.name}</h3>
                      {isDrawn ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                          Finalizado
                        </span>
                      ) : draw.status === 'CLOSED' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                          Cerrado
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800">
                          Programado
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 text-xs text-gray-600">
                      <Calendar className="h-3 w-3" />
                      <span>{formatDate(draw.scheduledAt)}</span>
                      <Clock className="h-3 w-3 ml-2" />
                      <span className="font-semibold">{formatTime(draw.scheduledAt)}</span>
                    </div>
                  </div>

                  {/* Card Body - Winner Info */}
                  <div className="p-4">
                    {isDrawn && draw.winnerItem ? (
                      <div className="space-y-3">
                        {/* Winner Image - Solo para juegos con imágenes */}
                        {drawImageUrl && (
                          <div 
                            className="relative w-full rounded-lg overflow-hidden bg-gray-100 cursor-pointer hover:opacity-90 transition-opacity" 
                            style={{ maxHeight: '250px' }}
                            onClick={() => {
                              setSelectedDraw(draw);
                              setSelectedImageUrl(drawImageUrl);
                            }}
                            title="Click para ver imagen completa"
                          >
                            <img
                              src={drawImageUrl}
                              alt={`Resultado ${draw.winnerItem.number}`}
                              className="w-full h-full object-contain"
                              onError={(e) => {
                                e.target.style.display = 'none';
                                e.target.nextSibling.style.display = 'flex';
                              }}
                            />
                            <div className="hidden absolute inset-0 items-center justify-center bg-gray-100">
                              <Trophy className="h-12 w-12 text-gray-300" />
                            </div>
                          </div>
                        )}
                        
                        {/* Winner Details */}
                        <div className="flex items-center justify-center gap-2 bg-yellow-50 rounded-lg p-3 border border-yellow-200">
                          <Trophy className="h-5 w-5 text-yellow-600" />
                          <div className="text-center">
                            <div className="font-bold text-2xl text-gray-900">
                              {draw.winnerItem.number}
                            </div>
                            {draw.winnerItem.name && (
                              <div className="text-sm text-gray-600">
                                {draw.winnerItem.name}
                              </div>
                            )}
                          </div>
                        </div>
                      </div>
                    ) : draw.preselectedItem ? (
                      <div className="text-center py-8">
                        <div className="text-sm text-gray-500 mb-2">Preseleccionado</div>
                        <div className="font-bold text-3xl text-gray-700">
                          {draw.preselectedItem.number}
                        </div>
                        {draw.preselectedItem.name && (
                          <div className="text-sm text-gray-600 mt-1">
                            {draw.preselectedItem.name}
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-8 text-gray-400">
                        <Clock className="h-8 w-8 mx-auto mb-2 opacity-50" />
                        <div className="text-sm">Pendiente</div>
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {/* Footer */}
      <footer className="bg-gray-900 text-white py-8 mt-16">
        <div className="container mx-auto px-4 text-center">
          <p className="text-sm">
            © {new Date().getFullYear()} Totalizador de Loterías. Todos los derechos reservados.
          </p>
          <p className="text-xs text-gray-400 mt-2">
            Resultados en tiempo real • Sistema automatizado
          </p>
        </div>
      </footer>

      {/* Image Modal */}
      {selectedDraw && selectedImageUrl && (
        <ImageModal
          draw={selectedDraw}
          imageUrl={selectedImageUrl}
          onClose={() => {
            setSelectedDraw(null);
            setSelectedImageUrl(null);
          }}
        />
      )}
    </div>
  );
}

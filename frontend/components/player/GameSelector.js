const gameLogos = {
  'triple-pantera': '/images/games/triple-pantera.png',
  'lotoanimalito': '/images/games/lotoanimalito.png',
  'lottopantera': '/images/games/lotto-pantera.png',
  'centenario-pantera': '/images/games/centenario-pantera.png',
};

export default function GameSelector({ games, selectedGame, onSelectGame }) {
  return (
    <div className="flex lg:grid lg:grid-cols-2 gap-2 lg:gap-3 overflow-x-auto lg:overflow-visible pb-2 lg:pb-0 -mx-1 px-1 lg:mx-0 lg:px-0">
      {games.map(game => {
        const logo = gameLogos[game.slug];
        return (
          <button
            key={game.id}
            onClick={() => onSelectGame(game)}
            className={`flex-shrink-0 lg:flex-shrink flex items-center gap-2 px-4 py-3 lg:py-4 rounded-lg lg:rounded-xl font-semibold text-sm lg:text-base transition-all ${
              selectedGame?.id === game.id
                ? 'bg-blue-600 text-white shadow-md hover:bg-blue-700'
                : 'bg-white text-gray-700 border border-gray-200 hover:border-blue-400 hover:bg-blue-50'
            }`}
          >
            {logo && (
              <img src={logo} alt={game.name} className="h-8 w-8 object-contain rounded" />
            )}
            {game.name}
          </button>
        );
      })}
    </div>
  );
}

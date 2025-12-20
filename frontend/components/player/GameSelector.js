export default function GameSelector({ games, selectedGame, onSelectGame }) {
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
      {games.map(game => (
        <button
          key={game.id}
          onClick={() => onSelectGame(game)}
          className={`flex-shrink-0 px-4 py-3 rounded-lg font-semibold text-sm transition-all ${
            selectedGame?.id === game.id
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-white text-gray-700 border border-gray-200'
          }`}
        >
          {game.name}
        </button>
      ))}
    </div>
  );
}

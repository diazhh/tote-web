import { create } from 'zustand';

const useGameStore = create((set) => ({
  games: [],
  selectedGame: null,

  /**
   * Set all games
   * @param {Array} games - Array of games
   */
  setGames: (games) => set({ games }),

  /**
   * Set selected game
   * @param {Object|null} game - Selected game object
   */
  setSelectedGame: (game) => set({ selectedGame: game }),

  /**
   * Update a specific game
   * @param {string} id - Game ID
   * @param {Object} data - Updated game data
   */
  updateGame: (id, data) =>
    set((state) => ({
      games: state.games.map((game) =>
        game.id === id ? { ...game, ...data } : game
      ),
      selectedGame:
        state.selectedGame?.id === id
          ? { ...state.selectedGame, ...data }
          : state.selectedGame
    })),

  /**
   * Add a new game
   * @param {Object} game - Game object
   */
  addGame: (game) =>
    set((state) => ({
      games: [...state.games, game]
    })),

  /**
   * Remove a game
   * @param {string} id - Game ID
   */
  removeGame: (id) =>
    set((state) => ({
      games: state.games.filter((game) => game.id !== id),
      selectedGame: state.selectedGame?.id === id ? null : state.selectedGame
    }))
}));

export default useGameStore;

import { create } from 'zustand';

const useDrawStore = create((set) => ({
  draws: [],
  nextDraw: null,
  todayDraws: [],

  /**
   * Set all draws
   * @param {Array} draws - Array of draws
   */
  setDraws: (draws) => set({ draws }),

  /**
   * Set next draw
   * @param {Object|null} draw - Next draw object
   */
  setNextDraw: (draw) => set({ nextDraw: draw }),

  /**
   * Set today's draws
   * @param {Array} draws - Array of today's draws
   */
  setTodayDraws: (draws) => set({ todayDraws: draws }),

  /**
   * Update a specific draw
   * @param {string} id - Draw ID
   * @param {Object} data - Updated draw data
   */
  updateDraw: (id, data) =>
    set((state) => ({
      draws: state.draws.map((draw) =>
        draw.id === id ? { ...draw, ...data } : draw
      ),
      todayDraws: state.todayDraws.map((draw) =>
        draw.id === id ? { ...draw, ...data } : draw
      ),
      nextDraw:
        state.nextDraw?.id === id
          ? { ...state.nextDraw, ...data }
          : state.nextDraw
    })),

  /**
   * Add a new draw
   * @param {Object} draw - Draw object
   */
  addDraw: (draw) =>
    set((state) => ({
      draws: [draw, ...state.draws]
    })),

  /**
   * Remove a draw
   * @param {string} id - Draw ID
   */
  removeDraw: (id) =>
    set((state) => ({
      draws: state.draws.filter((draw) => draw.id !== id),
      todayDraws: state.todayDraws.filter((draw) => draw.id !== id),
      nextDraw: state.nextDraw?.id === id ? null : state.nextDraw
    }))
}));

export default useDrawStore;

import api from './axios';

/**
 * Public API endpoints (no authentication required)
 */

/**
 * Get all active games
 * @returns {Promise<Array>} List of games
 */
export async function getGames() {
  const response = await api.get('/api/public/games');
  return response.data?.data || response.data || [];
}

/**
 * Get today's draws
 * @returns {Promise<Array>} List of draws
 */
export async function getTodayDraws() {
  const response = await api.get('/api/public/draws/today');
  return response.data?.data || response.data || [];
}

/**
 * Get draws by date
 * @param {string} date - Date in YYYY-MM-DD format
 * @returns {Promise<Array>} List of draws
 */
export async function getDrawsByDate(date) {
  const response = await api.get('/api/public/draws/by-date', { params: { date } });
  return response.data?.data || response.data || [];
}

/**
 * Get next upcoming draws
 * @param {number} limit - Number of draws to fetch
 * @returns {Promise<Array>} List of draws
 */
export async function getNextDraws(limit = 5) {
  const response = await api.get('/api/public/draws/next', { params: { limit } });
  return response.data?.data || response.data || [];
}

/**
 * Get today's draws for a specific game
 * @param {string} slug - Game slug
 * @returns {Promise<Array>} List of draws
 */
export async function getGameTodayDraws(slug) {
  const response = await api.get(`/api/public/draws/game/${slug}/today`);
  return response.data?.data || response.data || [];
}

/**
 * Get draw history for a specific game
 * @param {string} slug - Game slug
 * @param {Object} params - Query parameters (page, limit, startDate, endDate)
 * @returns {Promise<Object>} Paginated draws
 */
export async function getGameHistory(slug, params = {}) {
  const response = await api.get(`/api/public/draws/game/${slug}/history`, { params });
  return response.data?.data || response.data || { draws: [], total: 0, page: 1, limit: 10 };
}

/**
 * Get statistics for a specific game
 * @param {string} slug - Game slug
 * @param {Object} params - Query parameters (days)
 * @returns {Promise<Object>} Game statistics
 */
export async function getGameStats(slug, params = {}) {
  const response = await api.get(`/api/public/stats/game/${slug}`, { params });
  return response.data?.data || response.data || {};
}

// Default export
const publicAPI = {
  getGames,
  getTodayDraws,
  getDrawsByDate,
  getNextDraws,
  getGameTodayDraws,
  getGameHistory,
  getGameStats
};

export default publicAPI;

/**
 * API client for Games management
 */

import api from './axios';

const gamesAPI = {
  /**
   * Get all games
   */
  async getAll() {
    const response = await api.get('/games');
    return response.data;
  },

  /**
   * Get game by ID
   */
  async getById(id) {
    const response = await api.get(`/games/${id}`);
    return response.data;
  },

  /**
   * Get game by slug
   */
  async getBySlug(slug) {
    const response = await api.get(`/games/slug/${slug}`);
    return response.data;
  },

  /**
   * Get game stats
   */
  async getStats(id) {
    const response = await api.get(`/games/${id}/stats`);
    return response.data;
  },

  /**
   * Get game items
   */
  async getItems(id) {
    const response = await api.get(`/games/${id}/items`);
    return response.data;
  },

  /**
   * Create new game
   */
  async create(data) {
    const response = await api.post('/games', data);
    return response.data;
  },

  /**
   * Update game
   */
  async update(id, data) {
    const response = await api.put(`/games/${id}`, data);
    return response.data;
  },

  /**
   * Delete game
   */
  async delete(id) {
    const response = await api.delete(`/games/${id}`);
    return response.data;
  },
};

export default gamesAPI;

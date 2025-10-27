/**
 * API client for Game Items management
 */

import api from './axios';

const itemsAPI = {
  /**
   * Get item by ID
   */
  async getById(id) {
    const response = await api.get(`/api/items/${id}`);
    return response.data;
  },

  /**
   * Create new item
   */
  async create(data) {
    const response = await api.post('/api/items', data);
    return response.data;
  },

  /**
   * Update item
   */
  async update(id, data) {
    const response = await api.put(`/api/items/${id}`, data);
    return response.data;
  },

  /**
   * Delete item
   */
  async delete(id) {
    const response = await api.delete(`/api/items/${id}`);
    return response.data;
  },

  /**
   * Bulk create items for a game
   */
  async bulkCreate(gameId, items) {
    const promises = items.map(item => 
      this.create({ ...item, gameId })
    );
    return Promise.all(promises);
  },
};

export default itemsAPI;

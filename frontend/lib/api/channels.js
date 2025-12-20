/**
 * API client for Channel Configuration management
 */

import api from './axios';

const channelsAPI = {
  /**
   * Get all channel configurations
   */
  async getAll(filters = {}) {
    const response = await api.get('/channels', { params: filters });
    return response.data;
  },

  /**
   * Get channel config by ID
   */
  async getById(id) {
    const response = await api.get(`/channels/${id}`);
    return response.data;
  },

  /**
   * Create new channel configuration
   */
  async create(data) {
    const response = await api.post('/channels', data);
    return response.data;
  },

  /**
   * Update channel configuration
   */
  async update(id, data) {
    const response = await api.put(`/channels/${id}`, data);
    return response.data;
  },

  /**
   * Delete channel configuration
   */
  async delete(id) {
    const response = await api.delete(`/channels/${id}`);
    return response.data;
  },

  /**
   * Test channel connection
   */
  async testConnection(id) {
    const response = await api.post(`/channels/${id}/test`);
    return response.data;
  },
};

export default channelsAPI;

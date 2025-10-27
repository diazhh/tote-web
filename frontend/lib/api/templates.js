/**
 * API client for Draw Templates management
 */

import api from './axios';

const templatesAPI = {
  /**
   * Get all templates
   */
  async getAll(filters = {}) {
    const response = await api.get('/api/templates', { params: filters });
    return response.data;
  },

  /**
   * Get template by ID
   */
  async getById(id) {
    const response = await api.get(`/api/templates/${id}`);
    return response.data;
  },

  /**
   * Create new template
   */
  async create(data) {
    const response = await api.post('/api/templates', data);
    return response.data;
  },

  /**
   * Update template
   */
  async update(id, data) {
    const response = await api.patch(`/api/templates/${id}`, data);
    return response.data;
  },

  /**
   * Delete template
   */
  async delete(id) {
    const response = await api.delete(`/api/templates/${id}`);
    return response.data;
  },
};

export default templatesAPI;

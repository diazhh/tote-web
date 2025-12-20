/**
 * API client for Tickets
 */

import api from './axios';

const ticketsAPI = {
  /**
   * Create a new ticket
   */
  async create(ticketData) {
    const response = await api.post('/api/tickets', ticketData);
    return response.data;
  },

  /**
   * Get my tickets
   */
  async getMyTickets(params = {}) {
    const queryParams = new URLSearchParams();
    if (params.status) queryParams.append('status', params.status);
    if (params.drawId) queryParams.append('drawId', params.drawId);
    if (params.limit) queryParams.append('limit', params.limit);
    if (params.offset) queryParams.append('offset', params.offset);

    const response = await api.get(`/api/tickets/my-tickets?${queryParams.toString()}`);
    return response.data;
  },

  /**
   * Get ticket by ID
   */
  async getById(id) {
    const response = await api.get(`/api/tickets/${id}`);
    return response.data;
  },

  /**
   * Cancel ticket
   */
  async cancel(id) {
    const response = await api.delete(`/api/tickets/${id}`);
    return response.data;
  }
};

export default ticketsAPI;

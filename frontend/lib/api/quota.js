/**
 * API client for DrawItemQuota admin endpoints.
 */
import axios from './axios';

const quotaApi = {
  /** GET /api/draws/:drawId/quotas → per-item cap + utilization */
  async getDrawQuotas(drawId) {
    const response = await axios.get(`/draws/${drawId}/quotas`);
    return response.data;
  },

  /** PUT /api/draws/:drawId/quotas/:gameItemId */
  async setQuota(drawId, gameItemId, maxAmount) {
    const response = await axios.put(`/draws/${drawId}/quotas/${gameItemId}`, { maxAmount });
    return response.data;
  },

  /** DELETE /api/draws/:drawId/quotas/:gameItemId */
  async removeQuota(drawId, gameItemId) {
    const response = await axios.delete(`/draws/${drawId}/quotas/${gameItemId}`);
    return response.data;
  },
};

export default quotaApi;

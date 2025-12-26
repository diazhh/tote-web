import axios from './axios';

const numberHistoryApi = {
  async getLastSeen(gameId, number) {
    const response = await axios.get(`/number-history/${gameId}/${number}/last-seen`);
    return response.data;
  },

  async getHistory(gameId, number, limit = 10) {
    const response = await axios.get(`/number-history/${gameId}/${number}/history?limit=${limit}`);
    return response.data;
  },

  async getAllLastSeen(gameId) {
    const response = await axios.get(`/number-history/${gameId}/all`);
    return response.data;
  }
};

export default numberHistoryApi;

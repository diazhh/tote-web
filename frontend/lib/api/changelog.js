/**
 * API client del módulo Changelog.
 */
import axios from './axios';

const changelogApi = {
  /** GET /api/changelog */
  async list({ page = 1, pageSize = 25, includeDrafts = false, category } = {}) {
    const params = new URLSearchParams();
    params.append('page', String(page));
    params.append('pageSize', String(pageSize));
    if (includeDrafts) params.append('includeDrafts', 'true');
    if (category) params.append('category', category);
    const res = await axios.get(`/changelog?${params.toString()}`);
    return res.data;
  },

  /** GET /api/changelog/unread-count?since=<ISO> */
  async unreadCount(sinceIso) {
    const params = new URLSearchParams();
    if (sinceIso) params.append('since', sinceIso);
    const res = await axios.get(`/changelog/unread-count?${params.toString()}`);
    return res.data;
  },

  /** POST /api/changelog */
  async create(data) {
    const res = await axios.post('/changelog', data);
    return res.data;
  },

  /** PATCH /api/changelog/:id */
  async update(id, data) {
    const res = await axios.patch(`/changelog/${id}`, data);
    return res.data;
  },

  /** DELETE /api/changelog/:id */
  async remove(id) {
    const res = await axios.delete(`/changelog/${id}`);
    return res.data;
  },
};

export default changelogApi;

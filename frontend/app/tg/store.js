import { create } from 'zustand';
import axios from 'axios';
import { getInitData } from './lib/telegram';

const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:10000/api';

export const useSession = create((set) => ({
  status: 'idle',
  session: null,
  error: null,
  async authenticate() {
    set({ status: 'loading', error: null });
    try {
      const initData = getInitData();
      // Bare axios (no shared interceptor) so a 401 here shows the error UI
      // instead of redirecting to /login. The token is then used by the
      // shared `api` client for all subsequent calls.
      const { data } = await axios.post(`${API_BASE}/telegram-miniapp/auth`, { initData });
      localStorage.setItem('accessToken', data.token);
      set({ status: 'ok', session: data });
    } catch (e) {
      const msg = e?.response?.status === 403
        ? 'No tienes acceso de administrador. Vincula tu cuenta con /vincular en el bot.'
        : 'Sesión de Telegram inválida. Reábrela desde el bot.';
      set({ status: 'error', error: msg });
    }
  },
}));

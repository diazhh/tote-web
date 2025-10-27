import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import authAPI from '../api/auth';

/**
 * Store de autenticación
 */
const useAuthStore = create(
  persist(
    (set, get) => ({
      // Estado
      user: null,
      token: null,
      isAuthenticated: false,
      isLoading: false,
      error: null,

      /**
       * Login
       */
      login: async (username, password) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authAPI.login(username, password);
          
          if (response.success) {
            const { user, token } = response.data;
            
            // Guardar en localStorage
            if (typeof window !== 'undefined') {
              localStorage.setItem('accessToken', token);
              localStorage.setItem('user', JSON.stringify(user));
            }

            set({
              user,
              token,
              isAuthenticated: true,
              isLoading: false,
              error: null
            });

            return { success: true };
          }
        } catch (error) {
          const errorMessage = error.response?.data?.error || 'Error al iniciar sesión';
          set({ isLoading: false, error: errorMessage });
          return { success: false, error: errorMessage };
        }
      },

      /**
       * Logout
       */
      logout: () => {
        // Limpiar localStorage
        if (typeof window !== 'undefined') {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('user');
        }

        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null
        });
      },

      /**
       * Verificar sesión
       */
      checkAuth: async () => {
        const token = typeof window !== 'undefined' ? localStorage.getItem('accessToken') : null;
        
        if (!token) {
          set({ isAuthenticated: false, user: null, token: null });
          return false;
        }

        try {
          const response = await authAPI.me();
          if (response.success) {
            set({
              user: response.data,
              token,
              isAuthenticated: true
            });
            return true;
          }
        } catch (error) {
          get().logout();
          return false;
        }
      },

      /**
       * Cambiar contraseña
       */
      changePassword: async (currentPassword, newPassword) => {
        set({ isLoading: true, error: null });
        try {
          const response = await authAPI.changePassword(currentPassword, newPassword);
          set({ isLoading: false });
          return { success: true, data: response.data };
        } catch (error) {
          const errorMessage = error.response?.data?.error || 'Error al cambiar contraseña';
          set({ isLoading: false, error: errorMessage });
          return { success: false, error: errorMessage };
        }
      },

      /**
       * Limpiar error
       */
      clearError: () => set({ error: null })
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);

export default useAuthStore;

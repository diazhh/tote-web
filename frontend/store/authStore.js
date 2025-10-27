import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useAuthStore = create(
  persist(
    (set) => ({
      user: null,
      accessToken: null,
      isAuthenticated: false,

      /**
       * Login user
       * @param {Object} user - User object
       * @param {string} token - Access token
       */
      login: (user, token) => {
        set({
          user,
          accessToken: token,
          isAuthenticated: true
        });
        // Also store in localStorage for axios interceptor
        if (typeof window !== 'undefined') {
          localStorage.setItem('accessToken', token);
          localStorage.setItem('user', JSON.stringify(user));
        }
      },

      /**
       * Logout user
       */
      logout: () => {
        set({
          user: null,
          accessToken: null,
          isAuthenticated: false
        });
        // Clear localStorage
        if (typeof window !== 'undefined') {
          localStorage.removeItem('accessToken');
          localStorage.removeItem('user');
        }
      },

      /**
       * Update user data
       * @param {Object} userData - Updated user data
       */
      updateUser: (userData) => {
        set((state) => ({
          user: { ...state.user, ...userData }
        }));
      }
    }),
    {
      name: 'auth-storage',
      partialize: (state) => ({
        user: state.user,
        accessToken: state.accessToken,
        isAuthenticated: state.isAuthenticated
      })
    }
  )
);

export default useAuthStore;

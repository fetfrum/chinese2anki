import { create } from 'zustand';
import { devtools } from 'zustand/middleware';

export const useAuthStore = create(
  devtools(
    (set, get) => ({
      // State
      user: null,
      isAuthenticated: false,
      isLoading: true,
      error: null,
      regFlowActive: false,
      tempGoogleProfile: null,

      // Actions
      checkAuthStatus: async () => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch('/api/auth/status');
          if (!res.ok) throw new Error('Failed to verify session');
          const data = await res.json();
          
          set({
            user: data.user || null,
            isAuthenticated: !!data.authenticated,
            isLoading: false
          });
        } catch (err) {
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            error: err.message
          });
        }
      },

      registerUser: async (username) => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch('/api/register', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username })
          });
          const data = await res.json();
          
          if (!res.ok) {
            throw new Error(data.error || 'Registration failed');
          }
          
          set({
            user: data.user,
            isAuthenticated: true,
            isLoading: false,
            regFlowActive: false,
            tempGoogleProfile: null
          });
          return data;
        } catch (err) {
          set({ isLoading: false, error: err.message });
          throw err;
        }
      },

      logout: async () => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch('/api/auth/logout', { method: 'POST' });
          if (!res.ok) throw new Error('Logout failed');
          
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            regFlowActive: false,
            tempGoogleProfile: null
          });
        } catch (err) {
          set({ isLoading: false, error: err.message });
          throw err;
        }
      },

      deleteAccount: async () => {
        set({ isLoading: true, error: null });
        try {
          const res = await fetch('/api/user/delete', { method: 'POST' });
          if (!res.ok) throw new Error('Account deletion failed');
          
          set({
            user: null,
            isAuthenticated: false,
            isLoading: false,
            regFlowActive: false,
            tempGoogleProfile: null
          });
        } catch (err) {
          set({ isLoading: false, error: err.message });
          throw err;
        }
      },

      setRegFlow: (active, tempProfile = null) => {
        set({ regFlowActive: active, tempGoogleProfile: tempProfile });
      },

      clearError: () => set({ error: null })
    }),
    { name: 'AuthStore' }
  )
);

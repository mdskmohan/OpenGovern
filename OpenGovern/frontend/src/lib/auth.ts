import { create } from 'zustand';
import { api } from './api-client';
import type { User } from '@/types';

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
  loadFromStorage: () => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  token: null,
  isAuthenticated: false,
  isLoading: false,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });

    // Demo mode: accept demo credentials without backend
    const DEMO_EMAIL = 'admin@opengovern.io';
    const DEMO_PASSWORD = 'admin';
    if (email === DEMO_EMAIL && password === DEMO_PASSWORD) {
      const demoUser = {
        id: 'demo-user',
        email: DEMO_EMAIL,
        username: 'admin',
        fullName: 'Demo Admin',
        roles: ['admin'],
        isAuthenticated: true,
      };
      const demoToken = 'demo-token-no-backend-required';
      if (typeof window !== 'undefined') {
        localStorage.setItem('og_access_token', demoToken);
        localStorage.setItem('og_demo_mode', 'true');
      }
      set({ token: demoToken, user: demoUser as any, isAuthenticated: true, isLoading: false });
      return;
    }

    try {
      const response = await api.auth.login(email, password);
      // Auth service returns { user, tokens: { accessToken, refreshToken, ... } }
      const { user, tokens } = response.data;
      const token = tokens?.accessToken || response.data.token;
      if (typeof window !== 'undefined') {
        localStorage.setItem('og_access_token', token);
        if (tokens?.refreshToken) {
          localStorage.setItem('og_refresh_token', tokens.refreshToken);
        }
      }
      set({ token, user, isAuthenticated: true, isLoading: false });
    } catch (err: unknown) {
      const message =
        (err as { response?: { data?: { message?: string } } })?.response?.data
          ?.message || 'Invalid email or password';
      set({ error: message, isLoading: false });
      throw err;
    }
  },

  logout: () => {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('og_access_token');
    }
    api.auth.logout().catch(() => {}); // fire-and-forget
    set({ user: null, token: null, isAuthenticated: false });
    if (typeof window !== 'undefined') {
      window.location.href = '/login';
    }
  },

  loadFromStorage: async () => {
    if (typeof window === 'undefined') return;
    const token = localStorage.getItem('og_access_token');
    if (!token) {
      set({ isAuthenticated: false, isLoading: false });
      return;
    }
    // Demo mode: restore demo session without hitting backend
    if (token === 'demo-token-no-backend-required') {
      set({
        token,
        user: { id: 'demo-user', email: 'admin@opengovern.io', username: 'admin', fullName: 'Demo Admin', roles: ['admin'] } as any,
        isAuthenticated: true,
        isLoading: false,
      });
      return;
    }
    set({ token, isLoading: true });
    try {
      const response = await api.auth.me();
      set({ user: response.data, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem('og_access_token');
      set({ token: null, user: null, isAuthenticated: false, isLoading: false });
    }
  },

  clearError: () => set({ error: null }),
}));

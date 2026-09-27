import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type { AuthResult, Restaurant, User } from '../lib/types';
import { http } from '../lib/api';

interface AuthState {
  user: User | null;
  restaurant: Restaurant | null;
  accessToken: string | null;
  refreshToken: string | null;
  ready: boolean;
  login: (identifier: string, password: string) => Promise<void>;
  register: (input: Record<string, unknown>) => Promise<void>;
  setTokens: (tokens: { accessToken: string; refreshToken: string }) => void;
  setRestaurant: (restaurant: Restaurant) => void;
  logout: () => void;
  bootstrap: () => Promise<void>;
}

export const useAuth = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      restaurant: null,
      accessToken: null,
      refreshToken: null,
      ready: false,

      async login(identifier, password) {
        const { data } = await http.post<AuthResult>('/auth/login', { identifier, password });
        set({
          user: data.user,
          restaurant: data.restaurant ?? null,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          ready: true,
        });
      },

      async register(input) {
        const { data } = await http.post<AuthResult>('/auth/register', input);
        set({
          user: data.user,
          restaurant: data.restaurant ?? null,
          accessToken: data.accessToken,
          refreshToken: data.refreshToken,
          ready: true,
        });
      },

      setTokens(tokens) {
        set({ accessToken: tokens.accessToken, refreshToken: tokens.refreshToken });
      },

      setRestaurant(restaurant) {
        set({ restaurant });
      },

      logout() {
        const token = get().accessToken;
        if (token) void http.post('/auth/logout').catch(() => undefined);
        set({ user: null, restaurant: null, accessToken: null, refreshToken: null, ready: true });
      },

      /** Re-validates the stored token on boot and refreshes the restaurant record. */
      async bootstrap() {
        const { accessToken } = get();
        if (!accessToken) return void set({ ready: true });
        try {
          const { data } = await http.get<{ user: User; restaurant: Restaurant }>('/auth/me');
          set({ user: data.user, restaurant: data.restaurant, ready: true });
        } catch {
          set({ user: null, restaurant: null, accessToken: null, refreshToken: null, ready: true });
        }
      },
    }),
    {
      name: 'sizzle.auth',
      partialize: (s) => ({ user: s.user, restaurant: s.restaurant, accessToken: s.accessToken, refreshToken: s.refreshToken }),
    },
  ),
);

export const PERMISSIONS: Record<string, string[]> = {
  OWNER: ['*'],
  MANAGER: [
    'menu:read', 'menu:write', 'orders:read', 'orders:write', 'orders:status', 'kitchen:operate',
    'billing:read', 'billing:write', 'payments:read', 'payments:write', 'payments:refund',
    'bookings:read', 'bookings:write', 'tables:read', 'tables:write', 'requests:read', 'requests:write',
    'staff:read', 'staff:write', 'inventory:read', 'inventory:write', 'reports:read', 'audit:read',
  ],
  CASHIER: [
    'menu:read', 'orders:read', 'orders:status', 'billing:read', 'billing:write',
    'payments:read', 'payments:write', 'tables:read', 'bookings:read', 'requests:read', 'requests:write',
  ],
  KITCHEN: ['menu:read', 'orders:read', 'kitchen:operate'],
  WAITER: [
    'menu:read', 'orders:read', 'orders:write', 'orders:status', 'tables:read', 'tables:write',
    'bookings:read', 'bookings:write', 'requests:read', 'requests:write',
    'billing:read', 'billing:write', 'payments:read', 'payments:write',
  ],
};

export function can(role: string | undefined | null, permission: string): boolean {
  if (!role) return false;
  const list = PERMISSIONS[role];
  return !!list && (list.includes('*') || list.includes(permission));
}

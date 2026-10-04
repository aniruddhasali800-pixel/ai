import axios, { AxiosError, type AxiosInstance, type InternalAxiosRequestConfig } from 'axios';
import { useAuth } from '../store/auth';

/**
 * Where the API lives. Empty means "this same server", which is how the app runs in
 * development (Vite proxies /api) and when the API hosts the built client itself.
 * A separately deployed client — Vercel in front of Render, say — has to be told at
 * build time, because the browser cannot discover it.
 */
export const API_ROOT = (import.meta.env.VITE_API_URL as string | undefined)?.replace(/\/+$/, '') ?? '';

const baseURL = `${API_ROOT}/api`;

/** Turn a stored `/uploads/menu/x.png` into something loadable from another origin. */
export function mediaUrl(path: string | null | undefined): string {
  if (!path) return '';
  return /^(https?:|data:|blob:)/.test(path) ? path : `${API_ROOT}${path.startsWith('/') ? path : `/${path}`}`;
}

export const http: AxiosInstance = axios.create({
  baseURL,
  withCredentials: false,
});

/** Attach the local JWT access token to every request. */
http.interceptors.request.use((config) => {
  const localToken = useAuth.getState().accessToken;
  if (localToken && !config.headers.Authorization) {
    config.headers.Authorization = `Bearer ${localToken}`;
  }
  return config;
});

let refreshPromise: Promise<string> | null = null;

async function refreshAccessToken(): Promise<string> {
  const { refreshToken, setTokens, logout } = useAuth.getState();
  if (!refreshToken) {
    logout();
    throw new Error('no refresh token');
  }
  try {
    const { data } = await axios.post(`${baseURL}/auth/refresh`, { refreshToken });
    setTokens({ accessToken: data.accessToken, refreshToken: data.refreshToken });
    return data.accessToken as string;
  } catch (err) {
    logout();
    throw err;
  }
}

http.interceptors.response.use(
  (res) => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };
    const status = error.response?.status;
    const isAuthRoute =
      original?.url?.includes('/auth/login') ||
      original?.url?.includes('/auth/refresh') ||
      original?.url?.includes('/auth/me');

    if (status === 401 && original && !original._retry && !isAuthRoute) {
      const state = useAuth.getState();
      if (state.refreshToken) {
        original._retry = true;
        try {
          if (!refreshPromise) refreshPromise = refreshAccessToken().finally(() => (refreshPromise = null));
          const token = await refreshPromise;
          original.headers.Authorization = `Bearer ${token}`;
          return http(original);
        } catch {
          return Promise.reject(error);
        }
      }
    }
    return Promise.reject(error);
  },
);

/** Extract a human-readable message from any failed axios call. */
export function errMsg(error: unknown, fallback = 'Something went wrong'): string {
  if (axios.isAxiosError(error)) {
    const data = error.response?.data as { message?: string; error?: { message?: string } } | undefined;
    return data?.error?.message || data?.message || fallback;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

import { io, type Socket } from 'socket.io-client';
import { useEffect, useRef, useState } from 'react';
import { API_ROOT } from './api';

let socket: Socket | null = null;
let authToken: string | null = null;

export function connectRealtime(token: string | null) {
  authToken = token;
  if (socket) {
    socket.removeAllListeners();
    socket.disconnect();
    socket = null;
  }
  socket = io(API_ROOT || undefined, {
    path: '/socket.io',
    auth: token ? { token } : {},
    transports: ['websocket', 'polling'],
  });
  return socket;
}

export function disconnectRealtime() {
  if (socket) {
    socket.disconnect();
    socket = null;
  }
}

export function getSocket(): Socket | null {
  return socket;
}

export function joinSession(token: string) {
  socket?.emit('join:session', { token });
}

export function leaveSession(token: string) {
  socket?.emit('leave:session', { token });
}

export function useRealtimeConnected(): boolean {
  const [connected, setConnected] = useState(socket?.connected ?? false);
  useEffect(() => {
    if (!socket) return;
    setConnected(socket.connected);
    const on = () => setConnected(true);
    const off = () => setConnected(false);
    socket.on('connect', on);
    socket.on('disconnect', off);
    return () => {
      socket?.off('connect', on);
      socket?.off('disconnect', off);
    };
  }, []);
  return connected;
}

/** Subscribe to a socket event for the lifetime of a component. */
export function useRealtimeEvent<T = unknown>(event: string, handler: (payload: T) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    if (!socket) return;
    const listener = (payload: T) => ref.current(payload);
    socket.on(event, listener);
    return () => {
      socket?.off(event, listener);
    };
  }, [event]);
}

/**
 * Catch-all subscription for a set of event-name prefixes — used by the guest
 * screens, which only care that "something on this table changed".
 */
export function useRealtimePrefix(prefixes: string[], handler: (event: string) => void) {
  const ref = useRef(handler);
  ref.current = handler;
  const fingerprint = prefixes.join('|');
  useEffect(() => {
    if (!socket) return;
    const list = fingerprint.split('|');
    const listener = (event: string) => {
      if (list.some((p) => event.startsWith(p))) ref.current(event);
    };
    socket.onAny(listener);
    return () => {
      socket?.offAny(listener);
    };
  }, [fingerprint]);
}

export { authToken };

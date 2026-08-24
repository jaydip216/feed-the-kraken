import { io, Socket } from 'socket.io-client';

// In dev, Vite proxies /socket.io to the server; in prod same-origin.
export const socket: Socket = io({ autoConnect: true });

export function emit(event: string, payload?: any): Promise<any> {
  return new Promise((resolve) => {
    socket.emit(event, payload, (ack: any) => resolve(ack));
  });
}

// Reconnect token persistence (rulebook: Android phones drop sockets).
const KEY = (room: string) => `ftk:token:${room}`;
export const tokenStore = {
  get: (room: string) => localStorage.getItem(KEY(room)) || undefined,
  set: (room: string, token: string) => localStorage.setItem(KEY(room), token),
  clear: (room: string) => localStorage.removeItem(KEY(room)),
};
export const lastRoom = {
  get: () => localStorage.getItem('ftk:lastRoom') || '',
  set: (r: string) => localStorage.setItem('ftk:lastRoom', r),
  clear: () => localStorage.removeItem('ftk:lastRoom'),
};

// Wipe every trace of a finished session so no phone can rejoin it.
export function clearSession(room?: string) {
  const r = room || lastRoom.get();
  if (r) tokenStore.clear(r);
  for (const k of Object.keys(localStorage)) if (k.startsWith('ftk:token:')) localStorage.removeItem(k);
  lastRoom.clear();
}

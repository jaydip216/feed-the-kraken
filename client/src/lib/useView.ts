import { useEffect, useState } from 'react';
import { socket } from './socket.js';

// Subscribe to redacted views pushed by the server.
export function useView<T = any>(): T | null {
  const [view, setView] = useState<T | null>(null);
  useEffect(() => {
    const onView = (v: T) => setView(v);
    socket.on('view', onView);
    return () => { socket.off('view', onView); };
  }, []);
  return view;
}

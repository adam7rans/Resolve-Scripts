import { useCallback, useRef, useState } from 'react';
import type { Toast } from '../components/StatusToast';

export function useToasts() {
  const toastCounter = useRef(0);
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((message: string, type: Toast['type'] = 'info', sticky = false) => {
    const id = ++toastCounter.current;
    setToasts(t => [...t.slice(-4), { id, message, type, sticky }]);
    return id;
  }, []);

  const updateToast = useCallback((id: number, message: string, type: Toast['type']) => {
    setToasts(t => t.map(x => x.id === id ? { ...x, message, type, sticky: false } : x));
  }, []);

  const dismissToast = useCallback((id: number) => setToasts(t => t.filter(x => x.id !== id)), []);

  return { toasts, addToast, updateToast, dismissToast };
}

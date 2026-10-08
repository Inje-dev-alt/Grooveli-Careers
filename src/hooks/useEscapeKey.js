import { useEffect } from 'react';

/**
 * ESC closes the topmost interface layer.
 * Registered per-layer so the stack unwinds one panel at a time.
 */
export function useEscapeKey(handler, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      handler(event);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handler, active]);
}

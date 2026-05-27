// src/shared/hooks/useInspectorToggle.ts
import { useState, useEffect, useCallback } from 'preact/hooks';

/**
 * useInspectorToggle - centralised state for the Conversation Inspector panel.
 *
 * - Returns `isOpen`, `open()`, `close()`, `toggle()`.
 * - Persists the last user preference in `localStorage` under the key
 *   `inspector-toggle-state` so the choice survives page reloads.
 * - Works on both desktop (side‑panel) and mobile (drawer) layouts.
 */
export function useInspectorToggle(): {
  isOpen: boolean;
  open: () => void;
  close: () => void;
  toggle: () => void;
} {
  const storageKey = 'inspector-toggle-state';
  const initial = typeof window !== 'undefined' ?
    window.localStorage.getItem(storageKey) === 'true' : false;

  const [isOpen, setIsOpen] = useState<boolean>(initial);

  // keep storage in sync
  useEffect(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(storageKey, String(isOpen));
    }
  }, [isOpen]);

  const open = useCallback(() => setIsOpen(true), []);
  const close = useCallback(() => setIsOpen(false), []);
  const toggle = useCallback(() => setIsOpen((v) => !v), []);

  return { isOpen, open, close, toggle };
}

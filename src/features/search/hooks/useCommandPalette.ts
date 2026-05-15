import { useEffect, useState, useCallback } from 'preact/hooks';

type PaletteState = {
  open: boolean;
  openPalette: () => void;
  closePalette: () => void;
  togglePalette: () => void;
};

export function useCommandPalette(): PaletteState {
  const [open, setOpen] = useState(false);

  const openPalette = useCallback(() => setOpen(true), []);
  const closePalette = useCallback(() => setOpen(false), []);
  const togglePalette = useCallback(() => setOpen((prev) => !prev), []);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  return { open, openPalette, closePalette, togglePalette };
}

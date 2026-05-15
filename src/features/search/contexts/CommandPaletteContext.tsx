import { createContext } from 'preact';
import type { ComponentChildren } from 'preact';
import { useCallback, useContext, useEffect, useMemo, useState } from 'preact/hooks';
import { CommandPalette } from '../components/CommandPalette';

type Workspace = 'practice' | 'client' | 'public';

type CommandPaletteContextValue = {
  isOpen: boolean;
  open: (initialQuery?: string) => void;
  close: () => void;
  toggle: () => void;
};

const CommandPaletteContext = createContext<CommandPaletteContextValue | null>(null);

type ProviderProps = {
  children: ComponentChildren;
  practiceId: string | null;
  practiceSlug: string | null;
  workspace: Workspace;
  enabled: boolean;
};

export function CommandPaletteProvider({
  children,
  practiceId,
  practiceSlug,
  workspace,
  enabled,
}: ProviderProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [initialQuery, setInitialQuery] = useState('');

  const open = useCallback((nextQuery: string = '') => {
    setInitialQuery(nextQuery);
    setIsOpen(true);
  }, []);

  const close = useCallback(() => {
    setIsOpen(false);
    setInitialQuery('');
  }, []);

  const toggle = useCallback(() => {
    setIsOpen((prev) => {
      if (prev) {
        setInitialQuery('');
        return false;
      }
      return true;
    });
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const handler = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        toggle();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [enabled, toggle]);

  const value = useMemo<CommandPaletteContextValue>(
    () => ({ isOpen, open, close, toggle }),
    [isOpen, open, close, toggle],
  );

  return (
    <CommandPaletteContext.Provider value={value}>
      {children}
      {enabled && practiceId ? (
        <CommandPalette
          open={isOpen}
          onClose={close}
          practiceId={practiceId}
          practiceSlug={practiceSlug}
          workspace={workspace}
          initialQuery={initialQuery}
        />
      ) : null}
    </CommandPaletteContext.Provider>
  );
}

export function useCommandPalette(): CommandPaletteContextValue {
  const ctx = useContext(CommandPaletteContext);
  if (!ctx) {
    return {
      isOpen: false,
      open: () => {},
      close: () => {},
      toggle: () => {},
    };
  }
  return ctx;
}

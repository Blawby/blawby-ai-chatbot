import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';
import { Search } from 'lucide-preact';

export interface CommandItem {
  id: string;
  label: string;
  icon?: ComponentChildren;
  group?: string;
  shortcut?: string;
  onSelect: () => void;
  disabled?: boolean;
}

export interface CommandPaletteProps {
  items: CommandItem[];
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  placeholder?: string;
  className?: string;
}

export function CommandPalette({
  items,
  open: controlledOpen,
  onOpenChange,
  placeholder = 'Type a command or search...',
  className,
}: CommandPaletteProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const isOpen = controlledOpen ?? internalOpen;
  const setOpen = useCallback(
    (next: boolean) => {
      setInternalOpen(next);
      onOpenChange?.(next);
      if (!next) {
        setQuery('');
        setActiveIndex(0);
      }
    },
    [onOpenChange],
  );

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setOpen(!isOpen);
      }
      if (e.key === 'Escape' && isOpen) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [isOpen, setOpen]);

  useEffect(() => {
    if (isOpen) inputRef.current?.focus();
  }, [isOpen]);

  const filtered = useMemo(() => {
    if (!query) return items.filter((i) => !i.disabled);
    const lower = query.toLowerCase();
    return items.filter(
      (i) => !i.disabled && (i.label.toLowerCase().includes(lower) || i.group?.toLowerCase().includes(lower)),
    );
  }, [items, query]);

  const grouped = useMemo(() => {
    const map = new Map<string, CommandItem[]>();
    for (const item of filtered) {
      const group = item.group ?? '';
      if (!map.has(group)) map.set(group, []);
      map.get(group)!.push(item);
    }
    return map;
  }, [filtered]);

  useEffect(() => { setActiveIndex(0); }, [query]);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, filtered.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (e.key === 'Enter' && filtered[activeIndex]) {
        e.preventDefault();
        filtered[activeIndex].onSelect();
        setOpen(false);
      }
    },
    [filtered, activeIndex, setOpen],
  );

  if (!isOpen) return null;

  let flatIndex = -1;

  return (
    <div className="fixed inset-0 z-[300] flex items-start justify-center pt-[20vh]">
      <div
        className="absolute inset-0 bg-black/30 dark:bg-black/50 backdrop-blur-sm"
        onClick={() => setOpen(false)}
      />
      <div
        role="dialog"
        aria-label="Command palette"
        className={cn(
          'relative w-full max-w-lg rounded-2xl glass-card overflow-hidden shadow-2xl',
          className,
        )}
      >
        <div className="flex items-center gap-3 px-4 border-b border-line-glass/15">
          <Search size={16} className="text-input-placeholder shrink-0" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onInput={(e) => setQuery((e.target as HTMLInputElement).value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            className="flex-1 bg-transparent py-3.5 text-sm text-input-text placeholder:text-input-placeholder/80 outline-none"
            aria-label="Command search"
          />
          <kbd className="shrink-0 text-[10px] text-input-placeholder bg-black/5 dark:bg-white/8 px-1.5 py-0.5 rounded">
            ESC
          </kbd>
        </div>
        <div ref={listRef} className="max-h-72 overflow-y-auto py-2" role="listbox">
          {filtered.length === 0 && (
            <p className="px-4 py-6 text-center text-sm text-input-placeholder">No results found</p>
          )}
          {Array.from(grouped.entries()).map(([group, groupItems]) => (
            <div key={group}>
              {group && (
                <p className="px-4 pt-2 pb-1 text-[11px] font-medium uppercase tracking-wider text-input-placeholder/70">
                  {group}
                </p>
              )}
              {groupItems.map((item) => {
                flatIndex++;
                const idx = flatIndex;
                return (
                  <button
                    key={item.id}
                    type="button"
                    role="option"
                    aria-selected={idx === activeIndex}
                    onClick={() => { item.onSelect(); setOpen(false); }}
                    className={cn(
                      'flex w-full items-center gap-3 px-4 py-2 text-sm text-left transition-colors',
                      idx === activeIndex
                        ? 'bg-accent-500/10 text-accent-600 dark:text-accent-400'
                        : 'text-input-text hover:bg-black/5 dark:hover:bg-white/5',
                    )}
                  >
                    {item.icon && <span className="shrink-0 w-4">{item.icon}</span>}
                    <span className="flex-1 truncate">{item.label}</span>
                    {item.shortcut && (
                      <kbd className="text-[10px] text-input-placeholder bg-black/5 dark:bg-white/8 px-1.5 py-0.5 rounded">
                        {item.shortcut}
                      </kbd>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import type { ComponentChildren, JSX } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';

export interface ContextMenuItemProps {
  label: string;
  icon?: ComponentChildren;
  onClick?: () => void;
  disabled?: boolean;
  destructive?: boolean;
  divider?: boolean;
}

export interface ContextMenuProps {
  children: ComponentChildren;
  items: ContextMenuItemProps[];
  className?: string;
}

export function ContextMenu({ children, items, className }: ContextMenuProps) {
  const [position, setPosition] = useState<{ x: number; y: number } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  const handleContextMenu = useCallback((e: JSX.TargetedMouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    setPosition({ x: e.clientX, y: e.clientY });
  }, []);

  const close = useCallback(() => setPosition(null), []);

  useEffect(() => {
    if (!position) return;
    const handleClick = () => close();
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') close(); };
    document.addEventListener('click', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('click', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [position, close]);

  return (
    <div role="presentation" onContextMenu={handleContextMenu} className={className}>
      {children}
      {position && (
        <div
          ref={menuRef}
          role="menu"
          className="fixed z-[100] min-w-[160px] rounded-r-md panel py-1.5 shadow-lg"
          style={{ top: position.y, left: position.x }}
        >
          {items.map((item, i) => {
            if (item.divider) {
              return <div key={i} className="my-1 border-t border-line-subtle" />;
            }
            return (
              <button
                key={i}
                type="button"
                role="menuitem"
                disabled={item.disabled}
                onClick={() => {
                  item.onClick?.();
                  close();
                }}
                className={cn(
                  'flex w-full items-center gap-2.5 px-3 py-1.5 text-sm text-left transition-colors',
                  'hover:bg-paper-2/10',
                  'disabled:opacity-45 disabled:cursor-not-allowed',
                  item.destructive && 'text-red-500',
                  !item.destructive && 'text-ink',
                )}
              >
                {item.icon && <span className="shrink-0 w-4">{item.icon}</span>}
                {item.label}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

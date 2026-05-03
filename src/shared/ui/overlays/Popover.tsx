import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useRef, useState } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';

export interface PopoverProps {
  trigger: ComponentChildren;
  children: ComponentChildren;
  side?: 'top' | 'bottom' | 'left' | 'right';
  align?: 'start' | 'center' | 'end';
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  className?: string;
}

const sideStyles: Record<string, string> = {
  'top-start': 'bottom-full left-0 mb-2',
  'top-center': 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  'top-end': 'bottom-full right-0 mb-2',
  'bottom-start': 'top-full left-0 mt-2',
  'bottom-center': 'top-full left-1/2 -translate-x-1/2 mt-2',
  'bottom-end': 'top-full right-0 mt-2',
  'left-start': 'right-full top-0 mr-2',
  'left-center': 'right-full top-1/2 -translate-y-1/2 mr-2',
  'left-end': 'right-full bottom-0 mr-2',
  'right-start': 'left-full top-0 ml-2',
  'right-center': 'left-full top-1/2 -translate-y-1/2 ml-2',
  'right-end': 'left-full bottom-0 ml-2',
};

export function Popover({
  trigger,
  children,
  side = 'bottom',
  align = 'start',
  open: controlledOpen,
  onOpenChange,
  className,
}: PopoverProps) {
  const [internalOpen, setInternalOpen] = useState(false);
  const isOpen = controlledOpen ?? internalOpen;
  const containerRef = useRef<HTMLDivElement>(null);

  const setOpen = useCallback(
    (next: boolean) => {
      setInternalOpen(next);
      onOpenChange?.(next);
    },
    [onOpenChange],
  );

  useEffect(() => {
    if (!isOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (!containerRef.current?.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClick);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [isOpen, setOpen]);

  const placement = `${side}-${align}`;

  return (
    <div ref={containerRef} className="relative inline-flex">
      <div onClick={() => setOpen(!isOpen)}>{trigger}</div>
      {isOpen && (
        <div
          className={cn(
            'absolute z-[100] min-w-[200px] rounded-xl glass-panel p-3',
            'shadow-lg',
            sideStyles[placement] ?? sideStyles['bottom-start'],
            className,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

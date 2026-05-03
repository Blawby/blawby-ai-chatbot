import type { ComponentChildren, JSX } from 'preact';
import { useCallback, useEffect, useId, useRef, useState } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';

export interface TooltipProps {
  content: ComponentChildren;
  children: ComponentChildren;
  side?: 'top' | 'bottom' | 'left' | 'right';
  delay?: number;
  className?: string;
}

const sideClasses = {
  top: 'bottom-full left-1/2 -translate-x-1/2 mb-2',
  bottom: 'top-full left-1/2 -translate-x-1/2 mt-2',
  left: 'right-full top-1/2 -translate-y-1/2 mr-2',
  right: 'left-full top-1/2 -translate-y-1/2 ml-2',
};

export function Tooltip({
  content,
  children,
  side = 'top',
  delay = 300,
  className,
}: TooltipProps) {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tooltipId = useId();

  const clearPendingTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  };

  const show = useCallback(() => {
    clearPendingTimeout();
    timeoutRef.current = setTimeout(() => {
      setVisible(true);
      timeoutRef.current = null;
    }, delay);
  }, [delay]);

  const hide = useCallback(() => {
    clearPendingTimeout();
    setVisible(false);
  }, []);

  useEffect(() => () => clearPendingTimeout(), []);

  return (
    <span
      className="relative inline-flex"
      aria-describedby={visible ? tooltipId : undefined}
      onMouseEnter={show}
      onMouseLeave={hide}
      onFocus={show}
      onBlur={hide}
    >
      {children}
      {visible && (
        <span
          id={tooltipId}
          role="tooltip"
          className={cn(
            'absolute z-[500] px-2.5 py-1.5 text-xs font-medium rounded-lg whitespace-nowrap pointer-events-none',
            'bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900',
            'shadow-lg animate-in fade-in-0 zoom-in-95 duration-150',
            sideClasses[side],
            className,
          )}
        >
          {content}
        </span>
      )}
    </span>
  );
}

import { ComponentChildren } from 'preact';
import { useContext, useEffect, useState } from 'preact/hooks';
import { createPortal } from 'preact/compat';
import { cn } from '@/shared/utils/cn';
import { DropdownContext } from './DropdownMenu';

export interface DropdownMenuContentProps {
  children: ComponentChildren;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  sideOffset?: number;
  className?: string;
  open?: boolean;
}

type FixedPosition = {
  top?: number;
  bottom?: number;
  left?: number;
  right?: number;
};

function computePosition(
  rect: DOMRect,
  side: NonNullable<DropdownMenuContentProps['side']>,
  align: NonNullable<DropdownMenuContentProps['align']>,
  offset: number,
): FixedPosition {
  const pos: FixedPosition = {};

  if (side === 'bottom') {
    pos.top = rect.bottom + offset;
  } else if (side === 'top') {
    pos.bottom = window.innerHeight - rect.top + offset;
  } else if (side === 'right') {
    pos.left = rect.right + offset;
  } else {
    pos.right = window.innerWidth - rect.left + offset;
  }

  const isVertical = side === 'bottom' || side === 'top';
  if (isVertical) {
    if (align === 'start') pos.left = rect.left;
    else if (align === 'end') pos.right = window.innerWidth - rect.right;
    else pos.left = rect.left + rect.width / 2;
  } else {
    if (align === 'start') pos.top = rect.top;
    else if (align === 'end') pos.bottom = window.innerHeight - rect.bottom;
    else pos.top = rect.top + rect.height / 2;
  }

  return pos;
}

export const DropdownMenuContent = ({
  children,
  align = 'end',
  side = 'bottom',
  sideOffset = 4,
  className = '',
  open: controlledOpen,
}: DropdownMenuContentProps) => {
  const context = useContext(DropdownContext);

  if (!context) {
    throw new Error('DropdownMenuContent must be used within a DropdownMenu');
  }

  const { isOpen, triggerRef, dropdownId, setContentRef } = context;
  const open = controlledOpen !== undefined ? controlledOpen : isOpen;
  const [position, setPosition] = useState<FixedPosition>({});

  useEffect(() => {
    if (!open) {
      setContentRef(null);
    }
  }, [open, setContentRef]);

  useEffect(() => {
    return () => {
      setContentRef(null);
    };
  }, [setContentRef]);

  useEffect(() => {
    if (!open) return;

    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      setPosition(computePosition(el.getBoundingClientRect(), side, align, sideOffset));
    };

    update();
    window.addEventListener('scroll', update, { passive: true, capture: true });
    window.addEventListener('resize', update, { passive: true });
    return () => {
      window.removeEventListener('scroll', update, { capture: true });
      window.removeEventListener('resize', update);
    };
  }, [open, side, align, sideOffset, triggerRef]);

  if (!open) return null;

  const isVertical = side === 'bottom' || side === 'top';
  const centerTransform = align === 'center'
    ? (isVertical ? '-translate-x-1/2' : '-translate-y-1/2')
    : '';

  return createPortal(
    <div
      id={`${dropdownId}-menu`}
      role="menu"
      ref={(node) => setContentRef(node)}
      className={cn(
        'fixed z-50 min-w-max overflow-hidden rounded-xl border border-white/10 bg-surface-overlay shadow-glass text-input-text',
        centerTransform,
        className,
      )}
      style={position}
    >
      {children}
    </div>,
    document.body,
  );
};

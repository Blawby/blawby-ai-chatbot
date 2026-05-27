import { useState, useRef, useEffect, useMemo, useCallback } from 'preact/hooks';
import { ComponentChildren, createContext, RefObject } from 'preact';
import { cn } from '@/shared/utils/cn';

// Create context for dropdown state
export const DropdownContext = createContext<{
  isOpen: boolean;
  handleOpenChange: (open: boolean) => void;
  dropdownId: string;
  triggerRef: RefObject<HTMLElement | null>;
  contentRef: RefObject<HTMLElement | null>;
  setContentRef: (node: HTMLElement | null) => void;
} | null>(null);

export interface DropdownMenuProps {
  children: ComponentChildren;
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  defaultOpen?: boolean;
  className?: string;
}

export const DropdownMenu = ({
  children,
  open: controlledOpen,
  onOpenChange,
  defaultOpen = false,
  className = ''
}: DropdownMenuProps) => {
  const [internalOpen, setInternalOpen] = useState(defaultOpen);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLElement | null>(null);
  const contentRef = useRef<HTMLElement | null>(null);

  // Generate stable unique IDs for accessibility
  const dropdownId = useMemo(() => `dropdown-${Math.random().toString(36).slice(2, 11)}`, []);
  
  const isOpen = controlledOpen !== undefined ? controlledOpen : internalOpen;
  
  const handleOpenChange = useCallback((newOpen: boolean) => {
    if (onOpenChange) {
      onOpenChange(newOpen);
    } else {
      setInternalOpen(newOpen);
    }
  }, [onOpenChange]);

  const setContentRef = useCallback((node: HTMLElement | null) => {
    contentRef.current = node;
  }, []);

  // Create context to pass state to children
  const contextValue = useMemo(() => ({
    isOpen,
    handleOpenChange,
    dropdownId,
    triggerRef,
    contentRef,
    setContentRef,
  }), [isOpen, handleOpenChange, dropdownId, triggerRef, setContentRef]);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      const insideTriggerContainer = dropdownRef.current?.contains(target) ?? false;
      const insidePortaledContent = contentRef.current?.contains(target) ?? false;
      if (!insideTriggerContainer && !insidePortaledContent) {
        handleOpenChange(false);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen, handleOpenChange]);

  // Keyboard navigation
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (!isOpen) return;

    switch (event.key) {
      case 'Escape':
        event.preventDefault();
        handleOpenChange(false);
        break;
    }
  }, [isOpen, handleOpenChange]);

  // Handle keyboard events
  useEffect(() => {
    if (isOpen) {
      document.addEventListener('keydown', handleKeyDown);
      return () => document.removeEventListener('keydown', handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  return (
    <DropdownContext.Provider value={contextValue}>
      <div 
        ref={dropdownRef}
        className={cn('relative', className)}
        data-dropdown-id={dropdownId}
      >
        {children}
      </div>
    </DropdownContext.Provider>
  );
};

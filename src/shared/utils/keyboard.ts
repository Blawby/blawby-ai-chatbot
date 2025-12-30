// Keyboard event handlers and shortcuts
export interface KeyboardHandlers {
  onEscape?: () => void;
  onSubmit?: () => void;
  onFocusInput?: () => void;
}

// Enhanced keyboard navigation
export function createKeyboardHandlers(handlers: KeyboardHandlers) {
  return (e: KeyboardEvent) => {
    // Escape key to clear input or close modals
    if (e.key === 'Escape') {
      e.preventDefault();
      handlers.onEscape?.();
    }
    
    // Ctrl/Cmd + Enter to send message (alternative to Enter)
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handlers.onSubmit?.();
    }
    
    // Ctrl/Cmd + K to focus input (common chat shortcut)
    if (e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      handlers.onFocusInput?.();
    }
  };
}

// Handle key press for message submission
export function createKeyPressHandler(onSubmit: () => void) {
  return (e: KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      onSubmit();
    }
  };
}

// Setup global keyboard listeners
export function setupGlobalKeyboardListeners(handlers: KeyboardHandlers) {
  if (typeof document !== 'undefined') {
    const keyboardHandler = createKeyboardHandlers(handlers);
    document.addEventListener('keydown', keyboardHandler);
    
    return () => {
      document.removeEventListener('keydown', keyboardHandler);
    };
  }
} 
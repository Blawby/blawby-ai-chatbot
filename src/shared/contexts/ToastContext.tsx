import { createContext, ComponentChildren } from 'preact';
import { useCallback, useContext, useMemo } from 'preact/hooks';

import { useToast } from '@/shared/hooks/useToast';
import ToastContainer from '@/shared/components/ToastContainer';

interface ToastContextType {
  showSuccess: (title: string, message?: string, duration?: number) => string;
  showError: (title: string, message?: string, duration?: number) => string;
  showInfo: (title: string, message?: string, duration?: number) => string;
  showWarning: (title: string, message?: string, duration?: number) => string;
  showSystem: (title: string, message?: string, duration?: number) => string;
}

const ToastContext = createContext<ToastContextType | null>(null);

export const ToastProvider = ({ children }: { children: ComponentChildren }) => {
  const { toasts, removeToast, showSuccess, showError, showInfo, showWarning } = useToast();
  const showSystem = useCallback((title: string, message?: string, duration?: number) => {
    const id = typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
      ? crypto.randomUUID()
      : `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('notifications:system', { detail: { id, title, message, duration } }));
    }
    return id;
  }, []);

  const value = useMemo(() => ({
    showSuccess,
    showError,
    showInfo,
    showWarning,
    showSystem
  }), [showSuccess, showError, showInfo, showWarning, showSystem]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastContainer toasts={toasts} onRemoveToast={removeToast} />
    </ToastContext.Provider>
  );
};

export const useToastContext = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToastContext must be used within a ToastProvider');
  }
  return context;
};

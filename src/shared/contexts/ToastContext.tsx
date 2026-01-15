import { createContext, ComponentChildren } from 'preact';
import { useContext } from 'preact/hooks';

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
  const showSystem = (title: string, message?: string) => {
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('notifications:system', { detail: { title, message } }));
    }
    return crypto.randomUUID();
  };

  return (
    <ToastContext.Provider value={{ showSuccess, showError, showInfo, showWarning, showSystem }}>
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

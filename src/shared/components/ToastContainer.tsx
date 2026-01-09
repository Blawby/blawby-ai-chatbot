import { FunctionComponent } from 'preact';
// import { useState, useCallback } from 'preact/hooks'; // Unused
import { AnimatePresence } from 'framer-motion';
import ToastComponent, { Toast } from './Toast';
import { THEME } from '@/shared/utils/constants';

interface ToastContainerProps {
  toasts: Toast[];
  onRemoveToast: (id: string) => void;
}

const ToastContainer: FunctionComponent<ToastContainerProps> = ({ toasts, onRemoveToast }) => {
  return (
    <div className="fixed top-4 right-4 space-y-2" style={{ zIndex: THEME.zIndex.modal + 50 }}>
      <AnimatePresence mode="popLayout">
        {toasts.map((toast) => (
          <ToastComponent
            key={toast.id}
            toast={toast}
            onRemove={onRemoveToast}
          />
        ))}
      </AnimatePresence>
    </div>
  );
};

export default ToastContainer;

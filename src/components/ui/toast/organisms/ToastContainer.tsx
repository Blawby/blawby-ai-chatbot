import { FunctionComponent } from 'preact';
import { AnimatePresence } from 'framer-motion';
import ToastComponent, { Toast } from './Toast';

interface ToastContainerProps {
  toasts: Toast[];
  onRemoveToast: (id: string) => void;
}

const ToastContainer: FunctionComponent<ToastContainerProps> = ({ toasts, onRemoveToast }) => {
  return (
    <div 
      className="fixed top-4 left-1/2 -translate-x-1/2 sm:left-auto sm:translate-x-0 sm:right-4 z-50 space-y-2"
      aria-live="polite"
      role="status"
      aria-atomic="true"
    >
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

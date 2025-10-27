import { FunctionComponent } from 'preact';
import { useEffect, useRef, useCallback } from 'preact/hooks';
import { motion } from 'framer-motion';
import { ToastType } from '../atoms/ToastIcon';
import { ToastCard } from '../molecules/ToastCard';
import { ToastContent } from '../molecules/ToastContent';

export interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

const ToastComponent: FunctionComponent<ToastProps> = ({ toast, onRemove }) => {
  const visibilityTimerRef = useRef<number | null>(null);

  const handleRemove = useCallback(() => {
    onRemove(toast.id);
  }, [onRemove, toast.id]);

  useEffect(() => {
    const duration = Math.max(1000, toast.duration ?? 5000); // Clamp duration to minimum 1 second
    visibilityTimerRef.current = globalThis.setTimeout(handleRemove, duration);

    return () => {
      if (visibilityTimerRef.current) {
        globalThis.clearTimeout(visibilityTimerRef.current);
        visibilityTimerRef.current = null;
      }
    };
  }, [toast.id, toast.duration, handleRemove]);

  return (
    <motion.div
      initial={{ opacity: 0, y: -50, scale: 0.95 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -50, scale: 0.95 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
    >
      <ToastCard type={toast.type}>
        <ToastContent
          type={toast.type}
          title={toast.title}
          message={toast.message}
          onClose={handleRemove}
        />
      </ToastCard>
    </motion.div>
  );
};

export default ToastComponent;

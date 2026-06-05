import { FunctionComponent, memo } from 'preact/compat';
import { useEffect, useRef, useCallback } from 'preact/hooks';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-preact';

import { Icon } from '@/shared/ui/Icon';

export interface Toast {
  id: string;
  type: 'success' | 'error' | 'info' | 'warning';
  title: string;
  message?: string;
  duration?: number;
}

interface ToastProps {
  toast: Toast;
  onRemove: (id: string) => void;
}

const ToastComponent: FunctionComponent<ToastProps> = ({ toast, onRemove }) => {
  const visibilityTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const getIcon = () => {
    switch (toast.type) {
      case 'success':
        return <Icon icon={CheckCircle2} className="h-5 w-5 text-pos"  />;
      case 'error':
        return <Icon icon={AlertTriangle} className="h-5 w-5 text-neg"  />;
      case 'warning':
        return <Icon icon={AlertTriangle} className="h-5 w-5 text-warn"  />;
      case 'info':
      default:
        return <Icon icon={Info} className="h-5 w-5 text-accent"  />;
    }
  };

  const getStatusClass = () => {
    switch (toast.type) {
      case 'success':
        return 'status-success';
      case 'error':
        return 'status-error';
      case 'warning':
        return 'status-warning';
      case 'info':
      default:
        return 'status-info';
    }
  };

  return (
    <div className={`max-w-sm w-full ${getStatusClass()} rounded-r-md p-4 relative animate-toast-in`}>
      <div className="flex items-start">
        <div className="flex-shrink-0">
          {getIcon()}
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-ink">
            {toast.title}
          </h3>
          {toast.message && (
            <p className="mt-1 text-sm text-dim-2">
              {toast.message}
            </p>
          )}
        </div>
        <div className="ml-4 flex-shrink-0">
          <button
            onClick={handleRemove}
            className="inline-flex text-dim-2 hover:text-ink transition-colors duration-200 focus-visible:ring-2 focus-visible:ring-accent rounded-sm focus:outline-none"
          >
            <Icon icon={X} className="h-4 w-4"  />
          </button>
        </div>
      </div>
    </div>
  );
};

export default memo(ToastComponent);

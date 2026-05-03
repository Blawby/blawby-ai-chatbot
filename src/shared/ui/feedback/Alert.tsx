import type { ComponentChildren } from 'preact';
import { useState } from 'preact/hooks';
import { cn } from '@/shared/utils/cn';
import { AlertCircle, CheckCircle2, Info, AlertTriangle, X } from 'lucide-preact';

export interface AlertProps {
  variant?: 'info' | 'success' | 'warning' | 'error';
  title?: string;
  children?: ComponentChildren;
  dismissible?: boolean;
  onDismiss?: () => void;
  icon?: ComponentChildren;
  action?: ComponentChildren;
  className?: string;
}

const variantConfig = {
  info: {
    container: 'bg-blue-500/8 dark:bg-blue-500/12 border-blue-500/20',
    icon: 'text-blue-500',
    title: 'text-blue-700 dark:text-blue-300',
    DefaultIcon: Info,
  },
  success: {
    container: 'bg-emerald-500/8 dark:bg-emerald-500/12 border-emerald-500/20',
    icon: 'text-emerald-500',
    title: 'text-emerald-700 dark:text-emerald-300',
    DefaultIcon: CheckCircle2,
  },
  warning: {
    container: 'bg-amber-500/8 dark:bg-amber-500/12 border-amber-500/20',
    icon: 'text-amber-500',
    title: 'text-amber-700 dark:text-amber-300',
    DefaultIcon: AlertTriangle,
  },
  error: {
    container: 'bg-red-500/8 dark:bg-red-500/12 border-red-500/20',
    icon: 'text-red-500',
    title: 'text-red-700 dark:text-red-300',
    DefaultIcon: AlertCircle,
  },
};

export function Alert({
  variant = 'info',
  title,
  children,
  dismissible = false,
  onDismiss,
  icon,
  action,
  className,
}: AlertProps) {
  const [visible, setVisible] = useState(true);
  if (!visible) return null;

  const config = variantConfig[variant];
  const IconComponent = config.DefaultIcon;

  const handleDismiss = () => {
    setVisible(false);
    onDismiss?.();
  };

  return (
    <div
      role="alert"
      className={cn(
        'flex gap-3 rounded-xl border p-3.5 backdrop-blur-sm',
        config.container,
        className,
      )}
    >
      <div className={cn('shrink-0 mt-0.5', config.icon)}>
        {icon ?? <IconComponent size={18} />}
      </div>
      <div className="flex-1 min-w-0">
        {title && (
          <p className={cn('text-sm font-medium mb-0.5', config.title)}>{title}</p>
        )}
        {children && (
          <div className="text-sm text-input-text/80">{children}</div>
        )}
        {action && <div className="mt-2">{action}</div>}
      </div>
      {dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss alert"
          className="shrink-0 p-1 rounded-lg text-input-placeholder hover:text-input-text hover:bg-black/5 dark:hover:bg-white/10 transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

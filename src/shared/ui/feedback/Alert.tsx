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

type AlertVariant = NonNullable<AlertProps['variant']>;

const variantConfig: Record<AlertVariant, {
  tokenName: 'accent-deep' | 'pos' | 'warn' | 'neg';
  textClass: string;
  DefaultIcon: typeof Info;
}> = {
  info: {
    tokenName: 'accent-deep',
    textClass: 'text-accent-deep',
    DefaultIcon: Info,
  },
  success: {
    tokenName: 'pos',
    textClass: 'text-pos',
    DefaultIcon: CheckCircle2,
  },
  warning: {
    tokenName: 'warn',
    textClass: 'text-warn',
    DefaultIcon: AlertTriangle,
  },
  error: {
    tokenName: 'neg',
    textClass: 'text-neg',
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
      className={cn('flex gap-3 rounded-r-md border p-3.5', className)}
      style={{
        background: `color-mix(in oklab, var(--${config.tokenName}) 10%, transparent)`,
        borderColor: `color-mix(in oklab, var(--${config.tokenName}) 30%, transparent)`,
      }}
    >
      <div className={cn('shrink-0 mt-0.5', config.textClass)}>
        {icon ?? <IconComponent size={18} />}
      </div>
      <div className="flex-1 min-w-0">
        {title && (
          <p className={cn('text-sm font-medium mb-0.5', config.textClass)}>{title}</p>
        )}
        {children && (
          <div className="text-sm text-ink-2">{children}</div>
        )}
        {action && <div className="mt-2">{action}</div>}
      </div>
      {dismissible && (
        <button
          type="button"
          onClick={handleDismiss}
          aria-label="Dismiss alert"
          className="shrink-0 p-1 rounded-r-sm text-dim hover:text-ink hover:bg-paper-2 transition-colors"
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}

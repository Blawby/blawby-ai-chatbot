import type { ComponentChildren } from 'preact';
import { Button } from '@/shared/ui/Button';

type AnnouncementTone = 'warning' | 'info' | 'success';

interface AnnouncementAction {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
}

interface AnnouncementBannerProps {
  title: string;
  description?: string;
  tone?: AnnouncementTone;
  actions?: AnnouncementAction[];
  children?: ComponentChildren;
  variant?: 'card' | 'flat';
  className?: string;
}

const toneStyles: Record<AnnouncementTone, { container: string; title: string; body: string }> = {
  warning: {
    container: 'border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/40 dark:text-amber-100',
    title: 'text-amber-900 dark:text-amber-100',
    body: 'text-amber-800 dark:text-amber-200'
  },
  info: {
    container: 'border-blue-200 bg-blue-50 text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/40 dark:text-blue-100',
    title: 'text-blue-900 dark:text-blue-100',
    body: 'text-blue-800 dark:text-blue-200'
  },
  success: {
    container: 'border-emerald-200 bg-emerald-50 text-emerald-900 dark:border-emerald-900/60 dark:bg-emerald-950/40 dark:text-emerald-100',
    title: 'text-emerald-900 dark:text-emerald-100',
    body: 'text-emerald-800 dark:text-emerald-200'
  }
};

const flatToneStyles: Record<AnnouncementTone, string> = {
  warning: 'bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100',
  info: 'bg-blue-50 text-blue-900 dark:bg-blue-950/40 dark:text-blue-100',
  success: 'bg-emerald-50 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-100'
};

const AnnouncementBanner = ({
  title,
  description,
  tone = 'warning',
  actions = [],
  children,
  variant = 'card',
  className
}: AnnouncementBannerProps) => {
  const styles = toneStyles[tone];
  const containerClassName = variant === 'flat'
    ? `w-full px-4 py-2 ${flatToneStyles[tone]} ${className ?? ''}`.trim()
    : `w-full rounded-xl border px-4 py-3 shadow-sm ${styles.container} ${className ?? ''}`.trim();

  return (
    <div className={containerClassName}>
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1">
          <p className={`text-sm font-semibold ${styles.title}`}>{title}</p>
          {description && <p className={`text-sm ${styles.body}`}>{description}</p>}
          {children}
        </div>
        {actions.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {actions.map((action) => (
              <Button
                key={action.label}
                variant={action.variant ?? 'secondary'}
                size="sm"
                onClick={action.onClick}
              >
                {action.label}
              </Button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};

export default AnnouncementBanner;

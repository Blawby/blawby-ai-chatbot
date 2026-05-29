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

const toneStyles: Record<AnnouncementTone, { container: string; title: string; body: string; rail: string }> = {
  warning: {
    container: 'border-line-subtle bg-surface-panel/60 text-ink backdrop-blur-xl shadow-glass',
    title: 'text-ink',
    body: 'text-dim-2',
    rail: 'bg-amber-500/70'
  },
  info: {
    container: 'border-line-subtle bg-surface-panel/60 text-ink backdrop-blur-xl shadow-glass',
    title: 'text-ink',
    body: 'text-dim-2',
    rail: 'bg-sky-500/70'
  },
  success: {
    container: 'border-line-subtle bg-surface-panel/60 text-ink backdrop-blur-xl shadow-glass',
    title: 'text-ink',
    body: 'text-dim-2',
    rail: 'bg-emerald-500/70'
  }
};

const flatToneStyles: Record<AnnouncementTone, string> = {
  warning: 'border border-line-subtle bg-surface-panel/40 text-ink backdrop-blur-xl',
  info: 'border border-line-subtle bg-surface-panel/40 text-ink backdrop-blur-xl',
  success: 'border border-line-subtle bg-surface-panel/40 text-ink backdrop-blur-xl'
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
    ? `relative w-full overflow-hidden rounded-2xl px-4 py-2 ${flatToneStyles[tone]} ${className ?? ''}`.trim()
    : `relative w-full overflow-hidden rounded-2xl border px-4 py-3 ${styles.container} ${className ?? ''}`.trim();

  return (
    <div className={containerClassName}>
      <div className={`pointer-events-none absolute inset-y-0 left-0 w-1 ${styles.rail}`} aria-hidden="true" />
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div className="space-y-1 pl-1">
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

import type { ComponentChildren } from 'preact';
import type { LucideIcon } from 'lucide-preact';
import { cn } from '@/shared/utils/cn';

interface InfoCardProps {
  icon?: LucideIcon;
  title: string;
  children?: ComponentChildren;
  /** Header right slot — for action buttons, badges, etc. */
  trailing?: ComponentChildren;
  /** Pencil cards use 12px gap for tight cards (status/team/billing) and 16px for content-heavy ones (client/activity/details). */
  bodyGap?: 'sm' | 'md';
  className?: string;
}

export const InfoCard = ({
  icon: Icon,
  title,
  children,
  trailing,
  bodyGap = 'md',
  className
}: InfoCardProps) => (
  <section
    className={cn(
      'card flex flex-col rounded-xl p-5',
      bodyGap === 'sm' ? 'gap-3' : 'gap-4',
      className
    )}
  >
    <header className="flex items-center justify-between gap-2">
      <div className="flex items-center gap-2.5">
        {Icon ? <Icon className="h-[18px] w-[18px] text-dim-2" aria-hidden="true" /> : null}
        <h3 className="text-base font-semibold text-ink">{title}</h3>
      </div>
      {trailing}
    </header>
    {children}
  </section>
);

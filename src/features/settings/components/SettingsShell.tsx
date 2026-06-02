import type { ComponentChildren } from 'preact';
import type { ComponentType } from 'preact';
import { Icon, type IconComponent } from '@/shared/ui/Icon';
import { cn } from '@/shared/utils/cn';

export interface SettingsShellNavItem {
  id: string;
  label: string;
  href: string;
  icon?: ComponentType<unknown>;
  badge?: number | null;
}

export interface SettingsShellNavSection {
  label?: string;
  items: SettingsShellNavItem[];
}

export interface SettingsShellProps {
  orgLabel?: string;
  backLabel?: string;
  onBack: () => void;
  crumb: ComponentChildren;
  title: ComponentChildren;
  lede: ComponentChildren;
  sections: SettingsShellNavSection[];
  activeItemId: string;
  onNavigate: (href: string) => void;
  children: ComponentChildren;
  className?: string;
}

export const SettingsShell = ({
  orgLabel,
  backLabel = 'Back to assistant',
  onBack,
  crumb,
  title,
  lede,
  sections,
  activeItemId,
  onNavigate,
  children,
  className = '',
}: SettingsShellProps) => (
  <div
    className={cn(
      'flex h-full min-h-0 flex-col overflow-hidden',
      'bg-[radial-gradient(rgba(15,30,54,0.025)_1px,transparent_1.2px)] [background-size:3px_3px] [background-attachment:fixed]',
      className,
    )}
  >
    <div className="mx-auto grid min-h-0 flex-1 max-w-[1440px] grid-cols-[280px_minmax(0,1fr)] max-[980px]:grid-cols-1">
      <aside className="sticky top-0 flex h-dvh flex-col gap-3.5 overflow-y-auto border-r border-rule bg-[color-mix(in_oklab,var(--paper)_96%,var(--card))] px-4 py-[22px] max-[980px]:hidden">
        <button
          type="button"
          onClick={onBack}
          className="ml-[-8px] inline-flex items-center gap-1.5 px-2 py-1 text-left font-mono text-[11px] uppercase tracking-[0.06em] text-dim transition-colors hover:text-ink"
        >
          <span aria-hidden="true">←</span>
          <span>{backLabel}</span>
        </button>

        <div>
          <h2 className="mt-1 font-serif text-[28px] font-normal tracking-[-0.012em] text-ink">Settings</h2>
          {orgLabel ? (
            <div className="font-mono text-[11px] tracking-[0.04em] text-dim">{orgLabel}</div>
          ) : null}
        </div>

        {sections.map((section) => (
          <div key={section.label ?? section.items.map((item) => item.id).join('-')} className="mt-1.5 flex flex-col gap-px">
            {section.label ? (
              <div className="px-2.5 pb-1.5 pt-3.5 font-mono text-[9.5px] uppercase tracking-[0.12em] text-dim-2">
                {section.label}
              </div>
            ) : null}
            {section.items.map((item) => {
              const isActive = item.id === activeItemId;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onNavigate(item.href)}
                  className={cn(
                    'flex items-center gap-2.5 rounded-[var(--r-xs)] px-2.5 py-2 text-left text-[13.5px] transition-colors',
                    isActive
                      ? 'bg-ink text-accent'
                      : 'text-ink-2 hover:bg-rule-soft hover:text-ink',
                  )}
                >
                  {item.icon ? (
                    <Icon
                      icon={item.icon as IconComponent}
                      className={cn('h-3.5 w-3.5 shrink-0', isActive ? 'opacity-100' : 'opacity-70')}
                    />
                  ) : null}
                  <span className="min-w-0 flex-1 truncate">{item.label}</span>
                  {item.badge != null ? (
                    <span className={cn('ml-auto font-mono text-[10px]', isActive ? 'text-accent' : 'text-dim')}>
                      {item.badge}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
      </aside>

      <main className="min-h-0 min-w-0 overflow-y-auto">
        <div className="max-w-[920px] px-14 pb-20 pt-9 max-[980px]:px-[22px] max-[980px]:pb-12 max-[980px]:pt-6">
          <header className="mb-9">
            <div className="mb-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">{crumb}</div>
            <h1 className="font-serif text-[48px] font-normal leading-[1.05] tracking-[-0.02em] text-ink [&_em]:text-accent">
              {title}
            </h1>
            <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-ink-2">{lede}</p>
          </header>
          {children}
        </div>
      </main>
    </div>
  </div>
);

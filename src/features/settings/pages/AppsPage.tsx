import type { App } from './appsData';
import { cn } from '@/shared/utils/cn';
import { SettingsCard } from '@/features/settings/components/SettingsCard';

// ---------------------------------------------------------------------------
// Connection badge
// ---------------------------------------------------------------------------

const ConnBadge = ({ connected }: { connected: boolean }) => (
  <span className={cn(
    'inline-flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full',
    connected
      ? 'bg-[color-mix(in_oklab,var(--pos,#22c55e)_12%,var(--card,#fff))] text-[var(--pos,#22c55e)] border border-[color-mix(in_oklab,var(--pos,#22c55e)_25%,var(--rule,#e5e7eb))]'
      : 'text-dim border border-rule',
  )}>
    {connected && <span className="h-1.5 w-1.5 rounded-full bg-[var(--pos,#22c55e)]" />}
    {connected ? 'connected' : 'not connected'}
  </span>
);

// ---------------------------------------------------------------------------
// App icon — logo image or colored initial
// ---------------------------------------------------------------------------

const AppIcon = ({ app, size = 40 }: { app: App; size?: number }) => {
  const initial = app.name.charAt(0).toUpperCase();
  const sizeClass = size === 56 ? 'h-14 w-14 text-xl' : 'h-10 w-10 text-base';
  if (app.logo) {
    return (
      <img
        src={app.logo}
        alt={`${app.name} logo`}
        className={cn('rounded-lg object-cover flex-shrink-0', sizeClass)}
      />
    );
  }
  return (
    <div
      className={cn('rounded-lg grid place-items-center font-bold flex-shrink-0 bg-ink text-accent', sizeClass)}
      aria-hidden="true"
    >
      {initial}
    </div>
  );
};

// ---------------------------------------------------------------------------
// App card
// ---------------------------------------------------------------------------

interface AppCardProps {
  app: App;
  onSelect: () => void;
}

const AppCard = ({ app, onSelect }: AppCardProps) => (
  <button
    type="button"
    onClick={onSelect}
    className={cn(
      'bg-card border border-rule rounded-lg p-5 text-left flex flex-col gap-3 w-full',
      'cursor-pointer shadow-sm transition-all',
      'hover:border-ink hover:-translate-y-px hover:shadow-md',
    )}
  >
    {/* Head */}
    <div className="flex items-start gap-3.5">
      <AppIcon app={app} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-ink leading-tight">{app.name}</div>
        <div className="font-mono text-[10px] tracking-wider text-dim mt-0.5">by {app.developer}</div>
      </div>
    </div>
    {/* Description */}
    <p className="text-xs text-ink-2 leading-relaxed">{app.description}</p>
    {/* Footer */}
    <div className="flex items-center justify-between mt-auto pt-1">
      <span className="font-mono text-[10px] tracking-wider text-dim">
        {app.actions?.length ? `${app.actions.length} actions` : app.category}
      </span>
      {app.comingSoon ? (
        <span className="font-mono text-[10px] uppercase tracking-wider text-dim border border-rule rounded-full px-2 py-0.5">soon</span>
      ) : (
        <ConnBadge connected={app.connected} />
      )}
    </div>
  </button>
);

// ---------------------------------------------------------------------------
// Section header
// ---------------------------------------------------------------------------

const SectionHeader = ({ title, count, first = false }: { title: string; count: number; first?: boolean }) => (
  <div className={cn('flex items-baseline gap-2 mb-4', !first && 'pt-8 border-t border-rule')}>
    <h3 className="font-serif text-[22px] font-normal tracking-tight">{title}</h3>
    <span className="font-mono text-[10px] tracking-widest text-dim">{count}</span>
  </div>
);

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

interface AppsPageProps {
  apps: App[];
  onSelect: (appId: string) => void;
  className?: string;
}

export const AppsPage = ({ apps, onSelect, className = '' }: AppsPageProps) => {
  const connected = apps.filter((a) => a.connected && !a.comingSoon);
  const available = apps.filter((a) => !a.connected || a.comingSoon);

  return (
    <div className={className}>
      <SettingsCard className="mb-8 max-w-[860px]">
        <div className="flex items-start justify-between gap-4 max-sm:flex-col">
          <div>
            <div className="font-serif text-[24px] font-normal tracking-[-0.01em] text-ink">Connected tools</div>
            <p className="mt-1 max-w-[58ch] text-[13.5px] leading-relaxed text-dim">
              Connect external services the assistant can read from or act on with your approval.
            </p>
          </div>
          <div className="flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.1em] text-dim">
            <span>{connected.length} connected</span>
            <span className="h-1 w-1 rounded-full bg-rule" />
            <span>{available.length} available</span>
          </div>
        </div>
      </SettingsCard>
      {connected.length > 0 && (
        <div>
          <SectionHeader title="Connected" count={connected.length} first />
          <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
            {connected.map((app) => (
              <AppCard key={app.id} app={app} onSelect={() => onSelect(app.id)} />
            ))}
          </div>
        </div>
      )}

      <div>
        <SectionHeader title="Available" count={available.length} first={connected.length === 0} />
        <div className="grid gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
          {available.map((app) => (
            <AppCard key={app.id} app={app} onSelect={() => onSelect(app.id)} />
          ))}
        </div>
      </div>
    </div>
  );
};

import { useCallback } from 'preact/hooks';
import { MessagesSquare, Phone, FolderOpen } from 'lucide-preact';
import { Avatar } from '@/shared/ui/profile';
import { Button } from '@/shared/ui/Button';
import { Bar, SignalPill, type SignalPillSignal } from '@/design-system/primitives';
import { MatterChip } from '@/design-system/patterns';
import { cn } from '@/shared/utils/cn';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { getMajorAmountValue, asMajor } from '@/shared/utils/money';
import type { BackendMatter } from '@/features/matters/services/mattersApi';
import { formatLastContact, signalLabel } from './clientSignals';

export interface ClientDirectoryRowProps {
  id: string;
  name: string;
  matterCount: number;
  primaryMatter: BackendMatter | null;
  practiceArea: string | null;
  retainerAmount: number | null;
  retainerPercent: number | null;
  lastContactDays: number | null;
  lastContactSource: string | null;
  signal: SignalPillSignal;
  isSelected: boolean;
  isUrgent: boolean;
  onSelect: () => void;
  onMessage?: () => void;
  onCall?: () => void;
  onOpenMatters?: () => void;
  onOpenPrimaryMatter?: (matterId: string) => void;
}

/**
 * Chat-first directory row (Clients.html `.dir .row`).
 *
 * 7-col grid on desktop, collapses to 2-col on mobile (avatar+name | last).
 * Hover reveals a small action cluster (message / call / open matters) — the
 * "quick actions" called out in the design as inline row affordances.
 */
export function ClientDirectoryRow({
  name,
  matterCount,
  primaryMatter,
  practiceArea,
  retainerAmount,
  retainerPercent,
  lastContactDays,
  lastContactSource,
  signal,
  isSelected,
  isUrgent,
  onSelect,
  onMessage,
  onCall,
  onOpenMatters,
  onOpenPrimaryMatter,
}: ClientDirectoryRowProps) {
  const handleRowClick = useCallback(() => {
    onSelect();
  }, [onSelect]);
  const handleKeyDown = useCallback((event: KeyboardEvent) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onSelect();
    }
  }, [onSelect]);

  const retainerToneClass = retainerPercent === null
    ? ''
    : retainerPercent < 30
      ? 'text-neg'
      : '';

  // Mobile reflow strategy:
  // - 2-col grid below md: avatar (28px) + name/sub
  // - Desktop md+: 6 visible cols (avatar / name+sub / retainer / matter
  //   chip / last contact / signal pill) + hover-only action cluster overlay
  // - Touch target: row is >44px tall via px-4 py-3.5 (mobile) / md:py-[14px]
  // - Hover actions are pointer-events:none + opacity:0 on mobile (no-hover)
  //   so they don't intercept taps — drill-down via the row click handler
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleRowClick}
      onKeyDown={handleKeyDown}
      className={cn(
        'group relative grid w-full cursor-pointer items-center gap-3 border-b border-line-subtle px-4 py-3.5 text-left text-[13.5px] transition-colors hover:bg-rule-soft md:px-[18px] md:py-[14px]',
        // Mobile: 2 cols. Desktop: 6 visible cols + actions overlay (7th).
        'grid-cols-[28px_minmax(0,1fr)] md:grid-cols-[28px_minmax(0,1.8fr)_minmax(0,1.6fr)_minmax(0,1fr)_110px_100px]',
        'md:gap-4',
        isSelected && 'bg-[color-mix(in_oklab,var(--accent)_7%,var(--card))]',
        isUrgent && 'bg-[color-mix(in_oklab,var(--neg)_3%,transparent)]'
      )}
    >
      {isSelected ? (
        <span
          aria-hidden="true"
          className="absolute left-0 top-0 h-full w-[3px] bg-accent"
        />
      ) : null}

      {/* Col 1: avatar */}
      <div className="flex items-center justify-center">
        <Avatar name={name} size="sm" className={cn('text-ink', isUrgent && 'ring-1 ring-neg')} />
      </div>

      {/* Col 2: name + primary matter sub-line */}
      <div className="min-w-0">
        <div className="truncate font-[family-name:var(--serif)] text-[17px] leading-[1.1] tracking-[-0.005em] text-ink">
          {name}
        </div>
        <div className="mt-1 truncate font-mono text-[11px] uppercase tracking-wider text-dim">
          {matterCount === 0
            ? 'no matters'
            : matterCount === 1
              ? `1 matter${primaryMatter?.title ? ` · ${primaryMatter.title}` : ''}`
              : `${matterCount} matters${primaryMatter?.title ? ` · ${primaryMatter.title}` : ''}`}
          {practiceArea ? <span className="text-ink-2"> · {practiceArea}</span> : null}
        </div>
      </div>

      {/* Col 3: retainer — desktop only */}
      <div className="hidden flex-col gap-1 md:flex">
        <div className={cn('font-mono text-[12.5px] tabular-nums', retainerToneClass || 'text-ink')}>
          {retainerAmount !== null
            ? formatCurrency(asMajor(retainerAmount))
            : <span className="text-dim-2">—</span>}
        </div>
        <Bar
          value={retainerPercent ?? 0}
          tone={retainerPercent === null ? 'default' : retainerPercent < 30 ? 'warn' : retainerPercent > 70 ? 'ok' : 'default'}
          className="h-[3px]"
        />
      </div>

      {/* Col 4: primary matter chip — desktop only */}
      <div className="hidden md:block">
        {primaryMatter ? (
          <MatterChip
            urgent={String(primaryMatter.urgency ?? '').toLowerCase() === 'emergency'}
            onClick={(event) => {
              event.stopPropagation();
              if (primaryMatter.id) onOpenPrimaryMatter?.(primaryMatter.id);
            }}
            title={primaryMatter.title ?? 'Untitled matter'}
          >
            {primaryMatter.title ?? 'Untitled matter'}
          </MatterChip>
        ) : (
          <span className="font-mono text-[10.5px] uppercase tracking-wider text-dim-2">—</span>
        )}
      </div>

      {/* Col 5: last contact — desktop only */}
      <div className="hidden font-mono text-[11px] uppercase tracking-wider text-ink-2 md:block">
        {formatLastContact(lastContactDays)}
        {lastContactSource ? (
          <span className="mt-0.5 block text-[10px] normal-case tracking-normal text-dim">{lastContactSource}</span>
        ) : null}
      </div>

      {/* Col 6: signal pill — desktop only */}
      <div className="hidden justify-self-start md:block">
        <SignalPill signal={signal} label={signalLabel(signal)} />
      </div>

      {/* Quick-action cluster — overlaid on hover, desktop only */}
      <div className="pointer-events-none absolute inset-y-0 right-3 hidden items-center gap-1 opacity-0 transition-opacity group-hover:pointer-events-auto group-hover:opacity-100 md:flex">
        {onMessage ? (
          <Button
            variant="icon"
            size="icon-sm"
            icon={MessagesSquare}
            iconClassName="h-4 w-4"
            onClick={(event) => {
              event.stopPropagation();
              onMessage();
            }}
            aria-label={`Message ${name}`}
            title="Message"
          />
        ) : null}
        {onCall ? (
          <Button
            variant="icon"
            size="icon-sm"
            icon={Phone}
            iconClassName="h-4 w-4"
            onClick={(event) => {
              event.stopPropagation();
              onCall();
            }}
            aria-label={`Call ${name}`}
            title="Call"
          />
        ) : null}
        {onOpenMatters && matterCount > 0 ? (
          <Button
            variant="icon"
            size="icon-sm"
            icon={FolderOpen}
            iconClassName="h-4 w-4"
            onClick={(event) => {
              event.stopPropagation();
              onOpenMatters();
            }}
            aria-label={`View matters for ${name}`}
            title="View matters"
          />
        ) : null}
      </div>
    </div>
  );
}

/** Helper to safely read a retainer-ish dollar amount from a matter. */
export const readRetainerAmount = (matter: BackendMatter | null): number | null => {
  if (!matter) return null;
  // Closest proxy we have today is `total_fixed_price` for fixed-fee matters.
  // True trust/retainer balances live on the engagement / trust ledger and
  // aren't joined onto the matters list.
  if (matter.total_fixed_price !== null && matter.total_fixed_price !== undefined) {
    const value = getMajorAmountValue(matter.total_fixed_price);
    return Number.isFinite(value) && value > 0 ? value : null;
  }
  return null;
};

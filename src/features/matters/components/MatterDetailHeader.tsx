import type { LucideIcon } from 'lucide-preact';
import { Plus, Timer, FileText, Paperclip, MoreHorizontal } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Avatar } from '@/shared/ui/profile';
import { Popover } from '@/shared/ui/overlays';
import { MatterStatusDot } from '@/features/matters/components/MatterStatusDot';
import { MATTER_STATUS_LABELS } from '@/shared/types/matterStatus';
import type { MatterDetail } from '@/features/matters/data/matterTypes';
import { cn } from '@/shared/utils/cn';

export interface MatterMoreMenuItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
}

const URGENCY_DOT: Record<NonNullable<MatterDetail['urgency']>, string> = {
  routine: 'bg-emerald-500',
  time_sensitive: 'bg-amber-500',
  emergency: 'bg-rose-500'
};

const URGENCY_LABEL: Record<NonNullable<MatterDetail['urgency']>, string> = {
  routine: 'Routine',
  time_sensitive: 'Time sensitive',
  emergency: 'Emergency'
};

const heroInitial = (...candidates: Array<string | null | undefined>) => {
  for (const candidate of candidates) {
    const ch = candidate?.trim().charAt(0);
    if (ch) return ch.toUpperCase();
  }
  return '?';
};

const microLabel = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-input-placeholder';

export interface MatterDetailHeaderProps {
  detail: MatterDetail;
  clientLabel: string;
  clientEmail: string | null;
  clientImageUrl?: string | null;
  practiceAreaLabel?: string | null;
  onLogTime: () => void;
  onAddTask: () => void;
  onAddNote: () => void;
  onUploadFile: () => void;
  moreMenuItems?: MatterMoreMenuItem[];
}

export const MatterDetailHeader = ({
  detail,
  clientLabel,
  clientEmail,
  clientImageUrl,
  practiceAreaLabel,
  onLogTime,
  onAddTask,
  onAddNote,
  onUploadFile,
  moreMenuItems
}: MatterDetailHeaderProps) => {
  const title = detail.title?.trim() || 'Untitled matter';
  const subtitleParts = [clientLabel, practiceAreaLabel].filter((p): p is string => Boolean(p?.trim()));
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(' · ') : (clientEmail ?? '');

  return (
    <header className="flex flex-wrap items-center gap-4 px-4 py-4 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {clientImageUrl ? (
          <Avatar src={clientImageUrl} name={clientLabel} size="lg" />
        ) : (
          <div
            aria-hidden="true"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-accent-500 text-[20px] font-bold text-[rgb(var(--accent-foreground))]"
          >
            {heroInitial(clientEmail, clientLabel, title)}
          </div>
        )}

        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold leading-tight text-input-text">{title}</h2>
          {subtitle ? (
            <p className="truncate text-[13px] text-input-placeholder">{subtitle}</p>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex items-center gap-1.5 text-[13px] text-input-text">
          <MatterStatusDot status={detail.status} className="p-0" />
          <span>{MATTER_STATUS_LABELS[detail.status]}</span>
        </div>
        {detail.urgency ? (
          <div className="flex items-center gap-1.5 text-[13px] text-input-text">
            <span aria-hidden="true" className={cn('h-1.5 w-1.5 rounded-full', URGENCY_DOT[detail.urgency])} />
            <span>{URGENCY_LABEL[detail.urgency]}</span>
          </div>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="primary" icon={Timer} onClick={onLogTime}>
          Log time
        </Button>
        <Button size="sm" variant="secondary" icon={Plus} onClick={onAddTask}>
          Add task
        </Button>
        <Button size="sm" variant="secondary" icon={FileText} onClick={onAddNote}>
          Add note
        </Button>
        <Button size="sm" variant="secondary" icon={Paperclip} onClick={onUploadFile}>
          Upload file
        </Button>
        {moreMenuItems && moreMenuItems.length > 0 ? (
          <Popover
            side="bottom"
            align="end"
            trigger={
              <Button size="sm" variant="secondary" icon={MoreHorizontal} aria-label="More actions">
                More
              </Button>
            }
          >
            <ul className="flex min-w-[180px] flex-col gap-0.5">
              {moreMenuItems.map((item, index) => {
                const Icon = item.icon;
                return (
                  <li key={index}>
                    <button
                      type="button"
                      onClick={item.onClick}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-input-text transition-colors hover:bg-card"
                    >
                      {Icon ? <Icon className="h-4 w-4 text-input-placeholder" aria-hidden="true" /> : null}
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Popover>
        ) : null}
      </div>
      {/* Reserved for future use (e.g., kbd hint) */}
      <span className={cn(microLabel, 'sr-only')}>Matter actions</span>
    </header>
  );
};

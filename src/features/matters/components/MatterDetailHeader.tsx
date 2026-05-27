import type { LucideIcon } from 'lucide-preact';
import { Plus, Timer, FileText, Paperclip, MoreHorizontal, ChevronDown } from 'lucide-preact';

import { Button } from '@/shared/ui/Button';
import { Avatar } from '@/shared/ui/profile';
import { Popover } from '@/shared/ui/overlays';
import { MATTER_STATUS_BADGE_CLASS } from '@/features/matters/utils/matterStatusStyles';
import { MATTER_STATUS_LABELS } from '@/shared/types/matterStatus';
import type { MatterDetail } from '@/features/matters/data/matterTypes';
import { cn } from '@/shared/utils/cn';

export interface MatterMoreMenuItem {
  label: string;
  icon?: LucideIcon;
  onClick: () => void;
}

const URGENCY_BADGE: Record<NonNullable<MatterDetail['urgency']>, string> = {
  routine: 'status-success',
  time_sensitive: 'status-warning',
  emergency: 'status-error'
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

export interface MatterDetailHeaderProps {
  detail: MatterDetail;
  clientLabel: string;
  clientEmail: string | null;
  clientImageUrl?: string | null;
  practiceAreaLabel?: string | null;
  responsibleAttorneyLabel?: string | null;
  assigneeLabel?: string | null;
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
  responsibleAttorneyLabel,
  assigneeLabel,
  onLogTime,
  onAddTask,
  onAddNote,
  onUploadFile,
  moreMenuItems
}: MatterDetailHeaderProps) => {
  const title = detail.title?.trim() || 'Untitled matter';
  const subtitleParts = [clientLabel, practiceAreaLabel].filter((p): p is string => Boolean(p?.trim()));
  const subtitle = subtitleParts.length > 0 ? subtitleParts.join(' · ') : (clientEmail ?? '');
  const teamParts = [
    responsibleAttorneyLabel ? `Responsible: ${responsibleAttorneyLabel}` : null,
    assigneeLabel ? `Assigned: ${assigneeLabel}` : null
  ].filter((p): p is string => Boolean(p));

  return (
    <header className="page-detail-header">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          {clientImageUrl ? (
            <Avatar src={clientImageUrl} name={clientLabel} size="lg" />
          ) : (
            <div
              aria-hidden="true"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-surface-card-raised text-lg font-semibold text-input-text"
            >
              {heroInitial(clientEmail, clientLabel, title)}
            </div>
          )}

          <div className="min-w-0 flex-1">
            <h2 className="truncate text-xl font-semibold leading-tight tracking-tight text-input-text sm:text-2xl">{title}</h2>
            {subtitle ? <p className="truncate text-[13px] text-input-placeholder">{subtitle}</p> : null}
            {teamParts.length > 0 ? (
              <p className="mt-1 truncate text-xs text-input-placeholder">{teamParts.join(' · ')}</p>
            ) : null}
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset',
                  MATTER_STATUS_BADGE_CLASS[detail.status]
                )}
              >
                {MATTER_STATUS_LABELS[detail.status]}
              </span>
              {detail.urgency ? (
                <span
                  className={cn(
                    'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-semibold',
                    URGENCY_BADGE[detail.urgency]
                  )}
                >
                  {URGENCY_LABEL[detail.urgency]}
                </span>
              ) : null}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2">
          <Button size="sm" variant="secondary" icon={Timer} onClick={onLogTime}>
            Log time
          </Button>
          <Popover
            side="bottom"
            align="end"
            trigger={
              <Button size="sm" variant="secondary" icon={Plus}>
                Add <ChevronDown className="ml-1 h-3.5 w-3.5" aria-hidden="true" />
              </Button>
            }
          >
            <ul className="flex min-w-[180px] flex-col gap-0.5">
              {[
                { label: 'Task', icon: Plus, onClick: onAddTask },
                { label: 'Note', icon: FileText, onClick: onAddNote },
                { label: 'File', icon: Paperclip, onClick: onUploadFile }
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.label}>
                    <button
                      type="button"
                      onClick={item.onClick}
                      className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-input-text transition-colors hover:bg-surface-card-hover"
                    >
                      {Icon ? <Icon className="h-4 w-4 text-input-placeholder" aria-hidden="true" /> : null}
                      {item.label}
                    </button>
                  </li>
                );
              })}
            </ul>
          </Popover>
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
                        className="flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-sm text-input-text transition-colors hover:bg-surface-card-hover"
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
      </div>
    </header>
  );
};

import { FunctionComponent } from 'preact';
import { useMemo } from 'preact/hooks';
import { useTranslation } from 'react-i18next';
import { ChevronRight, Trash2 } from 'lucide-preact';
import { Avatar } from '@/shared/ui/profile/atoms/Avatar';
import { Button } from '@/shared/ui/Button';
import { DetailRow } from '@/shared/ui/detail/DetailRow';
import { cn } from '@/shared/utils/cn';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import {
  resolveConversationContactName,
  resolveConversationDisplayTitle,
} from '@/shared/utils/conversationDisplay';
import type { Conversation } from '@/shared/types/conversation';
import type { BackendMatter } from '@/features/matters/services/mattersApi';

const sectionTitle = 'text-[11px] font-semibold uppercase tracking-[0.08em] text-input-placeholder';
const sectionDivider = 'border-t border-line-glass/30 pt-4 mt-4';

interface ActivityEntry {
  id: string;
  title: string;
  detail?: string | null;
  timestamp?: string | null;
}

interface ConversationContextPanelProps {
  conversation: Conversation | null;
  matter?: BackendMatter | null;
  /** Practice name used as a fallback for the contact label. */
  practiceName?: string | null;
  /** Optional callback when the linked-matter row is clicked. */
  onOpenMatter?: (matterId: string) => void;
  /** Optional callback to start the delete-conversation flow. When provided,
   *  renders a "Delete conversation" button at the bottom of the panel. */
  onDeleteConversation?: () => void;
  className?: string;
}

const PRACTICE_AREA_LABELS: Record<string, string> = {
  family_law: 'Family Law',
  criminal_defense: 'Criminal Defense',
  personal_injury: 'Personal Injury',
  employment_law: 'Employment Law',
  business_law: 'Business Law',
  estate_planning: 'Estate Planning',
  immigration: 'Immigration',
  real_estate: 'Real Estate',
  intellectual_property: 'Intellectual Property',
  general: 'General',
};

const formatPracticeArea = (value: string | null | undefined): string => {
  if (!value) return '';
  if (PRACTICE_AREA_LABELS[value]) return PRACTICE_AREA_LABELS[value];
  return value
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const STATUS_TONE: Record<string, string> = {
  active: 'text-emerald-400',
  pleadings_filed: 'text-emerald-400',
  discovery: 'text-emerald-400',
  consultation_scheduled: 'text-amber-300',
  intake_pending: 'text-amber-300',
  closed: 'text-input-placeholder',
  declined: 'text-input-placeholder',
};

const formatStatusLabel = (status: string | null | undefined): string => {
  if (!status) return '';
  return status
    .split(/[_\s]+/)
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

const formatActivityDate = (timestamp: string | null | undefined): string => {
  if (!timestamp) return '';
  const date = new Date(timestamp);
  if (Number.isNaN(date.getTime())) return '';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
};

const buildActivityEntries = (conversation: Conversation | null): ActivityEntry[] => {
  if (!conversation) return [];
  const metadata = conversation.user_info ?? null;
  const entries: ActivityEntry[] = [];
  if (metadata?.intakeCompleted || metadata?.intakeSubmitted) {
    entries.push({
      id: 'intake-completed',
      title: 'Intake completed',
      detail: 'All form fields submitted',
      timestamp: conversation.first_response_at ?? conversation.updated_at ?? null,
    });
  }
  if (metadata?.intakePaymentReceived) {
    entries.push({
      id: 'payment-received',
      title: 'Payment received',
      detail: typeof metadata?.intakeRetainerLabel === 'string' ? metadata.intakeRetainerLabel : null,
      timestamp: conversation.last_message_at ?? null,
    });
  }
  if (conversation.lead?.is_lead && conversation.lead.created_at) {
    entries.push({
      id: 'lead-created',
      title: 'Lead created',
      detail: typeof conversation.lead.lead_source === 'string' ? conversation.lead.lead_source : null,
      timestamp: conversation.lead.created_at,
    });
  }
  return entries;
};

/**
 * Pencil rxzde right-side context panel. Renders three label-left, value-right
 * sections (Contact, Linked Matter, Recent Activity) inside a single column.
 * All data sources are optional — sections gracefully render placeholder rows
 * when fields are missing rather than collapsing.
 */
const ConversationContextPanel: FunctionComponent<ConversationContextPanelProps> = ({
  conversation,
  matter,
  practiceName,
  onOpenMatter,
  onDeleteConversation,
  className,
}) => {
  const { t } = useTranslation();

  const contactName = useMemo(() => {
    if (!conversation) return '';
    return (
      resolveConversationContactName(conversation) ||
      resolveConversationDisplayTitle(conversation, practiceName ?? '') ||
      ''
    );
  }, [conversation, practiceName]);

  const metadata = conversation?.user_info ?? null;
  const intakeState = (metadata?.intakeConversationState ?? null) as Record<string, unknown> | null;
  const slimDraft = (metadata?.intakeSlimContactDraft ?? null) as Record<string, unknown> | null;

  const email = useMemo(() => {
    if (typeof intakeState?.email === 'string' && intakeState.email.trim()) return intakeState.email;
    if (typeof slimDraft?.email === 'string' && slimDraft.email.trim()) return slimDraft.email;
    return '';
  }, [intakeState, slimDraft]);

  const phone = useMemo(() => {
    if (typeof intakeState?.phone === 'string' && intakeState.phone.trim()) return intakeState.phone;
    if (typeof slimDraft?.phone === 'string' && slimDraft.phone.trim()) return slimDraft.phone;
    return '';
  }, [intakeState, slimDraft]);

  const source = useMemo(() => {
    const leadSource = conversation?.lead?.lead_source;
    if (typeof leadSource === 'string' && leadSource.trim()) return leadSource;
    if (metadata?.mode === 'REQUEST_CONSULTATION') return 'Consultation request';
    if (metadata?.intakeUuid) return 'Website Intake';
    return '';
  }, [conversation, metadata]);

  const matterTitle = matter?.title ?? '';
  const matterStatus = matter?.status ?? '';
  const matterPracticeArea = formatPracticeArea(matter?.practice_area ?? null);

  const activity = useMemo(() => buildActivityEntries(conversation), [conversation]);

  const statusToneClass = STATUS_TONE[matterStatus] ?? 'text-input-text';
  const statusLabel = formatStatusLabel(matterStatus);

  const lastActiveLabel = conversation?.last_message_at
    ? formatRelativeTime(new Date(conversation.last_message_at))
    : null;

  return (
    <aside
      className={cn(
        'flex h-full min-h-0 w-full flex-col overflow-y-auto bg-[rgb(var(--surface-card))] px-5 py-5',
        className
      )}
      aria-label={t('workspace.conversationContext.label', { defaultValue: 'Conversation details' })}
    >
      {/* Identity header — small avatar + contact name + last-active hint */}
      <div className="flex flex-col items-center gap-3 pb-4 text-center">
        <Avatar src={null} name={contactName || (practiceName ?? 'Contact')} size="lg" />
        <div className="min-w-0">
          <p className="truncate text-base font-semibold text-input-text">{contactName || '—'}</p>
          {lastActiveLabel ? (
            <p className="mt-0.5 text-xs text-input-placeholder">
              {t('workspace.conversationContext.lastActive', {
                defaultValue: 'Active {{relative}}',
                relative: lastActiveLabel,
              })}
            </p>
          ) : null}
        </div>
      </div>

      <section className="flex flex-col gap-3 border-t border-line-glass/30 pt-4">
        <h3 className={sectionTitle}>{t('workspace.conversationContext.contact', { defaultValue: 'Contact' })}</h3>
        <DetailRow label={t('workspace.conversationContext.name', { defaultValue: 'Name' })} value={contactName} />
        <DetailRow label={t('workspace.conversationContext.email', { defaultValue: 'Email' })} value={email} />
        <DetailRow label={t('workspace.conversationContext.phone', { defaultValue: 'Phone' })} value={phone} />
        <DetailRow label={t('workspace.conversationContext.source', { defaultValue: 'Source' })} value={source} />
      </section>

      <section className={cn('flex flex-col gap-3', sectionDivider)}>
        <h3 className={sectionTitle}>
          {t('workspace.conversationContext.linkedMatter', { defaultValue: 'Linked Matter' })}
        </h3>
        <DetailRow
          label={t('workspace.conversationContext.matter', { defaultValue: 'Matter' })}
          value={
            matterTitle ? (
              onOpenMatter && matter ? (
                <button
                  type="button"
                  className="inline-flex items-center gap-1 text-right text-input-text hover:text-accent-utility focus:outline-none focus-visible:underline"
                  onClick={() => onOpenMatter(matter.id)}
                >
                  <span className="truncate">{matterTitle}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                </button>
              ) : (
                matterTitle
              )
            ) : (
              ''
            )
          }
          emptyText={t('workspace.conversationContext.noMatter', { defaultValue: 'No linked matter' })}
        />
        <DetailRow
          label={t('workspace.conversationContext.status', { defaultValue: 'Status' })}
          value={
            statusLabel ? (
              <span className={cn('font-medium', statusToneClass)}>{statusLabel}</span>
            ) : (
              ''
            )
          }
        />
        <DetailRow
          label={t('workspace.conversationContext.practiceArea', { defaultValue: 'Practice Area' })}
          value={matterPracticeArea}
        />
      </section>

      <section className={cn('flex flex-col gap-3', sectionDivider)}>
        <h3 className={sectionTitle}>
          {t('workspace.conversationContext.recentActivity', { defaultValue: 'Recent Activity' })}
        </h3>
        {activity.length === 0 ? (
          <p className="text-xs text-input-placeholder">
            {t('workspace.conversationContext.noActivity', {
              defaultValue: 'Activity will appear here once the conversation progresses.',
            })}
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {activity.map((entry) => (
              <li key={entry.id} className="flex items-start justify-between gap-3 text-sm">
                <div className="min-w-0">
                  <p className="font-medium text-input-text">{entry.title}</p>
                  {entry.detail ? (
                    <p className="mt-0.5 truncate text-xs text-input-placeholder">{entry.detail}</p>
                  ) : null}
                </div>
                {entry.timestamp ? (
                  <span className="flex-shrink-0 text-xs text-input-placeholder">
                    {formatActivityDate(entry.timestamp)}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </section>

      {onDeleteConversation && conversation ? (
        <section className={cn('flex flex-col gap-3', sectionDivider)}>
          <Button
            type="button"
            variant="danger"
            size="sm"
            icon={Trash2}
            iconClassName="h-4 w-4"
            iconPosition="left"
            onClick={onDeleteConversation}
            className="self-start"
          >
            {t('workspace.conversationContext.delete', { defaultValue: 'Delete conversation' })}
          </Button>
        </section>
      ) : null}
    </aside>
  );
};

export default ConversationContextPanel;

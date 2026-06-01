import { useTranslation } from 'react-i18next';
import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Copy, X, MessagesSquare, Plus, User, Phone } from 'lucide-preact';

import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
import { ResponsiveDefinitionGrid } from '@/shared/ui/layout/ResponsiveDefinitionGrid';
import { Panel } from '@/shared/ui/layout/Panel';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { LoadingBlock, InteractiveListItem } from '@/shared/ui/layout';
import { Button } from '@/shared/ui/Button';
import { Avatar } from '@/shared/ui/profile';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { cn } from '@/shared/utils/cn';
import { ActivityTimeline, type TimelineItem } from '@/shared/ui/activity/ActivityTimeline';
import { formatDate } from '@/shared/utils/dateTime';
import { splitName } from '@/shared/utils/name';
import { usePracticeManagement, type Invitation } from '@/shared/hooks/usePracticeManagement';
import { usePracticeInvitations } from '@/shared/hooks/usePracticeInvitations';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { useSessionContext, useMemberRoleContext } from '@/shared/contexts/SessionContext';
import { usePracticeTeam } from '@/shared/hooks/usePracticeTeam';
import { useMattersData } from '@/shared/hooks/useMattersData';
import { SettingsHelperText } from '@/features/settings/components/SettingsHelperText';
import {
  apiClient,
  isHttpError,
  listUserDetailMemos,
  createUserDetailMemo,
  updateUserDetailMemo,
  deleteUserDetailMemo,
  getUserDetail,
  getUserDetailAddressById,
  type UserDetailMemoRecord
} from '@/shared/lib/apiClient';
import {
  formatUserDetailAddressDisplay,
  hasRenderableUserDetailAddress,
  readUserDetailAddress,
} from '@/shared/lib/userDetailAddress';
import {
  CONTACT_RELATIONSHIP_STATUS_LABELS,
  type ContactRecord,
  type ContactRelationshipStatus,
} from '@/shared/domain/contacts';
import { getPracticeRoleLabel, normalizePracticeRole } from '@/shared/utils/practiceRoles';
import {
  AIAskBar,
  AIAnswerCard,
  Observation,
  StatStrip,
  MatterChip,
  type StatStripCell,
} from '@/design-system/patterns';
import { SignalPill, type SignalPillSignal } from '@/design-system/primitives';
import type { BackendMatter } from '@/features/matters/services/mattersApi';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import {
  ClientDirectoryRow,
  readRetainerAmount,
} from '@/features/clients/components/ClientDirectoryRow';
import {
  SENTIMENT_RANK,
  computeLastContactDays,
  deriveContactSignal,
  formatLastContact,
  signalLabel,
  type ContactFilterId,
  type ContactSortId,
} from '@/features/clients/components/clientSignals';

const STATUS_LABELS = CONTACT_RELATIONSHIP_STATUS_LABELS;

type DirectoryRecord = {
  id: string;
  kind: 'client' | 'team';
  userId: string | null;
  name: string;
  email: string;
  phone?: string | null;
  status?: ContactRelationshipStatus;
  teamRole?: string | null;
  addressDisplay?: string | null;
  // ── chat-first enrichment (derived from matters + contact timestamps) ──
  matters?: BackendMatter[];
  primaryMatter?: BackendMatter | null;
  lastContactDays?: number | null;
  signal?: SignalPillSignal;
};

const formatPhoneNumber = (phone?: string | null) => {
  if (!phone) return 'Not provided';
  const cleaned = phone.replace(/\D/g, '');
  if (cleaned.length === 10) {
    return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
  }
  if (cleaned.length === 11) {
    return `+${cleaned.slice(0, 1)} (${cleaned.slice(1, 4)}) ${cleaned.slice(4, 7)}-${cleaned.slice(7)}`;
  }
  return phone;
};

const PendingEmptyState = ({ onInviteClient }: { onInviteClient: () => void }) => (
  <WorkspacePlaceholderState
    icon={User}
    title="No pending invites"
    description="Contact invites you send will appear here until they are accepted."
    primaryAction={{
      label: 'New Contact',
      onClick: onInviteClient,
      icon: Plus,
    }}
  />
);

const PendingInvitationDetailPanel = ({
  invitation,
  canManage,
  onCopyLink,
  onCancelInvitation,
}: {
  invitation: Invitation;
  canManage: boolean;
  onCopyLink: (invitationId: string) => void | Promise<void>;
  onCancelInvitation: (invitationId: string) => void | Promise<void>;
}) => {
  const roleLabel = getPracticeRoleLabel(normalizePracticeRole(invitation.role) ?? 'client');
  return (
    <div className="h-full overflow-y-auto @container">
      <div className="space-y-6">
        <section
          className="relative overflow-hidden rounded-r-md border"
          style={{
            background: 'linear-gradient(180deg, color-mix(in oklab, var(--accent) 12%, var(--card)), var(--card))',
            borderColor: 'color-mix(in oklab, var(--accent) 30%, var(--rule))',
          }}
        >
          <div className="px-6 pb-12 pt-10">
            <div className="flex flex-col items-center text-center">
              <Avatar name={invitation.email} size="xl" />
              <div className="mt-8 min-w-0 max-w-full">
                <h3 className="truncate pb-1 text-4xl font-semibold leading-[1.15] text-ink md:text-5xl">{invitation.email}</h3>
                <p className="mt-2 truncate pb-0.5 text-base leading-snug text-ink-2 md:text-lg">
                  Pending contact invitation
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="panel rounded-2xl">
          <ResponsiveDefinitionGrid>
            <dl className="divide-y divide-line-subtle">
              <div className="px-5 py-4">
                <dt className="text-sm font-medium text-dim-2">Email</dt>
                <dd className="mt-1 text-sm text-ink">{invitation.email}</dd>
              </div>
              <div className="px-5 py-4">
                <dt className="text-sm font-medium text-dim-2">Role</dt>
                <dd className="mt-1 text-sm text-ink">{roleLabel}</dd>
              </div>
            </dl>
            <dl className="divide-y divide-line-subtle">
              <div className="px-5 py-4">
                <dt className="text-sm font-medium text-dim-2">Status</dt>
                <dd className="mt-1 text-sm text-ink">Pending</dd>
              </div>
              <div className="px-5 py-4">
                <dt className="text-sm font-medium text-dim-2">Expires</dt>
                <dd className="mt-1 text-sm text-ink">{formatDate(new Date(invitation.expiresAt))}</dd>
              </div>
            </dl>
          </ResponsiveDefinitionGrid>
        </section>

        <section className="px-1 py-1">
          <h3 className="text-sm font-semibold text-ink">Invite actions</h3>
          <p className="mt-2 text-sm text-dim-2">
            Copy the invite link or cancel this invitation if it is no longer needed.
          </p>
          {canManage ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { void onCopyLink(invitation.id); }}
                icon={Copy}
                iconClassName="h-4 w-4"
              >
                Copy invite link
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => { void onCancelInvitation(invitation.id); }}
                icon={X}
                iconClassName="h-4 w-4"
              >
                Cancel invitation
              </Button>
            </div>
          ) : (
            <SettingsHelperText className="mt-3">
              Only admins can manage pending invitations.
            </SettingsHelperText>
          )}
        </section>
      </div>
    </div>
  );
};

/**
 * Detail panel — chat-first focus drawer per Clients.html.
 *
 * Order of sections (top → bottom):
 *   1. Header (kind label · serif name with accent · sub line · read-only chip)
 *   2. Actions row (open thread / matter / call)
 *   3. Observation strip — deterministic "I noticed …"
 *   4. At a glance — 4-cell StatStrip
 *   5. Contact field list
 *   6. Matters list (MatterChips)
 *   7. Recent activity timeline (existing component, preserved)
 */
const ClientDetailPanel = ({
  client,
  activity,
  practiceId,
  onAddMemo,
  memoSubmitting = false,
  onEditMemo,
  onDeleteMemo,
  memoActionId,
  paddingClassName = '',
  onOpenMatter,
  onSendMessage,
  sendMessagePending = false,
}: {
  client: DirectoryRecord;
  activity: TimelineItem[];
  practiceId?: string | null;
  onAddMemo?: (value: string) => void | Promise<void>;
  memoSubmitting?: boolean;
  onEditMemo?: (memoId: string, value: string) => void | Promise<void>;
  onDeleteMemo?: (memoId: string) => void | Promise<void>;
  memoActionId?: string | null;
  paddingClassName?: string;
  onOpenMatter?: (matterId: string) => void;
  onSendMessage?: () => void;
  sendMessagePending?: boolean;
}) => {
  const isClientRecord = client.kind === 'client';
  const resolvedTeamRole = normalizePracticeRole(client.teamRole);
  const relationshipLabel = isClientRecord
    ? (client.status ? STATUS_LABELS[client.status] : 'Client')
    : 'Team member';
  const teamRoleLabel = !isClientRecord
    ? (resolvedTeamRole ? getPracticeRoleLabel(resolvedTeamRole) : 'Team member')
    : null;
  const messagingHint = isClientRecord && !client.userId
    ? 'No linked portal account yet'
    : null;

  const matters = client.matters ?? [];
  const openMatters = matters.filter((m) => {
    const status = String(m.status ?? '').toLowerCase();
    return status !== 'closed' && status !== 'archived';
  });
  const signal = client.signal ?? 'calm';
  const lastContactDays = client.lastContactDays ?? null;

  // Deterministic "I noticed" derivation from data.
  const observationText: string | null = (() => {
    if (!isClientRecord) return null;
    if (signal === 'frustrated' && openMatters.length > 0) {
      const m = openMatters.find((x) => String(x.urgency ?? '').toLowerCase() === 'emergency') ?? openMatters[0];
      return `${client.name.split(' ')[0]} has an emergency-tagged matter open${m.title ? ` — ${m.title}` : ''}. A quick check-in keeps the trust line short.`;
    }
    if (signal === 'silent' && lastContactDays !== null) {
      return `It's been ${lastContactDays} days since this record last moved. ${openMatters.length > 0 ? 'There are still open matters — worth a nudge.' : 'No open matters — consider closing the file.'}`;
    }
    if (signal === 'anxious') {
      return `Open matters tagged time-sensitive. A brief status note usually settles the timing question.`;
    }
    return null;
  })();

  // ── StatStrip cells ───────────────────────────────────────────────────
  // Lifetime value, Trust held, Unbilled all require ledger joins not in
  // the contacts payload — render "—" with TODO until exposed.
  // TODO(backend): expose per-contact aggregates
  //   (lifetime_value, trust_held, unbilled_total) on the user-details
  //   payload so we don't have to fan out N+1 invoice queries.
  const statCells: StatStripCell[] = [
    {
      label: 'Open matters',
      value: openMatters.length > 0 ? String(openMatters.length) : '—',
    },
    {
      label: 'Lifetime value',
      value: '—',
      extra: 'TODO',
    },
    {
      label: 'Trust held',
      value: '—',
      extra: 'TODO',
    },
    {
      label: 'Unbilled',
      value: '—',
      extra: 'TODO',
    },
  ];

  return (
    <div className={cn('h-full overflow-y-auto @container', paddingClassName)}>
      <div className="space-y-5 py-1">
        {/* ── Header ─────────────────────────────────────────────────── */}
        <header className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
            {isClientRecord ? 'Selected client' : 'Team member'}
          </div>
          <h2 className="font-[family-name:var(--serif)] text-3xl font-normal leading-[1.05] tracking-[-0.012em] text-ink">
            {(() => {
              const parts = splitName(client.name);
              if (parts.first && parts.last) {
                return (
                  <>
                    {parts.first} <em className="not-italic text-accent">{parts.last}</em>
                  </>
                );
              }
              return client.name;
            })()}
          </h2>
          <p className="text-[13px] text-ink-2">
            {isClientRecord ? relationshipLabel : teamRoleLabel}
            {client.email ? <> · {client.email}</> : null}
          </p>
          {isClientRecord ? (
            <div className="inline-flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-[0.1em] text-dim-2">
              <span aria-hidden="true" className="h-[5px] w-[5px] rounded-full bg-dim-2" />
              read-only · writes via assistant
            </div>
          ) : null}
          {messagingHint ? <p className="text-xs text-dim">{messagingHint}</p> : null}
        </header>

        {/* ── Actions ────────────────────────────────────────────────── */}
        {isClientRecord && (onSendMessage || openMatters.length > 0) ? (
          <div className="flex flex-wrap gap-1.5">
            {onSendMessage ? (
              <button
                type="button"
                className="chip primary"
                onClick={onSendMessage}
                disabled={!client.userId || sendMessagePending}
              >
                Open thread
              </button>
            ) : null}
            {openMatters[0]?.id && onOpenMatter ? (
              <button
                type="button"
                className="chip"
                onClick={() => onOpenMatter(openMatters[0].id)}
              >
                Open matter
              </button>
            ) : null}
            {client.phone ? (
              <a className="chip" href={`tel:${client.phone}`}>
                Call
              </a>
            ) : null}
          </div>
        ) : null}

        {/* ── Observation strip ──────────────────────────────────────── */}
        {observationText ? (
          <Observation label="I noticed">{observationText}</Observation>
        ) : null}

        {/* ── At a glance ────────────────────────────────────────────── */}
        {isClientRecord ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
              <span>At a glance</span>
              <span className="font-[family-name:var(--sans)] text-[11px] normal-case tracking-normal text-ink-2">
                {formatLastContact(lastContactDays)} since last contact
              </span>
            </div>
            <StatStrip cells={statCells} />
          </section>
        ) : null}

        {/* ── Contact field list ─────────────────────────────────────── */}
        <section className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
            Contact
          </div>
          <Panel className="rounded-r-md">
            <ResponsiveDefinitionGrid>
              <dl className="divide-y divide-line-subtle">
                <div className="px-5 py-4">
                  <dt className="text-sm font-medium text-dim-2">Email</dt>
                  <dd className="mt-1 text-sm text-ink">{client.email}</dd>
                </div>
                <div className="px-5 py-4">
                  <dt className="text-sm font-medium text-dim-2">Phone</dt>
                  <dd className="mt-1 text-sm text-ink">{isClientRecord ? formatPhoneNumber(client.phone) : 'Not provided'}</dd>
                </div>
              </dl>
              <dl className="divide-y divide-line-subtle">
                <div className="px-5 py-4">
                  <dt className="text-sm font-medium text-dim-2">Address</dt>
                  <dd className="mt-1 text-sm text-ink">{client.addressDisplay ?? 'Not provided'}</dd>
                </div>
                <div className="px-5 py-4">
                  <dt className="text-sm font-medium text-dim-2">
                    {isClientRecord ? 'Sentiment' : 'Team role'}
                  </dt>
                  <dd className="mt-1 text-sm">
                    {isClientRecord ? (
                      <SignalPill signal={signal} label={signalLabel(signal)} />
                    ) : (
                      <span className="text-ink">{teamRoleLabel}</span>
                    )}
                  </dd>
                </div>
              </dl>
            </ResponsiveDefinitionGrid>
          </Panel>
        </section>

        {/* ── Matters list ───────────────────────────────────────────── */}
        {isClientRecord && matters.length > 0 ? (
          <section className="space-y-2">
            <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
              <span>Matters</span>
              <span className="font-[family-name:var(--sans)] text-[11px] normal-case tracking-normal text-ink-2">
                {matters.length} total · {openMatters.length} open
              </span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {matters.map((matter) => {
                const status = String(matter.status ?? '').toLowerCase();
                const urgency = String(matter.urgency ?? '').toLowerCase();
                const closed = status === 'closed' || status === 'archived';
                return (
                  <MatterChip
                    key={matter.id}
                    urgent={urgency === 'emergency'}
                    active={false}
                    onClick={() => onOpenMatter?.(matter.id)}
                    title={matter.title ?? 'Untitled matter'}
                    className={closed ? 'opacity-60' : undefined}
                  >
                    {matter.title ?? 'Untitled matter'}
                  </MatterChip>
                );
              })}
            </div>
          </section>
        ) : null}

        {/* ── Activity timeline (preserved) ──────────────────────────── */}
        <section className="space-y-2">
          <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
            {isClientRecord ? 'Recent activity' : 'Team access'}
          </div>
          <div>
            {isClientRecord ? (
              <ActivityTimeline
                items={activity}
                showComposer
                composerDisabled={!onAddMemo}
                composerSubmitting={memoSubmitting}
                onComposerSubmit={onAddMemo}
                composerLabel="Comment"
                composerPlaceholder="Add your comment..."
                composerPracticeId={practiceId}
                onEditComment={onEditMemo}
                onDeleteComment={onDeleteMemo}
                commentActionsDisabled={memoSubmitting || Boolean(memoActionId)}
              />
            ) : (
              <p className="text-sm text-dim-2">
                Team member access and role changes are managed in Settings &gt; Team.
              </p>
            )}
          </div>
        </section>
      </div>
    </div>
  );
};

export const PracticeContactsPage = ({
  practiceId: routePracticeId,
  basePath = '/practice/contacts',
  conversationsPath,
  renderMode = 'full',
  statusFilter = null,
  prefetchedItems = [],
  prefetchedLoading = false,
  prefetchedLoadingMore = false,
  prefetchedError = null,
  onRefetchList: _onRefetchList,
  detailHeaderLeadingAction,
  showDetailBackButton = true,
}: {
  practiceId?: string | null;
  basePath?: string;
  conversationsPath?: string | null;
  renderMode?: 'full' | 'listOnly' | 'detailOnly';
  statusFilter?: ContactRelationshipStatus | null;
  prefetchedItems?: ContactRecord[];
  prefetchedLoading?: boolean;
  prefetchedLoadingMore?: boolean;
  prefetchedError?: string | null;
  onRefetchList?: (signal?: AbortSignal) => Promise<void>;
  detailHeaderLeadingAction?: ComponentChildren;
  showDetailBackButton?: boolean;
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const { currentPractice } = usePracticeManagement();
  const { session } = useSessionContext();
  const { activeMemberRole } = useMemberRoleContext();
  const { showError, showSuccess } = useToastContext();
  const normalizedActiveRole = normalizePracticeRole(activeMemberRole);
  const isAdmin = normalizedActiveRole === 'owner' || normalizedActiveRole === 'admin';
  const [memoTimelineByPractice, setMemoTimelineByPractice] = useState<Record<string, Record<string, TimelineItem[]>>>({});
  const [memoSubmitting, setMemoSubmitting] = useState(false);
  const [memoActionId, setMemoActionId] = useState<string | null>(null);
  const [sendMessagePending, setSendMessagePending] = useState(false);
  const [hydratedAddressByDetailId, setHydratedAddressByDetailId] = useState<Record<string, unknown>>({});
  // Transient in-flight / failed trackers — use refs to avoid effect self-canceling
  const hydrationInFlightRef = useRef<Record<string, true>>({});
  const hydrationFailedRef = useRef<Record<string, true>>({});

  // ── chat-first list controls ─────────────────────────────────────────
  const [activeFilter, setActiveFilter] = useState<ContactFilterId>('all');
  const [sortMode, setSortMode] = useState<ContactSortId>('recent_activity');
  const [askAnswer, setAskAnswer] = useState<{ query: string } | null>(null);

  const pathSuffix = location.path.startsWith(basePath) ? location.path.slice(basePath.length) : '';
  const pathSegments = pathSuffix.replace(/^\/+/, '').split('/').filter(Boolean);
  const contactsScope = (() => {
    if (pathSegments[0] === 'archived') return 'archived';
    if (pathSegments[0] === 'team') return 'team';
    if (pathSegments[0] === 'pending') return 'pending';
    if (pathSegments[0] === 'clients') return 'clients';
    return 'all';
  })();
  const isArchivedListRoute = contactsScope === 'archived';
  const isTeamListRoute = contactsScope === 'team';
  const isPendingListRoute = contactsScope === 'pending';
  const isClientsListRoute = contactsScope === 'clients';
  const selectedClientIdFromPath = useMemo(() => {
    const selectedSegment = isArchivedListRoute || isTeamListRoute || isClientsListRoute || isPendingListRoute
      ? pathSegments[1]
      : pathSegments[0];
    if (!selectedSegment) return null;
    try {
      const decoded = decodeURIComponent(selectedSegment);
      if (isTeamListRoute) {
        return `team:${decoded}`;
      }
      if (isPendingListRoute) {
        return `pending:${decoded}`;
      }
      return decoded;
    } catch (e) {
      console.warn('[Contacts] Failed to decode client ID from path', e);
      return null;
    }
  }, [isArchivedListRoute, isClientsListRoute, isPendingListRoute, isTeamListRoute, pathSegments]);
  const selectedPendingInvitationIdFromPath = selectedClientIdFromPath?.startsWith('pending:')
    ? selectedClientIdFromPath.slice('pending:'.length)
    : null;
  const activePracticeId = routePracticeId === undefined ? (currentPractice?.id ?? null) : routePracticeId;
  const {
    invitations: practiceInvitations,
    isLoading: invitationsLoading,
    error: invitationsError,
    cancelInvitation,
  } = usePracticeInvitations(activePracticeId);
  const {
    members: teamMembersData,
    isLoading: isFetchingMembers,
    error: teamMembersError,
  } = usePracticeTeam(activePracticeId, session?.user?.id ?? null, { enabled: Boolean(activePracticeId) });
  // First load done implied by `!isFetchingMembers` (isLoading is permanently
  // false after the first response).
  const teamMembersLoaded = !isFetchingMembers;

  // ── Matters fetch — used to enrich each contact row with primary matter,
  // matter count, retainer proxy, and sentiment signal. Filtered locally
  // by `client_id === contact.user_id`.
  const mattersData = useMattersData(activePracticeId ?? '', [], {
    enabled: Boolean(activePracticeId),
  });

  const memoTimeline = useMemo(
    () => (activePracticeId ? (memoTimelineByPractice[activePracticeId] ?? {}) : {}),
    [activePracticeId, memoTimelineByPractice]
  );
  const updateMemoTimeline = useCallback((updater: (prev: Record<string, TimelineItem[]>) => Record<string, TimelineItem[]>) => {
    if (!activePracticeId) return;
    setMemoTimelineByPractice((prev) => {
      const current = prev[activePracticeId] ?? {};
      const updated = updater(current);
      return { ...prev, [activePracticeId]: updated };
    });
  }, [activePracticeId]);
  useEffect(() => {
    if (!activePracticeId) return;

    const candidates = prefetchedItems.filter((detail) => {
      if (hydratedAddressByDetailId[detail.id] || hydrationInFlightRef.current[detail.id] || hydrationFailedRef.current[detail.id]) return false;
      const hasAddressId = Boolean((detail as Record<string, unknown>).address_id ?? (detail as Record<string, unknown>).addressId);
      if (!hasAddressId) return false;
      const inlineAddress = readUserDetailAddress(detail);
      return !inlineAddress;
    });

    if (candidates.length === 0) return;

    let cancelled = false;
    // mark in-flight in the ref (transient)
    hydrationInFlightRef.current = { ...hydrationInFlightRef.current };
    candidates.forEach((detail) => {
      hydrationInFlightRef.current[detail.id] = true;
    });
    void Promise.allSettled(
      candidates.map(async (detail) => {
        const hydrated = await getUserDetail(activePracticeId, detail.id);
        let resolved = hydrated ? readUserDetailAddress(hydrated) : null;
        if (hydrated && !resolved) {
          const hydratedRecord = hydrated as unknown as Record<string, unknown>;
          const addressId = typeof hydratedRecord.address_id === 'string'
            ? hydratedRecord.address_id
            : (typeof hydratedRecord.addressId === 'string' ? hydratedRecord.addressId : '');
          if (addressId.trim().length > 0) {
            const fetchedAddress = await getUserDetailAddressById(activePracticeId, addressId.trim());
            if (fetchedAddress && hasRenderableUserDetailAddress(fetchedAddress)) {
              resolved = readUserDetailAddress(fetchedAddress);
            }
          }
        }
        if (!resolved) return null;
        return { id: detail.id, address: resolved };
      })
    ).then((results) => {
      if (cancelled) return;
      const updates: Record<string, unknown> = {};
      results.forEach((result, index) => {
        const detailId = candidates[index]?.id;
        if (result.status === 'rejected') {
          console.error('[Contacts] Failed to hydrate contact address', {
            detailId,
            reason: result.reason
          });
          if (detailId) {
            hydrationFailedRef.current = { ...hydrationFailedRef.current };
            hydrationFailedRef.current[detailId] = true;
          }
          return;
        }
        if (!result.value) {
          if (detailId) {
            hydrationFailedRef.current = { ...hydrationFailedRef.current };
            hydrationFailedRef.current[detailId] = true;
          }
          return;
        }
        updates[result.value.id] = result.value.address;
      });
      if (Object.keys(updates).length === 0) return;
      setHydratedAddressByDetailId((prev) => ({ ...prev, ...updates }));
    }).finally(() => {
      // remove in-flight flags for completed candidates, even if the effect was cancelled
      hydrationInFlightRef.current = { ...hydrationInFlightRef.current };
      candidates.forEach((detail) => {
        delete hydrationInFlightRef.current[detail.id];
      });
    });

    return () => {
      // clear any in-flight markers we set for these candidates so they can
      // be retried on the next effect run instead of being permanently blocked
      hydrationInFlightRef.current = { ...hydrationInFlightRef.current };
      candidates.forEach((detail) => {
        delete hydrationInFlightRef.current[detail.id];
      });
      cancelled = true;
    };
  }, [activePracticeId, prefetchedItems, hydratedAddressByDetailId]);

  const teamMembers = useMemo<DirectoryRecord[]>(() => {
    return teamMembersData.map<DirectoryRecord>((member) => ({
        id: `team:${member.userId}`,
        kind: 'team',
        userId: member.userId,
        name: member.name?.trim() || member.email,
        email: member.email,
        phone: null,
        teamRole: member.role
      }));
  }, [teamMembersData]);

  // Build a map of user_id → matters for fast lookup.
  const mattersByUserId = useMemo(() => {
    const map = new Map<string, BackendMatter[]>();
    for (const matter of mattersData.items) {
      const userId = typeof matter.client_id === 'string' ? matter.client_id : null;
      if (!userId) continue;
      const existing = map.get(userId);
      if (existing) existing.push(matter);
      else map.set(userId, [matter]);
    }
    return map;
  }, [mattersData.items]);

  // Pick a primary matter for the row — prefer open + most-recently-updated.
  const pickPrimaryMatter = useCallback((matters: readonly BackendMatter[]): BackendMatter | null => {
    if (matters.length === 0) return null;
    const open = matters.filter((m) => {
      const status = String(m.status ?? '').toLowerCase();
      return status !== 'closed' && status !== 'archived';
    });
    const pool = open.length > 0 ? open : matters;
    return [...pool].sort((a, b) => {
      const at = a.updated_at ? new Date(a.updated_at).getTime() : 0;
      const bt = b.updated_at ? new Date(b.updated_at).getTime() : 0;
      return bt - at;
    })[0] ?? null;
  }, []);

  const now = useMemo(() => Date.now(), []);

  const clients = useMemo<DirectoryRecord[]>(() => {
    const peopleItems: DirectoryRecord[] = prefetchedItems.map((detail) => {
      const name = detail.user?.name?.trim() || detail.user?.email?.trim() || 'Unknown contact';
      const hydratedAddress = hydratedAddressByDetailId[detail.id];
      const resolvedAddress = readUserDetailAddress(hydratedAddress) ?? readUserDetailAddress(detail);
      const userId = detail.user_id;
      const matters = userId ? (mattersByUserId.get(userId) ?? []) : [];
      const primaryMatter = pickPrimaryMatter(matters);
      const lastContactDays = computeLastContactDays(detail, now);
      const signal = deriveContactSignal({ lastContactDays, matters });
      return {
        id: detail.id,
        kind: 'client',
        userId,
        name,
        email: detail.user?.email ?? 'Unknown email',
        phone: detail.user?.phone ?? null,
        status: detail.status,
        addressDisplay: formatUserDetailAddressDisplay(resolvedAddress),
        matters,
        primaryMatter,
        lastContactDays,
        signal,
      };
    });
    if (isArchivedListRoute) {
      return peopleItems.filter((client) => client.status === 'archived');
    }
    const activePeople = statusFilter
      ? peopleItems.filter((client) => client.status === statusFilter)
      : peopleItems.filter((client) => client.status !== 'archived');
    if (isTeamListRoute) {
      if (!teamMembersLoaded) return [];
      return teamMembers;
    }
    if (isClientsListRoute) {
      return activePeople;
    }
    return teamMembersLoaded ? [...activePeople, ...teamMembers] : activePeople;
  }, [hydratedAddressByDetailId, isArchivedListRoute, isClientsListRoute, isTeamListRoute, mattersByUserId, now, pickPrimaryMatter, prefetchedItems, statusFilter, teamMembers, teamMembersLoaded]);

  const pendingClientInvitations = useMemo(
    () => practiceInvitations.filter((invitation) => normalizePracticeRole(invitation.role) === 'client' && invitation.status === 'pending'),
    [practiceInvitations]
  );
  const sortedPendingInvitations = useMemo(
    () => [...pendingClientInvitations].sort((a, b) => a.email.localeCompare(b.email)),
    [pendingClientInvitations]
  );
  const isTeamSelectionRoute = isTeamListRoute || selectedClientIdFromPath?.startsWith('team:') === true;
  const isCombinedPeopleRoute = !isClientsListRoute && !isTeamListRoute && !isArchivedListRoute;
  const clientsLoading = isPendingListRoute
    ? invitationsLoading
    : prefetchedLoading
    || (isTeamSelectionRoute && isFetchingMembers)
    || (isCombinedPeopleRoute && !teamMembersLoaded);
  const clientsError = isPendingListRoute
    ? invitationsError
    : prefetchedError
    ?? ((isCombinedPeopleRoute || isTeamListRoute) ? teamMembersError : null);

  // ── Apply filter chip + sort ──────────────────────────────────────────
  const filterCounts = useMemo(() => {
    const counts: Record<ContactFilterId, number> = {
      all: 0,
      needs_check_in: 0,
      on_retainer: 0,
      awaiting_docs: 0,
      closed: 0,
    };
    for (const c of clients) {
      counts.all += 1;
      if (c.kind !== 'client') continue;
      const days = c.lastContactDays ?? null;
      if (days !== null && days > 30) counts.needs_check_in += 1;
      const hasRetainer = (c.matters ?? []).some((m) => readRetainerAmount(m) !== null);
      if (hasRetainer) counts.on_retainer += 1;
      // "Awaiting docs" heuristic — leads with no open matters yet.
      // TODO(backend): replace with a real `awaiting_docs` flag from intake state.
      if (c.status === 'lead' && (c.matters ?? []).length === 0) counts.awaiting_docs += 1;
      if (c.status === 'inactive') counts.closed += 1;
    }
    return counts;
  }, [clients]);

  const filteredClients = useMemo(() => {
    if (activeFilter === 'all') return clients;
    return clients.filter((c) => {
      if (c.kind !== 'client') return false;
      const days = c.lastContactDays ?? null;
      switch (activeFilter) {
        case 'needs_check_in':
          return days !== null && days > 30;
        case 'on_retainer':
          return (c.matters ?? []).some((m) => readRetainerAmount(m) !== null);
        case 'awaiting_docs':
          return c.status === 'lead' && (c.matters ?? []).length === 0;
        case 'closed':
          return c.status === 'inactive';
        default:
          return true;
      }
    });
  }, [activeFilter, clients]);

  const sortedClients = useMemo(() => {
    const items = [...filteredClients];
    switch (sortMode) {
      case 'a_z':
        return items.sort((a, b) => a.name.localeCompare(b.name));
      case 'recent_activity':
        return items.sort((a, b) => {
          const ad = a.lastContactDays ?? Number.POSITIVE_INFINITY;
          const bd = b.lastContactDays ?? Number.POSITIVE_INFINITY;
          return ad - bd;
        });
      case 'sentiment':
        return items.sort((a, b) => {
          const ar = SENTIMENT_RANK[a.signal ?? 'calm'] ?? 0;
          const br = SENTIMENT_RANK[b.signal ?? 'calm'] ?? 0;
          if (br !== ar) return br - ar;
          return a.name.localeCompare(b.name);
        });
      case 'risk':
        // "Risk" prioritizes silent (long gap) + frustrated (open emergency).
        return items.sort((a, b) => {
          const aRisk = (a.signal === 'frustrated' ? 100 : 0)
            + (a.signal === 'silent' ? 50 : 0)
            + (a.lastContactDays ?? 0);
          const bRisk = (b.signal === 'frustrated' ? 100 : 0)
            + (b.signal === 'silent' ? 50 : 0)
            + (b.lastContactDays ?? 0);
          return bRisk - aRisk;
        });
      default:
        return items;
    }
  }, [filteredClients, sortMode]);

  const selectedClientFromList = useMemo<DirectoryRecord | null>(() => {
    if (!selectedClientIdFromPath) return null;
    return clients.find((client) => client.id === selectedClientIdFromPath) ?? null;
  }, [clients, selectedClientIdFromPath]);
  const selectedPendingInvitationFromList = useMemo(() => {
    if (!selectedPendingInvitationIdFromPath) return null;
    return sortedPendingInvitations.find((invitation) => invitation.id === selectedPendingInvitationIdFromPath) ?? null;
  }, [selectedPendingInvitationIdFromPath, sortedPendingInvitations]);
  const [selectedClientRemote, setSelectedClientRemote] = useState<DirectoryRecord | null>(null);
  const selectedClient = selectedClientFromList ?? selectedClientRemote;

  const selectedClientActivity = useMemo(() => {
    if (!selectedClient) return [];
    return memoTimeline[selectedClient.id] ?? [];
  }, [memoTimeline, selectedClient]);

  const handleSelectClient = useCallback((record: DirectoryRecord) => {
    const rawId = record.kind === 'team' ? (record.userId ?? '').trim() : record.id;
    if (!rawId) return;
    const nextPath = isArchivedListRoute
      ? `${basePath}/archived/${encodeURIComponent(rawId)}`
      : isTeamListRoute
        ? `${basePath}/team/${encodeURIComponent(rawId)}`
        : isClientsListRoute
          ? `${basePath}/clients/${encodeURIComponent(rawId)}`
          : record.kind === 'team'
            ? `${basePath}/team/${encodeURIComponent(rawId)}`
            : `${basePath}/${encodeURIComponent(rawId)}`;
    location.route(nextPath);
  }, [basePath, isArchivedListRoute, isClientsListRoute, isTeamListRoute, location]);

  const mapMemosToTimeline = useCallback((client: DirectoryRecord, memos: UserDetailMemoRecord[]): TimelineItem[] => {
    const withoutId = memos.filter((memo) => !memo.id);
    if (withoutId.length > 0) {
      console.warn('[Contacts] Skipping memos without id', { contactId: client.id, count: withoutId.length });
    }

    return memos.filter((memo) => Boolean(memo.id)).map((memo) => {
      const rawDate =
        memo.event_time ||
        memo.created_at ||
        memo.createdAt ||
        memo.updated_at ||
        memo.updatedAt ||
        new Date().toISOString();
      const comment = memo.content ?? '';
      const personName =
        memo.user?.name ??
        memo.user?.email ??
        'Team member';
      const date = formatDate(rawDate);
      return {
        id: memo.id as string,
        type: 'commented',
        person: {
          name: personName || 'Team member'
        },
        date,
        dateTime: rawDate,
        comment
      };
    });
  }, []);

  const refreshClientMemos = useCallback(async (client: DirectoryRecord) => {
    if (!activePracticeId) return;
    if (client.kind !== 'client') return;
    const memos = await listUserDetailMemos(activePracticeId, client.id);
    updateMemoTimeline((prev) => ({
      ...prev,
      [client.id]: mapMemosToTimeline(client, memos)
    }));
  }, [activePracticeId, mapMemosToTimeline, updateMemoTimeline]);

  useEffect(() => {
    if (!activePracticeId || !selectedClient || selectedClient.kind !== 'client') return;
    if (memoTimeline[selectedClient.id]) return;

    refreshClientMemos(selectedClient)
      .catch((error) => {
        console.error('[Contacts] Failed to load contact memos', error);
        updateMemoTimeline((prev) => ({
          ...prev,
          [selectedClient.id]: []
        }));
      });
  }, [activePracticeId, memoTimeline, refreshClientMemos, selectedClient, updateMemoTimeline]);

  useEffect(() => {
    if (!activePracticeId || !selectedClientIdFromPath) {
      setSelectedClientRemote(null);
      return;
    }
    if (selectedClientIdFromPath.startsWith('team:') || selectedClientIdFromPath.startsWith('pending:')) {
      setSelectedClientRemote(null);
      return;
    }
    if (selectedClientFromList) {
      setSelectedClientRemote(null);
      return;
    }
    const controller = new AbortController();
    getUserDetail(activePracticeId, selectedClientIdFromPath, { signal: controller.signal })
      .then((detail) => {
        if (controller.signal.aborted) return;
        if (!detail) {
          console.warn('[Contacts] Selected contact was not found', {
            practiceId: activePracticeId,
            contactId: selectedClientIdFromPath,
          });
          setSelectedClientRemote(null);
          return;
        }
        const name = detail.user?.name?.trim() || detail.user?.email?.trim() || 'Unknown contact';
        const hydratedAddress = hydratedAddressByDetailId[detail.id];
        const resolvedAddress = readUserDetailAddress(hydratedAddress) ?? readUserDetailAddress(detail);
        const userId = detail.user_id;
        const matters = userId ? (mattersByUserId.get(userId) ?? []) : [];
        const primaryMatter = pickPrimaryMatter(matters);
        const lastContactDays = computeLastContactDays(detail, now);
        const signal = deriveContactSignal({ lastContactDays, matters });
        setSelectedClientRemote({
          id: detail.id,
          kind: 'client' as const,
          userId,
          name,
          email: detail.user?.email ?? 'Unknown email',
          phone: detail.user?.phone ?? null,
          status: detail.status,
          addressDisplay: formatUserDetailAddressDisplay(resolvedAddress),
          matters,
          primaryMatter,
          lastContactDays,
          signal,
        });
      })
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'AbortError') return;
        console.error('[Contacts] Failed to load selected contact detail', error);
        setSelectedClientRemote(null);
      });
    return () => controller.abort();
  }, [activePracticeId, hydratedAddressByDetailId, mattersByUserId, now, pickPrimaryMatter, selectedClientFromList, selectedClientIdFromPath, teamMembersLoaded]);

  const handleMemoSubmit = useCallback(async (text: string) => {
    if (!activePracticeId || !selectedClient || selectedClient.kind !== 'client') return;
    if (memoSubmitting) return;

    setMemoSubmitting(true);
    try {
      await createUserDetailMemo(activePracticeId, selectedClient.id, { content: text });
      await refreshClientMemos(selectedClient);
    } catch (error) {
      console.error('[Contacts] Failed to create memo', error);
      showError('Could not add memo', 'Please try again.');
    } finally {
      setMemoSubmitting(false);
    }
  }, [activePracticeId, memoSubmitting, refreshClientMemos, selectedClient, showError]);

  const handleMemoEdit = useCallback(async (memoId: string, text: string) => {
    if (!activePracticeId || !selectedClient || selectedClient.kind !== 'client') return;
    if (memoActionId) return;
    setMemoActionId(memoId);
    try {
      await updateUserDetailMemo(activePracticeId, selectedClient.id, memoId, { content: text });
      await refreshClientMemos(selectedClient);
    } catch (error) {
      console.error('[Contacts] Failed to update memo', error);
      showError('Could not update memo', 'Please try again.');
    } finally {
      setMemoActionId(null);
    }
  }, [activePracticeId, memoActionId, refreshClientMemos, selectedClient, showError]);

  const handleMemoDelete = useCallback(async (memoId: string) => {
    if (!activePracticeId || !selectedClient || selectedClient.kind !== 'client') return;
    if (memoActionId) return;
    const confirmed = window.confirm('Delete this memo?');
    if (!confirmed) return;
    setMemoActionId(memoId);
    try {
      await deleteUserDetailMemo(activePracticeId, selectedClient.id, memoId);
      await refreshClientMemos(selectedClient);
    } catch (error) {
      console.error('[Contacts] Failed to delete memo', error);
      showError('Could not delete memo', 'Please try again.');
    } finally {
      setMemoActionId(null);
    }
  }, [activePracticeId, memoActionId, refreshClientMemos, selectedClient, showError]);

  const handleSendMessage = useCallback(async (client: DirectoryRecord) => {
    if (client.kind !== 'client') return;
    if (!activePracticeId) {
      showError('Could not start conversation', 'Practice context is required.');
      return;
    }
    if (!client.userId) {
      showError('Could not start conversation', 'This contact does not have a linked portal account.');
      return;
    }
    if (sendMessagePending) return;
    setSendMessagePending(true);
    try {
      let payload: { success?: boolean; data?: { id?: string }; error?: string };
      try {
        const result = await apiClient.post<{
          success?: boolean;
          data?: { id?: string };
          error?: string;
        }>(
          '/api/conversations',
          {
            participantUserIds: [client.userId],
            metadata: {
              source: 'contact_detail',
              personId: client.id,
              directMessage: true,
              threadMode: 'new',
            },
            practiceId: activePracticeId,
          },
          { params: { practiceId: activePracticeId } },
        );
        payload = result.data;
      } catch (apiError) {
        if (isHttpError(apiError)) {
          const errorData = apiError.response.data as { error?: string } | undefined;
          throw new Error(errorData?.error || `HTTP ${apiError.response.status}`);
        }
        throw apiError;
      }
      const conversationId = payload.data?.id;
      if (!payload.success || !conversationId) {
        throw new Error(payload.error || 'Failed to create conversation');
      }
      const conversationsBasePath = conversationsPath ?? (basePath.endsWith('/contacts') ? basePath.replace(/\/contacts$/, '/conversations') : null);
      if (!conversationsBasePath) {
        throw new Error('Unable to derive conversations path from basePath; provide `conversationsPath` prop if your basePath does not end with "/contacts"');
      }
      location.route(`${conversationsBasePath}/${encodeURIComponent(conversationId)}`);
    } catch (error) {
      console.error('[Contacts] Failed to start conversation from contact detail', error);
      showError('Could not start conversation', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setSendMessagePending(false);
    }
  }, [activePracticeId, basePath, location, sendMessagePending, showError, conversationsPath]);

  const handleOpenMatter = useCallback((matterId: string) => {
    const mattersBasePath = basePath.endsWith('/contacts')
      ? basePath.replace(/\/contacts$/, '/matters')
      : null;
    if (!mattersBasePath) return;
    location.route(`${mattersBasePath}/${encodeURIComponent(matterId)}`);
  }, [basePath, location]);

  const handleOpenAddClient = useCallback(() => {
    // Normalize to a leading-slash path so encoded returnTo is canonical
    const raw = typeof location.url === 'string' ? location.url : '';
    const normalizedUrl = raw.startsWith('/') ? raw : `/${raw}`;
    const returnTo = encodeURIComponent(normalizedUrl);
    location.route(`${basePath}/new?returnTo=${returnTo}`);
  }, [basePath, location]);
  const handleOpenTeamInvite = useCallback(() => {
    const settingsTeamPath = basePath.replace(/\/contacts$/, '/settings/practice/team');
    location.route(`${settingsTeamPath}?invite=1`);
  }, [basePath, location]);

  const origin = (typeof window !== 'undefined' && window.location)
    ? window.location.origin
    : '';

  const buildInvitationLink = useCallback((invitationId: string) => {
    const path = `/auth/accept-invitation?invitationId=${encodeURIComponent(invitationId)}`;
    return origin ? `${origin}${path}` : path;
  }, [origin]);

  const handleCopyPendingInvitationLink = useCallback(async (invitationId: string) => {
    const link = buildInvitationLink(invitationId);
    try {
      await navigator.clipboard.writeText(link);
      showSuccess('Invite link copied', link);
    } catch (error) {
      showError('Failed to copy invite link', error instanceof Error ? error.message : 'Unknown error');
    }
  }, [buildInvitationLink, showError, showSuccess]);

  const handleCancelPendingInvitation = useCallback(async (invitationId: string) => {
    try {
      await cancelInvitation(invitationId);
      if (selectedPendingInvitationIdFromPath === invitationId) {
        showSuccess('Invitation canceled', 'The pending invitation was successfully canceled');
        location.route(`${basePath}/pending`);
        return;
      }
      showSuccess('Invitation canceled', 'The pending invitation was successfully canceled');
    } catch (error) {
      showError('Failed to cancel invitation', error instanceof Error ? error.message : 'Unknown error');
    }
  }, [basePath, cancelInvitation, location, selectedPendingInvitationIdFromPath, showError, showSuccess]);

  const handleSelectPendingInvitation = useCallback((invitation: Invitation) => {
    location.route(`${basePath}/pending/${encodeURIComponent(invitation.id)}`);
  }, [basePath, location]);

  // ── Stats for header strip ───────────────────────────────────────────
  const totalActiveCount = useMemo(
    () => clients.filter((c) => c.kind === 'client' && c.status !== 'archived').length,
    [clients]
  );
  const awaitingReplyCount = useMemo(() => {
    // TODO(backend): replace with a real "days since lawyer's last outbound
    // message" derivation once the messages join is exposed per contact.
    // For now we proxy "awaiting reply" with "no contact activity in 7+ days".
    return clients.filter((c) => c.kind === 'client' && (c.lastContactDays ?? 0) > 7).length;
  }, [clients]);
  const atRiskCount = useMemo(
    () => clients.filter((c) => c.kind === 'client' && (c.signal === 'frustrated' || c.signal === 'silent')).length,
    [clients]
  );

  const headerStatCells: StatStripCell[] = [
    { label: 'Active', value: String(totalActiveCount) },
    { label: 'Awaiting reply', value: String(awaitingReplyCount), extraWarn: awaitingReplyCount > 0 },
    { label: 'At risk', value: String(atRiskCount), extraWarn: atRiskCount > 0 },
  ];

  // ── Ask submit ───────────────────────────────────────────────────────
  const handleAskSubmit = useCallback((query: string) => {
    // TODO(backend): wire to /api/practice/:id/clients/ask once the natural-
    // language clients-query endpoint (PracticeAssistantQueryEngine) exists.
    // Today the AIAnswerCard renders a grounded narration of the current
    // filter state so the chat-first shape is present end-to-end without
    // fabricating answers.
    setAskAnswer({ query });
  }, []);

  // ── Filter chip definitions (counts come from filterCounts memo) ─────
  const FILTER_CHIPS: ReadonlyArray<{ id: ContactFilterId; label: string; warn?: boolean }> = [
    { id: 'all', label: 'All' },
    { id: 'needs_check_in', label: 'Needs check-in', warn: true },
    { id: 'on_retainer', label: 'On retainer' },
    { id: 'awaiting_docs', label: 'Awaiting docs' },
    { id: 'closed', label: 'Closed' },
  ];

  const SORT_OPTIONS: ReadonlyArray<{ id: ContactSortId; label: string }> = [
    { id: 'a_z', label: 'A → Z' },
    { id: 'recent_activity', label: 'Recent activity' },
    { id: 'sentiment', label: 'Sentiment' },
    { id: 'risk', label: 'Risk' },
  ];

  // ── List panes ───────────────────────────────────────────────────────
  const directoryListPane = (
    <div className="h-full overflow-y-auto">
      {/* Header row — desktop only */}
      <div className="hidden border-b border-line-subtle bg-paper-2 px-[18px] py-2.5 font-mono text-[10px] uppercase tracking-[0.12em] text-dim md:grid md:grid-cols-[28px_minmax(0,1.8fr)_minmax(0,1.6fr)_minmax(0,1fr)_110px_100px] md:gap-4">
        <div />
        <div>Client</div>
        <div>Retainer</div>
        <div>Primary matter</div>
        <div>Last contact</div>
        <div>Signal</div>
      </div>

      {sortedClients.length === 0 ? (
        <div className="flex h-full min-h-[200px] items-center justify-center px-6 py-12 text-center">
          <p className="text-sm text-dim-2">
            {activeFilter === 'all'
              ? 'No contacts found.'
              : 'No contacts match this filter.'}
          </p>
        </div>
      ) : (
        sortedClients.map((client) => {
          const isSelected = client.id === selectedClient?.id;
          if (client.kind === 'team') {
            // Team rows use the simpler legacy row — directory grid is for clients.
            const nameParts = splitName(client.name);
            const normalizedTeamRole = normalizePracticeRole(client.teamRole);
            return (
              <InteractiveListItem
                key={client.id}
                onClick={() => handleSelectClient(client)}
                isSelected={isSelected}
                padding="px-4 py-3.5"
                className="flex-nowrap gap-4 rounded-none h-auto border-b border-line-subtle"
              >
                <Avatar name={client.name} size="md" className="text-ink" />
                <div className="min-w-0 flex-1 text-left">
                  <p className="text-sm text-ink truncate">
                    {nameParts.first ? (
                      <>
                        <span>{nameParts.first} </span>
                        <span className="font-semibold">{nameParts.last}</span>
                      </>
                    ) : (
                      <span className="font-semibold">{nameParts.last}</span>
                    )}
                  </p>
                  <p className="mt-0.5 text-xs text-dim-2 truncate">
                    Team member{normalizedTeamRole ? ` • ${getPracticeRoleLabel(normalizedTeamRole)}` : ''}
                  </p>
                </div>
              </InteractiveListItem>
            );
          }
          const matters = client.matters ?? [];
          const retainerMatter = matters.find((m) => readRetainerAmount(m) !== null) ?? client.primaryMatter ?? null;
          const retainerAmount = readRetainerAmount(retainerMatter);
          // We don't have a real retainer cap exposed yet — use a placeholder
          // percent so the bar still gives a sense of presence.
          // TODO(backend): expose retainer cap + current balance per matter
          // so this bar can become exact instead of presence-only.
          const retainerPercent = retainerAmount !== null ? 60 : null;
          const lastContactSource = client.lastContactDays !== null && client.primaryMatter?.updated_at
            ? `via ${formatRelativeTime(client.primaryMatter.updated_at)}`
            : null;
          const practiceArea = client.primaryMatter?.matter_type ?? null;
          return (
            <ClientDirectoryRow
              key={client.id}
              id={client.id}
              name={client.name}
              matterCount={matters.length}
              primaryMatter={client.primaryMatter ?? null}
              practiceArea={practiceArea}
              retainerAmount={retainerAmount}
              retainerPercent={retainerPercent}
              lastContactDays={client.lastContactDays ?? null}
              lastContactSource={lastContactSource}
              signal={client.signal ?? 'calm'}
              isSelected={isSelected}
              isUrgent={client.signal === 'frustrated'}
              onSelect={() => handleSelectClient(client)}
              onMessage={() => { void handleSendMessage(client); }}
              onCall={client.phone ? () => { window.location.href = `tel:${client.phone}`; } : undefined}
              onOpenMatters={(() => {
                const primary = client.primaryMatter;
                return primary ? () => handleOpenMatter(primary.id) : undefined;
              })()}
              onOpenPrimaryMatter={(matterId) => handleOpenMatter(matterId)}
            />
          );
        })
      )}

      {prefetchedLoadingMore ? (
        <div className="px-4 py-3 text-xs text-dim-2 text-center">
          <LoadingSpinner size="sm" ariaLabel={t('clients.loadingMore', { defaultValue: 'Loading more contacts' })} />
        </div>
      ) : null}
    </div>
  );

  const pendingInvitationListPane = (
    <div className="relative h-full min-h-0 overflow-hidden">
      <div className="h-full overflow-y-auto">
        <ul className="divide-y divide-line-subtle">
          {sortedPendingInvitations.map((invitation) => {
            const isSelected = invitation.id === selectedPendingInvitationFromList?.id;
            const roleLabel = getPracticeRoleLabel(normalizePracticeRole(invitation.role) ?? 'client');
            return (
              <li key={invitation.id}>
                <InteractiveListItem
                  onClick={() => handleSelectPendingInvitation(invitation)}
                  isSelected={isSelected}
                  padding="px-4 py-3.5"
                  className="flex-nowrap gap-4 rounded-none h-auto"
                >
                  <Avatar
                    name={invitation.email}
                    size="md"
                    className="text-ink"
                  />
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium text-ink">
                      {invitation.email}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-dim-2">
                      {roleLabel} invitation • Expires {formatDate(new Date(invitation.expiresAt))}
                    </p>
                  </div>
                </InteractiveListItem>
              </li>
            );
          })}
          {sortedPendingInvitations.length === 0 ? (
            <li className="p-6">
              <PendingEmptyState onInviteClient={handleOpenAddClient} />
            </li>
          ) : null}
        </ul>
      </div>
    </div>
  );

  const clientDetailBody = selectedClient ? (
    <ClientDetailPanel
      client={selectedClient}
      activity={selectedClientActivity}
      practiceId={activePracticeId}
      onAddMemo={handleMemoSubmit}
      memoSubmitting={memoSubmitting}
      onEditMemo={handleMemoEdit}
      onDeleteMemo={handleMemoDelete}
      memoActionId={memoActionId}
      onOpenMatter={handleOpenMatter}
      onSendMessage={selectedClient.kind === 'client' && selectedClient.userId
        ? () => { void handleSendMessage(selectedClient); }
        : undefined}
      sendMessagePending={sendMessagePending}
    />
  ) : (
    <WorkspacePlaceholderState
      icon={User}
      title="Invite a contact to get started"
      description="Invite clients or team members, then select them from the list to view details."
      primaryAction={{
        label: 'New Contact',
        onClick: handleOpenAddClient,
      }}
      secondaryAction={{
        label: 'Invite Team Member',
        onClick: handleOpenTeamInvite,
        variant: 'secondary',
      }}
    />
  );

  const pendingInvitationDetailBody = selectedPendingInvitationFromList ? (
    <PendingInvitationDetailPanel
      invitation={selectedPendingInvitationFromList}
      canManage={isAdmin}
      onCopyLink={handleCopyPendingInvitationLink}
      onCancelInvitation={handleCancelPendingInvitation}
    />
  ) : (
    <WorkspacePlaceholderState
      icon={User}
      title="Pending invitations"
      description="Select an invitation to review details and manage the invite."
    />
  );

  const detailConfig = isPendingListRoute
    ? {
        title: 'Pending invitation',
        body: pendingInvitationDetailBody,
        backHref: `${basePath}/pending`,
      }
    : {
        title: 'Contact details',
        body: clientDetailBody,
        backHref: isArchivedListRoute
          ? `${basePath}/archived`
          : isTeamListRoute
            ? `${basePath}/team`
              : isClientsListRoute
                ? `${basePath}/clients`
              : basePath,
      };

  const detailHeaderActions = selectedClient ? (
    <div className="flex items-center gap-2">
      {selectedClient.kind === 'client' ? (
        <Button
          variant="icon"
          size="icon-sm"
          onClick={() => { void handleSendMessage(selectedClient); }}
          disabled={!selectedClient.userId || sendMessagePending}
          title={!selectedClient.userId ? 'Messaging requires a linked portal account.' : 'Send message'}
          aria-label="Send message"
          icon={MessagesSquare} iconClassName="h-5 w-5"
        />
      ) : null}
      {selectedClient.kind === 'client' && selectedClient.phone ? (
        <Button
          variant="icon"
          size="icon-sm"
          title="Call"
          aria-label="Call"
          icon={Phone}
          iconClassName="h-5 w-5"
          onClick={() => {
            if (selectedClient.phone) window.location.href = `tel:${selectedClient.phone}`;
          }}
        />
      ) : null}
    </div>
  ) : null;

  const renderCenteredState = (children: ComponentChildren) => (
    <div className="h-full flex items-center justify-center">
      {children}
    </div>
  );

  const renderLoadingState = () => renderCenteredState(
    <LoadingBlock label={t('clients.loading', { defaultValue: 'Loading contacts...' })} />
  );

  const renderErrorState = (message: string | null) => renderCenteredState(
    <p className="text-sm text-dim-2">{message}</p>
  );

  const renderListPanel = ({
    loading,
    error,
    content,
    useEmptyMinHeight = false,
  }: {
    loading: boolean;
    error: string | null;
    content: ComponentChildren;
    useEmptyMinHeight?: boolean;
  }) => (
    <Panel className={cn(
      'list-panel-card-gradient min-h-0 flex-1 overflow-hidden',
      useEmptyMinHeight && 'min-h-[520px]'
    )}>
      {loading
        ? renderLoadingState()
        : error
          ? renderErrorState(error)
          : content}
    </Panel>
  );

  const renderDetailShell = ({
    title,
    backHref,
    body,
    showBack = false,
    leadingAction,
    actions,
  }: {
    title: string;
    backHref?: string;
    body: ComponentChildren;
    showBack?: boolean;
    leadingAction?: ComponentChildren;
    actions?: ComponentChildren;
  }) => (
    <div className="h-full min-h-0 overflow-hidden">
      <div className="h-full min-h-0 flex flex-col">
        <DetailHeader
          title={title}
          showBack={showBack}
          onBack={backHref ? () => location.route(backHref) : undefined}
          leadingAction={leadingAction}
          actions={actions}
        />
        <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4 sm:px-6 sm:pb-6">
          {body}
        </div>
      </div>
    </div>
  );

  // ── Filter row (chat-first; horizontally scrollable on mobile) ──────
  const renderFilterRow = () => (
    <div className="flex flex-nowrap items-center gap-2 overflow-x-auto border-b border-line-subtle py-3.5 sm:flex-wrap sm:overflow-x-visible">
      {FILTER_CHIPS.map((chip) => {
        const isOn = activeFilter === chip.id;
        const count = filterCounts[chip.id];
        return (
          <button
            key={chip.id}
            type="button"
            onClick={() => setActiveFilter(chip.id)}
            aria-pressed={isOn}
            className={cn(
              'inline-flex shrink-0 items-center gap-1.5 rounded-full border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-wider transition-colors',
              isOn
                ? 'border-ink bg-ink text-paper'
                : 'border-line-utility bg-card text-dim hover:border-line-emphasized hover:text-ink-2',
              chip.warn && !isOn && count > 0 && 'text-ink-2'
            )}
          >
            <span>{chip.label}</span>
            <span className={cn(
              'font-mono text-[10.5px] tabular-nums',
              isOn
                ? 'text-paper-2'
                : chip.warn && count > 0
                  ? 'text-neg'
                  : 'text-accent'
            )}>
              {count}
            </span>
          </button>
        );
      })}

      <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
        <span className="hidden font-mono text-[10px] uppercase tracking-wider text-dim sm:inline">sort</span>
        <div className="inline-flex">
          {SORT_OPTIONS.map((option, idx) => {
            const isOn = sortMode === option.id;
            const isFirst = idx === 0;
            const isLast = idx === SORT_OPTIONS.length - 1;
            return (
              <button
                key={option.id}
                type="button"
                onClick={() => setSortMode(option.id)}
                aria-pressed={isOn}
                className={cn(
                  'inline-flex shrink-0 items-center border px-2.5 py-1 font-mono text-[10.5px] uppercase tracking-wider transition-colors',
                  isOn
                    ? 'border-ink bg-ink text-paper'
                    : 'border-line-utility bg-card text-dim hover:border-line-emphasized hover:text-ink-2',
                  isFirst && 'rounded-l-full',
                  isLast && 'rounded-r-full',
                  !isLast && 'border-r-0'
                )}
              >
                {option.label}
              </button>
            );
          })}
        </div>
      </div>
    </div>
  );

  // ── chat-first full-page render (when nothing is selected) ────────────
  // Mobile reflow strategy:
  // - Page padding: px-4 mobile → px-8 sm → px-10 md
  // - H1: 32px mobile → 44px sm → 56px lg
  // - StatStrip: hidden < sm (active count still shown via crumb line)
  // - Filter chips: horizontal scroll on mobile (flex-nowrap overflow-x-auto)
  // - Sort options: also live in the same scrollable row (ml-auto on sm+)
  // - Directory list row: 2 cols (avatar+name) below md, 6 cols at md+
  // - Detail pane: separate route on mobile via hasSelectedDetail flag
  const renderChatFirstListPage = () => {
    const totalForCrumb = totalActiveCount;
    return (
      <div className="flex h-full min-h-0 flex-col overflow-auto">
        <div className="mx-auto w-full max-w-[1280px] px-4 pb-12 pt-6 sm:px-8 sm:pt-7 md:px-10">
          {/* ── Page header ─────────────────────────────────────────── */}
          <header className="flex flex-wrap items-end justify-between gap-3 border-b border-line-subtle pb-5 sm:gap-4">
            <div className="min-w-0">
              <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">
                Clients · {totalForCrumb} active
              </div>
              <h1 className="mt-1.5 font-[family-name:var(--serif)] text-[32px] font-normal leading-[1.05] tracking-[-0.022em] text-ink sm:text-[44px] sm:leading-none lg:text-[56px]">
                Clients you{' '}
                <em className="not-italic text-accent">haven&apos;t heard from.</em>
              </h1>
            </div>
            <StatStrip cells={headerStatCells} className="hidden sm:flex" />
          </header>

          {/* ── AI ask bar ──────────────────────────────────────────── */}
          <div className="mt-6">
            <AIAskBar
              sticky={false}
              placeholder="Find clients who haven't been heard from in 30 days..."
              suggestions={[
                'Who’s been silent the longest?',
                'Clients with overdue invoices',
                'Clients with active matters at risk',
              ]}
              onSubmit={handleAskSubmit}
            />
          </div>

          {/* ── AI answer card ─────────────────────────────────────── */}
          {askAnswer ? (
            <div className="mt-5">
              <AIAnswerCard
                groundingLabel={`Practice assistant · grounded in ${totalForCrumb} contacts · ${mattersData.items.length} matters · just now`}
                lede={
                  <>
                    {atRiskCount > 0 ? (
                      <>
                        <em>{atRiskCount}</em> {atRiskCount === 1 ? 'client is' : 'clients are'} flagged at risk — frustrated or silent for over 30 days.
                      </>
                    ) : awaitingReplyCount > 0 ? (
                      <>
                        <em>{awaitingReplyCount}</em> {awaitingReplyCount === 1 ? 'client is' : 'clients are'} awaiting a reply from you.
                      </>
                    ) : (
                      <>Everyone has been heard from recently. Quiet day.</>
                    )}
                  </>
                }
                body={
                  <p className="text-sm leading-relaxed text-ink-2">
                    You asked: <span className="italic text-ink">&ldquo;{askAnswer.query}&rdquo;</span>. Live natural-language clients search is coming soon — for now I&rsquo;ve applied the closest matching filter and surfaced the rows below.
                  </p>
                }
                actions={[
                  {
                    id: 'show-needs-check-in',
                    label: 'Show me as a list',
                    variant: 'primary',
                    onClick: () => {
                      setActiveFilter('needs_check_in');
                      setSortMode('recent_activity');
                      setAskAnswer(null);
                    },
                  },
                  {
                    id: 'message-all',
                    label: 'Message all',
                    onClick: () => {
                      // TODO(backend): stage a multi-recipient draft via the
                      // assistant when grounded clients-query is live.
                      setAskAnswer(null);
                    },
                  },
                  {
                    id: 'schedule-check-ins',
                    label: 'Schedule check-ins',
                    onClick: () => {
                      // TODO(backend): hand off to calendar bulk-schedule.
                      setAskAnswer(null);
                    },
                  },
                ]}
                sources={[
                  { table: 'contacts', count: clients.length },
                  { table: 'matters', count: mattersData.items.length },
                ]}
              />
            </div>
          ) : null}

          {/* ── Filter row ──────────────────────────────────────────── */}
          {renderFilterRow()}

          {/* ── Directory ───────────────────────────────────────────── */}
          <div className="mt-0 overflow-hidden rounded-b-md border border-t-0 border-line-subtle bg-card">
            {clientsLoading ? (
              <div className="p-6">{renderLoadingState()}</div>
            ) : clientsError ? (
              <div className="p-6">{renderErrorState(clientsError)}</div>
            ) : (
              directoryListPane
            )}
          </div>

          {/* Foot summary */}
          {!clientsLoading && !clientsError && (
            <div className="flex items-center justify-between border-x border-b border-line-subtle bg-paper-2 px-[18px] py-3 font-mono text-[10.5px] uppercase tracking-wider text-dim">
              <span>{sortedClients.length} shown</span>
              <span>
                sorted by{' '}
                <span className="font-[family-name:var(--sans)] text-sm font-medium normal-case tracking-normal text-ink-2">
                  {SORT_OPTIONS.find((o) => o.id === sortMode)?.label ?? sortMode}
                </span>
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  const listPanelContent = isPendingListRoute
    ? {
        content: <div className="min-h-0 flex-1">{pendingInvitationListPane}</div>,
        useEmptyMinHeight: true,
      }
    : {
        content: <div className="min-h-0 flex-1 overflow-y-auto">{directoryListPane}</div>,
        useEmptyMinHeight: sortedClients.length === 0 || clientsLoading || Boolean(clientsError),
      };

  const hasSelectedDetail = Boolean(selectedPendingInvitationIdFromPath || selectedClientIdFromPath);

  if (renderMode === 'listOnly') {
    if (!isPendingListRoute && !clientsLoading && !clientsError && sortedClients.length === 0) {
      return null;
    }

    return (
      <div className="h-full min-h-0 overflow-hidden flex flex-col gap-2">
        {/* Filter row above the list when in listOnly (split view's left pane). */}
        {!isPendingListRoute ? (
          <div className="px-3 pt-2 sm:px-4">
            {renderFilterRow()}
          </div>
        ) : null}
        {renderListPanel({
          loading: clientsLoading,
          error: clientsError,
          ...listPanelContent,
        })}
      </div>
    );
  }

  if (renderMode === 'detailOnly') {
    return (
      <>
        {renderDetailShell({
          title: detailConfig.title,
          body: detailConfig.body,
          leadingAction: detailHeaderLeadingAction,
          actions: detailHeaderActions,
        })}
      </>
    );
  }

  if (hasSelectedDetail) {
    return (
      <>
        {renderDetailShell({
          title: detailConfig.title,
          showBack: showDetailBackButton,
          backHref: detailConfig.backHref,
          body: detailConfig.body,
          leadingAction: detailHeaderLeadingAction,
          actions: detailHeaderActions,
        })}
      </>
    );
  }

  // ── chat-first full-page (no selection, full renderMode) ──────────────
  if (!isPendingListRoute) {
    return renderChatFirstListPage();
  }

  // Pending invitations: preserve legacy panel-list rendering.
  return (
    <>
      <div className="h-full min-h-0 overflow-hidden flex flex-col gap-2">
        {renderListPanel({
          loading: clientsLoading,
          error: clientsError,
          content: listPanelContent.content,
          useEmptyMinHeight: listPanelContent.useEmptyMinHeight,
        })}
      </div>
    </>
  );
};

import { useTranslation } from 'react-i18next';
import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { DocumentDuplicateIcon, XMarkIcon } from '@heroicons/react/24/outline';
import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
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
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { usePracticeTeam } from '@/shared/hooks/usePracticeTeam';
import { SettingsHelperText } from '@/features/settings/components/SettingsHelperText';
import {
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
import { AddContactDialog } from '@/shared/ui/contacts/AddContactDialog';
import {
  ChatBubbleLeftRightIcon,
  PlusIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { getWorkerApiUrl } from '@/config/urls';

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
    icon={UserIcon}
    title="No pending invites"
    description="Contact invites you send will appear here until they are accepted."
    primaryAction={{
      label: 'Invite contact',
      onClick: onInviteClient,
      icon: PlusIcon,
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
    <div className="h-full overflow-y-auto">
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-b from-accent-500/30 via-surface-overlay/70 to-surface-overlay/85 [--accent-foreground:var(--input-text)]">
          <div className="absolute inset-0 bg-gradient-to-t from-surface-base/45 via-transparent to-transparent" />
          <div className="relative px-6 pb-12 pt-10">
            <div className="flex flex-col items-center text-center">
              <Avatar name={invitation.email} size="xl" />
              <div className="mt-8 min-w-0 max-w-full">
                <h3 className="truncate pb-1 text-4xl font-semibold leading-[1.15] text-[rgb(var(--accent-foreground))] md:text-5xl">{invitation.email}</h3>
                <p className="mt-2 truncate pb-0.5 text-base leading-snug text-[rgb(var(--accent-foreground))]/80 md:text-lg">
                  Pending contact invitation
                </p>
              </div>
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-2xl">
          <div className="grid grid-cols-1 divide-y divide-line-glass/5 md:grid-cols-2 md:divide-x md:divide-y-0 md:divide-line-glass/5">
            <dl className="divide-y divide-line-glass/5">
              <div className="px-5 py-4">
                <dt className="text-sm font-medium text-input-placeholder">Email</dt>
                <dd className="mt-1 text-sm text-input-text">{invitation.email}</dd>
              </div>
              <div className="px-5 py-4">
                <dt className="text-sm font-medium text-input-placeholder">Role</dt>
                <dd className="mt-1 text-sm text-input-text">{roleLabel}</dd>
              </div>
            </dl>
            <dl className="divide-y divide-line-glass/5">
              <div className="px-5 py-4">
                <dt className="text-sm font-medium text-input-placeholder">Status</dt>
                <dd className="mt-1 text-sm text-input-text">Pending</dd>
              </div>
              <div className="px-5 py-4">
                <dt className="text-sm font-medium text-input-placeholder">Expires</dt>
                <dd className="mt-1 text-sm text-input-text">{formatDate(new Date(invitation.expiresAt))}</dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="px-1 py-1">
          <h3 className="text-sm font-semibold text-input-text">Invite actions</h3>
          <p className="mt-2 text-sm text-input-placeholder">
            Copy the invite link or cancel this invitation if it is no longer needed.
          </p>
          {canManage ? (
            <div className="mt-4 flex flex-wrap gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => { void onCopyLink(invitation.id); }}
                icon={DocumentDuplicateIcon}
                iconClassName="h-4 w-4"
              >
                Copy invite link
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => { void onCancelInvitation(invitation.id); }}
                icon={XMarkIcon}
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

const ClientDetailPanel = ({
  client,
  activity,
  practiceId,
  onAddMemo,
  memoSubmitting = false,
  onEditMemo,
  onDeleteMemo,
  memoActionId,
  paddingClassName = ''
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

  return (
    <div className={cn('h-full overflow-y-auto', paddingClassName)}>
      <div className="space-y-6">
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-b from-accent-500/30 via-surface-overlay/70 to-surface-overlay/85 [--accent-foreground:var(--input-text)]">
          <div className="absolute inset-0 bg-gradient-to-t from-surface-base/45 via-transparent to-transparent" />
          <div className="relative px-6 pb-12 pt-10">
            <div className="flex flex-col items-center text-center">
              <Avatar name={client.name} size="xl" />
              <div className="mt-8 min-w-0 max-w-full">
                <h3 className="truncate pb-1 text-4xl font-semibold leading-[1.15] text-[rgb(var(--accent-foreground))] md:text-5xl">{client.name}</h3>
                <p className="mt-2 truncate pb-0.5 text-base leading-snug text-[rgb(var(--accent-foreground))]/80 md:text-lg">{client.email}</p>
                {messagingHint ? (
                  <p className="mt-2 text-xs text-[rgb(var(--accent-foreground))]/70">{messagingHint}</p>
                ) : null}
              </div>
            </div>
          </div>
        </section>

        <section className="glass-panel rounded-2xl">
          <div className="grid grid-cols-1 divide-y divide-line-glass/5 md:grid-cols-2 md:divide-x md:divide-y-0 md:divide-line-glass/5">
            <dl className="divide-y divide-line-glass/5">
              <div className="px-5 py-4">
                <dt className="text-sm font-medium text-input-placeholder">Email</dt>
                <dd className="mt-1 text-sm text-input-text">{client.email}</dd>
              </div>
              <div className="px-5 py-4">
                <dt className="text-sm font-medium text-input-placeholder">Phone</dt>
                <dd className="mt-1 text-sm text-input-text">{isClientRecord ? formatPhoneNumber(client.phone) : 'Not provided'}</dd>
              </div>
            </dl>
            <dl className="divide-y divide-line-glass/5">
              <div className="px-5 py-4">
                <dt className="text-sm font-medium text-input-placeholder">Address</dt>
                <dd className="mt-1 text-sm text-input-text">{client.addressDisplay ?? 'Not provided'}</dd>
              </div>
              <div className="px-5 py-4">
                <dt className="text-sm font-medium text-input-placeholder">
                  {isClientRecord ? 'Relationship status' : 'Team role'}
                </dt>
                <dd className="mt-1 text-sm text-input-text">
                  {isClientRecord ? relationshipLabel : teamRoleLabel}
                </dd>
              </div>
            </dl>
          </div>
        </section>

        <section className="px-1 py-1">
          <h3 className="text-sm font-semibold text-input-text">
            {isClientRecord ? 'Recent activity' : 'Team access'}
          </h3>
          <div className="mt-4">
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
              <p className="text-sm text-input-placeholder">
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
  onDetailInspector,
  detailInspectorOpen = false,
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
  onDetailInspector?: () => void;
  detailInspectorOpen?: boolean;
  detailHeaderLeadingAction?: ComponentChildren;
  showDetailBackButton?: boolean;
}) => {
  const { t } = useTranslation();
  const location = useLocation();
  const { currentPractice } = usePracticeManagement();
  const { session, activeMemberRole } = useSessionContext();
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

  const pathSuffix = location.path.startsWith(basePath) ? location.path.slice(basePath.length) : '';
  const pathSegments = pathSuffix.replace(/^\/+/, '').split('/').filter(Boolean);
  const isAddClientOpen = location.query?.create === '1';
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
  const listRef = useRef<HTMLDivElement>(null);
  const [currentLetter, setCurrentLetter] = useState('');
  const activePracticeId = routePracticeId === undefined ? (currentPractice?.id ?? null) : routePracticeId;
  const {
    invitations: practiceInvitations,
    isLoading: invitationsLoading,
    error: invitationsError,
    cancelInvitation,
    refetch: refetchPendingInvitations,
  } = usePracticeInvitations(activePracticeId);
  const {
    members: teamMembersData,
    isLoaded: teamMembersLoaded,
    isLoading: isFetchingMembers,
    error: teamMembersError,
  } = usePracticeTeam(activePracticeId, session?.user?.id ?? null, { enabled: Boolean(activePracticeId) });

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
      // remove in-flight flags for completed candidates
      hydrationInFlightRef.current = { ...hydrationInFlightRef.current };
      candidates.forEach((detail) => {
        delete hydrationInFlightRef.current[detail.id];
      });
      if (Object.keys(updates).length === 0) return;
      setHydratedAddressByDetailId((prev) => ({ ...prev, ...updates }));
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
  }, [activePracticeId, hydratedAddressByDetailId, prefetchedItems]);
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
  const clients = useMemo<DirectoryRecord[]>(() => {
    const peopleItems: DirectoryRecord[] = prefetchedItems.map((detail) => {
      const name = detail.user?.name?.trim() || detail.user?.email?.trim() || 'Unknown contact';
      const hydratedAddress = hydratedAddressByDetailId[detail.id];
      const resolvedAddress = readUserDetailAddress(hydratedAddress) ?? readUserDetailAddress(detail);
      return {
        id: detail.id,
        kind: 'client',
        userId: detail.user_id,
        name,
        email: detail.user?.email ?? 'Unknown email',
        phone: detail.user?.phone ?? null,
        status: detail.status,
        addressDisplay: formatUserDetailAddressDisplay(resolvedAddress)
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
  }, [hydratedAddressByDetailId, isArchivedListRoute, isClientsListRoute, isTeamListRoute, prefetchedItems, statusFilter, teamMembers, teamMembersLoaded]);
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
  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => a.name.localeCompare(b.name)),
    [clients]
  );
  const groupedClients = useMemo(() => {
    return sortedClients.reduce<Record<string, DirectoryRecord[]>>((acc, client) => {
      const trimmedName = (client.name || '').trim() || (client.email || 'Unknown contact');
      const letter = (trimmedName.charAt(0) || '#').toUpperCase();
      if (!acc[letter]) acc[letter] = [];
      acc[letter].push(client);
      return acc;
    }, {});
  }, [sortedClients]);
  const letters = useMemo(() => Object.keys(groupedClients).sort(), [groupedClients]);
  const activeLetter = (currentLetter && letters.includes(currentLetter)) ? currentLetter : (letters[0] ?? '');

  const selectedClientFromList = useMemo<DirectoryRecord | null>(() => {
    if (!selectedClientIdFromPath) return null;
    return sortedClients.find((client) => client.id === selectedClientIdFromPath) ?? null;
  }, [selectedClientIdFromPath, sortedClients]);
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
          setSelectedClientRemote(null);
          return;
        }
        const name = detail.user?.name?.trim() || detail.user?.email?.trim() || 'Unknown contact';
        const hydratedAddress = hydratedAddressByDetailId[detail.id];
        const resolvedAddress = readUserDetailAddress(hydratedAddress) ?? readUserDetailAddress(detail);
        setSelectedClientRemote({
          id: detail.id,
          kind: 'client' as const,
          userId: detail.user_id,
          name,
          email: detail.user?.email ?? 'Unknown email',
          phone: detail.user?.phone ?? null,
          status: detail.status,
          addressDisplay: formatUserDetailAddressDisplay(resolvedAddress)
        });
      })
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'AbortError') return;
        console.error('[Contacts] Failed to load selected contact detail', error);
        setSelectedClientRemote(null);
      });
    return () => controller.abort();
  }, [activePracticeId, hydratedAddressByDetailId, selectedClientFromList, selectedClientIdFromPath, teamMembersLoaded]);

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
      const endpoint = new URL('/api/conversations', getWorkerApiUrl());
      endpoint.searchParams.set('practiceId', activePracticeId);
      const response = await fetch(endpoint.toString(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          participantUserIds: [client.userId],
          metadata: {
            source: 'contact_detail',
            personId: client.id,
            directMessage: true,
            threadMode: 'new'
          },
          practiceId: activePracticeId,
        }),
      });
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(errorData.error || `HTTP ${response.status}`);
      }
      const payload = await response.json() as {
        success?: boolean;
        data?: { id?: string };
        error?: string;
      };
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

  const handleOpenAddClient = useCallback(() => {
    location.route(`${location.path}?create=1`);
  }, [location]);
  const handleOpenTeamInvite = useCallback(() => {
    const settingsTeamPath = basePath.replace(/\/contacts$/, '/settings/practice/team');
    location.route(`${settingsTeamPath}?invite=1`);
  }, [basePath, location]);

  const handleCloseAddClient = useCallback(() => {
    location.route(location.path);
  }, [location]);

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
      showSuccess('Invitation canceled', 'The pending invitation was successfully canceled');
      if (selectedPendingInvitationIdFromPath === invitationId) {
        location.route(`${basePath}/pending`);
      }
    } catch (error) {
      showError('Failed to cancel invitation', error instanceof Error ? error.message : 'Unknown error');
    }
  }, [basePath, cancelInvitation, location, selectedPendingInvitationIdFromPath, showError, showSuccess]);

  const handleSelectPendingInvitation = useCallback((invitation: Invitation) => {
    location.route(`${basePath}/pending/${encodeURIComponent(invitation.id)}`);
  }, [basePath, location]);

  const clientListPane = (
    <div className="relative h-full min-h-0 overflow-hidden">
      <div ref={listRef} className="h-full overflow-y-auto">
        <ul>
          {letters.map((letter) => (
            <li key={letter} data-letter={letter}>
              <div className="sticky top-0 z-10 bg-surface-collection/80 backdrop-blur-sm px-4 py-1.5 text-xs font-semibold text-input-placeholder border-y border-line-glass/10">
                {letter}
              </div>
              {groupedClients[letter].map((client) => {
                const isSelected = client.id === selectedClient?.id;
                const nameParts = splitName(client.name);
                const normalizedTeamRole = normalizePracticeRole(client.teamRole);
                return (
                  <InteractiveListItem
                    key={client.id}
                    onClick={() => handleSelectClient(client)}
                    isSelected={isSelected}
                    padding="px-4 py-3.5"
                    className="flex-nowrap gap-4 rounded-none h-auto"
                  >
                    <Avatar
                      name={client.name}
                      size="md"
                      className="text-input-text"
                    />
                    <div className="min-w-0 flex-1 text-left">
                      <p className="text-sm text-input-text truncate">
                        {nameParts.first ? (
                          <>
                            <span>{nameParts.first} </span>
                            <span className="font-semibold">{nameParts.last}</span>
                          </>
                        ) : (
                          <span className="font-semibold">{nameParts.last}</span>
                        )}
                      </p>
                      <p className="mt-0.5 text-xs text-input-placeholder truncate">
                        {client.kind === 'team'
                          ? `Team member${normalizedTeamRole ? ` • ${getPracticeRoleLabel(normalizedTeamRole)}` : ''}`
                          : (client.status ? STATUS_LABELS[client.status] : 'Client')}
                      </p>
                    </div>
                  </InteractiveListItem>
                );
              })}
            </li>
          ))}
          {prefetchedLoadingMore ? (
            <li className="px-4 py-3 text-xs text-input-placeholder text-center">
              <LoadingSpinner size="sm" ariaLabel={t('clients.loadingMore', { defaultValue: 'Loading more contacts' })} />
            </li>
          ) : null}
        </ul>
      </div>
      {letters.length > 0 ? (
        <div className="pointer-events-auto absolute right-1 top-1/2 z-20 -translate-y-1/2 hidden md:flex flex-col items-center gap-1 text-[11px] font-medium text-input-placeholder border border-line-utility bg-surface-workspace/80">
          {letters.map((letter) => (
            <Button
              key={letter}
              variant="ghost"
              size="sm"
              onClick={() => {
                const container = listRef.current;
                if (!container) return;
                const target = container.querySelector<HTMLElement>(`[data-letter="${letter}"]`);
                if (target) {
                  container.scrollTo({ top: target.offsetTop, behavior: 'smooth' });
                }
              }}
              className={cn(
                'relative h-4 w-4 min-h-0 min-w-0 p-0 text-[11px] flex items-center justify-center rounded-full transition-colors',
                "before:absolute before:-inset-3.5 before:content-['']",
                activeLetter === letter
                  ? 'text-accent-foreground font-bold bg-accent-500'
                  : 'text-input-placeholder hover:text-input-text hover:bg-surface-utility/40'
              )}
            >
              {letter}
            </Button>
          ))}
        </div>
      ) : null}
    </div>
  );
  const pendingInvitationListPane = (
    <div className="relative h-full min-h-0 overflow-hidden">
      <div className="h-full overflow-y-auto">
        <ul className="divide-y divide-line-glass/10">
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
                    className="text-input-text"
                  />
                  <div className="min-w-0 flex-1 text-left">
                    <p className="truncate text-sm font-medium text-input-text">
                      {invitation.email}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-input-placeholder">
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

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    let rafId: number | null = null;
    const updateCurrent = () => {
      const sections = Array.from(container.querySelectorAll<HTMLElement>('[data-letter]'));
      if (sections.length === 0) return;
      const scrollPosition = container.scrollTop + 4;
      let nextLetter = sections[0].dataset.letter ?? '';
      for (const section of sections) {
        if (section.offsetTop <= scrollPosition) {
          nextLetter = section.dataset.letter ?? nextLetter;
        } else {
          break;
        }
      }
      setCurrentLetter((prev) => (prev === nextLetter ? prev : nextLetter));
    };
    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updateCurrent();
      });
    };
    container.addEventListener('scroll', handleScroll);
    updateCurrent();
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [letters]);

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
    />
  ) : (
    <WorkspacePlaceholderState
      icon={UserIcon}
      title="Invite a contact to get started"
      description="Invite clients or team members, then select them from the list to view details."
      primaryAction={{
        label: 'Invite contact',
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
      icon={UserIcon}
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
          icon={ChatBubbleLeftRightIcon} iconClassName="h-5 w-5"
        />
      ) : null}
    </div>
  ) : null;

  const addClientModal = (
    <AddContactDialog
      practiceId={activePracticeId}
      isOpen={isAddClientOpen}
      onClose={handleCloseAddClient}
      onSuccess={isPendingListRoute ? () => void refetchPendingInvitations() : undefined}
    />
  );

  const renderCenteredState = (children: ComponentChildren) => (
    <div className="h-full flex items-center justify-center">
      {children}
    </div>
  );

  const renderLoadingState = () => renderCenteredState(
    <LoadingBlock label={t('clients.loading', { defaultValue: 'Loading contacts...' })} />
  );

  const renderErrorState = (message: string | null) => renderCenteredState(
    <p className="text-sm text-input-placeholder">{message}</p>
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
    inspectorOpen,
  }: {
    title: string;
    backHref?: string;
    body: ComponentChildren;
    showBack?: boolean;
    leadingAction?: ComponentChildren;
    actions?: ComponentChildren;
    inspectorOpen?: boolean;
  }) => (
    <div className="h-full min-h-0 overflow-hidden">
      <div className="h-full min-h-0 flex flex-col">
        <DetailHeader
          title={title}
          showBack={showBack}
          onBack={backHref ? () => location.route(backHref) : undefined}
          leadingAction={leadingAction}
          actions={actions}
          onInspector={onDetailInspector}
          inspectorOpen={inspectorOpen}
        />
        <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4 sm:px-6 sm:pb-6">
          {body}
        </div>
      </div>
    </div>
  );
  const listPanelContent = isPendingListRoute
    ? {
        content: sortedPendingInvitations.length === 0
          ? <PendingEmptyState onInviteClient={handleOpenAddClient} />
          : <div className="min-h-0 flex-1">{pendingInvitationListPane}</div>,
        useEmptyMinHeight: true,
      }
    : {
        content: sortedClients.length === 0
          ? <div className="h-full flex-1 items-center justify-center flex"><p className="text-sm text-input-placeholder">No contacts found.</p></div>
          : <div className="min-h-0 flex-1">{clientListPane}</div>,
        useEmptyMinHeight: sortedClients.length === 0 || clientsLoading || Boolean(clientsError),
      };
  const hasSelectedDetail = Boolean(selectedPendingInvitationIdFromPath || selectedClientIdFromPath);

  if (renderMode === 'listOnly') {
    if (!isPendingListRoute && !clientsLoading && !clientsError && sortedClients.length === 0) {
      return null;
    }

    return (
      <div className="h-full min-h-0 overflow-hidden flex flex-col gap-2">
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
          inspectorOpen: detailInspectorOpen,
        })}
        {addClientModal}
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
          inspectorOpen: detailInspectorOpen,
        })}
        {addClientModal}
      </>
    );
  }

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
      {addClientModal}
    </>
  );
};

import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
import { Panel } from '@/shared/ui/layout/Panel';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { Button } from '@/shared/ui/Button';
import Modal from '@/shared/components/Modal';
import { Avatar } from '@/shared/ui/profile';
import { FormActions } from '@/shared/ui/form';
import { AddressExperienceForm } from '@/shared/ui/address/AddressExperienceForm';
import { cn } from '@/shared/utils/cn';
import { ActivityTimeline, type TimelineItem } from '@/shared/ui/activity/ActivityTimeline';
import { formatDate } from '@/shared/utils/dateTime';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { useToastContext } from '@/shared/contexts/ToastContext';
import type { Address } from '@/shared/types/address';
import {
  listUserDetailMemos,
  createUserDetailMemo,
  updateUserDetailMemo,
  deleteUserDetailMemo,
  createUserDetail,
  getUserDetail,
  getUserDetailAddressById,
  type UserDetailMemoRecord
} from '@/shared/lib/apiClient';
import { invalidateClientsForPractice } from '@/shared/stores/clientsStore';
import {
  PERSON_RELATIONSHIP_STATUS_LABELS,
  type PersonRecord,
  type PersonRelationshipStatus,
} from '@/shared/domain/people';
import { getPracticeRoleLabel, normalizePracticeRole } from '@/shared/utils/practiceRoles';
import {
  ChatBubbleLeftRightIcon,
  PlusIcon,
  UserIcon,
} from '@heroicons/react/24/outline';
import { getWorkerApiUrl } from '@/config/urls';

const STATUS_LABELS = PERSON_RELATIONSHIP_STATUS_LABELS;

type DirectoryRecord = {
  id: string;
  kind: 'client' | 'team';
  userId: string | null;
  name: string;
  email: string;
  phone?: string | null;
  status?: PersonRelationshipStatus;
  teamRole?: string | null;
  addressDisplay?: string | null;
};

type ClientFormState = {
  name: string;
  email: string;
  phone: string;
  status: PersonRelationshipStatus;
  currency: string;
  address?: Address;  // Now uses Address object like intake form!
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

const splitName = (fullName: string) => {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) {
    return { first: '', last: '' };
  }
  if (parts.length === 1) {
    return { first: '', last: parts[0] };
  }
  const last = parts[parts.length - 1];
  const first = parts.slice(0, -1).join(' ');
  return { first, last };
};

const formatAddressDisplay = (raw: unknown): string | null => {
  if (!raw || typeof raw !== 'object') return null;
  const value = raw as Record<string, unknown>;
  const line1 = typeof value.address === 'string'
    ? value.address
    : typeof value.line1 === 'string'
      ? value.line1
      : '';
  const line2 = typeof value.apartment === 'string'
    ? value.apartment
    : typeof value.line2 === 'string'
      ? value.line2
      : '';
  const city = typeof value.city === 'string' ? value.city : '';
  const state = typeof value.state === 'string' ? value.state : '';
  const postalCode = typeof value.postalCode === 'string'
    ? value.postalCode
    : typeof value.postal_code === 'string'
      ? value.postal_code
      : '';
  const country = typeof value.country === 'string' ? value.country : '';
  const parts = [line1, line2, [city, state, postalCode].filter(Boolean).join(' '), country]
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(', ') : null;
};

const resolveUserDetailAddressValue = (detail: PersonRecord): unknown => {
  const detailRecord = detail as unknown as Record<string, unknown>;
  const nestedAddress = detailRecord.address;
  if (nestedAddress && typeof nestedAddress === 'object') {
    return nestedAddress;
  }

  // Some user-details responses include flattened address fields instead of a nested object.
  const flattened: Record<string, unknown> = {};
  const line1 = typeof detailRecord.line1 === 'string'
    ? detailRecord.line1
    : (typeof detailRecord.address === 'string' ? detailRecord.address : undefined);
  if (line1) flattened.line1 = line1;
  if (typeof detailRecord.apartment === 'string') flattened.apartment = detailRecord.apartment;
  if (typeof detailRecord.line2 === 'string') flattened.line2 = detailRecord.line2;
  if (typeof detailRecord.city === 'string') flattened.city = detailRecord.city;
  if (typeof detailRecord.state === 'string') flattened.state = detailRecord.state;
  if (typeof detailRecord.postal_code === 'string') flattened.postal_code = detailRecord.postal_code;
  if (typeof detailRecord.postalCode === 'string') flattened.postalCode = detailRecord.postalCode;
  if (typeof detailRecord.country === 'string') flattened.country = detailRecord.country;

  return Object.keys(flattened).length > 0 ? flattened : null;
};

const hasRenderableAddressFields = (raw: unknown): boolean => {
  if (!raw || typeof raw !== 'object') return false;
  const value = raw as Record<string, unknown>;
  return typeof value.address === 'string'
    || typeof value.line1 === 'string'
    || typeof value.city === 'string'
    || typeof value.state === 'string'
    || typeof value.postalCode === 'string'
    || typeof value.postal_code === 'string'
    || typeof value.country === 'string';
};

const EmptyState = ({ onAddClient }: { onAddClient: () => void }) => (
  <WorkspacePlaceholderState
    icon={UserIcon}
    title="No people yet"
    description="People are usually created from intake, conversation, and matter workflows."
    caption="Backoffice only: manual person creation is intentionally low-emphasis."
    primaryAction={{
      label: 'New Person',
      onClick: onAddClient,
      icon: PlusIcon,
    }}
  />
);

const CLIENT_FIELDS = ['name', 'email', 'phone', 'status', 'currency', 'address'] as const;
const CLIENT_REQUIRED = ['name', 'email'] as const;

const ClientForm = ({
  values,
  onChange,
  disabled = false
}: {
  values: ClientFormState;
  onChange: <K extends keyof ClientFormState>(field: K, value: ClientFormState[K]) => void;
  disabled?: boolean;
}) => (
  <AddressExperienceForm
    initialValues={values}
    fields={[...CLIENT_FIELDS]}
    required={[...CLIENT_REQUIRED]}
    onValuesChange={(updates) => {
      Object.entries(updates).forEach(([key, value]) => {
        onChange(key as keyof ClientFormState, value as ClientFormState[keyof ClientFormState]);
      });
    }}
    showSubmitButton={false}
    variant="plain"
    disabled={disabled}
  />
);

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
        <section className="relative overflow-hidden rounded-[28px] bg-gradient-to-b from-accent-500/30 via-surface-glass/70 to-surface-overlay/85 [--accent-foreground:var(--input-text)]">
          <div className="absolute inset-0 bg-gradient-to-t from-surface-base/45 via-transparent to-white/10" />
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

export const PracticeClientsPage = ({
  practiceId: routePracticeId,
  basePath = '/practice/people',
  renderMode = 'full',
  statusFilter = null,
  prefetchedItems = [],
  prefetchedLoading = false,
  prefetchedLoadingMore = false,
  prefetchedError = null,
  onRefetchList,
  onDetailInspector,
  detailInspectorOpen = false,
  detailHeaderLeadingAction,
  showDetailBackButton = true,
}: {
  practiceId?: string | null;
  basePath?: string;
  renderMode?: 'full' | 'listOnly' | 'detailOnly';
  statusFilter?: PersonRelationshipStatus | null;
  prefetchedItems?: PersonRecord[];
  prefetchedLoading?: boolean;
  prefetchedLoadingMore?: boolean;
  prefetchedError?: string | null;
  onRefetchList?: (signal?: AbortSignal) => Promise<void>;
  onDetailInspector?: () => void;
  detailInspectorOpen?: boolean;
  detailHeaderLeadingAction?: ComponentChildren;
  showDetailBackButton?: boolean;
}) => {
  const location = useLocation();
  const { currentPractice, fetchMembers, getMembers } = usePracticeManagement();
  const { showError, showSuccess } = useToastContext();
  const [memoTimeline, setMemoTimeline] = useState<Record<string, TimelineItem[]>>({});
  const [memoSubmitting, setMemoSubmitting] = useState(false);
  const [memoActionId, setMemoActionId] = useState<string | null>(null);
  const [sendMessagePending, setSendMessagePending] = useState(false);
  const [isFetchingMembers, setIsFetchingMembers] = useState(false);
  const [teamMembersLoaded, setTeamMembersLoaded] = useState(false);
  const [teamMembersError, setTeamMembersError] = useState<string | null>(null);
  const [hydratedAddressByDetailId, setHydratedAddressByDetailId] = useState<Record<string, unknown>>({});
  const processedDetailIdsRef = useRef<Set<string>>(new Set());
  const [addClientSubmitting, setAddClientSubmitting] = useState(false);
  const [addClientError, setAddClientError] = useState<string | null>(null);

  const defaultClientFormState: ClientFormState = {
    name: '',
    email: '',
    phone: '',
    status: 'lead' as PersonRelationshipStatus,
    currency: 'usd',
    address: undefined,  // Now uses Address object like intake form!
  };

  const [addClientForm, setAddClientForm] = useState<ClientFormState>(defaultClientFormState);

  const pathSuffix = location.path.startsWith(basePath) ? location.path.slice(basePath.length) : '';
  const pathSegments = pathSuffix.replace(/^\/+/, '').split('/').filter(Boolean);
  const isAddClientOpen = location.query?.create === '1';
  const peopleScope = (() => {
    if (pathSegments[0] === 'archived') return 'archived';
    if (pathSegments[0] === 'team') return 'team';
    if (pathSegments[0] === 'clients') return 'clients';
    return 'all';
  })();
  const isArchivedListRoute = peopleScope === 'archived';
  const isTeamListRoute = peopleScope === 'team';
  const isClientsListRoute = peopleScope === 'clients';
  const selectedClientIdFromPath = useMemo(() => {
    const selectedSegment = isArchivedListRoute || isTeamListRoute || isClientsListRoute
      ? pathSegments[1]
      : pathSegments[0];
    if (!selectedSegment) return null;
    try {
      const decoded = decodeURIComponent(selectedSegment);
      if (isTeamListRoute) {
        return `team:${decoded}`;
      }
      return decoded;
    } catch (e) {
      console.warn('[People] Failed to decode client ID from path', e);
      return null;
    }
  }, [isArchivedListRoute, isClientsListRoute, isTeamListRoute, pathSegments]);
  const listRef = useRef<HTMLDivElement>(null);
  const [currentLetter, setCurrentLetter] = useState('');
  const activePracticeId = routePracticeId === undefined ? (currentPractice?.id ?? null) : routePracticeId;

  const buildClientRecord = useCallback((detail: PersonRecord): DirectoryRecord => {
    const name = detail.user?.name?.trim() || detail.user?.email?.trim() || 'Unknown person';
    const hydratedAddress = hydratedAddressByDetailId[detail.id];
    const resolvedAddress = hasRenderableAddressFields(hydratedAddress)
      ? hydratedAddress
      : resolveUserDetailAddressValue(detail);
    return {
      id: detail.id,
      kind: 'client',
      userId: detail.user_id,
      name,
      email: detail.user?.email ?? 'Unknown email',
      phone: detail.user?.phone ?? null,
      status: detail.status,
      addressDisplay: formatAddressDisplay(resolvedAddress)
    };
  }, [hydratedAddressByDetailId]);
  useEffect(() => {
    processedDetailIdsRef.current = new Set();
  }, [activePracticeId]);
  useEffect(() => {
    if (!activePracticeId) return;

    const candidates = prefetchedItems.filter((detail) => {
      if (processedDetailIdsRef.current.has(detail.id)) return false;
      const hasAddressId = Boolean((detail as Record<string, unknown>).address_id ?? (detail as Record<string, unknown>).addressId);
      if (!hasAddressId) return false;
      const inlineAddress = resolveUserDetailAddressValue(detail);
      return !hasRenderableAddressFields(inlineAddress);
    });

    if (candidates.length === 0) return;

    let cancelled = false;
    void Promise.allSettled(
      candidates.map(async (detail) => {
        const hydrated = await getUserDetail(activePracticeId, detail.id);
        let resolved = hydrated ? resolveUserDetailAddressValue(hydrated) : null;
        if (hydrated && !hasRenderableAddressFields(resolved)) {
          const hydratedRecord = hydrated as unknown as Record<string, unknown>;
          const addressId = typeof hydratedRecord.address_id === 'string'
            ? hydratedRecord.address_id
            : (typeof hydratedRecord.addressId === 'string' ? hydratedRecord.addressId : '');
          if (addressId.trim().length > 0) {
            const fetchedAddress = await getUserDetailAddressById(activePracticeId, addressId.trim());
            if (fetchedAddress && hasRenderableAddressFields(fetchedAddress)) {
              resolved = fetchedAddress;
            }
          }
        }
        if (!resolved || !hasRenderableAddressFields(resolved)) return null;
        return { id: detail.id, address: resolved };
      })
    ).then((results) => {
      if (cancelled) return;
      const updates: Record<string, unknown> = {};
      results.forEach((result, index) => {
        const detailId = candidates[index]?.id;
        if (detailId) {
          processedDetailIdsRef.current.add(detailId);
        }
        if (result.status === 'rejected') {
          console.error('[People] Failed to hydrate person address', {
            detailId,
            reason: result.reason
          });
          return;
        }
        if (!result.value) return;
        updates[result.value.id] = result.value.address;
      });
      if (Object.keys(updates).length === 0) return;
      setHydratedAddressByDetailId((prev) => ({ ...prev, ...updates }));
    });

    return () => {
      cancelled = true;
    };
  }, [activePracticeId, prefetchedItems]);
  const teamMembers = useMemo(() => {
    if (!activePracticeId) return [];
    return getMembers(activePracticeId)
      .filter((member) => member.role !== 'client')
      .map<DirectoryRecord>((member) => ({
        id: `team:${member.userId}`,
        kind: 'team',
        userId: member.userId,
        name: member.name?.trim() || member.email,
        email: member.email,
        phone: null,
        teamRole: member.role
      }));
  }, [activePracticeId, getMembers]);
  useEffect(() => {
    if (!activePracticeId) {
      setIsFetchingMembers(false);
      setTeamMembersLoaded(false);
      setTeamMembersError(null);
      return;
    }
    setIsFetchingMembers(true);
    setTeamMembersLoaded(false);
    setTeamMembersError(null);
    fetchMembers(activePracticeId)
      .then(() => {
        setTeamMembersLoaded(true);
      })
      .catch((error) => {
        console.error('[People] Failed to load team members', error);
        setTeamMembersLoaded(false);
        setTeamMembersError(error instanceof Error ? error.message : 'Failed to load team members');
      })
      .finally(() => {
        setIsFetchingMembers(false);
      });
  }, [activePracticeId, fetchMembers]);
  const clients = useMemo(() => {
    const peopleItems = prefetchedItems.map(buildClientRecord);
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
  }, [buildClientRecord, isArchivedListRoute, isClientsListRoute, isTeamListRoute, prefetchedItems, statusFilter, teamMembers, teamMembersLoaded]);
  const isTeamSelectionRoute = isTeamListRoute || selectedClientIdFromPath?.startsWith('team:') === true;
  const isCombinedPeopleRoute = !isClientsListRoute && !isTeamListRoute && !isArchivedListRoute;
  const clientsLoading = prefetchedLoading
    || (isTeamSelectionRoute && isFetchingMembers)
    || (isCombinedPeopleRoute && !teamMembersLoaded);
  const clientsError = prefetchedError
    ?? ((isCombinedPeopleRoute || isTeamListRoute) ? teamMembersError : null);
  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => a.name.localeCompare(b.name)),
    [clients]
  );
  const groupedClients = useMemo(() => {
    return sortedClients.reduce<Record<string, DirectoryRecord[]>>((acc, client) => {
      const letter = client.name.charAt(0).toUpperCase();
      if (!acc[letter]) {
        acc[letter] = [];
      }
      acc[letter].push(client);
      return acc;
    }, {});
  }, [sortedClients]);
  const letters = useMemo(() => Object.keys(groupedClients).sort(), [groupedClients]);
  const activeLetter = (currentLetter && letters.includes(currentLetter)) ? currentLetter : (letters[0] ?? '');

  const selectedClientFromList = useMemo(() => {
    if (!selectedClientIdFromPath) return null;
    return sortedClients.find((client) => client.id === selectedClientIdFromPath) ?? null;
  }, [selectedClientIdFromPath, sortedClients]);
  const [selectedClientFallback, setSelectedClientFallback] = useState<DirectoryRecord | null>(null);
  const selectedClient = selectedClientFromList ?? selectedClientFallback;

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
      console.warn('[People] Skipping memos without id', { clientId: client.id, count: withoutId.length });
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
    setMemoTimeline((prev) => ({
      ...prev,
      [client.id]: mapMemosToTimeline(client, memos)
    }));
  }, [activePracticeId, mapMemosToTimeline]);

  useEffect(() => {
    if (!activePracticeId || !selectedClient || selectedClient.kind !== 'client') return;
    if (memoTimeline[selectedClient.id]) return;

    refreshClientMemos(selectedClient)
      .catch((error) => {
        console.error('[People] Failed to load client memos', error);
        setMemoTimeline((prev) => ({
          ...prev,
          [selectedClient.id]: []
        }));
      });
  }, [activePracticeId, memoTimeline, refreshClientMemos, selectedClient]);

  useEffect(() => {
    if (!activePracticeId || !selectedClientIdFromPath) {
      setSelectedClientFallback(null);
      return;
    }
    if (selectedClientIdFromPath.startsWith('team:')) {
      setSelectedClientFallback(null);
      return;
    }
    if (selectedClientFromList) {
      setSelectedClientFallback(null);
      return;
    }
    const controller = new AbortController();
    getUserDetail(activePracticeId, selectedClientIdFromPath, { signal: controller.signal })
      .then((detail) => {
        if (controller.signal.aborted) return;
        if (!detail) {
          setSelectedClientFallback(null);
          return;
        }
        setSelectedClientFallback(buildClientRecord(detail));
      })
      .catch((error) => {
        if (controller.signal.aborted || error.name === 'AbortError') return;
        console.error('[People] Failed to load selected client detail', error);
        setSelectedClientFallback(null);
      });
    return () => controller.abort();
  }, [activePracticeId, buildClientRecord, selectedClientFromList, selectedClientIdFromPath, teamMembersLoaded]);

  const handleMemoSubmit = useCallback(async (text: string) => {
    if (!activePracticeId || !selectedClient || selectedClient.kind !== 'client') return;
    if (memoSubmitting) return;

    setMemoSubmitting(true);
    try {
      await createUserDetailMemo(activePracticeId, selectedClient.id, { content: text });
      await refreshClientMemos(selectedClient);
    } catch (error) {
      console.error('[People] Failed to create memo', error);
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
      console.error('[People] Failed to update memo', error);
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
      console.error('[People] Failed to delete memo', error);
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
      showError('Could not start conversation', 'This person does not have a linked portal account.');
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
            source: 'people_detail',
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
      const conversationsBasePath = basePath.replace(/\/(clients|people)$/, '/conversations');
      if (conversationsBasePath === basePath) {
        throw new Error('People base path does not map to conversations path');
      }
      location.route(`${conversationsBasePath}/${encodeURIComponent(conversationId)}`);
    } catch (error) {
      console.error('[People] Failed to start conversation from person detail', error);
      showError('Could not start conversation', error instanceof Error ? error.message : 'Unknown error');
    } finally {
      setSendMessagePending(false);
    }
  }, [activePracticeId, basePath, location, sendMessagePending, showError]);

  const handleOpenAddClient = useCallback(() => {
    setAddClientError(null);
    location.route(`${location.path}?create=1`);
  }, [location]);
  const handleOpenTeamInvite = useCallback(() => {
    const settingsTeamPath = basePath.replace(/\/(clients|people)$/, '/settings/practice/team');
    location.route(`${settingsTeamPath}?invite=1`);
  }, [basePath, location]);

  const updateAddClientField = useCallback(<K extends keyof ClientFormState>(
    field: K,
    value: ClientFormState[K]
  ) => {
    setAddClientForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const resetAddClientForm = useCallback(() => {
    setAddClientForm({
      name: '',
      email: '',
      phone: '',
      status: 'lead',
      currency: 'usd',
      address: undefined,  // Now uses Address object like intake form!
    });
  }, []);

  const handleCloseAddClient = useCallback(() => {
    setAddClientError(null);
    location.route(location.path);
  }, [location]);

  const handleSubmitAddClient = useCallback(async () => {
    if (!activePracticeId) return;
    const name = addClientForm.name.trim();
    const email = addClientForm.email.trim();
    if (!name || !email) {
      setAddClientError('Name and email are required');
      return;
    }
    if (addClientSubmitting) return;
    setAddClientSubmitting(true);
    setAddClientError(null);
    try {
      await createUserDetail(activePracticeId, {
        name,
        email,
        phone: addClientForm.phone.trim() || undefined,
        status: addClientForm.status,
        currency: addClientForm.currency.trim() || 'usd',
        address: addClientForm.address,
        event_name: 'Add Person Manually'
      });
      invalidateClientsForPractice(activePracticeId);
      try {
        await onRefetchList?.();
      } catch (err) {
        console.error('[People] Failed to refetch after add', err);
      }
      showSuccess('Person added', 'The person has been added to your practice.');
      resetAddClientForm();
      location.route(location.path);
    } catch (error) {
      console.error('[People] Failed to create client', error);
      setAddClientError('Failed to create person');
      showError('Could not add person', 'Please try again.');
    } finally {
      setAddClientSubmitting(false);
    }
  }, [
    addClientForm,
    addClientSubmitting,
    activePracticeId,
    location,
    onRefetchList,
    resetAddClientForm,
    showError,
    showSuccess
  ]);

  const addClientModal = (
    <Modal
      isOpen={isAddClientOpen}
      onClose={handleCloseAddClient}
      title="Backoffice: Add person manually"
      type="modal"
    >
      <div className="space-y-4">
        {addClientError && (
          <div className="glass-panel p-3 border-red-500/20 text-sm text-red-200">
            {addClientError}
          </div>
        )}
        <ClientForm
          values={addClientForm}
          onChange={updateAddClientField}
          disabled={addClientSubmitting}
        />
        <FormActions
          className="justify-end gap-2"
          onCancel={handleCloseAddClient}
          onSubmit={handleSubmitAddClient}
          submitType="button"
          submitText={addClientSubmitting ? 'Saving...' : 'Add person manually'}
          disabled={addClientSubmitting}
        />
      </div>
    </Modal>
  );

  const clientListPane = (
    <div className="relative h-full min-h-0 overflow-hidden">
      <div ref={listRef} className="h-full overflow-y-auto">
        <ul>
          {letters.map((letter) => (
            <li key={letter} data-letter={letter}>
              <div className="sticky top-0 z-10 bg-transparent px-4 py-1.5 text-xs font-semibold text-input-placeholder">
                {letter}
              </div>
              {groupedClients[letter].map((client) => {
                const isSelected = client.id === selectedClient?.id;
                const nameParts = splitName(client.name);
                const normalizedTeamRole = normalizePracticeRole(client.teamRole);
                return (
                  <div key={client.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectClient(client)}
                      aria-current={isSelected ? 'true' : undefined}
                      className={cn(
                        'w-full justify-start px-4 py-3.5 h-auto rounded-none text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40',
                        isSelected ? 'bg-white/5' : 'hover:bg-white/[0.03]'
                      )}
                    >
                      <div className="flex items-center gap-4 w-full">
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
                      </div>
                    </button>
                  </div>
                );
              })}
            </li>
          ))}
          {prefetchedLoadingMore ? (
            <li className="px-4 py-3 text-xs text-input-placeholder text-center">Loading more people...</li>
          ) : null}
        </ul>
      </div>
      {letters.length > 0 ? (
        <div className="pointer-events-auto absolute right-1 top-1/2 z-20 -translate-y-1/2 hidden md:flex flex-col items-center gap-1 text-[11px] font-medium text-input-placeholder">
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
                  ? 'text-[rgb(var(--accent-foreground))] font-bold bg-accent-500'
                  : 'text-input-placeholder hover:text-input-text hover:bg-white/10'
              )}
            >
              {letter}
            </Button>
          ))}
        </div>
      ) : null}
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
      title="Invite someone to get started"
      description="Invite clients or team members, then select them from the list to view details."
      primaryAction={{
        label: 'Invite Client',
        onClick: handleOpenAddClient,
      }}
      secondaryAction={{
        label: 'Invite Team Member',
        onClick: handleOpenTeamInvite,
        variant: 'secondary',
      }}
    />
  );
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

  if (renderMode === 'listOnly') {
    if (!clientsLoading && !clientsError && sortedClients.length === 0) {
      return null;
    }

    return (
      <div className="h-full min-h-0 overflow-hidden flex flex-col gap-2">
        <Panel className="list-panel-card-gradient min-h-0 flex-1 overflow-hidden">
          {clientsLoading ? (
            <div className="h-full flex-1 items-center justify-center flex">
              <p className="text-sm text-input-placeholder">Loading people...</p>
            </div>
          ) : clientsError ? (
            <div className="h-full flex-1 items-center justify-center flex">
              <p className="text-sm text-input-placeholder">{clientsError}</p>
            </div>
          ) : sortedClients.length === 0 ? (
            <div className="h-full flex-1 items-center justify-center flex">
              <p className="text-sm text-input-placeholder">No people found.</p>
            </div>
          ) : (
            <div className="min-h-0 flex-1">{clientListPane}</div>
          )}
        </Panel>
      </div>
    );
  }

  if (renderMode === 'detailOnly') {
    return (
      <>
        <div className="h-full min-h-0 overflow-hidden">
          {clientsLoading ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-input-placeholder">Loading people...</p>
            </div>
          ) : clientsError ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-input-placeholder">{clientsError}</p>
            </div>
          ) : (
            <div className="h-full min-h-0 flex flex-col">
              {selectedClient ? (
                <DetailHeader
                  title="Person details"
                  leadingAction={detailHeaderLeadingAction}
                  actions={detailHeaderActions}
                  onInspector={onDetailInspector}
                  inspectorOpen={detailInspectorOpen}
                />
              ) : null}
              <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4 sm:px-6 sm:pb-6">{clientDetailBody}</div>
            </div>
          )}
        </div>
        {addClientModal}
      </>
    );
  }

  if (selectedClientIdFromPath) {
    return (
      <>
        <div className="h-full min-h-0 overflow-hidden">
          <div className="h-full min-h-0 flex flex-col">
            <DetailHeader
              title="Person details"
              showBack={showDetailBackButton}
              onBack={() => location.route(
                isArchivedListRoute
                  ? `${basePath}/archived`
                  : isTeamListRoute
                    ? `${basePath}/team`
                    : isClientsListRoute
                    ? `${basePath}/clients`
                      : basePath
              )}
              leadingAction={detailHeaderLeadingAction}
              actions={detailHeaderActions}
              onInspector={onDetailInspector}
              inspectorOpen={detailInspectorOpen}
            />
            <div className="min-h-0 flex-1 overflow-hidden px-4 pb-4 sm:px-6 sm:pb-6">
              {clientsLoading ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-sm text-input-placeholder">Loading people...</p>
                </div>
              ) : clientsError ? (
                <div className="h-full flex items-center justify-center">
                  <p className="text-sm text-input-placeholder">{clientsError}</p>
                </div>
              ) : (
                clientDetailBody
              )}
            </div>
          </div>
        </div>
        {addClientModal}
      </>
    );
  }

  return (
    <>
      <div className="h-full min-h-0 overflow-hidden flex flex-col gap-2">
        <Panel
          className={cn(
            'list-panel-card-gradient min-h-0 flex-1 overflow-hidden flex flex-col',
            (clientsLoading || clientsError || sortedClients.length === 0) && 'min-h-[520px]'
          )}
        >
          {clientsLoading ? (
            <div className="h-full flex-1 items-center justify-center flex">
              <p className="text-sm text-input-placeholder">Loading people...</p>
            </div>
          ) : clientsError ? (
            <div className="h-full flex-1 items-center justify-center flex">
              <p className="text-sm text-input-placeholder">{clientsError}</p>
            </div>
          ) : sortedClients.length === 0 ? (
            <EmptyState onAddClient={handleOpenAddClient} />
          ) : (
            <div className="min-h-0 flex-1">{clientListPane}</div>
          )}
        </Panel>
      </div>
      {addClientModal}
    </>
  );
};

export const PracticePeoplePage = PracticeClientsPage;

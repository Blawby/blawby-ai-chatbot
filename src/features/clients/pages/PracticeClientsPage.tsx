import type { ComponentChildren } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { DetailHeader } from '@/shared/ui/layout/DetailHeader';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { Page } from '@/shared/ui/layout/Page';
import { Panel } from '@/shared/ui/layout/Panel';
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
  updateUserDetail,
  deleteUserDetail,
  getUserDetail,
  type UserDetailRecord,
  type UserDetailStatus,
  type UserDetailMemoRecord
} from '@/shared/lib/apiClient';
import { invalidateClientsForPractice } from '@/shared/stores/clientsStore';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from '@/shared/ui/dropdown';
import {
  ArrowUpTrayIcon,
  ChatBubbleLeftRightIcon,
  EllipsisVerticalIcon,
  PlusIcon,
  UserIcon,
  DocumentTextIcon as DocumentTextOutlineIcon
} from '@heroicons/react/24/outline';

const STATUS_LABELS: Record<UserDetailStatus, string> = {
  lead: 'Lead',
  active: 'Active',
  inactive: 'Inactive',
  archived: 'Archived',
};

type ClientRecord = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  status: UserDetailStatus;
};

type ClientFormState = {
  name: string;
  email: string;
  phone: string;
  status: UserDetailStatus;
  currency: string;
  address?: Address;  // Now uses Address object like intake form!
};

type EditClientFormState = ClientFormState & { id: string };

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

const EmptyState = ({ onAddClient }: { onAddClient: () => void }) => (
  <div className="flex h-full items-center justify-center p-6">
    <div className="max-w-md text-center">
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-white/5 border border-white/10">
        <UserIcon className="h-6 w-6 text-input-placeholder" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-input-text">No clients yet</h3>
      <p className="mt-2 text-sm text-input-placeholder">
        Get started by creating a new client or importing your existing clients.
      </p>
      <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:justify-center">
        <Button size="sm" icon={<PlusIcon className="h-4 w-4" />} onClick={onAddClient}>
          Add Client
        </Button>
        <Button size="sm" variant="secondary" icon={<ArrowUpTrayIcon className="h-4 w-4" />} disabled>
          Import Clients
        </Button>
      </div>
    </div>
  </div>
);

const StatusPill = ({ status }: { status: UserDetailStatus }) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
      status === 'active'
        ? 'bg-emerald-500/10 text-emerald-400'
        : status === 'lead'
          ? 'bg-amber-500/10 text-amber-400'
          : status === 'inactive'
            ? 'glass-panel text-input-placeholder px-2 py-0.5'
            : 'glass-panel opacity-60 text-input-placeholder px-2 py-0.5'
    )}
  >
    {STATUS_LABELS[status]}
  </span>
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
  onEditClient,
  onDeleteClient,
  paddingClassName = ''
}: {
  client: ClientRecord;
  activity: TimelineItem[];
  practiceId?: string | null;
  onAddMemo?: (value: string) => void | Promise<void>;
  memoSubmitting?: boolean;
  onEditMemo?: (memoId: string, value: string) => void | Promise<void>;
  onDeleteMemo?: (memoId: string) => void | Promise<void>;
  memoActionId?: string | null;
  onEditClient?: () => void;
  onDeleteClient?: () => void;
  paddingClassName?: string;
}) => (
  <div className={cn('h-full overflow-y-auto px-6 py-6', paddingClassName)}>
    <div className="divide-y divide-line-default">
      <div className="pb-6">
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" icon={<DocumentTextOutlineIcon className="h-4 w-4" />}>
            Generate Invoice
          </Button>
          <Button
            variant="secondary"
            size="sm"
            icon={<ChatBubbleLeftRightIcon className="h-4 w-4" />}
            disabled={!client.phone}
          >
            Send message
          </Button>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button
                variant="secondary"
                size="icon"
                icon={<EllipsisVerticalIcon className="h-5 w-5" />}
                aria-label="Open client actions"
              />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <div className="py-1">
                <DropdownMenuItem onSelect={onEditClient} disabled={!onEditClient}>
                  Edit
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={onDeleteClient}
                  disabled={!onDeleteClient}
                  className="text-red-600 dark:text-red-400"
                >
                  Delete
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
      <div className="py-6">
        <dl className="divide-y divide-line-default">
          <div className="py-4">
            <dt className="text-sm font-medium text-input-placeholder">Email</dt>
            <dd className="mt-1 text-sm text-input-text">{client.email}</dd>
          </div>
          <div className="py-4">
            <dt className="text-sm font-medium text-input-placeholder">Phone</dt>
            <dd className="mt-1 text-sm text-input-text">{formatPhoneNumber(client.phone)}</dd>
          </div>
          <div className="py-4">
            <dt className="text-sm font-medium text-input-placeholder">Status</dt>
            <dd className="mt-2">
              <StatusPill status={client.status} />
            </dd>
          </div>
        </dl>
      </div>
      <div className="pt-6">
        <h3 className="text-sm font-semibold text-input-text">Recent activity</h3>
        <div className="mt-4">
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
        </div>
      </div>
    </div>
  </div>
);

export const PracticeClientsPage = ({
  practiceId: routePracticeId,
  basePath = '/practice/clients',
  renderMode = 'full',
  statusFilter = null,
  prefetchedItems = [],
  prefetchedLoading = false,
  prefetchedLoadingMore = false,
  prefetchedError = null,
  onRefetchList,
  listHeaderLeftControl,
  detailHeaderRightControl,
  showDetailBackButton = true,
}: {
  practiceId?: string | null;
  basePath?: string;
  renderMode?: 'full' | 'listOnly' | 'detailOnly';
  statusFilter?: UserDetailStatus | null;
  prefetchedItems?: UserDetailRecord[];
  prefetchedLoading?: boolean;
  prefetchedLoadingMore?: boolean;
  prefetchedError?: string | null;
  onRefetchList?: (signal?: AbortSignal) => Promise<void>;
  listHeaderLeftControl?: ComponentChildren;
  detailHeaderRightControl?: ComponentChildren;
  showDetailBackButton?: boolean;
}) => {
  const location = useLocation();
  const { currentPractice } = usePracticeManagement();
  const { showError, showSuccess } = useToastContext();
  const [memoTimeline, setMemoTimeline] = useState<Record<string, TimelineItem[]>>({});
  const [memoSubmitting, setMemoSubmitting] = useState(false);
  const [memoActionId, setMemoActionId] = useState<string | null>(null);
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [addClientSubmitting, setAddClientSubmitting] = useState(false);
  const [addClientError, setAddClientError] = useState<string | null>(null);
  const [isEditClientOpen, setIsEditClientOpen] = useState(false);
  const [editClientSubmitting, setEditClientSubmitting] = useState(false);
  const [editClientError, setEditClientError] = useState<string | null>(null);

  const defaultClientFormState: ClientFormState = {
    name: '',
    email: '',
    phone: '',
    status: 'lead' as UserDetailStatus,
    currency: 'usd',
    address: undefined,  // Now uses Address object like intake form!
  };

  const [addClientForm, setAddClientForm] = useState<ClientFormState>(defaultClientFormState);
  const [editClientForm, setEditClientForm] = useState<EditClientFormState>({
    id: '',
    name: '',
    email: '',
    phone: '',
    status: 'lead' as UserDetailStatus,
    currency: 'usd',
    address: undefined,  // Now uses Address object like intake form!
  });

  const pathSuffix = location.path.startsWith(basePath) ? location.path.slice(basePath.length) : '';
  const pathSegments = pathSuffix.replace(/^\/+/, '').split('/').filter(Boolean);
  const selectedClientIdFromPath = useMemo(() => {
    if (!pathSegments[0]) return null;
    try {
      return decodeURIComponent(pathSegments[0]);
    } catch (e) {
      console.warn('[Clients] Failed to decode client ID from path', e);
      return null;
    }
  }, [pathSegments]);
  const listRef = useRef<HTMLDivElement>(null);
  const [currentLetter, setCurrentLetter] = useState('');
  const activePracticeId = routePracticeId === undefined ? (currentPractice?.id ?? null) : routePracticeId;

  const buildClientRecord = useCallback((detail: UserDetailRecord): ClientRecord => {
    const name = detail.user?.name?.trim() || detail.user?.email?.trim() || 'Unknown Client';
    return {
      id: detail.id,
      name,
      email: detail.user?.email ?? 'Unknown email',
      phone: detail.user?.phone ?? null,
      status: detail.status
    };
  }, []);
  const clients = useMemo(() => {
    const items = prefetchedItems.map(buildClientRecord);
    if (!statusFilter) return items;
    return items.filter((client) => client.status === statusFilter);
  }, [buildClientRecord, prefetchedItems, statusFilter]);
  const clientsLoading = prefetchedLoading;
  const clientsError = prefetchedError;
  const sortedClients = useMemo(
    () => [...clients].sort((a, b) => a.name.localeCompare(b.name)),
    [clients]
  );
  const groupedClients = useMemo(() => {
    return sortedClients.reduce<Record<string, ClientRecord[]>>((acc, client) => {
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
  const [selectedClientFallback, setSelectedClientFallback] = useState<ClientRecord | null>(null);
  const selectedClient = selectedClientFromList ?? selectedClientFallback;

  const selectedClientActivity = useMemo(() => {
    if (!selectedClient) return [];
    return memoTimeline[selectedClient.id] ?? [];
  }, [memoTimeline, selectedClient]);

  const handleSelectClient = useCallback((clientId: string) => {
    location.route(`${basePath}/${encodeURIComponent(clientId)}`);
  }, [basePath, location]);

  const mapMemosToTimeline = useCallback((client: ClientRecord, memos: UserDetailMemoRecord[]): TimelineItem[] => {
    const withoutId = memos.filter((memo) => !memo.id);
    if (withoutId.length > 0) {
      console.warn('[Clients] Skipping memos without id', { clientId: client.id, count: withoutId.length });
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

  const refreshClientMemos = useCallback(async (client: ClientRecord) => {
    if (!activePracticeId) return;
    const memos = await listUserDetailMemos(activePracticeId, client.id);
    setMemoTimeline((prev) => ({
      ...prev,
      [client.id]: mapMemosToTimeline(client, memos)
    }));
  }, [activePracticeId, mapMemosToTimeline]);

  useEffect(() => {
    if (!activePracticeId || !selectedClient) return;
    if (memoTimeline[selectedClient.id]) return;

    refreshClientMemos(selectedClient)
      .catch((error) => {
        console.error('[Clients] Failed to load client memos', error);
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
        console.error('[Clients] Failed to load selected client detail', error);
        setSelectedClientFallback(null);
      });
    return () => controller.abort();
  }, [activePracticeId, buildClientRecord, selectedClientFromList, selectedClientIdFromPath]);

  const handleMemoSubmit = useCallback(async (text: string) => {
    if (!activePracticeId || !selectedClient) return;
    if (memoSubmitting) return;

    setMemoSubmitting(true);
    try {
      await createUserDetailMemo(activePracticeId, selectedClient.id, { content: text });
      await refreshClientMemos(selectedClient);
    } catch (error) {
      console.error('[Clients] Failed to create memo', error);
      showError('Could not add memo', 'Please try again.');
    } finally {
      setMemoSubmitting(false);
    }
  }, [activePracticeId, memoSubmitting, refreshClientMemos, selectedClient, showError]);

  const handleMemoEdit = useCallback(async (memoId: string, text: string) => {
    if (!activePracticeId || !selectedClient) return;
    if (memoActionId) return;
    setMemoActionId(memoId);
    try {
      await updateUserDetailMemo(activePracticeId, selectedClient.id, memoId, { content: text });
      await refreshClientMemos(selectedClient);
    } catch (error) {
      console.error('[Clients] Failed to update memo', error);
      showError('Could not update memo', 'Please try again.');
    } finally {
      setMemoActionId(null);
    }
  }, [activePracticeId, memoActionId, refreshClientMemos, selectedClient, showError]);

  const handleMemoDelete = useCallback(async (memoId: string) => {
    if (!activePracticeId || !selectedClient) return;
    if (memoActionId) return;
    const confirmed = window.confirm('Delete this memo?');
    if (!confirmed) return;
    setMemoActionId(memoId);
    try {
      await deleteUserDetailMemo(activePracticeId, selectedClient.id, memoId);
      await refreshClientMemos(selectedClient);
    } catch (error) {
      console.error('[Clients] Failed to delete memo', error);
      showError('Could not delete memo', 'Please try again.');
    } finally {
      setMemoActionId(null);
    }
  }, [activePracticeId, memoActionId, refreshClientMemos, selectedClient, showError]);

  const handleOpenAddClient = useCallback(() => {
    setAddClientError(null);
    setIsAddClientOpen(true);
  }, []);

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
    setIsAddClientOpen(false);
    setAddClientError(null);
  }, []);

  const updateEditClientField = useCallback(<K extends keyof ClientFormState>(
    field: K,
    value: ClientFormState[K]
  ) => {
    setEditClientForm((prev) => ({ ...prev, [field]: value }));
  }, []);

  const resetEditClientForm = useCallback(() => {
    setEditClientForm({
      id: '',
      name: '',
      email: '',
      phone: '',
      status: 'lead',
      currency: 'usd',
      address: undefined,  // Now uses Address object like intake form!
    });
  }, []);

  const handleCloseEditClient = useCallback(() => {
    setIsEditClientOpen(false);
    setEditClientError(null);
  }, []);

  const handleOpenEditClient = useCallback(async () => {
    if (!activePracticeId || !selectedClient) return;
    setEditClientError(null);
    try {
      const detail = await getUserDetail(activePracticeId, selectedClient.id);
      const name = detail?.user?.name?.trim() || detail?.user?.email?.trim() || selectedClient.name;
      setEditClientForm({
        id: selectedClient.id,
        name,
        email: detail?.user?.email ?? selectedClient.email,
        phone: detail?.user?.phone ?? selectedClient.phone ?? '',
        status: detail?.status ?? selectedClient.status,
        currency: detail?.currency ?? 'usd',
        address: undefined,  // Now uses Address object like intake form!
      });
      setIsEditClientOpen(true);
    } catch (error) {
      console.error('[Clients] Failed to load client detail', error);
      setEditClientError('Failed to load client');
      setIsEditClientOpen(true);
    }
  }, [activePracticeId, selectedClient]);

  const handleSubmitEditClient = useCallback(async () => {
    if (!activePracticeId || !editClientForm.id) return;
    const name = editClientForm.name.trim();
    const email = editClientForm.email.trim();
    if (!name || !email) {
      setEditClientError('Name and email are required');
      return;
    }
    if (editClientSubmitting) return;
    setEditClientSubmitting(true);
    setEditClientError(null);
    try {
      await updateUserDetail(activePracticeId, editClientForm.id, {
        name,
        email,
        phone: editClientForm.phone.trim() || undefined,
        status: editClientForm.status,
        currency: editClientForm.currency.trim() || 'usd',
        event_name: 'Invite Client',
        address: editClientForm.address
      });
      invalidateClientsForPractice(activePracticeId);
      await onRefetchList?.();
      showSuccess('Client updated', 'Client details have been saved.');
      resetEditClientForm();
      setIsEditClientOpen(false);
    } catch (error) {
      console.error('[Clients] Failed to update client', error);
      setEditClientError('Failed to update client');
      showError('Could not update client', 'Please try again.');
    } finally {
      setEditClientSubmitting(false);
    }
  }, [activePracticeId, editClientForm, editClientSubmitting, onRefetchList, resetEditClientForm, showError, showSuccess]);

  const handleDeleteClient = useCallback(async () => {
    if (!activePracticeId || !selectedClient) return;
    const confirmed = window.confirm('Delete this client?');
    if (!confirmed) return;
    try {
      await deleteUserDetail(activePracticeId, selectedClient.id);
      invalidateClientsForPractice(activePracticeId);
      await onRefetchList?.();
      showSuccess('Client deleted', 'The client has been removed.');
      location.route(basePath);
    } catch (error) {
      console.error('[Clients] Failed to delete client', error);
      showError('Could not delete client', 'Please try again.');
    }
  }, [activePracticeId, basePath, location, onRefetchList, selectedClient, showError, showSuccess]);

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
        event_name: 'Invite Client'
      });
      invalidateClientsForPractice(activePracticeId);
      await onRefetchList?.();
      showSuccess('Client added', 'The client has been added to your practice.');
      resetAddClientForm();
      setIsAddClientOpen(false);
    } catch (error) {
      console.error('[Clients] Failed to create client', error);
      setAddClientError('Failed to create client');
      showError('Could not add client', 'Please try again.');
    } finally {
      setAddClientSubmitting(false);
    }
  }, [
    addClientForm,
    addClientSubmitting,
    activePracticeId,
    onRefetchList,
    resetAddClientForm,
    showError,
    showSuccess
  ]);

  const addClientModal = (
    <Modal
      isOpen={isAddClientOpen}
      onClose={handleCloseAddClient}
      title="Add Client"
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
          submitText={addClientSubmitting ? 'Saving...' : 'Add Client'}
          disabled={addClientSubmitting}
        />
      </div>
    </Modal>
  );

  const editClientModal = (
    <Modal
      isOpen={isEditClientOpen}
      onClose={handleCloseEditClient}
      title="Edit Client"
      type="modal"
    >
      <div className="space-y-4">
        {editClientError && (
          <div className="glass-panel p-3 border-red-500/20 text-sm text-red-200">
            {editClientError}
          </div>
        )}
        <ClientForm
          values={editClientForm}
          onChange={updateEditClientField}
          disabled={editClientSubmitting}
        />
        <FormActions
          className="justify-end gap-2"
          onCancel={handleCloseEditClient}
          onSubmit={handleSubmitEditClient}
          submitType="button"
          submitText={editClientSubmitting ? 'Saving...' : 'Save Changes'}
          disabled={editClientSubmitting}
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
              {groupedClients[letter].map((client, index) => {
                const isSelected = client.id === selectedClient?.id;
                const nameParts = splitName(client.name);
                const isLastInLetterGroup = index === groupedClients[letter].length - 1;
                return (
                  <div key={client.id}>
                    <button
                      type="button"
                      onClick={() => handleSelectClient(client.id)}
                      aria-current={isSelected ? 'true' : undefined}
                      className={cn(
                        'w-full justify-start px-4 py-3.5 h-auto rounded-none text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40',
                        isSelected ? 'bg-white/5' : 'hover:bg-white/[0.03]'
                      )}
                    >
                      <div className="flex items-center gap-4 w-full">
                        <Avatar
                          name={client.name}
                          size="sm"
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
                        </div>
                      </div>
                    </button>
                    {!isLastInLetterGroup ? <div aria-hidden="true" className="border-b border-line-glass/8" /> : null}
                  </div>
                );
              })}
            </li>
          ))}
          {prefetchedLoadingMore ? (
            <li className="px-4 py-3 text-xs text-input-placeholder text-center">Loading more clients...</li>
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
      onEditClient={handleOpenEditClient}
      onDeleteClient={handleDeleteClient}
    />
  ) : (
    <div className="h-full flex items-center justify-center">
      <div className="text-center">
        <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-light-hover dark:bg-dark-hover">
          <UserIcon className="h-6 w-6 text-input-text/70" aria-hidden="true" />
        </div>
        <h3 className="mt-4 text-sm font-semibold text-input-text">Select a client</h3>
        <p className="mt-2 text-sm text-input-placeholder">
          Choose a client from the list to view their details.
        </p>
      </div>
    </div>
  );

  if (renderMode === 'listOnly') {
    return (
      <div className="h-full min-h-0 overflow-hidden flex flex-col gap-2">
        {listHeaderLeftControl ? (
          <div className="px-1 py-1">{listHeaderLeftControl}</div>
        ) : null}
        <Panel className="list-panel-card-gradient min-h-0 flex-1 overflow-hidden">
          {clientsLoading ? (
            <div className="h-full flex-1 items-center justify-center flex">
              <p className="text-sm text-input-placeholder">Loading clients...</p>
            </div>
          ) : clientsError ? (
            <div className="h-full flex-1 items-center justify-center flex">
              <p className="text-sm text-input-placeholder">{clientsError}</p>
            </div>
          ) : sortedClients.length === 0 ? (
            <div className="h-full flex-1 items-center justify-center flex">
              <p className="text-sm text-input-placeholder">No clients found.</p>
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
              <p className="text-sm text-input-placeholder">Loading clients...</p>
            </div>
          ) : clientsError ? (
            <div className="h-full flex items-center justify-center">
              <p className="text-sm text-input-placeholder">{clientsError}</p>
            </div>
          ) : (
            <div className="h-full min-h-0 flex flex-col">
              {selectedClient ? (
                <DetailHeader
                  title={selectedClient.name}
                  subtitle={selectedClient.email}
                  actions={detailHeaderRightControl}
                />
              ) : null}
              <div className="min-h-0 flex-1 overflow-hidden">{clientDetailBody}</div>
            </div>
          )}
        </div>
        {addClientModal}
        {editClientModal}
      </>
    );
  }

  if (selectedClientIdFromPath) {
    return (
      <>
        <Page className="h-full">
          <div className="max-w-6xl mx-auto flex h-full min-h-0 flex-col gap-6">
            <DetailHeader
              title={selectedClient?.name ?? 'Client detail'}
              subtitle={selectedClient?.email ?? undefined}
              showBack={showDetailBackButton}
              onBack={() => location.route(basePath)}
              actions={detailHeaderRightControl}
            />
            <Panel className="flex-1 min-h-0 overflow-hidden">
              {clientDetailBody}
            </Panel>
          </div>
        </Page>
        {addClientModal}
        {editClientModal}
      </>
    );
  }

  if (clientsLoading) {
    return (
      <>
        <Page className="h-full">
          <div className="max-w-6xl mx-auto h-full">
            <PageHeader
              title="Clients"
              subtitle="A unified list of client relationships tied to conversations and matters."
            />
            <Panel className="mt-6 min-h-[520px] flex items-center justify-center">
              <p className="text-sm text-input-placeholder">Loading clients...</p>
            </Panel>
          </div>
        </Page>
        {addClientModal}
        {editClientModal}
      </>
    );
  }

  if (clientsError) {
    return (
      <>
        <Page className="h-full">
          <div className="max-w-6xl mx-auto h-full">
            <PageHeader
              title="Clients"
              subtitle="A unified list of client relationships tied to conversations and matters."
            />
            <Panel className="mt-6 min-h-[520px] flex items-center justify-center">
              <p className="text-sm text-input-placeholder">{clientsError}</p>
            </Panel>
          </div>
        </Page>
        {addClientModal}
        {editClientModal}
      </>
    );
  }

  if (sortedClients.length === 0) {
    return (
      <>
        <Page className="h-full">
          <div className="max-w-6xl mx-auto h-full">
            <PageHeader
              title="Clients"
              subtitle="A unified list of client relationships tied to conversations and matters."
              actions={(
                <div className="flex items-center gap-2">
                  <Button size="sm" icon={<PlusIcon className="h-4 w-4" />} onClick={handleOpenAddClient}>
                    Add Client
                  </Button>
                  <Button size="sm" variant="secondary" icon={<ArrowUpTrayIcon className="h-4 w-4" />} disabled>
                    Import
                  </Button>
                </div>
              )}
            />
            <Panel className="mt-6 min-h-[520px]">
              <EmptyState onAddClient={handleOpenAddClient} />
            </Panel>
          </div>
        </Page>
        {addClientModal}
        {editClientModal}
      </>
    );
  }

  return (
    <>
      <Page className="h-full">
        <div className="max-w-6xl mx-auto flex h-full min-h-0 flex-col gap-6">
          <PageHeader
            title="Clients"
            subtitle="A unified list of client relationships tied to conversations and matters."
          />
          <Panel className="flex-1 min-h-0 overflow-hidden bg-transparent flex flex-col">
            <div className="min-h-0 flex-1">{clientListPane}</div>
          </Panel>
        </div>
      </Page>
      {addClientModal}
      {editClientModal}
    </>
  );
};

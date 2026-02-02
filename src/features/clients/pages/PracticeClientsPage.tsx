import { Fragment } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { Button } from '@/shared/ui/Button';
import Modal from '@/shared/components/Modal';
import { Avatar } from '@/shared/ui/profile';
import { EmailInput, Input, PhoneInput, Select, type SelectOption } from '@/shared/ui/input';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import { cn } from '@/shared/utils/cn';
import { ActivityTimeline, type TimelineItem } from '@/shared/ui/activity/ActivityTimeline';
import { formatDate } from '@/shared/utils/dateTime';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import { useToastContext } from '@/shared/contexts/ToastContext';
import {
  listUserDetails,
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
  active: 'Client',
  inactive: 'Inactive',
  archived: 'Archived'
};

const STATUS_OPTIONS: SelectOption[] = [
  { value: 'lead', label: STATUS_LABELS.lead },
  { value: 'active', label: STATUS_LABELS.active },
  { value: 'inactive', label: STATUS_LABELS.inactive },
  { value: 'archived', label: STATUS_LABELS.archived }
];

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
  eventName: string;
  addressLine1: string;
  addressLine2: string;
  city: string;
  state: string;
  postalCode: string;
  country: string;
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
      <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-light-hover dark:bg-dark-hover">
        <UserIcon className="h-6 w-6 text-gray-600 dark:text-gray-300" aria-hidden="true" />
      </div>
      <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-white">No clients yet</h3>
      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
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
        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
        : status === 'lead'
          ? 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
          : status === 'inactive'
            ? 'bg-gray-100 text-gray-700 dark:bg-gray-900/40 dark:text-gray-200'
            : 'bg-slate-200 text-slate-700 dark:bg-slate-900/40 dark:text-slate-200'
    )}
  >
    {STATUS_LABELS[status]}
  </span>
);

const ClientFormFields = ({
  values,
  onChange,
  disabled = false
}: {
  values: ClientFormState;
  onChange: <K extends keyof ClientFormState>(field: K, value: ClientFormState[K]) => void;
  disabled?: boolean;
}) => (
  <div className="grid gap-4 sm:grid-cols-2">
    <div className="sm:col-span-2">
      <Input
        label="Full name"
        value={values.name}
        onChange={(value) => onChange('name', value)}
        placeholder="Jane Doe"
        required
        disabled={disabled}
      />
    </div>
    <EmailInput
      label="Email"
      value={values.email}
      onChange={(value) => onChange('email', value)}
      placeholder="jane@example.com"
      required
      disabled={disabled}
      showValidation={true}
    />
    <PhoneInput
      label="Phone"
      value={values.phone}
      onChange={(value) => onChange('phone', value)}
      placeholder="(555) 123-4567"
      disabled={disabled}
      showCountryCode={true}
      countryCode="+1"
    />
    <Select
      label="Status"
      value={values.status}
      options={STATUS_OPTIONS}
      onChange={(value) => onChange('status', value as UserDetailStatus)}
      disabled={disabled}
    />
    <Input
      label="Currency"
      value={values.currency}
      onChange={(value) => onChange('currency', value)}
      placeholder="usd"
      disabled={disabled}
    />
    <div className="sm:col-span-2">
      <Input
        label="Event name"
        value={values.eventName}
        onChange={(value) => onChange('eventName', value)}
        placeholder="Initial consult"
        disabled={disabled}
      />
    </div>
    <div className="sm:col-span-2">
      <Input
        label="Address line 1"
        value={values.addressLine1}
        onChange={(value) => onChange('addressLine1', value)}
        placeholder="123 Main St"
        disabled={disabled}
      />
    </div>
    <div className="sm:col-span-2">
      <Input
        label="Address line 2"
        value={values.addressLine2}
        onChange={(value) => onChange('addressLine2', value)}
        placeholder="Suite 400"
        disabled={disabled}
      />
    </div>
    <Input
      label="City"
      value={values.city}
      onChange={(value) => onChange('city', value)}
      placeholder="San Francisco"
      disabled={disabled}
    />
    <Input
      label="State"
      value={values.state}
      onChange={(value) => onChange('state', value)}
      placeholder="CA"
      disabled={disabled}
    />
    <Input
      label="Postal code"
      value={values.postalCode}
      onChange={(value) => onChange('postalCode', value)}
      placeholder="94103"
      disabled={disabled}
    />
    <Input
      label="Country"
      value={values.country}
      onChange={(value) => onChange('country', value)}
      placeholder="US"
      disabled={disabled}
    />
  </div>
);

const ClientDetailPanel = ({
  client,
  activity,
  onAddMemo,
  memoSubmitting = false,
  onEditMemo,
  onDeleteMemo,
  memoActionId,
  onEditClient,
  onDeleteClient,
  paddingClassName = 'px-6 py-6'
}: {
  client: ClientRecord;
  activity: TimelineItem[];
  onAddMemo?: (value: string) => void | Promise<void>;
  memoSubmitting?: boolean;
  onEditMemo?: (memoId: string, value: string) => void | Promise<void>;
  onDeleteMemo?: (memoId: string) => void | Promise<void>;
  memoActionId?: string | null;
  onEditClient?: () => void;
  onDeleteClient?: () => void;
  paddingClassName?: string;
}) => (
  <div className="h-full overflow-y-auto">
    <div className={cn('divide-y divide-gray-200 dark:divide-white/10', paddingClassName)}>
      <div className="pb-6">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">{client.name}</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">{client.email}</p>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-2">
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
        <dl className="divide-y divide-gray-200 dark:divide-white/10">
          <div className="py-4">
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Email</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-white">{client.email}</dd>
          </div>
          <div className="py-4">
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Phone</dt>
            <dd className="mt-1 text-sm text-gray-900 dark:text-white">{formatPhoneNumber(client.phone)}</dd>
          </div>
          <div className="py-4">
            <dt className="text-sm font-medium text-gray-500 dark:text-gray-400">Status</dt>
            <dd className="mt-2">
              <StatusPill status={client.status} />
            </dd>
          </div>
        </dl>
      </div>
      <div className="pt-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Activity Feed</h3>
        <div className="mt-4 rounded-xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg p-4">
          <ActivityTimeline
            items={activity}
            showComposer
            composerDisabled={!onAddMemo}
            composerSubmitting={memoSubmitting}
            onComposerSubmit={onAddMemo}
            composerLabel="Add memo"
            composerPlaceholder="Add a memo..."
            onEditComment={onEditMemo}
            onDeleteComment={onDeleteMemo}
            commentActionsDisabled={memoSubmitting || Boolean(memoActionId)}
          />
        </div>
      </div>
    </div>
  </div>
);

export const PracticeClientsPage = () => {
  const isMobile = useMobileDetection();
  const { currentPractice } = usePracticeManagement();
  const { showError, showSuccess } = useToastContext();
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [clientsPage, setClientsPage] = useState(1);
  const [clientsHasMore, setClientsHasMore] = useState(true);
  const [clientsLoadingMore, setClientsLoadingMore] = useState(false);
  const [memoTimeline, setMemoTimeline] = useState<Record<string, TimelineItem[]>>({});
  const [memoSubmitting, setMemoSubmitting] = useState(false);
  const [memoActionId, setMemoActionId] = useState<string | null>(null);
  const [isAddClientOpen, setIsAddClientOpen] = useState(false);
  const [addClientSubmitting, setAddClientSubmitting] = useState(false);
  const [addClientError, setAddClientError] = useState<string | null>(null);
  const [isEditClientOpen, setIsEditClientOpen] = useState(false);
  const [editClientSubmitting, setEditClientSubmitting] = useState(false);
  const [editClientError, setEditClientError] = useState<string | null>(null);
  const [addClientForm, setAddClientForm] = useState<ClientFormState>({
    name: '',
    email: '',
    phone: '',
    status: 'lead' as UserDetailStatus,
    currency: 'usd',
    eventName: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: 'US'
  });
  const [editClientForm, setEditClientForm] = useState<EditClientFormState>({
    id: '',
    name: '',
    email: '',
    phone: '',
    status: 'lead' as UserDetailStatus,
    currency: 'usd',
    eventName: '',
    addressLine1: '',
    addressLine2: '',
    city: '',
    state: '',
    postalCode: '',
    country: ''
  });

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

  const [selectedClientId, setSelectedClientId] = useState(() => sortedClients[0]?.id ?? '');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [currentLetter, setCurrentLetter] = useState(() => letters[0] ?? '');
  const listRef = useRef<HTMLDivElement>(null);
  const loadMoreRef = useRef<HTMLLIElement>(null);
  const pageSize = 50;

  const selectedClient = useMemo(() => {
    return sortedClients.find((client) => client.id === selectedClientId) ?? sortedClients[0] ?? null;
  }, [selectedClientId, sortedClients]);

  const selectedClientActivity = useMemo(() => {
    if (!selectedClient) return [];
    return memoTimeline[selectedClient.id] ?? [];
  }, [memoTimeline, selectedClient]);

  const handleSelectClient = useCallback((clientId: string) => {
    setSelectedClientId(clientId);
    if (isMobile) {
      setIsDrawerOpen(true);
    }
  }, [isMobile]);

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
    if (!currentPractice?.id) return;
    const memos = await listUserDetailMemos(currentPractice.id, client.id);
    setMemoTimeline((prev) => ({
      ...prev,
      [client.id]: mapMemosToTimeline(client, memos)
    }));
  }, [currentPractice?.id, mapMemosToTimeline]);

  const fetchClientsPage = useCallback(async (page: number, options?: { replace?: boolean }) => {
    if (!currentPractice?.id) {
      setClients([]);
      setClientsHasMore(true);
      setClientsPage(1);
      return;
    }

    if (options?.replace) {
      setClientsLoading(true);
      setClientsError(null);
      setClientsHasMore(true);
      setClientsPage(1);
    }

    try {
      const offset = (page - 1) * pageSize;
      const response = await listUserDetails(currentPractice.id, { limit: pageSize, offset });
      const nextClients = response.data.map(buildClientRecord);
      setClients((prev) => (options?.replace ? nextClients : [...prev, ...nextClients]));
      setClientsHasMore(nextClients.length === pageSize);
      setClientsPage(page);
      if (options?.replace) {
        if (nextClients.length > 0) {
          setSelectedClientId((prev) => (prev && nextClients.some(c => c.id === prev) ? prev : nextClients[0].id));
        } else {
          setSelectedClientId('');
        }
      }
    } catch (error) {
      console.error('[Clients] Failed to load user details', error);
      setClientsError('Failed to load clients');
      setClientsHasMore(false);
    } finally {
      if (options?.replace) {
        setClientsLoading(false);
      }
      setClientsLoadingMore(false);
    }
  }, [buildClientRecord, currentPractice?.id, pageSize]);

  useEffect(() => {
    void fetchClientsPage(1, { replace: true });
  }, [fetchClientsPage]);

  useEffect(() => {
    if (!currentPractice?.id || !selectedClient) return;
    if (memoTimeline[selectedClient.id]) return;

    refreshClientMemos(selectedClient)
      .catch((error) => {
        console.error('[Clients] Failed to load client memos', error);
        setMemoTimeline((prev) => ({
          ...prev,
          [selectedClient.id]: []
        }));
      });
  }, [currentPractice?.id, memoTimeline, refreshClientMemos, selectedClient]);

  const handleMemoSubmit = useCallback(async (text: string) => {
    if (!currentPractice?.id || !selectedClient) return;
    if (memoSubmitting) return;

    setMemoSubmitting(true);
    try {
      await createUserDetailMemo(currentPractice.id, selectedClient.id, { content: text });
      await refreshClientMemos(selectedClient);
    } catch (error) {
      console.error('[Clients] Failed to create memo', error);
      showError('Could not add memo', 'Please try again.');
    } finally {
      setMemoSubmitting(false);
    }
  }, [currentPractice?.id, memoSubmitting, refreshClientMemos, selectedClient, showError]);

  const handleMemoEdit = useCallback(async (memoId: string, text: string) => {
    if (!currentPractice?.id || !selectedClient) return;
    if (memoActionId) return;
    setMemoActionId(memoId);
    try {
      await updateUserDetailMemo(currentPractice.id, selectedClient.id, memoId, { content: text });
      await refreshClientMemos(selectedClient);
    } catch (error) {
      console.error('[Clients] Failed to update memo', error);
      showError('Could not update memo', 'Please try again.');
    } finally {
      setMemoActionId(null);
    }
  }, [currentPractice?.id, memoActionId, refreshClientMemos, selectedClient, showError]);

  const handleMemoDelete = useCallback(async (memoId: string) => {
    if (!currentPractice?.id || !selectedClient) return;
    if (memoActionId) return;
    const confirmed = window.confirm('Delete this memo?');
    if (!confirmed) return;
    setMemoActionId(memoId);
    try {
      await deleteUserDetailMemo(currentPractice.id, selectedClient.id, memoId);
      await refreshClientMemos(selectedClient);
    } catch (error) {
      console.error('[Clients] Failed to delete memo', error);
      showError('Could not delete memo', 'Please try again.');
    } finally {
      setMemoActionId(null);
    }
  }, [currentPractice?.id, memoActionId, refreshClientMemos, selectedClient, showError]);

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
      eventName: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      postalCode: '',
      country: 'US'
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
      eventName: '',
      addressLine1: '',
      addressLine2: '',
      city: '',
      state: '',
      postalCode: '',
      country: ''
    });
  }, []);

  const handleCloseEditClient = useCallback(() => {
    setIsEditClientOpen(false);
    setEditClientError(null);
  }, []);

  const handleOpenEditClient = useCallback(async () => {
    if (!currentPractice?.id || !selectedClient) return;
    setEditClientError(null);
    try {
      const detail = await getUserDetail(currentPractice.id, selectedClient.id);
      const name = detail?.user?.name?.trim() || detail?.user?.email?.trim() || selectedClient.name;
      setEditClientForm({
        id: selectedClient.id,
        name,
        email: detail?.user?.email ?? selectedClient.email,
        phone: detail?.user?.phone ?? selectedClient.phone ?? '',
        status: detail?.status ?? selectedClient.status,
        currency: detail?.currency ?? 'usd',
        eventName: '',
        addressLine1: '',
        addressLine2: '',
        city: '',
        state: '',
        postalCode: '',
        country: ''
      });
      setIsEditClientOpen(true);
    } catch (error) {
      console.error('[Clients] Failed to load client detail', error);
      setEditClientError('Failed to load client');
      setIsEditClientOpen(true);
    }
  }, [currentPractice?.id, selectedClient]);

  const handleSubmitEditClient = useCallback(async () => {
    if (!currentPractice?.id || !editClientForm.id) return;
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
      const addressLine1 = editClientForm.addressLine1.trim();
      const addressLine2 = editClientForm.addressLine2.trim();
      const city = editClientForm.city.trim();
      const state = editClientForm.state.trim();
      const postalCode = editClientForm.postalCode.trim();
      const country = editClientForm.country.trim();
      const hasAddress =
        Boolean(addressLine1) ||
        Boolean(addressLine2) ||
        Boolean(city) ||
        Boolean(state) ||
        Boolean(postalCode) ||
        Boolean(country);

      await updateUserDetail(currentPractice.id, editClientForm.id, {
        name,
        email,
        phone: editClientForm.phone.trim() || undefined,
        status: editClientForm.status,
        currency: editClientForm.currency.trim() || 'usd',
        event_name: editClientForm.eventName.trim() || undefined,
        ...(hasAddress && {
          address: {
            line1: addressLine1 || undefined,
            line2: addressLine2 || undefined,
            city: city || undefined,
            state: state || undefined,
            postal_code: postalCode || undefined,
            country: country || undefined
          }
        })
      });
      await fetchClientsPage(1, { replace: true });
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
  }, [currentPractice?.id, editClientForm, editClientSubmitting, fetchClientsPage, resetEditClientForm, showError, showSuccess]);

  const handleDeleteClient = useCallback(async () => {
    if (!currentPractice?.id || !selectedClient) return;
    const confirmed = window.confirm('Delete this client?');
    if (!confirmed) return;
    try {
      await deleteUserDetail(currentPractice.id, selectedClient.id);
      await fetchClientsPage(1, { replace: true });
      showSuccess('Client deleted', 'The client has been removed.');
      setIsDrawerOpen(false);
    } catch (error) {
      console.error('[Clients] Failed to delete client', error);
      showError('Could not delete client', 'Please try again.');
    }
  }, [currentPractice?.id, fetchClientsPage, selectedClient, showError, showSuccess]);

  const handleSubmitAddClient = useCallback(async () => {
    if (!currentPractice?.id) return;
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
      await createUserDetail(currentPractice.id, {
        name,
        email,
        phone: addClientForm.phone.trim() || undefined,
        status: addClientForm.status,
        currency: addClientForm.currency.trim() || 'usd',
        event_name: addClientForm.eventName.trim() || undefined,
        address: {
          line1: addClientForm.addressLine1.trim() || undefined,
          line2: addClientForm.addressLine2.trim() || undefined,
          city: addClientForm.city.trim() || undefined,
          state: addClientForm.state.trim() || undefined,
          postal_code: addClientForm.postalCode.trim() || undefined,
          country: addClientForm.country.trim() || 'US'
        }
      });
      await fetchClientsPage(1, { replace: true });
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
  }, [addClientForm, addClientSubmitting, currentPractice?.id, fetchClientsPage, resetAddClientForm, showError, showSuccess]);

  const updateCurrentLetter = useCallback(() => {
    const container = listRef.current;
    if (!container) return;
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
  }, []);

  useEffect(() => {
    const container = listRef.current;
    if (!container) return;
    let rafId: number | null = null;
    const handleScroll = () => {
      if (rafId !== null) return;
      rafId = window.requestAnimationFrame(() => {
        rafId = null;
        updateCurrentLetter();
      });
    };
    container.addEventListener('scroll', handleScroll);
    updateCurrentLetter();
    return () => {
      container.removeEventListener('scroll', handleScroll);
      if (rafId !== null) {
        window.cancelAnimationFrame(rafId);
      }
    };
  }, [updateCurrentLetter]);

  const scrollToLetter = useCallback((letter: string) => {
    const container = listRef.current;
    if (!container) return;
    const target = container.querySelector<HTMLElement>(`[data-letter="${letter}"]`);
    if (target) {
      container.scrollTo({ top: target.offsetTop, behavior: 'smooth' });
    }
  }, []);

  const loadMoreClients = useCallback(async () => {
    if (!clientsHasMore || clientsLoading || clientsLoadingMore) {
      return;
    }
    const nextPage = clientsPage + 1;
    setClientsLoadingMore(true);
    await fetchClientsPage(nextPage);
  }, [clientsHasMore, clientsLoading, clientsLoadingMore, clientsPage, fetchClientsPage]);

  useEffect(() => {
    const target = loadMoreRef.current;
    const root = listRef.current;
    if (!target || !root) return;
    if (!clientsHasMore || clientsLoading || clientsLoadingMore) return;

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (entry?.isIntersecting) {
          void loadMoreClients();
        }
      },
      { root, rootMargin: '200px' }
    );

    observer.observe(target);
    return () => observer.disconnect();
  }, [clientsHasMore, clientsLoading, clientsLoadingMore, loadMoreClients]);

  const addClientModal = (
    <Modal
      isOpen={isAddClientOpen}
      onClose={handleCloseAddClient}
      title="Add Client"
      type="modal"
    >
      <div className="space-y-4">
        {addClientError && (
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {addClientError}
          </div>
        )}
        <ClientFormFields
          values={addClientForm}
          onChange={updateAddClientField}
          disabled={addClientSubmitting}
        />
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={handleCloseAddClient} disabled={addClientSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmitAddClient} disabled={addClientSubmitting}>
            {addClientSubmitting ? 'Saving...' : 'Add Client'}
          </Button>
        </div>
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
          <div className="rounded-md bg-red-50 border border-red-200 p-3 text-sm text-red-700">
            {editClientError}
          </div>
        )}
        <ClientFormFields
          values={editClientForm}
          onChange={updateEditClientField}
          disabled={editClientSubmitting}
        />
        <div className="flex justify-end gap-2 pt-4">
          <Button variant="secondary" onClick={handleCloseEditClient} disabled={editClientSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleSubmitEditClient} disabled={editClientSubmitting}>
            {editClientSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>
    </Modal>
  );

  if (clientsLoading) {
    return (
      <>
        <div className="h-full p-6">
          <div className="max-w-6xl mx-auto h-full">
            <PageHeader
              title="Clients"
              subtitle="A unified list of client relationships tied to conversations and matters."
            />
            <div className="mt-6 rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg min-h-[520px] flex items-center justify-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">Loading clients...</p>
            </div>
          </div>
        </div>
        {addClientModal}
        {editClientModal}
      </>
    );
  }

  if (clientsError) {
    return (
      <>
        <div className="h-full p-6">
          <div className="max-w-6xl mx-auto h-full">
            <PageHeader
              title="Clients"
              subtitle="A unified list of client relationships tied to conversations and matters."
            />
            <div className="mt-6 rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg min-h-[520px] flex items-center justify-center">
              <p className="text-sm text-gray-500 dark:text-gray-400">{clientsError}</p>
            </div>
          </div>
        </div>
        {addClientModal}
        {editClientModal}
      </>
    );
  }

  if (sortedClients.length === 0) {
    return (
      <>
        <div className="h-full p-6">
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
            <div className="mt-6 rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg min-h-[520px]">
              <EmptyState onAddClient={handleOpenAddClient} />
            </div>
          </div>
        </div>
        {addClientModal}
        {editClientModal}
      </>
    );
  }

  return (
    <>
      <div className="h-full p-6">
        <div className="max-w-6xl mx-auto flex h-full min-h-0 flex-col gap-6">
          <PageHeader
            title="Clients"
            subtitle="A unified list of client relationships tied to conversations and matters."
            actions={(
              <div className="flex items-center gap-2">
                <Button size="sm" icon={<PlusIcon className="h-4 w-4" />} onClick={handleOpenAddClient}>
                  Add Client
                </Button>
                <Button size="sm" variant="secondary" icon={<ArrowUpTrayIcon className="h-4 w-4" />}>
                  Import
                </Button>
              </div>
            )}
          />
          <div className="flex-1 min-h-0 rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg overflow-hidden">
            <div className="flex h-full flex-col lg:flex-row min-h-[560px]">
              <div className="relative w-full lg:w-1/3 border-b lg:border-b-0 lg:border-r border-gray-100 dark:border-white/10">
                <div
                  ref={listRef}
                  className="h-full overflow-y-auto"
                >
                  <ul className="divide-y divide-gray-100 dark:divide-white/10">
                    {letters.map((letter) => (
                      <Fragment key={letter}>
                        <li
                          data-letter={letter}
                          className="sticky top-0 z-10 bg-white dark:bg-dark-card-bg px-4 py-2 text-xs font-semibold text-gray-500 dark:text-gray-400"
                        >
                          {letter}
                        </li>
                        {groupedClients[letter].map((client) => {
                          const isActive = client.id === selectedClient?.id;
                          const nameParts = splitName(client.name);
                          return (
                            <li key={client.id}>
                              <Button
                                variant="ghost"
                                onClick={() => handleSelectClient(client.id)}
                                aria-current={isActive ? 'true' : undefined}
                                className={cn(
                                  'w-full justify-start px-4 py-3 h-auto',
                                  isActive
                                    ? 'bg-light-hover dark:bg-dark-hover border-l-2 border-accent-500'
                                    : 'hover:bg-gray-50 dark:hover:bg-dark-hover border-l-2 border-transparent'
                                )}
                              >
                                <div className="flex items-center gap-4 w-full">
                                  <Avatar
                                    name={client.name}
                                    size="sm"
                                    className="bg-gray-200 text-gray-700 dark:bg-gray-700"
                                  />
                                  <div className="min-w-0 flex-1 text-left">
                                    <p className="text-sm text-gray-900 dark:text-white truncate">
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
                              </Button>
                            </li>
                          );
                        })}
                      </Fragment>
                    ))}
                    <li
                      ref={loadMoreRef}
                      className="px-4 py-3 text-xs text-gray-500 dark:text-gray-400"
                    >
                      {clientsLoadingMore
                        ? 'Loading more clients...'
                        : clientsHasMore
                          ? 'Scroll to load more'
                          : 'No more clients'}
                    </li>
                  </ul>
                </div>
                <div className="absolute right-2 top-1/2 z-20 -translate-y-1/2 flex flex-col items-center gap-1 text-[11px] font-medium text-gray-500 dark:text-gray-400">
                  {letters.map((letter) => (
                    <Button
                      key={letter}
                      variant="ghost"
                      size="sm"
                      onClick={() => scrollToLetter(letter)}
                      className={cn(
                        'h-4 w-4 min-h-0 min-w-0 p-0 text-[11px] flex items-center justify-center',
                        currentLetter === letter
                          ? 'text-gray-900 dark:text-white font-semibold'
                          : 'text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
                      )}
                    >
                      {letter}
                    </Button>
                  ))}
                </div>
              </div>
              <div className="hidden lg:block flex-1">
                {selectedClient ? (
                  <ClientDetailPanel
                    client={selectedClient}
                    activity={selectedClientActivity}
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
                        <UserIcon className="h-6 w-6 text-gray-600 dark:text-gray-300" aria-hidden="true" />
                      </div>
                      <h3 className="mt-4 text-sm font-semibold text-gray-900 dark:text-white">Select a client</h3>
                      <p className="mt-2 text-sm text-gray-500 dark:text-gray-400">
                        Choose a client from the list to view their details.
                      </p>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {selectedClient && (
          <Modal
            isOpen={isMobile && isDrawerOpen}
            onClose={() => setIsDrawerOpen(false)}
            type="drawer"
            title="Client Details"
          >
            <ClientDetailPanel
              client={selectedClient}
              activity={selectedClientActivity}
              onAddMemo={handleMemoSubmit}
              memoSubmitting={memoSubmitting}
              onEditMemo={handleMemoEdit}
              onDeleteMemo={handleMemoDelete}
              memoActionId={memoActionId}
              onEditClient={handleOpenEditClient}
              onDeleteClient={handleDeleteClient}
              paddingClassName="px-0 py-0"
            />
          </Modal>
        )}
      </div>
      {addClientModal}
      {editClientModal}
    </>
  );
};

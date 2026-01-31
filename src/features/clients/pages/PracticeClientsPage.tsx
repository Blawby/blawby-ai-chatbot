import { Fragment } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { Button } from '@/shared/ui/Button';
import Modal from '@/shared/components/Modal';
import { Avatar } from '@/shared/ui/profile';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import { cn } from '@/shared/utils/cn';
import { ActivityTimeline, type TimelineItem } from '@/shared/ui/activity/ActivityTimeline';
import { formatDate } from '@/shared/utils/dateTime';
import { usePracticeManagement } from '@/shared/hooks/usePracticeManagement';
import {
  listUserDetails,
  listUserDetailMemos,
  createUserDetailMemo,
  updateUserDetailMemo,
  deleteUserDetailMemo,
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

type ClientRecord = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  status: UserDetailStatus;
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

const EmptyState = () => (
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
        <Button size="sm" icon={<PlusIcon className="h-4 w-4" />} disabled>
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

const ClientDetailPanel = ({
  client,
  activity,
  onAddMemo,
  memoSubmitting = false,
  onEditMemo,
  onDeleteMemo,
  memoActionId,
  paddingClassName = 'px-6 py-6'
}: {
  client: ClientRecord;
  activity: TimelineItem[];
  onAddMemo?: (value: string) => void | Promise<void>;
  memoSubmitting?: boolean;
  onEditMemo?: (memoId: string, value: string) => void | Promise<void>;
  onDeleteMemo?: (memoId: string) => void | Promise<void>;
  memoActionId?: string | null;
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
                <DropdownMenuItem>Edit</DropdownMenuItem>
                <DropdownMenuItem className="text-red-600 dark:text-red-400">Delete</DropdownMenuItem>
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
  const [clients, setClients] = useState<ClientRecord[]>([]);
  const [clientsLoading, setClientsLoading] = useState(false);
  const [clientsError, setClientsError] = useState<string | null>(null);
  const [memoTimeline, setMemoTimeline] = useState<Record<string, TimelineItem[]>>({});
  const [memoSubmitting, setMemoSubmitting] = useState(false);
  const [memoActionId, setMemoActionId] = useState<string | null>(null);

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
    return memos.map((memo, index) => {
      const rawDate =
        memo.created_at ||
        memo.createdAt ||
        memo.updated_at ||
        memo.updatedAt ||
        new Date().toISOString();
      const comment =
        memo.memo ??
        memo.content ??
        memo.body ??
        memo.note ??
        '';
      const personName =
        memo.user?.name ??
        memo.user?.email ??
        'Team member';
      const date = formatDate(rawDate);
      return {
        id: memo.id ?? `${client.id}-memo-${index}`,
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

  useEffect(() => {
    if (!currentPractice?.id) {
      setClients([]);
      return;
    }

    setClientsLoading(true);
    setClientsError(null);

    listUserDetails(currentPractice.id, { limit: 100, offset: 0 })
      .then((response) => {
        const nextClients = response.data.map(buildClientRecord);
        setClients(nextClients);
        if (nextClients.length > 0) {
          setSelectedClientId((prev) => (prev && nextClients.some(c => c.id === prev) ? prev : nextClients[0].id));
        } else {
          setSelectedClientId('');
        }
      })
      .catch((error) => {
        console.error('[Clients] Failed to load user details', error);
        setClientsError('Failed to load clients');
      })
      .finally(() => {
        setClientsLoading(false);
      });
  }, [buildClientRecord, currentPractice?.id]);

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
      await createUserDetailMemo(currentPractice.id, selectedClient.id, { memo: text });
      await refreshClientMemos(selectedClient);
    } catch (error) {
      console.error('[Clients] Failed to create memo', error);
    } finally {
      setMemoSubmitting(false);
    }
  }, [currentPractice?.id, memoSubmitting, refreshClientMemos, selectedClient]);

  const handleMemoEdit = useCallback(async (memoId: string, text: string) => {
    if (!currentPractice?.id || !selectedClient) return;
    if (memoActionId) return;
    setMemoActionId(memoId);
    try {
      await updateUserDetailMemo(currentPractice.id, selectedClient.id, memoId, { memo: text });
      await refreshClientMemos(selectedClient);
    } catch (error) {
      console.error('[Clients] Failed to update memo', error);
    } finally {
      setMemoActionId(null);
    }
  }, [currentPractice?.id, memoActionId, refreshClientMemos, selectedClient]);

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
    } finally {
      setMemoActionId(null);
    }
  }, [currentPractice?.id, memoActionId, refreshClientMemos, selectedClient]);

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

  if (clientsLoading) {
    return (
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
    );
  }

  if (clientsError) {
    return (
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
    );
  }

  if (sortedClients.length === 0) {
    return (
      <div className="h-full p-6">
        <div className="max-w-6xl mx-auto h-full">
          <PageHeader
            title="Clients"
            subtitle="A unified list of client relationships tied to conversations and matters."
            actions={(
              <div className="flex items-center gap-2">
                <Button size="sm" icon={<PlusIcon className="h-4 w-4" />} disabled>
                  Add Client
                </Button>
                <Button size="sm" variant="secondary" icon={<ArrowUpTrayIcon className="h-4 w-4" />} disabled>
                  Import
                </Button>
              </div>
            )}
          />
          <div className="mt-6 rounded-2xl border border-gray-200 dark:border-dark-border bg-white dark:bg-dark-card-bg min-h-[520px]">
            <EmptyState />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full p-6">
      <div className="max-w-6xl mx-auto flex h-full min-h-0 flex-col gap-6">
        <PageHeader
          title="Clients"
          subtitle="A unified list of client relationships tied to conversations and matters."
          actions={(
            <div className="flex items-center gap-2">
              <Button size="sm" icon={<PlusIcon className="h-4 w-4" />}>Add Client</Button>
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
            paddingClassName="px-0 py-0"
          />
        </Modal>
      )}
    </div>
  );
};

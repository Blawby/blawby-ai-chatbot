import { Fragment } from 'preact';
import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { Button } from '@/shared/ui/Button';
import Modal from '@/shared/components/Modal';
import { Avatar } from '@/shared/ui/profile';
import { useMobileDetection } from '@/shared/hooks/useMobileDetection';
import { cn } from '@/shared/utils/cn';
import { ActivityTimeline, type TimelineItem } from '@/shared/ui/activity/ActivityTimeline';
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

type ClientStatus = 'Client' | 'Lead';

type ClientRecord = {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  status: ClientStatus;
  activity: TimelineItem[];
};

const slugify = (value: string) =>
  value.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)+/g, '');

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

const buildActivity = (clientName: string): TimelineItem[] => {
  const baseId = slugify(clientName);
  const manager = {
    name: 'Chelsea Hagon',
    imageUrl:
      'https://images.unsplash.com/photo-1550525811-e5869dd03032?ixlib=rb-1.2.1&auto=format&fit=facearea&facepad=2&w=256&h=256&q=80'
  };
  const reviewer = {
    name: 'Alex Curren'
  };

  return [
    {
      id: `${baseId}-created`,
      type: 'created',
      person: manager,
      date: '7d ago',
      dateTime: '2026-01-18T10:32',
      action: 'created the client record.'
    },
    {
      id: `${baseId}-edited`,
      type: 'edited',
      person: manager,
      date: '6d ago',
      dateTime: '2026-01-19T11:03',
      action: 'updated intake details.'
    },
    {
      id: `${baseId}-sent`,
      type: 'sent',
      person: manager,
      date: '6d ago',
      dateTime: '2026-01-19T11:24',
      action: 'sent the invoice.'
    },
    {
      id: `${baseId}-commented`,
      type: 'commented',
      person: manager,
      comment: `Messaged ${clientName}, they reassured us the invoice will be paid by the 25th.`,
      date: '3d ago',
      dateTime: '2026-01-22T15:56'
    },
    {
      id: `${baseId}-viewed`,
      type: 'viewed',
      person: reviewer,
      date: '2d ago',
      dateTime: '2026-01-23T09:12',
      action: 'viewed the invoice.'
    },
    {
      id: `${baseId}-paid`,
      type: 'paid',
      person: reviewer,
      date: '1d ago',
      dateTime: '2026-01-24T09:20',
      action: 'paid the invoice.'
    }
  ];
};

const makeClient = (name: string, status: ClientStatus, phone: string | null) => ({
  id: `client-${slugify(name)}`,
  name,
  email: `${slugify(name).replace(/-/g, '.')}@blawby.com`,
  phone,
  status,
  activity: buildActivity(name)
});

const baseClients: ClientRecord[] = [
  {
    id: 'client-avery-chen',
    name: 'Avery Chen',
    email: 'avery.chen@blawby.com',
    phone: '4155550198',
    status: 'Client',
    activity: buildActivity('Avery Chen')
  },
  {
    id: 'client-jordan-patel',
    name: 'Jordan Patel',
    email: 'jordan.patel@blawby.com',
    phone: '3125550144',
    status: 'Lead',
    activity: buildActivity('Jordan Patel')
  },
  {
    id: 'client-luna-martinez',
    name: 'Luna Martinez',
    email: 'luna.martinez@blawby.com',
    phone: '6465550177',
    status: 'Client',
    activity: buildActivity('Luna Martinez')
  },
  {
    id: 'client-miles-okafor',
    name: 'Miles Okafor',
    email: 'miles.okafor@blawby.com',
    phone: null,
    status: 'Lead',
    activity: buildActivity('Miles Okafor')
  },
  {
    id: 'client-priya-desai',
    name: 'Priya Desai',
    email: 'priya.desai@blawby.com',
    phone: '2125550113',
    status: 'Client',
    activity: buildActivity('Priya Desai')
  },
  {
    id: 'client-sawyer-brooks',
    name: 'Sawyer Brooks',
    email: 'sawyer.brooks@blawby.com',
    phone: '9175550135',
    status: 'Client',
    activity: buildActivity('Sawyer Brooks')
  },
  {
    id: 'client-talia-nguyen',
    name: 'Talia Nguyen',
    email: 'talia.nguyen@blawby.com',
    phone: null,
    status: 'Lead',
    activity: buildActivity('Talia Nguyen')
  },
  {
    id: 'client-zane-howard',
    name: 'Zane Howard',
    email: 'zane.howard@blawby.com',
    phone: '3055550122',
    status: 'Client',
    activity: buildActivity('Zane Howard')
  }
];

const extraClients: ClientRecord[] = [
  makeClient('Brooke Alvarez', 'Lead', '6195550147'),
  makeClient('Cameron Whitfield', 'Client', '5035550192'),
  makeClient('Daria Feldman', 'Client', null),
  makeClient('Elliot Park', 'Lead', '2135550188'),
  makeClient('Fatima Yusuf', 'Client', '2065550174'),
  makeClient('Gianna Russo', 'Client', null),
  makeClient('Hector Ibarra', 'Lead', '7025550161'),
  makeClient('Isabel Flores', 'Client', '9175550126'),
  makeClient('Jonas Keller', 'Lead', '4155550112'),
  makeClient('Keira Dawson', 'Client', null),
  makeClient('Levi Grant', 'Client', '8085550140'),
  makeClient('Maya Kapoor', 'Lead', '3125550194'),
  makeClient('Noah Bennett', 'Client', '6465550189'),
  makeClient('Olivia Rhodes', 'Lead', null),
  makeClient('Paolo Ricci', 'Client', '3475550133'),
  makeClient('Quinn Bailey', 'Lead', '5125550166'),
  makeClient('Renee Wallace', 'Client', null),
  makeClient('Samir Haddad', 'Client', '2125550179'),
  makeClient('Tessa Nguyen', 'Lead', '4155550155'),
  makeClient('Uma Patel', 'Client', null),
  makeClient('Victor Chen', 'Lead', '7185550107'),
  makeClient('Willa Parks', 'Client', '9095550129'),
  makeClient('Xavier Ortiz', 'Lead', null),
  makeClient('Yara Haddad', 'Client', '3055550170'),
  makeClient('Zoe Hart', 'Lead', '6465550148')
];

const mockClients: ClientRecord[] = [...baseClients, ...extraClients];

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

const StatusPill = ({ status }: { status: ClientStatus }) => (
  <span
    className={cn(
      'inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium',
      status === 'Client'
        ? 'bg-green-100 text-green-800 dark:bg-green-900/40 dark:text-green-200'
        : 'bg-amber-100 text-amber-900 dark:bg-amber-900/40 dark:text-amber-200'
    )}
  >
    {status}
  </span>
);

const ClientDetailPanel = ({
  client,
  paddingClassName = 'px-6 py-6'
}: {
  client: ClientRecord;
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
          <ActivityTimeline items={client.activity} showComposer composerDisabled />
        </div>
      </div>
    </div>
  </div>
);

export const PracticeClientsPage = () => {
  const isMobile = useMobileDetection();
  const sortedClients = useMemo(
    () => [...mockClients].sort((a, b) => a.name.localeCompare(b.name)),
    []
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

  const handleSelectClient = useCallback((clientId: string) => {
    setSelectedClientId(clientId);
    if (isMobile) {
      setIsDrawerOpen(true);
    }
  }, [isMobile]);

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
                <ClientDetailPanel client={selectedClient} />
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
          <ClientDetailPanel client={selectedClient} paddingClassName="px-0 py-0" />
        </Modal>
      )}
    </div>
  );
};

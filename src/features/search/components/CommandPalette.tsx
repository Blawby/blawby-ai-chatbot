import { useMemo, useState, useEffect, useRef } from 'preact/hooks';
import { useNavigation } from '@/shared/utils/navigation';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useGlobalSearch } from '../hooks/useGlobalSearch';
import { useSearchRecents } from '../hooks/useSearchRecents';
import { recordSearchClick } from '../services/searchApi';
import {
  parseQuery,
  type SearchScope,
} from '../utils/parseQuery';
import type {
  SearchEnvelope,
  SearchResultItem,
  SearchEntityType,
} from '../services/searchTypes';
import { cn } from '@/shared/utils/cn';
import {
  Users,
  Briefcase,
  FileText,
  MessageSquare,
  File as FileIcon,
  ClipboardList,
  StickyNote,
  Search,
} from 'lucide-preact';

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  practiceId: string | null;
  practiceSlug: string | null;
  workspace: 'practice' | 'client' | 'public';
};

const ENTITY_ICON: Record<SearchEntityType, typeof Users> = {
  client: Users,
  matter: Briefcase,
  invoice: FileText,
  conversation: MessageSquare,
  file: FileIcon,
  file_chunk: FileIcon,
  intake: ClipboardList,
  note: StickyNote,
};

export function CommandPalette({
  open,
  onClose,
  practiceId,
  practiceSlug,
  workspace,
}: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { session } = useSessionContext();
  const { navigate } = useNavigation();
  const userId = session?.user?.id ?? null;
  const { recents, push: pushRecent } = useSearchRecents(practiceId, userId);

  const { envelope, loading, error } = useGlobalSearch(practiceId, query);

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  const parsed = useMemo(() => parseQuery(query), [query]);

  const flatItems = useMemo(() => {
    if (!envelope) return [] as Array<{ groupId: string; item: SearchResultItem; rank: number }>;
    const flat: Array<{ groupId: string; item: SearchResultItem; rank: number }> = [];
    let rank = 0;
    for (const group of envelope.groups) {
      for (const item of group.items) {
        flat.push({ groupId: group.id, item, rank });
        rank += 1;
      }
    }
    return flat;
  }, [envelope]);

  const [activeIndex, setActiveIndex] = useState(0);
  useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  useEffect(() => {
    if (!open) return;
    const handler = (event: KeyboardEvent) => {
      if (flatItems.length === 0) return;
      if (event.key === 'ArrowDown') {
        event.preventDefault();
        setActiveIndex((i) => Math.min(i + 1, flatItems.length - 1));
      } else if (event.key === 'ArrowUp') {
        event.preventDefault();
        setActiveIndex((i) => Math.max(i - 1, 0));
      } else if (event.key === 'Enter') {
        event.preventDefault();
        const target = flatItems[activeIndex];
        if (target) selectResult(target.item, target.rank);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, flatItems, activeIndex]);

  function selectResult(item: SearchResultItem, rank: number): void {
    if (envelope?.queryLogId && practiceId) {
      void recordSearchClick(
        practiceId,
        envelope.queryLogId,
        item.entityType,
        item.entityId,
        rank,
      ).catch(() => {
        /* fire and forget */
      });
    }
    pushRecent(query);
    const path = buildEntityPath(item, practiceSlug, workspace);
    if (path) navigate(path);
    onClose();
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-start justify-center pt-[15vh] px-4"
      role="dialog"
      aria-modal="true"
      aria-label="Global search"
      onClick={onClose}
    >
      <div
        className="absolute inset-0 bg-neutral-950/60"
        aria-hidden="true"
      />
      <div
        className={cn(
          'relative w-full max-w-2xl rounded-2xl shadow-2xl overflow-hidden',
          'bg-white dark:bg-neutral-900',
          'border border-neutral-200 dark:border-neutral-800',
        )}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center gap-2 px-4 border-b border-neutral-200 dark:border-neutral-800">
          <Search size={18} className="text-neutral-500" aria-hidden="true" />
          {parsed.scopes.length > 0 ? (
            <ScopePills scopes={parsed.scopes} />
          ) : null}
          <input
            ref={inputRef}
            type="text"
            value={query}
            onInput={(event) => setQuery((event.target as HTMLInputElement).value)}
            placeholder="Search clients, matters, invoices, files…"
            className="flex-1 bg-transparent py-3 outline-none text-base placeholder:text-neutral-500"
            aria-label="Search query"
          />
        </div>
        <div className="max-h-[60vh] overflow-y-auto py-2">
          {error ? (
            <EmptyState message={error} />
          ) : loading && !envelope ? (
            <EmptyState message="Searching…" />
          ) : envelope && envelope.groups.length === 0 && query.trim().length > 0 ? (
            <EmptyState message={`No results for "${query.trim()}"`} />
          ) : envelope ? (
            <ResultGroups
              envelope={envelope}
              activeIndex={activeIndex}
              onSelect={selectResult}
            />
          ) : recents.length > 0 ? (
            <RecentsList recents={recents} onPick={(q) => setQuery(q)} />
          ) : (
            <EmptyState message="Start typing to search" />
          )}
        </div>
        <Footer />
      </div>
    </div>
  );
}

function ScopePills({ scopes }: { scopes: SearchScope[] }) {
  return (
    <div className="flex gap-1.5 mr-1">
      {scopes.map((scope) => (
        <span
          key={scope}
          className="text-xs font-medium px-2 py-1 rounded-md bg-neutral-100 dark:bg-neutral-800 text-neutral-700 dark:text-neutral-300"
        >
          in:{scope}
        </span>
      ))}
    </div>
  );
}

function ResultGroups({
  envelope,
  activeIndex,
  onSelect,
}: {
  envelope: SearchEnvelope;
  activeIndex: number;
  onSelect: (item: SearchResultItem, rank: number) => void;
}) {
  let rank = 0;
  return (
    <div className="flex flex-col">
      {envelope.groups.map((group) => (
        <div key={group.id} className="px-2 pb-2">
          <div className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wider text-neutral-500 font-medium">
            {group.label}
          </div>
          {group.items.map((item) => {
            const itemRank = rank;
            rank += 1;
            const Icon = ENTITY_ICON[item.entityType] ?? FileIcon;
            const active = itemRank === activeIndex;
            return (
              <button
                key={`${item.entityType}:${item.entityId}`}
                type="button"
                onClick={() => onSelect(item, itemRank)}
                onMouseEnter={() => {
                  /* no-op for now; activeIndex is keyboard-driven */
                }}
                className={cn(
                  'w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left',
                  'transition-colors',
                  active
                    ? 'bg-neutral-100 dark:bg-neutral-800'
                    : 'hover:bg-neutral-50 dark:hover:bg-neutral-800/50',
                  item.archived ? 'opacity-60' : '',
                )}
              >
                <Icon size={16} className="mt-0.5 shrink-0 text-neutral-500" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate">
                    {item.title}
                    {item.archived ? (
                      <span className="ml-2 text-[10px] uppercase text-neutral-500">
                        archived
                      </span>
                    ) : null}
                  </div>
                  {item.subtitle ? (
                    <div className="text-xs text-neutral-500 truncate">{item.subtitle}</div>
                  ) : null}
                  {item.snippet ? (
                    <div
                      className="text-xs text-neutral-600 dark:text-neutral-400 mt-0.5"
                      dangerouslySetInnerHTML={{ __html: item.snippet }}
                    />
                  ) : null}
                </div>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function RecentsList({
  recents,
  onPick,
}: {
  recents: string[];
  onPick: (query: string) => void;
}) {
  return (
    <div className="px-2 pb-2">
      <div className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wider text-neutral-500 font-medium">
        Recent searches
      </div>
      {recents.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onPick(q)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
        >
          <Search size={14} className="text-neutral-400" aria-hidden="true" />
          <span className="text-sm">{q}</span>
        </button>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-6 py-10 text-center text-sm text-neutral-500">
      {message}
    </div>
  );
}

function Footer() {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-neutral-200 dark:border-neutral-800 text-[11px] text-neutral-500">
      <div className="flex gap-3">
        <span>↑↓ navigate</span>
        <span>↵ open</span>
        <span>esc close</span>
      </div>
      <span>Cmd/Ctrl+K to toggle</span>
    </div>
  );
}

function buildEntityPath(
  item: SearchResultItem,
  practiceSlug: string | null,
  workspace: 'practice' | 'client' | 'public',
): string | null {
  if (!practiceSlug) return null;
  const root = workspace === 'practice' ? '/practice' : '/client';
  const slug = encodeURIComponent(practiceSlug);
  switch (item.entityType) {
    case 'client':
      return `${root}/${slug}/contacts/${encodeURIComponent(item.entityId)}`;
    case 'matter':
      return `${root}/${slug}/matters/${encodeURIComponent(item.entityId)}`;
    case 'invoice':
      return `${root}/${slug}/invoices/${encodeURIComponent(item.entityId)}`;
    case 'conversation':
      return `${root}/${slug}/conversations/${encodeURIComponent(item.entityId)}`;
    case 'intake':
      return `${root}/${slug}/intakes/${encodeURIComponent(item.entityId)}`;
    case 'file':
    case 'file_chunk':
      return `${root}/${slug}/files`;
    default:
      return null;
  }
}

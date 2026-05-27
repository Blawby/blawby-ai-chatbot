import { useMemo, useState, useEffect, useRef, useCallback } from 'preact/hooks';
import { Dialog } from '@/shared/ui/dialog';
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
  BarChart3,
} from 'lucide-preact';

type CommandPaletteProps = {
  open: boolean;
  onClose: () => void;
  practiceId: string | null;
  practiceSlug: string | null;
  workspace: 'practice' | 'client' | 'public';
  initialQuery?: string;
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
  report: BarChart3,
};

export function CommandPalette({
  open,
  onClose,
  practiceId,
  practiceSlug,
  workspace,
  initialQuery = '',
}: CommandPaletteProps) {
  const [query, setQuery] = useState(initialQuery);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const { session } = useSessionContext();
  const { navigate } = useNavigation();
  const userId = session?.user?.id ?? null;
  const { recents, push: pushRecent } = useSearchRecents(practiceId, userId);

  const { envelope, loading, error } = useGlobalSearch(practiceId, query);
  const suggestions = envelope?.suggestions ?? [];

  useEffect(() => {
    if (!open) {
      setQuery('');
      return;
    }
    setQuery(initialQuery);
    const timer = window.setTimeout(() => inputRef.current?.focus(), 30);
    return () => window.clearTimeout(timer);
  }, [open, initialQuery]);

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

  // Pair query updates with an activeIndex reset at the call site rather
  // than via a derived-state useEffect — the effect form re-fired on every
  // query change including programmatic resets, racing with selectResult.
  const setQueryAndReset = useCallback((next: string) => {
    setQuery(next);
    setActiveIndex(0);
  }, []);

  const selectResult = useCallback(
    (item: SearchResultItem, rank: number): void => {
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
    },
    [envelope, practiceId, practiceSlug, workspace, query, pushRecent, navigate, onClose],
  );

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
  }, [open, flatItems, activeIndex, selectResult]);

  return (
    <Dialog
      isOpen={open}
      onClose={onClose}
      ariaLabelledBy="command-palette-title"
      showCloseButton={false}
      contentClassName="!p-0 !max-w-2xl !top-[15vh] !translate-y-0"
    >
      <div id="command-palette-title" className="sr-only">
        Global search
      </div>
      <div className="flex items-center gap-2 px-4 border-b border-line-subtle">
        <Search size={18} className="text-input-text/60" aria-hidden="true" />
        {parsed.scopes.length > 0 ? <ScopePills scopes={parsed.scopes} /> : null}
        <input
          ref={inputRef}
          type="text"
          value={query}
          onInput={(event) => setQueryAndReset((event.target as HTMLInputElement).value)}
          placeholder="Search clients, matters, invoices, files…"
          className="flex-1 bg-transparent py-3 outline-none text-base text-input-text placeholder:text-input-text/40"
          aria-label="Search query"
        />
      </div>
      <div className="max-h-[60vh] overflow-y-auto py-2">
        {suggestions.length > 0 ? (
          <SuggestionsList
            suggestions={suggestions}
            onPick={(s) => setQueryAndReset(s)}
          />
        ) : null}
        {error ? (
          <EmptyState message={error} />
        ) : loading && !envelope ? (
          <EmptyState message="Searching…" />
        ) : envelope && envelope.groups.length === 0 && query.trim().length > 0 ? (
          <>
            <EmptyState message={`No results for "${query.trim()}"`} />
            {envelope.didYouMean?.title ? (
              <DidYouMean
                title={envelope.didYouMean.title}
                onPick={() => envelope.didYouMean && setQueryAndReset(envelope.didYouMean.title ?? '')}
              />
            ) : null}
          </>
        ) : envelope ? (
          <ResultGroups
            envelope={envelope}
            activeIndex={activeIndex}
            onSelect={selectResult}
          />
        ) : recents.length > 0 ? (
          <RecentsList recents={recents} onPick={(q) => setQueryAndReset(q)} />
        ) : (
          <EmptyState message="Start typing to search" />
        )}
      </div>
      <Footer />
    </Dialog>
  );
}

function ScopePills({ scopes }: { scopes: SearchScope[] }) {
  return (
    <div className="flex gap-1.5 mr-1">
      {scopes.map((scope) => (
        <span
          key={scope}
          className="text-xs font-medium px-2 py-1 rounded-md bg-surface-card-hover text-input-text"
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
          <div className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wider text-input-text/50 font-medium">
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
                className={cn(
                  'w-full flex items-start gap-3 px-3 py-2 rounded-lg text-left transition-colors',
                  active
                    ? 'bg-surface-card-hover'
                    : 'hover:bg-surface-card-hover/60',
                  item.archived ? 'opacity-60' : '',
                )}
              >
                <Icon size={16} className="mt-0.5 shrink-0 text-input-text/60" aria-hidden="true" />
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium truncate text-input-text">
                    {item.title}
                    {item.archived ? (
                      <span className="ml-2 text-[10px] uppercase text-input-text/50">
                        archived
                      </span>
                    ) : null}
                  </div>
                  {item.subtitle ? (
                    <div className="text-xs text-input-text/60 truncate">{item.subtitle}</div>
                  ) : null}
                  {item.snippet ? (
                    <div
                      className="text-xs text-input-text/70 mt-0.5"
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

function SuggestionsList({
  suggestions,
  onPick,
}: {
  suggestions: Array<{ query: string; source: 'user' | 'practice' }>;
  onPick: (query: string) => void;
}) {
  return (
    <div className="px-2 pb-2">
      <div className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wider text-input-text/50 font-medium">
        Suggestions
      </div>
      {suggestions.map((s) => (
        <button
          key={`${s.source}:${s.query}`}
          type="button"
          onClick={() => onPick(s.query)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-surface-card-hover/60"
        >
          <Search size={14} className="text-input-text/40" aria-hidden="true" />
          <span className="text-sm text-input-text flex-1">{s.query}</span>
          <span className="text-[10px] uppercase text-input-text/40">
            {s.source === 'user' ? 'recent' : 'popular'}
          </span>
        </button>
      ))}
    </div>
  );
}

function DidYouMean({
  title,
  onPick,
}: {
  title: string;
  onPick: () => void;
}) {
  return (
    <div className="px-6 pb-4 text-center">
      <div className="text-sm text-input-text/70">
        Did you mean{' '}
        <button
          type="button"
          onClick={onPick}
          className="text-input-text underline hover:no-underline"
        >
          {title}
        </button>
        ?
      </div>
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
      <div className="px-3 pt-3 pb-1 text-[11px] uppercase tracking-wider text-input-text/50 font-medium">
        Recent searches
      </div>
      {recents.map((q) => (
        <button
          key={q}
          type="button"
          onClick={() => onPick(q)}
          className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-left hover:bg-surface-card-hover/60"
        >
          <Search size={14} className="text-input-text/40" aria-hidden="true" />
          <span className="text-sm text-input-text">{q}</span>
        </button>
      ))}
    </div>
  );
}

function EmptyState({ message }: { message: string }) {
  return (
    <div className="px-6 py-10 text-center text-sm text-input-text/60">{message}</div>
  );
}

function Footer() {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-2.5 border-t border-line-subtle text-[11px] text-input-text/60">
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
      // Practice and client workspaces use different intake-detail URLs:
      //   practice: /practice/:slug/intakes/responses/:intakeId  (the
      //             response-detail route; the plain :intakeId slot is
      //             reserved for template editing — using it sends the
      //             user to a broken template page).
      //   client:   /client/:slug/intakes/:intakeId               (no
      //             template editing exists for clients).
      return workspace === 'practice'
        ? `${root}/${slug}/intakes/responses/${encodeURIComponent(item.entityId)}`
        : `${root}/${slug}/intakes/${encodeURIComponent(item.entityId)}`;
    case 'file':
    case 'file_chunk':
      return `${root}/${slug}/files`;
    case 'report':
      return `${root}/${slug}/reports/${encodeURIComponent(item.entityId)}`;
    default:
      return null;
  }
}

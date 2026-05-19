import { FunctionComponent } from 'preact';
import { useCallback, useMemo, useState } from 'preact/hooks';
import { useQuery } from '@/shared/hooks/useQuery';
import { apiClient } from '@/shared/lib/apiClient';
import { queryCache } from '@/shared/lib/queryCache';
import { Button } from '@/shared/ui/Button';
import { useNavigation } from '@/shared/utils/navigation';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { LoadingScreen } from '@/shared/ui/layout/LoadingScreen';

/**
 * U10: Admin intake-inspector page. Engineer-only — gated by the
 * `INTAKE_INSPECTOR_ENGINEER_EMAILS` worker env var (U9). This page is
 * intentionally minimal: a search input + per-turn timeline view. Provenance
 * badges. Per-row independent expand. "Clear AI failure" button when
 * `ai_failed_at` is set on the conversation.
 *
 * See U10 of docs/plans/2026-05-18-002-feat-strengthen-intake-ai-observability-plan.md.
 */

type ProvenanceTag =
  | 'ai_intake'
  | 'ai_intake_no_tool_call'
  | 'safety_rail.legal_disclaimer'
  | 'ai_failure'
  | 'submit_intake'
  | 'mode_unresolved';

interface IntakeTurn {
  id: string;
  conversation_id: string;
  practice_id: string;
  turn_seq: number;
  provenance: ProvenanceTag;
  mode_resolution: Record<string, unknown> | null;
  user_message: string | null;
  model_request: Record<string, unknown> | null;
  model_response: Record<string, unknown> | null;
  tool_calls: unknown[] | null;
  tool_results: unknown[] | null;
  failure_reason: string | null;
  created_at: string;
}

interface IntakeInspectorResponse {
  conversation_id: string;
  practice_id: string;
  ai_failed_at: string | null;
  intake_mode_activated_at: string | null;
  turns: IntakeTurn[];
}

const PROVENANCE_LABELS: Record<ProvenanceTag, string> = {
  'ai_intake': 'AI intake',
  'ai_intake_no_tool_call': 'AI intake (no tool call)',
  'safety_rail.legal_disclaimer': 'Safety rail — legal disclaimer',
  'ai_failure': 'AI failure',
  'submit_intake': 'Submit intake',
  'mode_unresolved': 'Mode unresolved',
};

const PROVENANCE_BADGE_CLASS: Record<ProvenanceTag, string> = {
  'ai_intake': 'bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/40 dark:text-emerald-200 dark:border-emerald-800',
  'ai_intake_no_tool_call': 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800',
  'safety_rail.legal_disclaimer': 'bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/40 dark:text-amber-200 dark:border-amber-800',
  'ai_failure': 'bg-red-100 text-red-800 border-red-200 dark:bg-red-900/40 dark:text-red-200 dark:border-red-800',
  'submit_intake': 'bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-900/40 dark:text-blue-200 dark:border-blue-800',
  'mode_unresolved': 'bg-orange-100 text-orange-800 border-orange-200 dark:bg-orange-900/40 dark:text-orange-200 dark:border-orange-800',
};

const buildTimelineKey = (conversationId: string): string =>
  `intake-inspector:timeline:${conversationId}`;

type TimelineFetchResult =
  | { kind: 'ok'; response: IntakeInspectorResponse }
  | { kind: 'not_found' };

const fetchTimeline = async (
  conversationId: string,
  signal?: AbortSignal,
): Promise<TimelineFetchResult> => {
  const url = `/api/admin/intake-events/${encodeURIComponent(conversationId)}`;
  try {
    const { data } = await apiClient.get<IntakeInspectorResponse>(url, { signal });
    return { kind: 'ok', response: data };
  } catch (error) {
    const httpStatus = (error as { status?: number })?.status;
    if (httpStatus === 404) {
      return { kind: 'not_found' };
    }
    throw error;
  }
};

interface PageProps {
  conversationId?: string;
}

const AdminIntakeInspectorPage: FunctionComponent<PageProps> = ({ conversationId }) => {
  const { session, isPending } = useSessionContext();

  if (isPending) return <LoadingScreen />;
  if (!session?.user || session.user.is_anonymous) {
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-semibold">Sign in required</h1>
        <p className="mt-2 text-sm text-input-text/70">
          The intake inspector is engineer-only. Sign in to continue.
        </p>
      </div>
    );
  }

  return conversationId ? (
    <TimelineView conversationId={conversationId} />
  ) : (
    <SearchEntry />
  );
};

const SearchEntry: FunctionComponent = () => {
  const { navigate } = useNavigation();
  const [input, setInput] = useState('');

  const submit = useCallback((e: Event) => {
    e.preventDefault();
    const id = input.trim();
    if (!id) return;
    navigate(`/admin/intake-inspector/${encodeURIComponent(id)}`);
  }, [input, navigate]);

  return (
    <div className="mx-auto max-w-2xl p-6">
      <h1 className="text-xl font-semibold">Intake inspector</h1>
      <p className="mt-2 text-sm text-input-text/70">
        Engineer-only view of the intake event timeline for a conversation. Paste a
        conversation id to load its timeline.
      </p>
      <form onSubmit={submit} className="mt-4 flex gap-2">
        <input
          type="text"
          value={input}
          onInput={(e) => setInput((e.currentTarget as HTMLInputElement).value)}
          placeholder="conversation_id"
          className="flex-1 rounded-md border border-input-border bg-surface-app px-3 py-2 text-sm"
          aria-label="Conversation id"
        />
        <Button type="submit" disabled={!input.trim()}>
          Open
        </Button>
      </form>
    </div>
  );
};

interface TimelineViewProps {
  conversationId: string;
}

const TimelineView: FunctionComponent<TimelineViewProps> = ({ conversationId }) => {
  const cacheKey = buildTimelineKey(conversationId);

  const fetcher = useCallback(
    (signal?: AbortSignal) => fetchTimeline(conversationId, signal),
    [conversationId],
  );

  const { data, error, isLoading, refetch } = useQuery<TimelineFetchResult>({
    key: cacheKey,
    fetcher,
  });

  const [clearError, setClearError] = useState<string | null>(null);
  const [isClearing, setIsClearing] = useState(false);

  const handleClearFailure = useCallback(async () => {
    setClearError(null);
    setIsClearing(true);
    try {
      await apiClient.post(
        `/api/admin/intake-events/${encodeURIComponent(conversationId)}/clear-failure`,
      );
      queryCache.invalidate(cacheKey);
      await refetch();
    } catch (err) {
      setClearError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsClearing(false);
    }
  }, [cacheKey, conversationId, refetch]);

  if (isLoading) return <LoadingScreen />;

  if (error) {
    const isForbidden = error.toLowerCase().includes('forbidden') || error.includes('403');
    return (
      <div className="mx-auto max-w-2xl p-6">
        <h1 className="text-xl font-semibold">
          {isForbidden ? 'Not authorized' : 'Failed to load timeline'}
        </h1>
        <p className="mt-2 text-sm text-input-text/70">
          {isForbidden
            ? 'Your account is not in the intake-inspector engineer allowlist.'
            : error}
        </p>
      </div>
    );
  }

  if (!data) return null;

  if (data.kind === 'not_found') {
    return (
      <div className="mx-auto max-w-3xl p-6">
        <h1 className="text-xl font-semibold">Conversation not found</h1>
        <p className="mt-2 text-sm text-input-text/70">
          No conversation with id <code>{conversationId}</code> exists.
        </p>
      </div>
    );
  }

  const response = data.response;
  const turns = response.turns;
  const isFailed = Boolean(response.ai_failed_at);

  return (
    <div className="mx-auto max-w-4xl p-6">
      <header className="mb-6">
        <div className="flex items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold">Intake inspector</h1>
            <p className="mt-1 text-sm text-input-text/70">
              <span className="font-mono">{conversationId}</span>
            </p>
          </div>
          {isFailed && (
            <Button onClick={handleClearFailure} disabled={isClearing} variant="secondary">
              {isClearing ? 'Clearing…' : 'Clear AI failure (unbrick)'}
            </Button>
          )}
        </div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm">
          <SummaryChip label="Status" value={isFailed ? 'AI failed' : 'OK'} valueClass={isFailed ? 'text-red-600 dark:text-red-300' : 'text-emerald-600 dark:text-emerald-300'} />
          <SummaryChip label="Turns" value={String(turns.length)} />
          <SummaryChip label="Practice" value={response.practice_id} valueClass="font-mono text-xs" />
          {response.intake_mode_activated_at && (
            <SummaryChip label="Intake mode since" value={formatTimestamp(response.intake_mode_activated_at)} />
          )}
          {response.ai_failed_at && (
            <SummaryChip label="Failed at" value={formatTimestamp(response.ai_failed_at)} />
          )}
        </div>
        {clearError && (
          <p role="alert" className="mt-2 text-sm text-red-600 dark:text-red-300">
            Failed to clear AI failure: {clearError}
          </p>
        )}
      </header>

      {turns.length === 0 ? (
        <p className="text-sm text-input-text/70">No timeline events recorded for this conversation.</p>
      ) : (
        <ol className="space-y-2">
          {turns.map((turn) => (
            <IntakeTimelineRow key={turn.id} turn={turn} />
          ))}
        </ol>
      )}
    </div>
  );
};

const SummaryChip: FunctionComponent<{ label: string; value: string; valueClass?: string }> = ({
  label,
  value,
  valueClass,
}) => (
  <div className="flex flex-col gap-0.5">
    <span className="text-xs uppercase tracking-wide text-input-text/60">{label}</span>
    <span className={valueClass ?? 'text-sm font-medium'}>{value}</span>
  </div>
);

interface IntakeTimelineRowProps {
  turn: IntakeTurn;
}

const IntakeTimelineRow: FunctionComponent<IntakeTimelineRowProps> = ({ turn }) => {
  const [expanded, setExpanded] = useState(false);
  const provenanceBadge = PROVENANCE_BADGE_CLASS[turn.provenance] ?? 'bg-gray-100 text-gray-800';
  const provenanceLabel = PROVENANCE_LABELS[turn.provenance] ?? turn.provenance;

  return (
    <li className="rounded-md border border-input-border bg-surface-app">
      <button
        type="button"
        className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left"
        onClick={() => setExpanded((value) => !value)}
        aria-expanded={expanded}
      >
        <span className="flex items-center gap-3">
          <span className="font-mono text-xs text-input-text/60">#{turn.turn_seq}</span>
          <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-medium ${provenanceBadge}`}>
            {provenanceLabel}
          </span>
          {turn.failure_reason && (
            <span className="text-xs text-red-600 dark:text-red-300">{turn.failure_reason}</span>
          )}
        </span>
        <span className="text-xs text-input-text/60">{formatTimestamp(turn.created_at)}</span>
      </button>
      {expanded && (
        <div className="border-t border-input-border px-3 py-2 text-xs">
          {turn.user_message && (
            <ExpandedSection label="User message">
              <pre className="whitespace-pre-wrap break-words">{turn.user_message}</pre>
            </ExpandedSection>
          )}
          <ExpandedSection label="Mode resolution">
            <JsonBlock value={turn.mode_resolution} />
          </ExpandedSection>
          <ExpandedSection label="Model request">
            <JsonBlock value={turn.model_request} />
          </ExpandedSection>
          <ExpandedSection label="Model response">
            <JsonBlock value={turn.model_response} />
          </ExpandedSection>
          <ExpandedSection label="Tool calls">
            <JsonBlock value={turn.tool_calls} />
          </ExpandedSection>
          <ExpandedSection label="Tool results">
            <JsonBlock value={turn.tool_results} />
          </ExpandedSection>
        </div>
      )}
    </li>
  );
};

const ExpandedSection: FunctionComponent<{ label: string; children: preact.ComponentChildren }> = ({
  label,
  children,
}) => (
  <details className="mb-2" open>
    <summary className="cursor-pointer text-xs font-medium text-input-text/70">{label}</summary>
    <div className="mt-1 rounded bg-surface-utility/40 p-2 dark:bg-surface-utility/20">{children}</div>
  </details>
);

const JsonBlock: FunctionComponent<{ value: unknown }> = ({ value }) => {
  const serialized = useMemo(() => {
    if (value === null || value === undefined) return '—';
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  }, [value]);
  return <pre className="whitespace-pre-wrap break-all text-xs">{serialized}</pre>;
};

const formatTimestamp = (iso: string): string => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return date.toLocaleString();
};

export default AdminIntakeInspectorPage;

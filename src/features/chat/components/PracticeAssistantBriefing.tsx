import { useCallback, useEffect, useMemo, useRef, useState } from 'preact/hooks';
import { Check, X } from 'lucide-preact';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { useSidebarCounts } from '@/shared/hooks/useSidebarCounts';
import { useClientsData } from '@/shared/hooks/useClientsData';
import { useMattersData } from '@/shared/hooks/useMattersData';
import { useNavigation } from '@/shared/utils/navigation';
import {
  AIAnswerCard,
  AIAskBar,
  BriefingGrid,
  Citations,
  Observation,
  StagedAction,
} from '@/design-system/patterns';
import { Bar, SignalPill } from '@/design-system/primitives';
import { usePracticeBillingData } from '@/features/practice-dashboard/hooks/usePracticeBillingData';
import { listIntakes, type IntakeListItem } from '@/features/intake/api/intakesApi';
import { resolveIntakeTitle } from '@/features/intake/utils/intakeTitle';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { apiClient } from '@/shared/lib/apiClient';
import { matterNestedPath } from '@/config/urls';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { getMajorAmountValue, type MajorAmount } from '@/shared/utils/money';
import { getOnboardingStatusPayload, isAbortError, isHttpError } from '@/shared/lib/apiClient';
import { extractStripeStatusFromPayload } from '@/features/onboarding/utils';
import type { BackendMatter } from '@/features/matters/services/mattersApi';

// ── types ────────────────────────────────────────────────────────────────────

interface PracticeAssistantBriefingProps {
  practiceId: string;
  practiceSlug: string | null;
  practiceName?: string | null;
  /** Called when the user submits a question from the AIAskBar. */
  onAsk: (question: string) => void;
}

interface SetupStep {
  id: string;
  title: string;
  description: string;
  complete: boolean;
  href: string | null;
}
type StripeStatus = ReturnType<typeof extractStripeStatusFromPayload>;

interface AskHistoryItem {
  id: string;
  question: string;
}

// ── helpers ───────────────────────────────────────────────────────────────────

const SETUP_DISMISSED_STORAGE_KEY = 'blawby:practice-home:setup-dismissed';

const hasMoneyValue = (value: MajorAmount | null | undefined) =>
  Math.abs(getMajorAmountValue(value)) > 0;

const URGENCY_RANK: Record<string, number> = {
  emergency: 3,
  time_sensitive: 2,
  routine: 1,
};

const pickPriorityIntake = (intakes: readonly IntakeListItem[]): IntakeListItem | null => {
  if (intakes.length === 0) return null;
  const sorted = [...intakes]
    .filter((row) => row.triage_status === 'pending_review')
    .sort((a, b) => {
      const ru = (URGENCY_RANK[a.urgency ?? ''] ?? 0) - (URGENCY_RANK[b.urgency ?? ''] ?? 0);
      if (ru !== 0) return -ru;
      const rs = (a.case_strength ?? 0) - (b.case_strength ?? 0);
      if (rs !== 0) return -rs;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  return sorted[0] ?? intakes[0] ?? null;
};

const matterUpdatedAt = (matter: BackendMatter): number => {
  const raw = matter.updated_at ?? matter.created_at ?? null;
  if (!raw) return 0;
  const t = new Date(raw).getTime();
  return Number.isFinite(t) ? t : 0;
};

const STALL_THRESHOLD_MS = 7 * 24 * 60 * 60 * 1000;

const pickStalledMatters = (matters: readonly BackendMatter[]): BackendMatter[] => {
  const now = Date.now();
  return matters
    .filter((m) => {
      const status = String(m.status ?? '').toLowerCase();
      if (status === 'closed' || status === 'archived') return false;
      return now - matterUpdatedAt(m) > STALL_THRESHOLD_MS;
    })
    .sort((a, b) => matterUpdatedAt(a) - matterUpdatedAt(b))
    .slice(0, 3);
};

const pickPinnedMatter = (matters: readonly BackendMatter[]): BackendMatter | null => {
  if (matters.length === 0) return null;
  const active = matters.filter((m) => {
    const status = String(m.status ?? '').toLowerCase();
    return status !== 'closed' && status !== 'archived';
  });
  const pool = active.length > 0 ? active : matters;
  const sorted = [...pool].sort((a, b) => {
    const au = (URGENCY_RANK[String(a.urgency ?? '').toLowerCase()] ?? 0);
    const bu = (URGENCY_RANK[String(b.urgency ?? '').toLowerCase()] ?? 0);
    if (au !== bu) return bu - au;
    return matterUpdatedAt(b) - matterUpdatedAt(a);
  });
  return sorted[0] ?? null;
};

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

const formatGreetingDate = (now = new Date()): string => {
  const day = DAY_NAMES[now.getDay()];
  const month = MONTH_NAMES[now.getMonth()];
  return `${day} · ${month} ${now.getDate()}, ${now.getFullYear()}`;
};

const greetingFor = (now = new Date()): string => {
  const hour = now.getHours();
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
};

// ── RecentActivityFeed ────────────────────────────────────────────────────────

interface BackendActivity { id: string; description: string | null; activity_type?: string | null; created_at: string; }

function RecentActivityFeed({ practiceId, matterId, onOpen, prefetched }: {
  practiceId: string;
  matterId: string;
  onOpen: (id: string) => void;
  prefetched?: Array<{ id: string; description: string; createdAt: string }>;
}) {
  const [items, setItems] = useState<BackendActivity[]>([]);
  const fetchedKeyRef = useRef<string | null>(null);

  useEffect(() => {
    if (prefetched && prefetched.length > 0) {
      setItems(prefetched.map((a) => ({
        id: a.id,
        description: a.description,
        activity_type: null,
        created_at: a.createdAt,
      })));
      fetchedKeyRef.current = `${practiceId}:${matterId}`;
    }
  }, [prefetched, practiceId, matterId]);

  useEffect(() => {
    if (!practiceId || !matterId) return;
    if (prefetched && prefetched.length > 0) return;
    const key = `${practiceId}:${matterId}`;
    if (fetchedKeyRef.current === key) return;
    const ctrl = new AbortController();
    const url = `${matterNestedPath(practiceId, matterId, 'activity')}?limit=5`;
    void apiClient.get<{ activities: BackendActivity[] }>(url, { signal: ctrl.signal })
      .then((res) => {
        if (ctrl.signal.aborted) return;
        fetchedKeyRef.current = key;
        setItems(res.activities ?? []);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [practiceId, matterId, prefetched]);

  if (items.length === 0) {
    return (
      <div className="rounded-md border border-rule bg-card px-3.5 py-3 text-[13px] text-dim">
        No recent events.{' '}
        <button type="button" className="underline hover:text-ink" onClick={() => onOpen(matterId)}>
          Open matter
        </button>{' '}
        for full timeline.
      </div>
    );
  }
  return (
    <div className="rounded-md border border-rule bg-card px-3.5 py-1">
      {items.map((item, idx) => (
        <div key={item.id} className={`grid grid-cols-[44px_1fr] gap-2.5 py-2 text-[12.5px] ${idx > 0 ? 'border-t border-rule' : ''}`}>
          <div className="pt-0.5 font-mono text-[9.5px] uppercase tracking-[0.06em] text-dim">
            {new Date(item.created_at).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}
          </div>
          <div className="text-ink">{item.description || item.activity_type || '—'}</div>
        </div>
      ))}
    </div>
  );
}

// ── main component ────────────────────────────────────────────────────────────

export function PracticeAssistantBriefing({
  practiceId,
  practiceSlug,
  onAsk,
}: PracticeAssistantBriefingProps) {
  const { session } = useSessionContext();
  const { navigate } = useNavigation();

  const [setupDismissed, setSetupDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try { return window.localStorage.getItem(SETUP_DISMISSED_STORAGE_KEY) === '1'; } catch { return false; }
  });
  const [askHistory, setAskHistory] = useState<AskHistoryItem[]>([]);
  const [focusDrawerPinned, setFocusDrawerPinned] = useState(true);
  const [focusUnbilledHours, setFocusUnbilledHours] = useState<number | null>(null);
  const [focusUnbilledAmount, setFocusUnbilledAmount] = useState<number | null>(null);
  const [focusEventCount, setFocusEventCount] = useState<number | null>(null);
  const [focusClientName, setFocusClientName] = useState<string | null>(null);
  const [focusClientPhone, setFocusClientPhone] = useState<string | null>(null);
  const [focusSolDate, setFocusSolDate] = useState<string | null>(null);
  const [focusStagedActions, setFocusStagedActions] = useState<Array<{ id: string; title: string; description: string }>>([]);
  const focusFetchAbort = useRef<AbortController | null>(null);
  const lastFetchedSummaryKey = useRef<string | null>(null);
  const [focusPrefetchedActivities, setFocusPrefetchedActivities] = useState<Array<{ id: string; description: string; createdAt: string }>>([]);

  const dismissSetup = () => {
    setSetupDismissed(true);
    try { window.localStorage.setItem(SETUP_DISMISSED_STORAGE_KEY, '1'); } catch { /* ignore */ }
  };

  const userName = session?.user?.name || session?.user?.email || 'there';
  const firstName = userName.split(' ')[0] || userName;
  const userEmail = session?.user?.email ?? null;

  const practiceBasePath = practiceSlug
    ? `/practice/${encodeURIComponent(practiceSlug)}`
    : null;

  const { hasDetails, fetchDetails } = usePracticeDetails(
    practiceId ?? null,
    practiceSlug,
    false,
  );
  useEffect(() => {
    if (!practiceId || hasDetails) return;
    void fetchDetails();
  }, [practiceId, hasDetails, fetchDetails]);

  const { counts: sidebarCounts, raw: rawSidebarCounts } = useSidebarCounts(
    practiceId ?? null,
    'home',
  );

  const activeClientsData = useClientsData(
    practiceId ?? '',
    'active',
    session?.user?.id ?? null,
    { enabled: Boolean(practiceId) },
  );

  const { summaryStats, loading: practiceBillingLoading } = usePracticeBillingData({
    practiceId,
    enabled: Boolean(practiceId),
    matterLimit: 25,
    windowSize: '7d',
  });

  const mattersData = useMattersData(practiceId ?? '', [], {
    enabled: Boolean(practiceId),
  });

  const [stripeStatus, setStripeStatus] = useState<StripeStatus>(null);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [recentIntakes, setRecentIntakes] = useState<IntakeListItem[]>([]);
  const [recentIntakesLoading, setRecentIntakesLoading] = useState(false);

  useEffect(() => {
    if (!practiceId) { setStripeStatus(null); setStripeError(null); return; }
    setStripeStatus(null); setStripeError(null);
    const controller = new AbortController();
    void getOnboardingStatusPayload(practiceId, { signal: controller.signal })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setStripeStatus(extractStripeStatusFromPayload(payload));
      })
      .catch((error) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        if (isHttpError(error) && error.response.status === 404) { setStripeStatus(null); setStripeError(null); return; }
        setStripeStatus(null);
        setStripeError(error instanceof Error ? error.message : 'Unable to load billing setup status');
      });
    return () => controller.abort();
  }, [practiceId]);

  useEffect(() => {
    if (!practiceId) { setRecentIntakes([]); setRecentIntakesLoading(false); return; }
    setRecentIntakes([]);
    const controller = new AbortController();
    setRecentIntakesLoading(true);
    void listIntakes(practiceId, { page: 1, limit: 10 }, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setRecentIntakes(result.intakes);
      })
      .catch((error) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        setRecentIntakes([]);
      })
      .finally(() => {
        if (!controller.signal.aborted) setRecentIntakesLoading(false);
      });
    return () => controller.abort();
  }, [practiceId]);

  const invoicesTotal = rawSidebarCounts?.invoices?.total ?? 0;
  const activeClientCount = activeClientsData.items.length;
  const billingComplete = Boolean(
    stripeStatus?.details_submitted &&
    stripeStatus?.charges_enabled &&
    stripeStatus?.payouts_enabled
  );

  const setupSteps: SetupStep[] = useMemo(() => [
    {
      id: 'account',
      title: 'Create account',
      description: 'Your account is set up and ready to go.',
      complete: Boolean(session?.user && !session.user.is_anonymous),
      href: null,
    },
    {
      id: 'billing',
      title: 'Set up billing',
      description: billingComplete
        ? 'Stripe is connected for payments and payouts.'
        : 'Connect Stripe before accepting invoice payments.',
      complete: billingComplete,
      href: practiceBasePath ? `${practiceBasePath}/settings/practice/payouts` : null,
    },
    {
      id: 'client',
      title: 'Add your first client',
      description: activeClientCount > 0
        ? `${activeClientCount} active ${activeClientCount === 1 ? 'client' : 'clients'} in contacts.`
        : 'Create an active client contact for intake and billing.',
      complete: activeClientCount > 0,
      href: practiceBasePath ? `${practiceBasePath}/contacts/new` : null,
    },
    {
      id: 'invoice',
      title: 'Send first invoice',
      description: invoicesTotal > 0
        ? `${invoicesTotal} ${invoicesTotal === 1 ? 'invoice has' : 'invoices have'} been created.`
        : 'Create and send an invoice to start cashflow tracking.',
      complete: invoicesTotal > 0,
      href: practiceBasePath ? `${practiceBasePath}/invoices/new` : null,
    },
  ], [activeClientCount, billingComplete, invoicesTotal, practiceBasePath, session?.user]);

  const completeSetupCount = setupSteps.filter((s) => s.complete).length;
  const setupVisible = !setupDismissed && completeSetupCount < setupSteps.length;
  const stalledMatters = useMemo(() => pickStalledMatters(mattersData.items), [mattersData.items]);
  const pinnedMatter = useMemo(() => pickPinnedMatter(mattersData.items), [mattersData.items]);
  const priorityIntake = useMemo(() => pickPriorityIntake(recentIntakes), [recentIntakes]);

  const pinnedMatterId = pinnedMatter?.id ?? null;
  useEffect(() => {
    const clientId = pinnedMatter?.client_id ?? null;
    const summaryKey = pinnedMatterId ? `${practiceId}:${pinnedMatterId}:${clientId ?? ''}` : null;
    if (!summaryKey || summaryKey === lastFetchedSummaryKey.current) return;
    focusFetchAbort.current?.abort();
    if (!practiceId || !pinnedMatterId) {
      setFocusUnbilledHours(null); setFocusUnbilledAmount(null); setFocusEventCount(null);
      setFocusClientName(null); setFocusClientPhone(null); setFocusSolDate(null); setFocusStagedActions([]);
      return;
    }
    const ctrl = new AbortController();
    focusFetchAbort.current = ctrl;
    const qs = clientId ? `?clientId=${encodeURIComponent(clientId)}` : '';
    const url = `/api/practice/${encodeURIComponent(practiceId)}/matter-summary/${encodeURIComponent(pinnedMatterId)}${qs}`;
    void apiClient.get<{
      unbilledHours: number; unbilledAmount: number; solDate: string | null;
      activities: Array<{ id: string; description: string; createdAt: string }>;
      eventCount30d: number; clientName: string | null; clientPhone: string | null;
      stagedActions: Array<{ id: string; title: string; description: string }>;
    }>(url, { signal: ctrl.signal })
      .then((res) => {
        if (ctrl.signal.aborted) return;
        const d = res.data;
        lastFetchedSummaryKey.current = summaryKey;
        setFocusUnbilledHours(d?.unbilledHours ?? null);
        setFocusUnbilledAmount(d?.unbilledAmount ?? null);
        setFocusEventCount(d?.eventCount30d ?? null);
        setFocusClientName(d?.clientName ?? null);
        setFocusClientPhone(d?.clientPhone ?? null);
        setFocusSolDate(d?.solDate ?? null);
        setFocusStagedActions(d?.stagedActions ?? []);
        if (d?.activities?.length) setFocusPrefetchedActivities(d.activities);
      })
      .catch(() => {});
    return () => ctrl.abort();
  }, [practiceId, pinnedMatterId, pinnedMatter?.client_id]);

  const openMattersTotal = rawSidebarCounts?.matters?.total ?? mattersData.items.length;
  const pendingIntakeCount = rawSidebarCounts?.intakes?.pending_review ?? 0;
  const unreadMessages = rawSidebarCounts?.conversations?.unread ?? 0;

  const revenueStat = summaryStats.find((s) => s.id === 'revenue');
  const outstandingStat = summaryStats.find((s) => s.id === 'outstanding') ?? summaryStats.find((s) => s.id === 'overdue');
  const unbilledStat = summaryStats.find((s) => s.id === 'unbilled');
  const hasCashflowData = summaryStats.some((m) => hasMoneyValue(m.value));

  const observationText = useMemo<string | null>(() => {
    if (priorityIntake) {
      const name = priorityIntake.metadata?.name?.trim() || 'a new prospect';
      const subject = resolveIntakeTitle(priorityIntake.metadata, '').toLowerCase();
      const urgent = String(priorityIntake.urgency ?? '').toLowerCase() === 'emergency';
      if (urgent && subject) return `${name} flagged their ${subject} as urgent. Worth a triage pass before the rest of the day fills up.`;
      if (urgent) return `${name} marked their intake as urgent. A quick triage now keeps your response window comfortable.`;
    }
    if (stalledMatters.length >= 2) {
      const oldestDays = Math.max(1, Math.round((Date.now() - matterUpdatedAt(stalledMatters[0])) / (24 * 60 * 60 * 1000)));
      return `${stalledMatters.length} active matters haven't moved in over a week — the longest is ${oldestDays} days quiet. A nudge cluster might shake something loose.`;
    }
    if (outstandingStat && hasMoneyValue(outstandingStat.value)) {
      return `You have ${formatCurrency(outstandingStat.value)} sitting in unpaid invoices. A single reminder pass usually clears about a third.`;
    }
    return null;
  }, [priorityIntake, stalledMatters, outstandingStat]);

  const goToIntake = useCallback((id: string) => {
    if (practiceBasePath) navigate(`${practiceBasePath}/intakes/responses/${encodeURIComponent(id)}`);
  }, [practiceBasePath, navigate]);
  const goToIntakesQueue = useCallback(() => {
    if (practiceBasePath) navigate(`${practiceBasePath}/intakes/responses`);
  }, [practiceBasePath, navigate]);
  const goToMatter = useCallback((matterId: string) => {
    if (practiceBasePath) navigate(`${practiceBasePath}/matters/${encodeURIComponent(matterId)}`);
  }, [practiceBasePath, navigate]);
  const goToMatters = useCallback(() => {
    if (practiceBasePath) navigate(`${practiceBasePath}/matters`);
  }, [practiceBasePath, navigate]);
  const goToNewInvoice = useCallback(() => {
    if (practiceBasePath) navigate(`${practiceBasePath}/invoices/new`);
  }, [practiceBasePath, navigate]);
  const handleSetupStep = useCallback((step: SetupStep) => {
    if (step.href) navigate(step.href);
  }, [navigate]);

  const greeting = greetingFor();
  const greetingDate = formatGreetingDate();

  // ── Greeting header ───────────────────────────────────────────────────────

  const greetingHero = (
    <header className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-5">
      <div className="min-w-0">
        <div className="font-mono text-[10.5px] uppercase tracking-[0.16em] text-dim">{greetingDate}</div>
        <h1 className="mt-1.5 font-serif text-[32px] font-normal leading-none tracking-tight text-ink lg:text-[60px]">
          {greeting}, <em className="text-accent">{firstName}.</em>
        </h1>
      </div>
      <div className="text-right text-sm leading-relaxed text-ink-2">
        <div className="mb-1 font-mono text-[10px] uppercase tracking-[0.14em] text-dim">Practice snapshot</div>
        <div>
          <span className="font-medium text-ink tabular-nums">{openMattersTotal}</span> open matters ·{' '}
          <span className="font-medium text-ink tabular-nums">{pendingIntakeCount}</span> pending intakes
        </div>
        <div><span className="font-medium text-ink tabular-nums">{unreadMessages}</span> unread messages</div>
      </div>
    </header>
  );

  // ── Priority intake feature card ──────────────────────────────────────────

  const heroCard = priorityIntake ? (() => {
    const name = priorityIntake.metadata?.name?.trim() || 'New prospect';
    const subject = resolveIntakeTitle(priorityIntake.metadata, `${name} intake`);
    const urgent = String(priorityIntake.urgency ?? '').toLowerCase() === 'emergency';
    return (
      <BriefingGrid.Card spanTwo feature>
        <div className="flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.14em] text-accent-deep">
          <span>If you do one thing today</span>
          {urgent ? <SignalPill signal="urgent" label="Urgent" /> : <SignalPill signal="warn" label="Triage" />}
        </div>
        <h3 className="mt-3 font-serif text-2xl font-normal leading-tight tracking-tight text-ink">Triage {name}&apos;s intake.</h3>
        <p className="mt-1.5 max-w-[46ch] text-[13.5px] leading-relaxed text-ink-2">
          {subject}
          {typeof priorityIntake.case_strength === 'number' ? ` · case strength ${priorityIntake.case_strength.toFixed(1)} / 5` : ''}
          {' · '}submitted {formatRelativeTime(priorityIntake.created_at)}.
        </p>
        <div className="mt-3.5 flex flex-wrap gap-1.5">
          <button type="button" className="chip primary" onClick={() => goToIntake(priorityIntake.uuid)}>Open intake</button>
          <button type="button" className="chip" onClick={goToIntakesQueue}>Open queue</button>
        </div>
      </BriefingGrid.Card>
    );
  })() : (
    <BriefingGrid.Card spanTwo feature>
      <div className="flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.14em] text-accent-deep">
        <span>If you do one thing today</span>
        <span className="font-sans text-[10.5px] normal-case tracking-normal text-accent-deep/80">All clear</span>
      </div>
      <h3 className="mt-3 font-serif text-2xl font-normal leading-tight tracking-tight text-ink">No urgent intake waiting on you.</h3>
      <p className="mt-1.5 max-w-[46ch] text-[13.5px] leading-relaxed text-ink-2">
        When a new prospect submits an intake, they&apos;ll show up here so you can decide fast.
      </p>
      <div className="mt-3.5 flex flex-wrap gap-1.5">
        <button type="button" className="chip" onClick={goToIntakesQueue}>Open queue</button>
      </div>
    </BriefingGrid.Card>
  );

  // ── Money card ────────────────────────────────────────────────────────────

  const moneyCard = (
    <BriefingGrid.Card>
      <div className="flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.14em] text-dim">
        <span>Money this week</span>
        <span className="font-sans text-[10.5px] normal-case tracking-normal text-ink-2">Last 7d</span>
      </div>
      {practiceBillingLoading && summaryStats.length === 0 ? (
        <div className="mt-3 space-y-2"><div className="h-8 w-28 rounded bg-paper-2" /><div className="h-3 w-40 rounded bg-paper-2" /></div>
      ) : hasCashflowData ? (
        <>
          <div className="mt-3 flex items-baseline gap-2">
            <span className="font-serif text-4xl leading-none tabular-nums text-ink">{formatCurrency(revenueStat?.value ?? unbilledStat?.value ?? 0)}</span>
            <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-dim">{revenueStat ? 'collected · 7d' : 'unbilled · 7d'}</span>
          </div>
          <svg aria-hidden="true" width="100%" height="40" viewBox="0 0 280 40" preserveAspectRatio="none" style={{ display: 'block', marginTop: '10px' }}>
            <defs>
              <linearGradient id="pa-spark-data" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="oklch(0.72 0.13 82)" stopOpacity="0.55" />
                <stop offset="100%" stopColor="oklch(0.72 0.13 82)" stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d="M0 32 L35 28 L70 30 L105 24 L140 20 L175 15 L210 11 L245 7 L280 3" fill="none" stroke="var(--ink)" strokeWidth="1.2" />
            <path d="M0 32 L35 28 L70 30 L105 24 L140 20 L175 15 L210 11 L245 7 L280 3 L280 40 L0 40 Z" fill="url(#pa-spark-data)" />
          </svg>
          {outstandingStat && hasMoneyValue(outstandingStat.value) ? (
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2"><span className="font-medium text-ink">{formatCurrency(outstandingStat.value)}</span>{' '}awaiting payment from sent invoices.</p>
          ) : (
            <p className="mt-2 text-[13px] leading-relaxed text-ink-2">All sent invoices are paid.</p>
          )}
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button type="button" className="chip primary" onClick={goToNewInvoice}>Draft invoice</button>
          </div>
        </>
      ) : (
        <>
          <svg aria-hidden="true" width="100%" height="40" viewBox="0 0 280 40" preserveAspectRatio="none" style={{ display: 'block', marginTop: '12px' }}>
            <line x1="0" y1="20" x2="280" y2="20" stroke="var(--rule)" strokeWidth="1" strokeDasharray="5 4" />
            {[0, 56, 112, 168, 224, 280].map((x) => (<circle key={x} cx={x} cy="20" r="2.5" fill="var(--paper-2)" stroke="var(--rule)" strokeWidth="1" />))}
          </svg>
          <p className="mt-2 text-[13.5px] leading-relaxed text-ink-2">No invoice activity yet — send your first to start tracking cashflow.</p>
          <div className="mt-3 flex flex-wrap gap-1.5">
            <button type="button" className="chip primary" onClick={goToNewInvoice}>Send first invoice</button>
          </div>
        </>
      )}
    </BriefingGrid.Card>
  );

  // ── This week card (milestones from matters) ──────────────────────────────

  const upcomingEvents = useMemo(() => {
    const now = Date.now();
    const twoWeeks = now + 14 * 24 * 60 * 60 * 1000;
    const events: { id: string; title: string; date: string; matterTitle: string }[] = [];
    for (const matter of mattersData.items) {
      const ms = Array.isArray(matter.milestones) ? matter.milestones as Array<Record<string, unknown>> : [];
      for (const m of ms) {
        const due = typeof m.due_date === 'string' ? m.due_date : null;
        if (!due) continue;
        const t = new Date(due).getTime();
        if (t < now || t > twoWeeks) continue;
        events.push({ id: String(m.id ?? `${matter.id}:${due}`), title: String(m.description || m.title || 'Milestone'), date: due, matterTitle: matter.title || 'Untitled matter' });
      }
    }
    return events.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()).slice(0, 4);
  }, [mattersData.items]);

  const DAY_ABBR = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];

  const thisWeekCard = (
    <BriefingGrid.Card>
      <div className="flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.14em] text-dim">
        <span>This week</span>
        <span className="font-sans text-[10.5px] normal-case tracking-normal text-ink-2">{upcomingEvents.length} {upcomingEvents.length === 1 ? 'event' : 'events'}</span>
      </div>
      {upcomingEvents.length === 0 ? (
        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">Nothing on the calendar for the next two weeks.</p>
      ) : (
        <>
          <h3 className="mt-3 font-serif text-xl font-normal leading-tight tracking-tight text-ink">{upcomingEvents[0].title}</h3>
          <p className="mt-0.5 text-[13px] text-ink-2">{upcomingEvents[0].matterTitle}</p>
          {upcomingEvents.length > 1 && (
            <ul className="mt-2 flex flex-col">
              {upcomingEvents.slice(1).map((ev, idx) => {
                const d = new Date(ev.date);
                return (
                  <li key={ev.id} className={`flex items-baseline gap-2 py-1.5 text-[13px] text-ink-2 ${idx > 0 ? 'border-t border-rule' : 'border-t border-rule'}`}>
                    <span className="min-w-[36px] font-mono text-[10px] text-dim">{DAY_ABBR[d.getDay()]}</span>
                    <span className="flex-1 truncate">{ev.title}</span>
                  </li>
                );
              })}
            </ul>
          )}
        </>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button type="button" className="chip" onClick={() => practiceBasePath && navigate(`${practiceBasePath}/calendar`)}>Open calendar</button>
      </div>
    </BriefingGrid.Card>
  );

  // ── Intakes card ──────────────────────────────────────────────────────────

  const intakesCard = (
    <BriefingGrid.Card>
      <div className="flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.14em] text-dim">
        <span>Intakes</span>
        <span className="font-sans text-[10.5px] normal-case tracking-normal text-ink-2">{recentIntakes.length} recent</span>
      </div>
      {recentIntakesLoading && recentIntakes.length === 0 ? (
        <div className="mt-3 space-y-2"><div className="h-4 w-3/4 rounded bg-paper-2" /><div className="h-4 w-2/3 rounded bg-paper-2" /></div>
      ) : recentIntakes.length === 0 ? (
        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">No intake submissions yet. Once a visitor completes a form, they&apos;ll appear here.</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {recentIntakes.slice(0, 3).map((row, idx) => {
            const name = row.metadata?.name?.trim() || row.metadata?.email?.trim() || 'Unknown';
            const urgency = String(row.urgency ?? '').toLowerCase();
            const signal: 'urgent' | 'warn' | 'quiet' = urgency === 'emergency' ? 'urgent' : urgency === 'time_sensitive' ? 'warn' : 'quiet';
            const label = urgency === 'emergency' ? 'urgent' : urgency === 'time_sensitive' ? 'soon' : 'routine';
            return (
              <li key={row.uuid} className={`flex items-baseline gap-2 py-1.5 text-[13px] text-ink-2 ${idx > 0 ? 'border-t border-rule' : ''}`}>
                <span className="min-w-[42px] font-mono text-[11px] text-dim">{formatRelativeTime(row.created_at).replace(' ago', '')}</span>
                <span className="flex-1 truncate">
                  <button type="button" className="font-medium text-ink hover:underline" onClick={() => goToIntake(row.uuid)}>{name}</button>
                </span>
                <SignalPill signal={signal} label={label} dot={false} />
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button type="button" className="chip" onClick={goToIntakesQueue}>Open queue</button>
      </div>
    </BriefingGrid.Card>
  );

  // ── Stalled card ──────────────────────────────────────────────────────────

  const stalledCard = (
    <BriefingGrid.Card>
      <div className="flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.14em] text-dim">
        <span>Matters going quiet</span>
        <span className="font-sans text-[10.5px] normal-case tracking-normal text-ink-2">{stalledMatters.length} stalled</span>
      </div>
      {mattersData.isLoading && mattersData.items.length === 0 ? (
        <div className="mt-3 space-y-2"><div className="h-4 w-3/4 rounded bg-paper-2" /><div className="h-4 w-2/3 rounded bg-paper-2" /></div>
      ) : stalledMatters.length === 0 ? (
        <p className="mt-3 text-[13.5px] leading-relaxed text-ink-2">Nothing stalled. Every active matter has moved in the past week.</p>
      ) : (
        <ul className="mt-2 flex flex-col">
          {stalledMatters.map((matter, idx) => {
            const days = Math.max(1, Math.round((Date.now() - matterUpdatedAt(matter)) / (24 * 60 * 60 * 1000)));
            return (
              <li key={matter.id} className={`flex items-baseline gap-2 py-1.5 text-[13px] text-ink-2 ${idx > 0 ? 'border-t border-rule' : ''}`}>
                <span className="min-w-[42px] font-mono text-[11px] text-dim">{days}d</span>
                <button type="button" className="flex-1 truncate text-left font-medium text-ink hover:underline" onClick={() => goToMatter(matter.id)}>
                  {matter.title || 'Untitled matter'}
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <div className="mt-3 flex flex-wrap gap-1.5">
        <button type="button" className="chip" onClick={goToMatters}>Show all</button>
      </div>
    </BriefingGrid.Card>
  );

  // ── Setup card ────────────────────────────────────────────────────────────

  const setupCard = setupVisible ? (
    <BriefingGrid.Card>
      <div className="flex items-center justify-between font-mono text-[9.5px] uppercase tracking-[0.14em] text-dim">
        <span>Setup</span>
        <div className="flex items-center gap-2">
          <span className="font-sans text-[10.5px] normal-case tracking-normal text-ink-2">{completeSetupCount}/{setupSteps.length} done</span>
          <button type="button" onClick={dismissSetup} aria-label="Dismiss setup checklist" className="btn btn-icon btn-icon-xs">
            <X className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </div>
      </div>
      <ul className="mt-3 flex flex-col gap-1.5">
        {setupSteps.map((step, idx) => (
          <li key={step.id}>
            <button
              type="button" disabled={!step.href} onClick={() => handleSetupStep(step)}
              className="flex w-full items-center gap-2 rounded-r-md py-1 text-left text-[13px] text-ink-2 transition-colors hover:text-ink disabled:cursor-default disabled:hover:text-ink-2"
            >
              {step.complete ? (
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full bg-accent text-accent-ink">
                  <Check className="h-3 w-3" strokeWidth={3} aria-hidden="true" />
                </span>
              ) : (
                <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-full border border-rule text-[10px] font-semibold text-ink">{idx + 1}</span>
              )}
              <span className={step.complete ? 'text-dim line-through' : 'font-medium text-ink'}>{step.title}</span>
            </button>
          </li>
        ))}
      </ul>
      {stripeError ? <p className="mt-2 text-xs text-neg">{stripeError}</p> : null}
    </BriefingGrid.Card>
  ) : null;

  // ── Ask response stub ─────────────────────────────────────────────────────

  const askResponseCard = askHistory.length > 0 ? (
    <AIAnswerCard
      groundingLabel="Practice assistant · stub answer · just now"
      lede={<>You asked <em className="text-accent-deep">{askHistory[0].question}</em> — a grounded answer will come from the assistant.</>}
      body={null}
      sources={[
        { table: 'intakes', count: recentIntakes.length },
        { table: 'matters', count: mattersData.items.length },
      ]}
    />
  ) : null;

  // ── Focus drawer ──────────────────────────────────────────────────────────

  const focusDrawer = (pinnedMatter && focusDrawerPinned) ? (() => {
    const matter = pinnedMatter;
    const urgent = String(matter.urgency ?? '').toLowerCase() === 'emergency';
    const opened = matter.created_at ? formatRelativeTime(matter.created_at) : '—';
    const matterType = matter.matter_type || 'Untitled';
    const jurisdiction = matter.court || '—';

    return (
      <aside
        className="hidden border-l border-rule bg-paper xl:flex xl:w-[400px] xl:shrink-0 xl:flex-col"
        aria-label="Pinned matter"
      >
        <div className="flex h-full flex-col gap-4 overflow-y-auto p-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="font-mono text-[10px] uppercase tracking-[0.14em] text-dim">Matter · pinned by assistant</div>
              <h2 className="mt-1.5 font-serif text-[30px] font-normal leading-tight tracking-tight text-ink">{matter.title || 'Untitled matter'}</h2>
              <div className="mt-1 text-[13px] text-dim">
                {focusClientName ?? matterType}{matter.case_number ? ` · ${matter.case_number}` : ''}{` · opened ${opened}`}
              </div>
              {urgent ? (
                <div className="mt-2 flex items-center gap-1.5 font-mono text-[10px] uppercase tracking-[0.1em] text-neg">
                  <span className="focus-priority-pulse" aria-hidden="true" />
                  Priority · high
                </div>
              ) : (
                <div className="mt-2 font-mono text-[10px] uppercase tracking-[0.1em] text-dim">Active</div>
              )}
            </div>
            <button type="button" onClick={() => setFocusDrawerPinned(false)} className="focus-drawer-close-btn" aria-label="Unpin matter" title="Unpin">×</button>
          </div>

          {focusStagedActions.map((action) => (
            <StagedAction key={action.id} title={action.title} description={action.description || undefined}
              actions={
                <div className="flex flex-wrap gap-1.5">
                  <a href={practiceBasePath ? `${practiceBasePath}/assistant` : '#'} className="chip primary">Review in assistant ↗</a>
                </div>
              }
            />
          ))}

          <div className="grid grid-cols-2 gap-2">
            {(() => {
              const balanceCents = typeof matter.retainer_balance === 'number' ? matter.retainer_balance : null;
              const capCents = typeof matter.retainer_cap === 'number' ? matter.retainer_cap : null;
              const balanceDollars = balanceCents != null ? balanceCents / 100 : null;
              const capDollars = capCents != null ? capCents / 100 : null;
              const pct = balanceDollars != null && capDollars != null && capDollars > 0
                ? Math.round((balanceDollars / capDollars) * 100)
                : null;
              const tone = pct != null ? (pct < 15 ? 'warn' : pct < 30 ? 'warn' : 'ok') : 'default';
              return (
                <div className="rounded-md border border-rule bg-card p-3">
                  <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-dim">Retainer</div>
                  <div className="mt-1 font-serif text-2xl leading-none tracking-tight text-ink">
                    {balanceDollars != null ? (
                      <>
                        {formatCurrency(balanceDollars)}
                        {capDollars != null && <small className="ml-1 font-mono text-[10px] text-dim">/ {formatCurrency(capDollars)}</small>}
                      </>
                    ) : '—'}
                  </div>
                  {pct != null && (
                    <Bar value={pct} max={100} tone={tone as 'default' | 'ok' | 'warn'} className="mt-2" label="Retainer balance" />
                  )}
                </div>
              );
            })()}
            <div className="rounded-md border border-rule bg-card p-3">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-dim">Unbilled</div>
              <div className="mt-1 font-serif text-2xl leading-none tracking-tight text-ink">
                {focusUnbilledHours != null ? (
                  <>
                    {focusUnbilledHours % 1 === 0 ? `${focusUnbilledHours.toFixed(0)}h` : `${focusUnbilledHours.toFixed(1)}h`}
                    {focusUnbilledAmount != null && focusUnbilledAmount > 0 && (
                      <small className="ml-1 font-mono text-[10px] text-dim">· {formatCurrency(focusUnbilledAmount)}</small>
                    )}
                  </>
                ) : '—'}
              </div>
              {focusUnbilledHours != null && focusUnbilledHours > 0 && (
                <Bar value={Math.min(focusUnbilledHours, 40)} max={40} tone="default" className="mt-2" label="Unbilled hours" />
              )}
            </div>
            <div className="rounded-md border border-rule bg-card p-3">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-dim">Events · 30d</div>
              <div className="mt-1 font-serif text-2xl leading-none tracking-tight text-ink">{focusEventCount != null ? focusEventCount : '—'}</div>
              {focusEventCount != null && focusEventCount > 0 && (
                <Bar value={Math.min(focusEventCount, 30)} max={30} tone="default" className="mt-2" label="Events in 30 days" />
              )}
            </div>
            <div className="rounded-md border border-rule bg-card p-3">
              <div className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-dim">SOL</div>
              <div className="mt-1 font-serif text-2xl leading-none tracking-tight text-ink">{focusSolDate ?? '—'}</div>
            </div>
          </div>

          <section>
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
              <span>Facts</span>
              <button type="button" className="font-sans text-[11px] normal-case tracking-normal text-ink-2 hover:underline" onClick={() => goToMatter(matter.id)}>open detail</button>
            </div>
            <dl className="rounded-md border border-rule bg-card px-3.5 py-1">
              {[
                { k: 'Client', v: focusClientName ? `${focusClientName}${focusClientPhone ? ` · ${focusClientPhone}` : ''}` : '—' },
                { k: 'Type', v: matterType },
                { k: 'Jurisdiction', v: jurisdiction },
                { k: 'Opposing', v: matter.opposing_party || '—' },
                { k: 'Opposing counsel', v: matter.opposing_counsel || '—' },
              ].map((row, idx) => (
                <div key={row.k} className={`grid grid-cols-[110px_1fr] gap-2.5 py-2 text-[13px] ${idx > 0 ? 'border-t border-rule' : ''}`}>
                  <dt className="pt-0.5 font-mono text-[10px] uppercase tracking-[0.08em] text-dim">{row.k}</dt>
                  <dd className="text-ink">{row.v}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
              <span>Recent activity</span>
              <button type="button" className="font-sans text-[11px] normal-case tracking-normal text-ink-2 hover:underline" onClick={() => goToMatter(matter.id)}>full timeline</button>
            </div>
            {practiceId && (
              <RecentActivityFeed
                practiceId={practiceId}
                matterId={matter.id}
                onOpen={goToMatter}
                prefetched={focusPrefetchedActivities.length > 0 ? focusPrefetchedActivities : undefined}
              />
            )}
          </section>

          <section>
            <div className="mb-2 flex items-center justify-between font-mono text-[10px] uppercase tracking-[0.14em] text-dim">
              <span>Quick actions</span>
              <button type="button" className="font-sans text-[11px] normal-case tracking-normal text-ink-2" style={{ textDecoration: 'underline dotted', textUnderlineOffset: '2px' }} onClick={() => goToMatter(matter.id)}>everything else, just ask</button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button type="button" className="chip" onClick={() => goToMatter(matter.id)}>Log time</button>
              <button type="button" className="chip" onClick={() => goToMatter(matter.id)}>Add note</button>
              <button type="button" className="chip" onClick={() => goToMatter(matter.id)}>Upload file</button>
              <button type="button" className="chip warn" onClick={() => goToMatter(matter.id)}>Close matter</button>
            </div>
          </section>

          <div className="mt-auto border-t border-rule pt-3 font-mono text-[10px] uppercase tracking-[0.06em] text-dim-2">
            Read-only view · all writes via assistant
          </div>
        </div>
      </aside>
    );
  })() : null;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="flex h-full min-w-0 flex-1">
      {/* Center column */}
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <div className="flex-1 overflow-y-auto px-5 pt-6 pb-2 md:px-10 md:pt-9">
          <div className="mx-auto flex max-w-3xl flex-col gap-7">
            {greetingHero}

            {/* AI message wrapper */}
            <article className="flex gap-3.5">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-ink font-serif italic leading-none text-accent select-none" style={{ fontSize: '15px' }}>
                B
              </div>
              <div className="min-w-0 flex-1">
                <div className="mb-3 flex flex-wrap items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-dim">
                  <span>Practice assistant</span>
                  {(recentIntakes.length > 0 || mattersData.items.length > 0) && (
                    <span className="flex items-center gap-1 text-pos">
                      <span className="inline-block h-[5px] w-[5px] rounded-full bg-pos" />
                      grounded
                    </span>
                  )}
                  <span>{new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}</span>
                </div>
                <p className="mb-4 max-w-[52ch] font-serif text-[22px] font-normal leading-snug tracking-tight text-ink" style={{ textWrap: 'balance' } as React.CSSProperties}>
                  Here&apos;s your day.{' '}
                  {priorityIntake
                    ? <>One intake needs a decision before it goes cold.</>
                    : stalledMatters.length > 0
                      ? <>{stalledMatters.length} matter{stalledMatters.length > 1 ? 's are' : ' is'} going quiet — worth a nudge.</>
                      : <>Everything looks clear — nothing urgent on deck.</>
                  }
                </p>
                <BriefingGrid className="!grid-cols-1 lg:!grid-cols-2">
                  {heroCard}
                  {moneyCard}
                  {thisWeekCard}
                  {intakesCard}
                  {stalledCard}
                  {setupCard}
                </BriefingGrid>
                {(recentIntakes.length > 0 || mattersData.items.length > 0) && (
                  <div className="mt-4">
                    <Citations
                      sources={[
                        { table: 'intakes', count: recentIntakes.length, isLive: true },
                        { table: 'matters', count: mattersData.items.length },
                        { table: 'invoices', count: invoicesTotal },
                      ].filter((s) => s.count > 0)}
                    />
                  </div>
                )}
              </div>
            </article>

            {askResponseCard}

            {observationText ? <Observation>{observationText}</Observation> : null}
          </div>
        </div>

        {/* Sticky composer */}
        <div className="px-5 pb-5 md:px-10 md:pb-6">
          <div className="mx-auto max-w-3xl">
            <AIAskBar
              placeholder="What's on your mind? — try 'who needs follow-up this week?'"
              onSubmit={(q) => {
                setAskHistory((prev) => [{ id: String(Date.now()), question: q }, ...prev]);
                onAsk(q);
              }}
            />
          </div>
        </div>
      </div>

      {/* Right focus drawer */}
      {focusDrawer}
    </div>
  );
}

export default PracticeAssistantBriefing;

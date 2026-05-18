import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { listMatters, type BackendMatter } from '@/features/matters/services/mattersApi';
import { listClientInvoices } from '@/features/invoices/services/invoicesService';
import type { InvoiceSummary } from '@/features/invoices/types';
import { asMajor, type MajorAmount } from '@/shared/utils/money';

export type ClientDashboardStat = {
  id: string;
  label: string;
  value: string;
  helper?: string | null;
  tone?: 'positive' | 'negative' | 'neutral' | 'attention';
};

export type ClientActionReason = 'invoice_due' | 'invoice_overdue' | 'engagement_pending';

export type ClientActionItem = {
  id: string;
  reason: ClientActionReason;
  title: string;
  subtitle?: string | null;
  amount?: number | null;
  priority: number;
  ctaLabel: string;
  navigateTo: string;
};

export type ClientInvoiceActivityEntry = {
  id: string;
  invoiceId: string;
  invoiceNumber: string;
  status: InvoiceSummary['status'];
  amount: number;
  matterTitle: string | null;
  issuedAt: string | null;
};

export type ClientInvoiceActivityDay = {
  label: string;
  isoDate: string;
  entries: ClientInvoiceActivityEntry[];
};

export type ClientMatterCard = {
  id: string;
  title: string;
  statusLabel: string | null;
  practiceArea: string | null;
  updatedAt: string | null;
};

type UseClientDashboardDataInput = {
  practiceId: string | null;
  practiceSlug: string | null;
  enabled?: boolean;
};

const PRIORITY: Record<ClientActionReason, number> = {
  invoice_overdue: 3,
  engagement_pending: 2,
  invoice_due: 1,
};

const ACTIVE_MATTER_STATUSES = new Set([
  'first_contact',
  'intake_pending',
  'conflict_check',
  'eligibility',
  'consultation_scheduled',
  'engagement_pending',
  'active',
  'pleadings_filed',
  'discovery',
  'mediation',
  'pre_trial',
  'trial',
  'order_entered',
  'appeal_pending',
]);

const UNPAID_STATUSES = new Set<InvoiceSummary['status']>(['open', 'overdue', 'sent', 'pending']);

const formatDayLabel = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'Unknown date';
  const today = new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const startOfDay = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  const diffDays = Math.round((startOfToday - startOfDay) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const humanizeStatus = (status: string | null | undefined): string | null => {
  if (!status) return null;
  return status
    .replace(/_/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
};

const formatCurrencyValue = (value: number) =>
  new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    maximumFractionDigits: 0,
  }).format(value);

const sumAmountDue = (invoices: InvoiceSummary[]) =>
  invoices.reduce((sum, invoice) => sum + (invoice.amountDue ?? 0), 0);

export const useClientDashboardData = ({
  practiceId,
  practiceSlug,
  enabled = true,
}: UseClientDashboardDataInput) => {
  const [matters, setMatters] = useState<BackendMatter[]>([]);
  const [invoices, setInvoices] = useState<InvoiceSummary[]>([]);
  const [loading, setLoading] = useState(Boolean(enabled));
  const [error, setError] = useState<string | null>(null);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!enabled) {
      setMatters([]);
      setInvoices([]);
      setLoading(false);
      return;
    }
    if (!practiceId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [matterList, invoiceResult] = await Promise.all([
        listMatters(practiceId, { limit: 25, signal }),
        listClientInvoices(
          practiceId,
          { rules: [], page: 1, pageSize: 50 },
          { signal }
        ),
      ]);
      if (signal?.aborted) return;
      setMatters(matterList);
      setInvoices(invoiceResult.items);
    } catch (err) {
      if (signal?.aborted) return;
      if (err instanceof Error && err.name === 'AbortError') return;
      console.error('[useClientDashboardData] Failed to load client dashboard data', err);
      setError(err instanceof Error ? err.message : 'Unable to load dashboard data');
      setMatters([]);
      setInvoices([]);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [practiceId, enabled]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  const stats = useMemo<ClientDashboardStat[]>(() => {
    const openMatters = matters.filter((m) => ACTIVE_MATTER_STATUSES.has((m.status ?? '').toLowerCase()));
    const unpaidInvoices = invoices.filter((inv) => UNPAID_STATUSES.has(inv.status));
    const overdueInvoices = invoices.filter((inv) => inv.status === 'overdue');
    const outstandingTotal = sumAmountDue(unpaidInvoices);
    const engagementPending = matters.filter((m) => (m.status ?? '').toLowerCase() === 'engagement_pending').length;
    const actionsCount = unpaidInvoices.length + engagementPending;

    const lastInvoiceUpdate = invoices.reduce<number>((latest, inv) => {
      const ts = new Date(inv.updatedAt ?? inv.issueDate ?? 0).getTime();
      return Number.isFinite(ts) && ts > latest ? ts : latest;
    }, 0);
    const lastActivityLabel = lastInvoiceUpdate > 0
      ? new Date(lastInvoiceUpdate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })
      : '—';

    return [
      {
        id: 'open-matters',
        label: 'Open matters',
        value: String(openMatters.length),
        helper: openMatters.length === 0 ? 'No active matters yet' : `${openMatters.length === 1 ? '1 matter' : `${openMatters.length} matters`} in progress`,
        tone: 'neutral',
      },
      {
        id: 'outstanding-balance',
        label: 'Outstanding balance',
        value: formatCurrencyValue(outstandingTotal),
        helper: unpaidInvoices.length === 0
          ? 'All caught up'
          : `${unpaidInvoices.length} unpaid invoice${unpaidInvoices.length === 1 ? '' : 's'}`,
        tone: overdueInvoices.length > 0 ? 'negative' : unpaidInvoices.length > 0 ? 'attention' : 'positive',
      },
      {
        id: 'action-items',
        label: 'Action items',
        value: String(actionsCount),
        helper: actionsCount === 0 ? "You're all caught up" : 'Tasks waiting on you',
        tone: actionsCount > 0 ? 'attention' : 'positive',
      },
      {
        id: 'recent-activity',
        label: 'Last activity',
        value: lastActivityLabel,
        helper: lastInvoiceUpdate > 0 ? 'Most recent invoice update' : 'No recent activity',
        tone: 'neutral',
      },
    ];
  }, [matters, invoices]);

  const actionItems = useMemo<ClientActionItem[]>(() => {
    if (!practiceSlug) return [];
    const items: ClientActionItem[] = [];
    invoices.forEach((invoice) => {
      if (invoice.status === 'overdue') {
        items.push({
          id: `invoice-overdue-${invoice.id}`,
          reason: 'invoice_overdue',
          title: invoice.matterTitle ?? `Invoice ${invoice.invoiceNumber}`,
          subtitle: `Invoice ${invoice.invoiceNumber} overdue`,
          amount: invoice.amountDue,
          priority: PRIORITY.invoice_overdue,
          ctaLabel: 'Pay invoice',
          navigateTo: `/client/${encodeURIComponent(practiceSlug)}/invoices/${encodeURIComponent(invoice.id)}`,
        });
      } else if (UNPAID_STATUSES.has(invoice.status) && invoice.status !== 'overdue') {
        items.push({
          id: `invoice-due-${invoice.id}`,
          reason: 'invoice_due',
          title: invoice.matterTitle ?? `Invoice ${invoice.invoiceNumber}`,
          subtitle: invoice.dueDate
            ? `Due ${new Date(invoice.dueDate).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`
            : `Invoice ${invoice.invoiceNumber}`,
          amount: invoice.amountDue,
          priority: PRIORITY.invoice_due,
          ctaLabel: 'View invoice',
          navigateTo: `/client/${encodeURIComponent(practiceSlug)}/invoices/${encodeURIComponent(invoice.id)}`,
        });
      }
    });
    matters.forEach((matter) => {
      if ((matter.status ?? '').toLowerCase() === 'engagement_pending') {
        items.push({
          id: `engagement-pending-${matter.id}`,
          reason: 'engagement_pending',
          title: matter.title ?? 'Engagement to review',
          subtitle: 'Engagement letter awaiting your signature',
          amount: null,
          priority: PRIORITY.engagement_pending,
          ctaLabel: 'Review & sign',
          navigateTo: `/client/${encodeURIComponent(practiceSlug)}/matters/${encodeURIComponent(matter.id)}`,
        });
      }
    });
    return items
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return (b.amount ?? 0) - (a.amount ?? 0);
      })
      .slice(0, 6);
  }, [invoices, matters, practiceSlug]);

  const recentActivity = useMemo<ClientInvoiceActivityDay[]>(() => {
    const dated = invoices
      .filter((inv) => inv.issueDate || inv.updatedAt)
      .sort((a, b) => {
        const aDate = new Date(a.issueDate ?? a.updatedAt ?? '').getTime();
        const bDate = new Date(b.issueDate ?? b.updatedAt ?? '').getTime();
        return bDate - aDate;
      })
      .slice(0, 10);

    const map = new Map<string, ClientInvoiceActivityDay>();
    dated.forEach((invoice) => {
      const iso = invoice.issueDate ?? invoice.updatedAt ?? new Date().toISOString();
      const label = formatDayLabel(iso);
      if (!map.has(label)) {
        map.set(label, { label, isoDate: iso, entries: [] });
      }
      const day = map.get(label);
      if (day) {
        day.entries.push({
          id: `${invoice.id}-activity`,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          status: invoice.status,
          amount: invoice.total,
          matterTitle: invoice.matterTitle,
          issuedAt: iso,
        });
      }
    });
    return Array.from(map.values());
  }, [invoices]);

  const matterCards = useMemo<ClientMatterCard[]>(() => {
    return matters
      .filter((m) => ACTIVE_MATTER_STATUSES.has((m.status ?? '').toLowerCase()))
      .sort((a, b) => {
        const aTs = new Date(a.updated_at ?? a.created_at ?? 0).getTime();
        const bTs = new Date(b.updated_at ?? b.created_at ?? 0).getTime();
        return bTs - aTs;
      })
      .slice(0, 6)
      .map((matter) => ({
        id: matter.id,
        title: matter.title ?? 'Untitled matter',
        statusLabel: humanizeStatus(matter.status ?? null),
        practiceArea: humanizeStatus(matter.matter_type ?? null),
        updatedAt: matter.updated_at ?? matter.created_at ?? null,
      }));
  }, [matters]);

  const outstandingBalance: MajorAmount = useMemo(() => {
    return asMajor(sumAmountDue(invoices.filter((inv) => UNPAID_STATUSES.has(inv.status))));
  }, [invoices]);

  return useMemo(() => ({
    stats,
    actionItems,
    recentActivity,
    matterCards,
    outstandingBalance,
    loading,
    error,
    refetch: fetchData,
  }), [stats, actionItems, recentActivity, matterCards, outstandingBalance, loading, error, fetchData]);
};

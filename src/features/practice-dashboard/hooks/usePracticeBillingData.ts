import { useCallback, useEffect, useMemo, useState } from 'preact/hooks';
import { asMajor, getMajorAmountValue, safeAdd, type MajorAmount } from '@/shared/utils/money';
import { listMatters, type BackendMatter } from '@/features/matters/services/mattersApi';
import { getUnbilledSummary, listInvoices } from '@/features/matters/services/invoicesApi';
import type { Invoice } from '@/features/matters/types/billing.types';

export type BillingActionReason = 'unbilled' | 'overdue' | 'retainer';

export type BillingAction = {
  id: string;
  matterId: string;
  title: string;
  subtitle?: string | null;
  reason: BillingActionReason;
  amount?: MajorAmount | null;
  highlight?: string;
  priority: number;
  ctaLabel: string;
};

export type OutstandingPaymentsSummary = {
  awaitingCount: number;
  awaitingTotal: MajorAmount;
  overdueCount: number;
  overdueTotal: MajorAmount;
};

export type DashboardStat = {
  id: string;
  label: string;
  value: MajorAmount;
  helper?: string | null;
  tone?: 'positive' | 'negative' | 'neutral';
  changeLabel?: string | null;
  changeTone?: 'positive' | 'negative' | 'neutral';
};

export type ActivityEntry = {
  id: string;
  invoiceId: string;
  invoiceNumber?: string | null;
  amount: MajorAmount;
  status: Invoice['status'];
  clientName: string;
  description?: string | null;
  issuedAt?: string | null;
};

export type ActivityDay = {
  label: string;
  isoDate: string;
  entries: ActivityEntry[];
};

export type RecentClient = {
  id: string;
  name: string;
  avatarUrl?: string | null;
  lastInvoice?: {
    date?: string | null;
    amount: MajorAmount;
    status: Invoice['status'];
  } | null;
};

export type BillingWindow = '7d' | '30d' | 'all';

type UsePracticeBillingDataProps = {
  practiceId: string | null;
  enabled?: boolean;
  matterLimit?: number;
  windowSize?: BillingWindow;
};

type MatterBillingSnapshot = {
  matter: BackendMatter;
  unbilledTotal: MajorAmount | null;
  overdueCount: number;
  overdueTotal: MajorAmount | null;
  retainerBalance: MajorAmount | null;
  retainerTarget: MajorAmount | null;
};

const toNumber = (value: MajorAmount | null | undefined) => getMajorAmountValue(value);

const sumInvoices = (invoices: Invoice[], selector: (invoice: Invoice) => MajorAmount | null | undefined) =>
  invoices.reduce((sum, invoice) => safeAdd(sum, selector(invoice)), asMajor(0));

const parseMajorAmount = (value: unknown): MajorAmount | null => {
  if (typeof value === 'number') {
    return asMajor(value);
  }
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) {
      return asMajor(parsed);
    }
  }
  if (typeof value === 'object' && value !== null && 'amount' in (value as Record<string, unknown>)) {
    const maybe = (value as Record<string, unknown>).amount;
    return parseMajorAmount(maybe);
  }
  return null;
};

const readRetainerField = (matter: BackendMatter, key: 'retainer_amount' | 'retainer_balance'): MajorAmount | null => {
  const record = matter as Record<string, unknown>;
  const camelKey = key === 'retainer_amount' ? 'retainerAmount' : 'retainerBalance';
  const normalizedKey = key === 'retainer_amount' ? 'retainer_amount_major' : 'retainer_balance_major';
  const raw = record[key] ?? record[camelKey] ?? record[normalizedKey];
  return parseMajorAmount(raw);
};

const PRIORITY: Record<BillingActionReason, number> = {
  overdue: 3,
  retainer: 2,
  unbilled: 1
};

const formatDayLabel = (isoDate: string | null | undefined) => {
  if (!isoDate) return 'Unknown date';
  const date = new Date(isoDate);
  const today = new Date();
  const diffMs = today.setHours(0, 0, 0, 0) - date.setHours(0, 0, 0, 0);
  const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  return date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
};

const getInvoiceTimestamp = (invoice: Invoice): number => {
  const raw = invoice.issue_date ?? invoice.created_at ?? invoice.updated_at ?? null;
  if (!raw) return 0;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? 0 : parsed.getTime();
};

const filterInvoicesByRange = (invoices: Invoice[], start: number | null, end: number | null) => {
  return invoices.filter((invoice) => {
    const ts = getInvoiceTimestamp(invoice);
    if (start !== null && ts < start) return false;
    if (end !== null && ts >= end) return false;
    return true;
  });
};

const formatChangeLabel = (current: MajorAmount, previous: MajorAmount) => {
  const currentValue = getMajorAmountValue(current);
  const previousValue = getMajorAmountValue(previous);
  if (previousValue === 0) return null;
  const delta = ((currentValue - previousValue) / previousValue) * 100;
  const rounded = delta.toFixed(2);
  return `${delta >= 0 ? '+' : ''}${rounded}%`;
};

const evaluateChange = (
  current: MajorAmount,
  previous: MajorAmount,
  increaseIsGood: boolean
): { label: string | null; tone: 'positive' | 'negative' | 'neutral' } => {
  const label = formatChangeLabel(current, previous);
  if (!label) {
    return { label: null, tone: 'neutral' };
  }
  const currentValue = getMajorAmountValue(current);
  const previousValue = getMajorAmountValue(previous);
  const increased = currentValue >= previousValue;
  const tone = increased === increaseIsGood ? 'positive' : 'negative';
  return { label, tone };
};

export const usePracticeBillingData = ({
  practiceId,
  enabled = true,
  matterLimit = 15,
  windowSize = '7d'
}: UsePracticeBillingDataProps) => {
  const [billingActions, setBillingActions] = useState<BillingAction[]>([]);
  const [outstandingSummary, setOutstandingSummary] = useState<OutstandingPaymentsSummary | null>(null);
  const [summaryStats, setSummaryStats] = useState<DashboardStat[]>([]);
  const [recentActivity, setRecentActivity] = useState<ActivityDay[]>([]);
  const [recentClients, setRecentClients] = useState<RecentClient[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const buildActions = useCallback((snapshots: MatterBillingSnapshot[]): BillingAction[] => {
    const actions: BillingAction[] = [];
    snapshots.forEach((snapshot) => {
      const { matter, unbilledTotal, overdueCount, overdueTotal, retainerBalance, retainerTarget } = snapshot;
      const title = matter.title ?? 'Untitled matter';
      if (overdueCount > 0 && overdueTotal) {
        actions.push({
          id: `${matter.id}-overdue`,
          matterId: matter.id,
          title,
          subtitle: `${overdueCount} invoice${overdueCount === 1 ? '' : 's'} overdue`,
          reason: 'overdue',
          amount: overdueTotal,
          highlight: 'Follow up on payment',
          priority: PRIORITY.overdue,
          ctaLabel: 'Follow up'
        });
      }

      if (retainerTarget && retainerTarget > 0 && retainerBalance !== null) {
        const ratio = retainerBalance / retainerTarget;
        if (ratio <= 0.2) {
          actions.push({
            id: `${matter.id}-retainer`,
            matterId: matter.id,
            title,
            subtitle: `Retainer ${retainerBalance.toFixed(2)} / ${retainerTarget.toFixed(2)}`,
            reason: 'retainer',
            amount: retainerBalance,
            highlight: 'Retainer running low',
            priority: PRIORITY.retainer,
            ctaLabel: 'Request funds'
          });
        }
      }

      if (unbilledTotal && unbilledTotal >= 1000) {
        actions.push({
          id: `${matter.id}-unbilled`,
          matterId: matter.id,
          title,
          subtitle: 'Unbilled time & expenses',
          reason: 'unbilled',
          amount: unbilledTotal,
          highlight: 'Ready for invoicing',
          priority: PRIORITY.unbilled,
          ctaLabel: 'Create invoice'
        });
      }
    });

    return actions
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        return toNumber(b.amount) - toNumber(a.amount);
      })
      .slice(0, 8);
  }, []);

  const fetchData = useCallback(async (signal?: AbortSignal) => {
    if (!practiceId || !enabled) {
      setBillingActions([]);
      setOutstandingSummary(null);
      setSummaryStats([]);
      setRecentActivity([]);
      setRecentClients([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const [matters, invoices] = await Promise.all([
        listMatters(practiceId, { limit: matterLimit, signal }),
        listInvoices(practiceId, undefined, { signal })
      ]);
      if (signal?.aborted) return;

      const now = Date.now();
      const windowDuration = windowSize === '7d' ? 7 * 24 * 60 * 60 * 1000
        : windowSize === '30d' ? 30 * 24 * 60 * 60 * 1000
          : null;
      const windowStart = windowDuration ? now - windowDuration : null;
      const previousStart = windowDuration && windowStart !== null ? windowStart - windowDuration : null;

      const windowInvoices = filterInvoicesByRange(invoices, windowStart, null);
      const previousInvoices = windowDuration ? filterInvoicesByRange(invoices, previousStart, windowStart) : [];

      const matterSubset = matters.slice(0, matterLimit);
      const invoiceMap = invoices.reduce<Map<string, Invoice[]>>((map, invoice) => {
        if (invoice.matter_id) {
          if (!map.has(invoice.matter_id)) {
            map.set(invoice.matter_id, []);
          }
          const group = map.get(invoice.matter_id);
          if (group) {
            group.push(invoice);
          }
        }
        return map;
      }, new Map());

      const unbilledSnapshots = await Promise.allSettled(
        matterSubset.map(async (matter) => {
          try {
            const summary = await getUnbilledSummary(practiceId, matter.id, { signal });
            return summary.totalUnbilled ?? null;
          } catch (err) {
            console.warn('[usePracticeBillingData] Failed to load unbilled summary', err);
            return null;
          }
        })
      );
      if (signal?.aborted) return;

      const snapshots: MatterBillingSnapshot[] = matterSubset.map((matter, index) => {
        const invoicesForMatter = invoiceMap.get(matter.id) ?? [];
        const overdueInvoices = invoicesForMatter.filter((invoice) => invoice.status === 'overdue');
        const unbilledTotal = unbilledSnapshots[index].status === 'fulfilled'
          ? unbilledSnapshots[index].value
          : null;
        return {
          matter,
          unbilledTotal,
          overdueCount: overdueInvoices.length,
          overdueTotal: overdueInvoices.length
            ? sumInvoices(overdueInvoices, (invoice) => invoice.amount_due ?? invoice.total)
            : null,
          retainerBalance: readRetainerField(matter, 'retainer_balance'),
          retainerTarget: readRetainerField(matter, 'retainer_amount')
        };
      });

      const resolvedActions = buildActions(snapshots);
      if (signal?.aborted) return;
      setBillingActions(resolvedActions);

      const awaitingInvoices = invoices.filter((invoice) => invoice.status === 'sent' || invoice.status === 'pending');
      const overdueInvoices = invoices.filter((invoice) => invoice.status === 'overdue');
      const awaitingTotal = sumInvoices(awaitingInvoices, (invoice) => invoice.amount_due ?? invoice.total);
      const overdueTotalAggregate = sumInvoices(overdueInvoices, (invoice) => invoice.amount_due ?? invoice.total);
      if (signal?.aborted) return;
      setOutstandingSummary({
        awaitingCount: awaitingInvoices.length,
        awaitingTotal,
        overdueCount: overdueInvoices.length,
        overdueTotal: overdueTotalAggregate
      });

      const paidInvoices = windowInvoices.filter((invoice) => invoice.status === 'paid');
      const previousPaidInvoices = previousInvoices.filter((invoice) => invoice.status === 'paid');
      const revenueTotal = sumInvoices(paidInvoices, (invoice) => invoice.amount_paid ?? invoice.total);
      const previousRevenueTotal = sumInvoices(previousPaidInvoices, (invoice) => invoice.amount_paid ?? invoice.total);
      const revenueChange = windowDuration
        ? evaluateChange(revenueTotal, previousRevenueTotal, true)
        : { label: null, tone: 'neutral' as const };

      const windowOverdueInvoices = windowInvoices.filter((invoice) => invoice.status === 'overdue');
      const previousOverdueInvoices = previousInvoices.filter((invoice) => invoice.status === 'overdue');
      const overdueWindowTotal = sumInvoices(windowOverdueInvoices, (invoice) => invoice.amount_due ?? invoice.total);
      const overduePrevTotal = sumInvoices(previousOverdueInvoices, (invoice) => invoice.amount_due ?? invoice.total);
      const overdueChange = windowDuration
        ? evaluateChange(overdueWindowTotal, overduePrevTotal, false)
        : { label: null, tone: 'neutral' as const };

      const windowAwaitingInvoices = windowInvoices.filter((invoice) => invoice.status === 'sent' || invoice.status === 'pending');
      const previousAwaitingInvoices = previousInvoices.filter((invoice) => invoice.status === 'sent' || invoice.status === 'pending');
      const windowAwaitingTotal = sumInvoices(windowAwaitingInvoices, (invoice) => invoice.amount_due ?? invoice.total);
      const previousAwaitingTotal = sumInvoices(previousAwaitingInvoices, (invoice) => invoice.amount_due ?? invoice.total);
      const awaitingChange = windowDuration
        ? evaluateChange(windowAwaitingTotal, previousAwaitingTotal, false)
        : { label: null, tone: 'neutral' as const };

      const unbilledAggregate = asMajor(
        snapshots.reduce((sum, snapshot) => sum + toNumber(snapshot.unbilledTotal), 0)
      );
      const unbilledMattersCount = snapshots.filter(s => toNumber(s.unbilledTotal) > 0).length;

      if (signal?.aborted) return;
      setSummaryStats([
        {
          id: 'revenue',
          label: 'Collected revenue',
          value: revenueTotal,
          helper: `${paidInvoices.length} paid invoices`,
          tone: 'positive',
          changeLabel: revenueChange.label,
          changeTone: revenueChange.tone
        },
        {
          id: 'overdue',
          label: 'Overdue invoices',
          value: overdueWindowTotal,
          helper: `${windowOverdueInvoices.length} overdue`,
          tone: windowOverdueInvoices.length > 0 ? 'negative' : 'positive',
          changeLabel: overdueChange.label,
          changeTone: overdueChange.tone
        },
        {
          id: 'outstanding',
          label: 'Awaiting payment',
          value: windowAwaitingTotal,
          helper: `${windowAwaitingInvoices.length} sent`,
          tone: 'neutral',
          changeLabel: awaitingChange.label,
          changeTone: awaitingChange.tone
        },
        {
          id: 'unbilled',
          label: 'Ready to invoice',
          value: unbilledAggregate,
          helper: `${unbilledMattersCount} matters flagged`,
          tone: unbilledMattersCount > 0 ? 'neutral' : 'positive',
          changeLabel: null,
          changeTone: 'neutral'
        }
      ]);

      const recentInvoices = [...windowInvoices]
        .filter((invoice) => invoice.issue_date || invoice.created_at)
        .sort((a, b) => {
          const aDate = new Date(a.issue_date ?? a.created_at ?? '').getTime();
          const bDate = new Date(b.issue_date ?? b.created_at ?? '').getTime();
          return bDate - aDate;
        })
        .slice(0, 12);

      const activityMap = new Map<string, ActivityDay>();
      recentInvoices.forEach((invoice) => {
        const isoDate = invoice.issue_date ?? invoice.created_at ?? new Date().toISOString();
        const label = formatDayLabel(isoDate);
        if (!activityMap.has(label)) {
          activityMap.set(label, { label, isoDate, entries: [] });
        }
        const entry: ActivityEntry = {
          id: `${invoice.id}-activity`,
          invoiceId: invoice.id,
          invoiceNumber: invoice.stripe_invoice_number ?? invoice.invoice_number,
          amount: invoice.total,
          status: invoice.status,
          clientName: invoice.client?.user?.name ?? invoice.client?.user?.email ?? 'Client',
          description: invoice.memo ?? invoice.notes ?? null,
          issuedAt: isoDate
        };
        const group = activityMap.get(label);
        if (group) {
          group.entries.push(entry);
        }
      });
      const activityDays = Array.from(activityMap.values()).sort(
        (a, b) => new Date(b.isoDate).getTime() - new Date(a.isoDate).getTime()
      );
      if (signal?.aborted) return;
      setRecentActivity(activityDays);

      const clientMap = new Map<string, RecentClient>();
      windowInvoices.forEach((invoice) => {
        if (!invoice.client_id) return;
        const existing = clientMap.get(invoice.client_id);
        const latestDate = invoice.issue_date ?? invoice.created_at ?? invoice.updated_at ?? null;
        const amount = invoice.total;
        if (!existing || (latestDate && (!existing.lastInvoice?.date || new Date(latestDate) > new Date(existing.lastInvoice.date)))) {
          clientMap.set(invoice.client_id, {
            id: invoice.client_id,
            name: invoice.client?.user?.name ?? invoice.client?.user?.email ?? `Client ${invoice.client_id.slice(0, 5)}`,
            avatarUrl: invoice.client?.user?.image ?? null,
            lastInvoice: latestDate ? { date: latestDate, amount, status: invoice.status } : null
          });
        }
      });
      if (signal?.aborted) return;
      setRecentClients(Array.from(clientMap.values()).slice(0, 6));
    } catch (err) {
      if (signal?.aborted) return;
      console.error('[usePracticeBillingData] Failed to load practice billing data', err);
      setError(err instanceof Error ? err.message : 'Unable to load billing data');
      setBillingActions([]);
      setOutstandingSummary(null);
      setSummaryStats([]);
      setRecentActivity([]);
      setRecentClients([]);
    } finally {
      if (!signal?.aborted) {
        setLoading(false);
      }
    }
  }, [practiceId, enabled, matterLimit, windowSize, buildActions]);

  useEffect(() => {
    const controller = new AbortController();
    void fetchData(controller.signal);
    return () => controller.abort();
  }, [fetchData]);

  return useMemo(() => ({
    billingActions,
    outstandingSummary,
    summaryStats,
    recentActivity,
    recentClients,
    loading,
    error,
    refetch: fetchData
  }), [billingActions, outstandingSummary, summaryStats, recentActivity, recentClients, loading, error, fetchData]);
};

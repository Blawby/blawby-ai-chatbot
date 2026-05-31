import { useMemo } from 'preact/hooks';
import { useReportData } from '@/features/reports/hooks/useReportData';
import type {
  TrustLedgerMeta,
  TrustLedgerRow,
} from '@/features/reports/services/reportsTypes';

/**
 * Per-client aggregation derived from the flat ledger rows.
 *
 * The backend Trust Ledger report emits flat transaction rows ordered by
 * `occurredAt`. For the chat-first Trust screen we need a per-client roll-up
 * (current balance + last activity). This is computed entirely on the client
 * — there is no dedicated per-client endpoint today.
 */
export interface TrustClientBalance {
  /** Stable id; falls back to clientName when no id is available. */
  id: string;
  clientName: string;
  /** Balance in cents — the most recent row's `balanceCents` for this client. */
  balanceCents: number;
  /** ISO timestamp of the most recent transaction for this client. */
  lastActivityAt: string | null;
  /** Number of ledger entries for this client in the period. */
  entryCount: number;
}

export interface UseTrustLedgerResult {
  /** Flat ledger entries, newest-first. */
  entries: TrustLedgerRow[];
  /** Derived per-client roll-up, sorted by balance desc. */
  clientBalances: TrustClientBalance[];
  /** Report meta — totals from the backend. */
  meta: TrustLedgerMeta | null;
  generatedAt: string | null;
  loading: boolean;
  error: { code: string; message: string } | null;
  refetch: () => void;
}

const compareDescByOccurredAt = (a: TrustLedgerRow, b: TrustLedgerRow): number => {
  if (a.occurredAt < b.occurredAt) return 1;
  if (a.occurredAt > b.occurredAt) return -1;
  return 0;
};

/**
 * Wraps the generic report-data hook for the Trust screen so callers don't
 * have to know about the report-collection plumbing. Returns the flat ledger
 * plus a derived per-client roll-up so the page can render both panes from
 * one request.
 */
export const useTrustLedger = (practiceId: string): UseTrustLedgerResult => {
  const { data, loading, error, refetch } = useReportData<TrustLedgerRow, TrustLedgerMeta>(
    practiceId,
    'trust-ledger',
    {},
    { enabled: Boolean(practiceId) },
  );

  const entries = useMemo(() => {
    const items = data?.items ?? [];
    return [...items].sort(compareDescByOccurredAt);
  }, [data?.items]);

  const clientBalances = useMemo<TrustClientBalance[]>(() => {
    if (entries.length === 0) return [];
    const byClient = new Map<string, TrustClientBalance>();
    // entries is already newest-first; first row we see for a client is the
    // most recent, which is also the row whose balanceCents represents the
    // running balance after that transaction.
    for (const row of entries) {
      const key = row.clientName?.trim() || 'Unassigned';
      const existing = byClient.get(key);
      if (existing) {
        existing.entryCount += 1;
        continue;
      }
      byClient.set(key, {
        id: key,
        clientName: key,
        balanceCents: row.balanceCents,
        lastActivityAt: row.occurredAt,
        entryCount: 1,
      });
    }
    return Array.from(byClient.values()).sort((a, b) => b.balanceCents - a.balanceCents);
  }, [entries]);

  return {
    entries,
    clientBalances,
    meta: data?.meta ?? null,
    generatedAt: data?.generatedAt ?? null,
    loading,
    error,
    refetch,
  };
};

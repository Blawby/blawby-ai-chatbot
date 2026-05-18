/**
 * Static catalog of report navigation entries. Reports are NOT data records
 * we walk via the backend — they're a fixed set of practice-management
 * dashboards/views. We match search queries against this list in-memory at
 * query time and surface matches as a 'Reports' group in the envelope.
 *
 * Why static (not D1-indexed): the catalog is tiny (~10 entries), changes
 * rarely, and isn't practice-scoped. Indexing it would mean replicating
 * the same rows across every practice with the same content — wasteful.
 *
 * Frontend interpolates `:slug` from the active workspace when building
 * the navigation URL.
 */

export type ReportCatalogEntry = {
  id: string;
  title: string;
  subtitle: string;
  /** Lowercased keywords that should match. Order doesn't matter. */
  tags: readonly string[];
};

export const REPORT_CATALOG: readonly ReportCatalogEntry[] = [
  {
    id: 'revenue',
    title: 'Revenue',
    subtitle: 'Total collected by period',
    tags: ['revenue', 'income', 'collected', 'earnings', 'sales'],
  },
  {
    id: 'outstanding-invoices',
    title: 'Outstanding Invoices',
    subtitle: 'Unpaid invoices by status',
    tags: ['outstanding', 'overdue', 'unpaid', 'past due', 'invoice', 'aging'],
  },
  {
    id: 'cashflow',
    title: 'Cashflow',
    subtitle: 'Collected vs. owed over time',
    tags: ['cashflow', 'cash flow', 'money', 'flow', 'pipeline'],
  },
  {
    id: 'matters-active',
    title: 'Active Matters',
    subtitle: 'Caseload by status and assignee',
    tags: ['matters', 'active', 'caseload', 'open cases', 'work in progress'],
  },
  {
    id: 'time-activity',
    title: 'Time & Activity',
    subtitle: 'Hours logged by attorney',
    tags: ['time', 'hours', 'activity', 'attorney', 'productivity'],
  },
  {
    id: 'hours-by-matter',
    title: 'Hours by Matter',
    subtitle: 'Time entries grouped by matter',
    tags: ['hours', 'matter', 'time', 'billable', 'utilization'],
  },
  {
    id: 'expense-logs',
    title: 'Expense Logs',
    subtitle: 'Billable and non-billable expenses',
    tags: ['expenses', 'expense', 'cost', 'spending', 'outlay'],
  },
  {
    id: 'refunds',
    title: 'Refunds',
    subtitle: 'Refunds issued to clients',
    tags: ['refund', 'refunds', 'credit', 'reversal'],
  },
  {
    id: 'trust-account',
    title: 'Trust Account',
    subtitle: 'IOLTA balance and transactions',
    tags: ['trust', 'iolta', 'retainer', 'escrow'],
  },
  {
    id: 'deliveries',
    title: 'Report Deliveries',
    subtitle: 'Sent and scheduled report runs',
    tags: ['delivery', 'deliveries', 'scheduled', 'sent', 'email', 'export'],
  },
];

export type ReportMatch = {
  id: string;
  title: string;
  subtitle: string;
  score: number;
};

/**
 * Match the (already-lowercased) query terms against the catalog and return
 * scored matches. Score is a coarse "how many tag/title hits" — higher
 * the better. Returns at most `limit` entries, ranked highest first.
 */
export function matchReports(query: string, limit: number = 5): ReportMatch[] {
  const q = query.trim().toLowerCase();
  if (q.length === 0) return [];
  const tokens = q.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return [];

  const matches: ReportMatch[] = [];
  for (const entry of REPORT_CATALOG) {
    let score = 0;
    const titleLower = entry.title.toLowerCase();
    const subtitleLower = entry.subtitle.toLowerCase();

    for (const tok of tokens) {
      // Title hit weighs heaviest; subtitle medium; tag exact-match smallest.
      if (titleLower.includes(tok)) score += 4;
      if (subtitleLower.includes(tok)) score += 2;
      for (const tag of entry.tags) {
        if (tag === tok) {
          score += 3;
          break; // count one exact-tag hit per token
        }
        if (tag.includes(tok) || tok.includes(tag)) {
          score += 1;
          break;
        }
      }
    }

    if (score > 0) {
      matches.push({
        id: entry.id,
        title: entry.title,
        subtitle: entry.subtitle,
        score,
      });
    }
  }

  return matches.sort((a, b) => b.score - a.score).slice(0, limit);
}

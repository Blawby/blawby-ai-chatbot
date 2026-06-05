import { useCallback, useMemo, useState } from 'preact/hooks';
import type { FunctionComponent } from 'preact';
import { useLocation } from 'preact-iso';
import { AlertTriangle, Wallet } from 'lucide-preact';

import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useWorkspaceResolver } from '@/shared/hooks/useWorkspaceResolver';
import { useSidebarCounts } from '@/shared/hooks/useSidebarCounts';
import { useNavigation } from '@/shared/utils/navigation';
import { signOut } from '@/shared/utils/auth';
import { LeftRail, BrandMark, type LeftRailItem } from '@/design-system/layout';
import { OrgSwitcherMenu } from '@/shared/ui/nav/OrgSwitcherMenu';
import { SidebarProfileMenu } from '@/shared/ui/nav/SidebarProfileMenu';
import { GlobalSearchTrigger } from '@/features/search/components/GlobalSearchTrigger';
import { getPracticeNavConfig } from '@/shared/config/navConfig';
import type { IconComponent } from '@/shared/ui/Icon';
import { PageHeader } from '@/shared/ui/layout/PageHeader';
import { WorkspacePlaceholderState } from '@/shared/ui/layout/WorkspacePlaceholderState';
import { Button } from '@/shared/ui/Button';
import { LoadingSpinner } from '@/shared/ui/layout/LoadingSpinner';
import { Tooltip } from '@/shared/ui/overlays/Tooltip';
import { EntityList } from '@/shared/ui/list/EntityList';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { AISummary, MatterChip, StatStrip, type StatStripCell } from '@/design-system/patterns';
import { Pill, Chip } from '@/design-system/primitives';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { reportsApi } from '@/features/reports/services/reportsApi';

import { useTrustLedger, type TrustClientBalance } from '../hooks/useTrustLedger';
import { TrustLedgerEntryRow } from '../components/TrustLedgerEntryRow';
import { TrustAuditTrailPane } from '../components/TrustAuditTrailPane';
import { TrustComplianceRulesPane } from '../components/TrustComplianceRulesPane';
import { EmailCpaDialog } from '../components/EmailCpaDialog';

const formatCentsMajor = (cents: number): string => formatCurrency(cents / 100);

/**
 * Split a major-currency string into "$18,720" + ".00" so we can render the
 * cents fraction as a smaller sub-figure in the stat strip (mirrors the
 * canonical Trust.html mockup). Returns `{ whole, fraction: null }` if the
 * formatter ever returns a value without a decimal segment.
 */
const splitCurrencyForStat = (cents: number): { whole: string; fraction: string | null } => {
  const formatted = formatCurrency(cents / 100);
  const lastDot = formatted.lastIndexOf('.');
  if (lastDot < 0) return { whole: formatted, fraction: null };
  return {
    whole: formatted.slice(0, lastDot),
    fraction: formatted.slice(lastDot),
  };
};

const formatGeneratedAt = (iso: string | null): string => {
  if (!iso) return 'not yet generated';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return formatRelativeTime(iso);
};

/**
 * Rough "low balance" threshold for the AI lede observation. We don't
 * have a per-client retainer target yet (`practices.retainer_target_cents`
 * is in the backend backlog — see PR #662), so a flat $1,000 cents value
 * is the most we can ground without inventing data.
 */
const LOW_BALANCE_CENTS = 100_000;
/** Threshold the lede suggests as the typical replenishment amount. */
const SUGGESTED_REPLENISH_CENTS = 300_000;

/*
 * TODO(backend): expose `matter_id` on `TrustLedgerRow` so per-client
 * roll-ups and individual ledger rows can render the primary matter
 * inline (`· {matterTitle}`). The wire field is already in
 * `BackendTrustTransactionSchema` but `aggregateTrustLedger` drops it
 * before returning — see `worker/services/ReportService.ts`.
 */
const ClientBalanceRow: FunctionComponent<{ balance: TrustClientBalance }> = ({ balance }) => (
  <div className="grid w-full grid-cols-[minmax(0,1fr)_120px_110px] items-center gap-4 px-5 py-4">
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex items-center gap-2">
        <MatterChip>{balance.clientName}</MatterChip>
      </div>
      <span className="font-mono text-[10.5px] uppercase tracking-[0.04em] text-dim">
        {balance.entryCount} {balance.entryCount === 1 ? 'entry' : 'entries'} this period
      </span>
    </div>
    <span className="text-right font-mono text-sm tabular-nums text-ink">
      {formatCentsMajor(balance.balanceCents)}
    </span>
    <span className="text-right font-mono text-[10.5px] uppercase tracking-[0.04em] text-dim">
      {balance.lastActivityAt ? formatRelativeTime(balance.lastActivityAt) : '—'}
    </span>
  </div>
);

const PracticeTrustPage: FunctionComponent = () => {
  const { session } = useSessionContext();
  const location = useLocation();
  const { navigate } = useNavigation();
  const { showSuccess, showError, showInfo } = useToastContext();

  // Read the slug from the URL so the resolver picks `currentPractice` for the
  // workspace we're on — mirrors the pattern in PracticeHomePage.
  const urlPracticeSlug = useMemo(() => {
    const match = location.path.match(/^\/practice\/([^/]+)/);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }, [location.path]);

  const { currentPractice } = useWorkspaceResolver({ practiceSlug: urlPracticeSlug });
  const practiceSlug = currentPractice?.slug ?? null;
  const practiceBasePath = practiceSlug
    ? `/practice/${encodeURIComponent(practiceSlug)}`
    : null;
  const activePracticeId = currentPractice?.id ?? null;
  const orgName = currentPractice?.name?.trim() || 'Practice';
  const orgInitial = (orgName.charAt(0) || 'B').toUpperCase();

  const userName = session?.user?.name || session?.user?.email || 'there';
  const userEmail = session?.user?.email ?? null;
  const userImage = session?.user?.image ?? null;

  const { counts: sidebarCounts } = useSidebarCounts(activePracticeId, 'reports');

  const {
    entries,
    clientBalances,
    meta,
    generatedAt,
    loading,
    error,
    refetch,
  } = useTrustLedger(activePracticeId ?? '');

  // Filter the ledger by client when a chip is clicked.
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const visibleEntries = useMemo(() => {
    if (!clientFilter) return entries;
    return entries.filter((entry) => (entry.clientName?.trim() || 'Unassigned') === clientFilter);
  }, [entries, clientFilter]);

  const totalBalanceCents = meta?.endingBalanceCents ?? 0;
  const totalCreditsCents = meta?.totalCreditsCents ?? 0;
  const totalDebitsCents = meta?.totalDebitsCents ?? 0;
  const clientCount = clientBalances.length;

  const balanceParts = splitCurrencyForStat(totalBalanceCents);
  const creditsParts = splitCurrencyForStat(totalCreditsCents);
  const debitsParts = splitCurrencyForStat(totalDebitsCents);

  const statCells: StatStripCell[] = useMemo(() => [
    {
      label: 'Total IOLTA balance',
      value: (
        <>
          {balanceParts.whole}
          {balanceParts.fraction ? <small>{balanceParts.fraction}</small> : null}
        </>
      ),
      extra: clientCount > 0 ? `across ${clientCount} ${clientCount === 1 ? 'client' : 'clients'} · USD` : 'USD',
    },
    {
      label: 'Total credits',
      value: (
        <>
          {creditsParts.whole}
          {creditsParts.fraction ? <small>{creditsParts.fraction}</small> : null}
        </>
      ),
      extra: 'deposits this period',
    },
    {
      label: 'Total debits',
      value: (
        <>
          {debitsParts.whole}
          {debitsParts.fraction ? <small>{debitsParts.fraction}</small> : null}
        </>
      ),
      extra: 'withdrawals this period',
      extraWarn: totalDebitsCents > 0,
    },
    {
      label: 'Last refreshed',
      value: formatGeneratedAt(generatedAt),
      extra: 'auto · on ledger view',
    },
  ], [balanceParts, creditsParts, debitsParts, generatedAt, clientCount, totalDebitsCents]);

  // Build the LeftRail items the same way PracticeHomePage does, then mark
  // the Trust entry active via aria/CSS only when the nav config supplies it.
  const railItems = useMemo<LeftRailItem[]>(() => {
    if (!practiceSlug) return [];
    const config = getPracticeNavConfig(
      { practiceSlug, role: null, canAccessPractice: true },
      'reports',
    );
    return config.rail.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon as IconComponent,
      href: item.href,
      matchHrefs: item.matchHrefs,
      badge: sidebarCounts?.[item.id] ?? item.badge ?? null,
      variant: item.variant,
      isAction: item.isAction,
      onClick: item.onClick,
      prefetch: item.prefetch,
    }));
  }, [practiceSlug, sidebarCounts]);

  const brandRow = currentPractice?.id && practiceSlug ? (
    <OrgSwitcherMenu
      org={{
        id: currentPractice.id,
        name: orgName,
        initial: orgInitial,
        subtitle: 'Practice',
        logoUrl: currentPractice.logo ?? null,
      }}
      collapsed={false}
    />
  ) : (
    <BrandMark className="px-2 py-2" />
  );

  const brandMark = (
    <div className="flex flex-col gap-1.5">
      {brandRow}
      <div className="px-1">
        <GlobalSearchTrigger placement="rail" />
      </div>
    </div>
  );

  const profileFooter = session?.user ? (
    <SidebarProfileMenu
      user={{ name: userName, email: userEmail, image: userImage }}
      onAccount={() => practiceBasePath && navigate(`${practiceBasePath}/settings/account`)}
      onSettings={() => practiceBasePath && navigate(`${practiceBasePath}/settings/general`)}
      onSignOut={() => void signOut({ navigate })}
    />
  ) : null;

  // ── Actionable observation ───────────────────────────────────────────────
  // Single client with the lowest balance below LOW_BALANCE_CENTS — the
  // lede surfaces it by name so the user has somewhere to act. We don't
  // synthesize a name when no one is below threshold; the second sentence
  // (net flow / period totals) carries the lede instead.
  const lowestBelowThreshold = useMemo<TrustClientBalance | null>(() => {
    if (clientBalances.length === 0) return null;
    const below = clientBalances.filter((b) => b.balanceCents > 0 && b.balanceCents < LOW_BALANCE_CENTS);
    if (below.length === 0) return null;
    return below.reduce((min, b) => (b.balanceCents < min.balanceCents ? b : min), below[0]);
  }, [clientBalances]);

  const netFlowCents = totalCreditsCents - totalDebitsCents;
  const isNetOutflow = totalDebitsCents > 0 && netFlowCents < 0;

  // ── Email-to-CPA dialog state ────────────────────────────────────────────
  const [cpaDialogOpen, setCpaDialogOpen] = useState(false);
  const handleOpenCpaDialog = useCallback(() => setCpaDialogOpen(true), []);
  const handleCloseCpaDialog = useCallback(() => setCpaDialogOpen(false), []);

  // ── Generate IOLTA report (send-now → Reports → Deliveries) ──────────────
  const [generatingReport, setGeneratingReport] = useState(false);
  const handleGenerateReport = useCallback(async () => {
    if (!activePracticeId) return;
    setGeneratingReport(true);
    try {
      await reportsApi.sendNow(activePracticeId, {
        reportType: 'trust-ledger',
        recipients: [],
        filters: { period: 'month' },
      });
      showSuccess(
        'Report generation queued',
        'Check Reports → Deliveries to download once ready.',
      );
    } catch (err) {
      showError(
        'Could not queue report',
        err instanceof Error ? err.message : 'Try again in a moment.',
      );
    } finally {
      setGeneratingReport(false);
    }
  }, [activePracticeId, showError, showSuccess]);

  // ── "Email statement" staged-action chip ─────────────────────────────────
  // Same `sendNow` path as the primary CTA, but pinned to a per-client
  // export when a client filter is active. For now it queues the same
  // trust-ledger delivery; once we have a per-client export we can scope
  // it to `{ clientId }`. TODO(backend): expose `clientId` filter on
  // `/api/reports/:practiceId/send-now`.
  const handleEmailStatement = useCallback(async () => {
    if (!activePracticeId) return;
    setGeneratingReport(true);
    try {
      await reportsApi.sendNow(activePracticeId, {
        reportType: 'trust-ledger',
        recipients: [],
        filters: { period: 'month' },
      });
      showSuccess(
        'Statement queued',
        'Trust ledger export is generating — check Reports → Deliveries.',
      );
    } catch (err) {
      showError(
        'Could not queue statement',
        err instanceof Error ? err.message : 'Try again in a moment.',
      );
    } finally {
      setGeneratingReport(false);
    }
  }, [activePracticeId, showError, showSuccess]);

  // ── "Pause new draws" stub ───────────────────────────────────────────────
  // TODO(backend): wire to a real preference toggle (e.g. flip the
  // `lock_matter_on_zero` rule globally, or add a `trust_paused` flag on
  // `practices`). Today we just acknowledge the click.
  const handlePauseDraws = useCallback(() => {
    showInfo(
      'Pause new draws',
      'Backend wiring pending — this will lock the staged-action queue once available.',
    );
  }, [showInfo]);

  // ── AI summary copy ────────────────────────────────────────────────────────
  // Surface ONE actionable observation (lowest client under threshold) plus
  // the deterministic period rollup. Every figure is sourced from the
  // ledger meta we just fetched — no invented names or percentages.
  const aiSummaryBody = (() => {
    if (loading && !meta) return 'Loading trust balance commentary…';
    if (!meta || (totalCreditsCents === 0 && totalDebitsCents === 0 && totalBalanceCents === 0)) {
      return (
        <>
          No trust activity recorded yet. Once you receive a retainer or transfer
          funds in or out of the IOLTA account, a <em>three-way reconciliation
          summary</em> will appear here.
        </>
      );
    }
    return (
      <>
        {lowestBelowThreshold ? (
          <>
            I noticed: <em>{lowestBelowThreshold.clientName}</em> retainer is at{' '}
            <em>{formatCentsMajor(lowestBelowThreshold.balanceCents)}</em> — practices
            typically replenish at <em>{formatCentsMajor(SUGGESTED_REPLENISH_CENTS)}</em>.
            {' '}
          </>
        ) : null}
        Ending IOLTA balance is <em>{formatCentsMajor(totalBalanceCents)}</em> across {clientCount} {clientCount === 1 ? 'client' : 'clients'}.
        This period recorded <em>{formatCentsMajor(totalCreditsCents)}</em> in deposits and{' '}
        <em>{formatCentsMajor(totalDebitsCents)}</em> in withdrawals
        {isNetOutflow ? (
          <>
            {' '}— a net outflow of <em>{formatCentsMajor(Math.abs(netFlowCents))}</em>.
          </>
        ) : (
          <>.</>
        )}
      </>
    );
  })();

  const aiSummaryActions = activePracticeId ? (
    <>
      <Chip onClick={handleEmailStatement} title="Email a trust statement to recipients on file">
        Email statement
      </Chip>
      <Chip onClick={handleOpenCpaDialog} title="Schedule recurring delivery to your CPA">
        Email to CPA
      </Chip>
      <Chip onClick={handlePauseDraws} title="Pause staged actions against trust">
        Pause new draws
      </Chip>
    </>
  ) : null;

  // Replenishment is intentionally disabled in v1 — the wiring lives in a
  // separate IOLTA work track (StagedAction approval flow). Render as a
  // disabled CTA so the affordance is discoverable but not actionable.
  const replenishButton = (
    <Tooltip content="Coming soon · replenishment must go through the StagedAction approval flow">
      <Button variant="secondary" disabled>
        Stage replenishment
      </Button>
    </Tooltip>
  );

  // Reconcile is also gated on the bank-integration track. Render disabled
  // so the affordance is visible but the user can't trigger it.
  const reconcileButton = (
    <Tooltip content="Reconciliation pending bank integration">
      <Button variant="secondary" disabled>
        Reconcile
      </Button>
    </Tooltip>
  );

  const handleExportCsv = () => {
    // Reuse the existing report CSV export route. Opens in a new tab so the
    // user stays on the ledger surface.
    if (!activePracticeId) return;
    const path = `/api/reports/${encodeURIComponent(activePracticeId)}/export/trust-ledger?format=csv`;
    window.open(path, '_blank', 'noopener,noreferrer');
  };

  const main = (
    <div className="h-full overflow-y-auto px-6 py-8 md:px-10 md:py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-7">
        <PageHeader
          crumb="Workspace · IOLTA"
          title="Trust ledger"
          subtitle="Read-only view of client trust funds. Deposits, transfers, and refunds flow through the staged-approval queue."
          actions={
            <div className="flex flex-wrap items-center gap-2">
              {reconcileButton}
              <Button variant="secondary" onClick={handleExportCsv} disabled={!activePracticeId}>
                Export CSV
              </Button>
              <Button
                variant="secondary"
                onClick={handleOpenCpaDialog}
                disabled={!activePracticeId}
              >
                Email to CPA quarterly
              </Button>
              {replenishButton}
              <Button
                variant="primary"
                onClick={handleGenerateReport}
                disabled={!activePracticeId || generatingReport}
              >
                {generatingReport && (
                  <span className="mr-1.5 inline-flex">
                    <LoadingSpinner size="sm" ariaLabel="Queuing report" announce={false} />
                  </span>
                )}
                Generate IOLTA report
              </Button>
            </div>
          }
        />

        <AISummary
          label="Trust balance commentary"
          verifier={meta ? 'grounded in ledger meta' : undefined}
          actions={aiSummaryActions}
        >
          {aiSummaryBody}
        </AISummary>

        <StatStrip cells={statCells} />

        {error ? (
          <div className="flex items-center justify-between rounded-md border border-red-500/30 bg-red-500/5 px-3 py-2">
            <div className="flex items-center gap-2 text-sm text-red-400">
              <AlertTriangle className="h-4 w-4" />
              <span>{error.message}</span>
            </div>
            <button
              type="button"
              className="text-xs font-medium text-red-300 underline"
              onClick={refetch}
            >
              Retry
            </button>
          </div>
        ) : null}

        {/*
          Two-column body (Trust.html .ledger-body): per-client balances +
          recent transactions on the left, audit trail + compliance rules
          on the right. Collapses to a single column under 1024px.
        */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="flex min-w-0 flex-col gap-6">
            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="font-serif text-xl text-ink">Per-client balances</h2>
                  <p className="mt-1 text-sm text-dim-2">
                    Running balance per client based on the most recent entry in the period.
                  </p>
                </div>
                <span className="font-mono text-[10.5px] uppercase tracking-[0.04em] text-dim">
                  {clientCount} {clientCount === 1 ? 'client' : 'clients'} · {formatCentsMajor(totalBalanceCents)} total
                </span>
              </div>
              <EntityList
                items={clientBalances}
                onSelect={(b) => setClientFilter((current) => (current === b.id ? null : b.id))}
                selectedId={clientFilter ?? undefined}
                isLoading={loading && clientBalances.length === 0}
                className="panel overflow-hidden"
                emptyState={
                  <WorkspacePlaceholderState
                    icon={Wallet}
                    title="No client balances"
                    description="Once a client deposits funds to your trust account, their balance will appear here."
                    className="h-full"
                  />
                }
                renderItem={(balance) => <ClientBalanceRow balance={balance} />}
              />
            </section>

            <section className="flex flex-col gap-3">
              <div className="flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h2 className="font-serif text-xl text-ink">Recent transactions</h2>
                  <p className="mt-1 text-sm text-dim-2">
                    Every deposit, transfer, and refund recorded in the ledger.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  {clientFilter ? (
                    <>
                      <Pill tone="dim">Filtered · {clientFilter}</Pill>
                      <button
                        type="button"
                        className="font-mono text-[10.5px] uppercase tracking-[0.04em] text-dim hover:text-ink"
                        onClick={() => setClientFilter(null)}
                      >
                        Clear filter
                      </button>
                    </>
                  ) : (
                    <span className="font-mono text-[10.5px] uppercase tracking-[0.04em] text-dim">
                      {visibleEntries.length} {visibleEntries.length === 1 ? 'entry' : 'entries'}
                    </span>
                  )}
                </div>
              </div>
              <EntityList
                items={visibleEntries}
                onSelect={() => undefined}
                isLoading={loading && visibleEntries.length === 0}
                className="panel overflow-hidden"
                emptyState={
                  <WorkspacePlaceholderState
                    icon={Wallet}
                    title={clientFilter ? `No entries for ${clientFilter}` : 'No transactions yet'}
                    description={
                      clientFilter
                        ? 'Clear the filter to see all ledger entries.'
                        : 'Deposits and transfers will appear here once a client funds their trust balance.'
                    }
                    className="h-full"
                  />
                }
                renderItem={(entry) => (
                  <TrustLedgerEntryRow
                    entry={entry}
                    onSelectClient={(name) =>
                      setClientFilter((current) => (current === name ? null : name))
                    }
                  />
                )}
              />
            </section>
          </div>

          <div className="flex min-w-0 flex-col gap-6">
            <TrustAuditTrailPane practiceId={activePracticeId} />
            <TrustComplianceRulesPane practiceId={activePracticeId} />
          </div>
        </div>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      <LeftRail
        variant="desktop"
        items={railItems}
        brandMark={brandMark}
        footer={profileFooter}
        className="hidden lg:flex"
      />
      <main className="flex-1 min-h-0 overflow-hidden order-first lg:order-none">
        {main}
      </main>
      <LeftRail variant="mobile" items={railItems} className="lg:hidden" />
      <EmailCpaDialog
        practiceId={activePracticeId}
        isOpen={cpaDialogOpen}
        onClose={handleCloseCpaDialog}
      />
    </div>
  );
};

export default PracticeTrustPage;

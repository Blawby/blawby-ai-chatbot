import { useEffect, useState } from 'preact/hooks';
import { Plus, UserPlus, Check, X, ArrowRight } from 'lucide-preact';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useWorkspaceResolver } from '@/shared/hooks/useWorkspaceResolver';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { useSidebarCounts } from '@/shared/hooks/useSidebarCounts';
import { applyAccentColor } from '@/shared/utils/accentColors';
import { useNavigation } from '@/shared/utils/navigation';
import { Button } from '@/shared/ui/Button';
import { SegmentedToggle, type SegmentedToggleOption } from '@/shared/ui/input/SegmentedToggle';
import { StatusBadge, type StatusVariant } from '@/shared/ui/badges/StatusBadge';
import { PracticeSidebar } from '@/shared/ui/nav/PracticeSidebar';
import { WorkspaceShellHeader } from '@/shared/ui/layout/WorkspaceShellHeader';
import { AppShell } from '@/shared/ui/layout/AppShell';
import { useCommandPalette } from '@/features/search/contexts/CommandPaletteContext';

type CashflowRange = '7d' | '30d' | 'all';

const SETUP_DISMISSED_STORAGE_KEY = 'blawby:practice-home:setup-dismissed';

const CASHFLOW_RANGES: ReadonlyArray<SegmentedToggleOption<CashflowRange>> = [
  { value: '7d', label: 'Last 7 days' },
  { value: '30d', label: 'Last 30 days' },
  { value: 'all', label: 'All-time' },
];

interface SetupStep {
  id: string;
  title: string;
  description: string;
  complete: boolean;
}

const SETUP_STEPS: SetupStep[] = [
  { id: 'account', title: 'Create account', description: 'Your account is set up and ready to go.', complete: true },
  { id: 'billing', title: 'Set up billing', description: 'Connect Stripe to start accepting payments.', complete: false },
  { id: 'client', title: 'Add your first client', description: 'Import or manually add clients to your practice.', complete: false },
  { id: 'invoice', title: 'Send first invoice', description: 'Create and send your first invoice to a client.', complete: false },
];

interface MetricCard {
  id: string;
  label: string;
  value: string;
  hint: string;
}

const CASHFLOW_METRICS: MetricCard[] = [
  { id: 'collected', label: 'Collected revenue', value: '$0', hint: 'Send your first invoice to start tracking' },
  { id: 'overdue', label: 'Overdue invoices', value: '$0', hint: "No overdue invoices — you're all clear" },
  { id: 'awaiting', label: 'Awaiting payment', value: '$0', hint: 'Invoices waiting for client payment' },
  { id: 'ready', label: 'Ready to invoice', value: '$0', hint: 'Billable hours ready for invoicing' },
];

interface IntakeRow {
  id: string;
  client: string;
  initials: string;
  matter: string;
  date: string;
  amount: string;
  status: StatusVariant;
  statusLabel: string;
}

const RECENT_INTAKES: IntakeRow[] = [
  { id: 'i1', client: 'Maya Patel', initials: 'MP', matter: 'Divorce filing', date: 'Apr 25, 2026', amount: '$7,500', status: 'pending', statusLabel: 'Pending' },
  { id: 'i2', client: 'Daniel Romero', initials: 'DR', matter: 'Estate planning', date: 'Apr 25, 2026', amount: '$3,200', status: 'pending', statusLabel: 'Pending' },
  { id: 'i3', client: 'Sarah Whitman', initials: 'SW', matter: 'Tenant dispute', date: 'Apr 24, 2026', amount: '$4,800', status: 'success', statusLabel: 'Accepted' },
];

const PracticeHomePage = () => {
  const { session } = useSessionContext();
  const { currentPractice, practices } = useWorkspaceResolver();
  const { navigate } = useNavigation();
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [cashflowRange, setCashflowRange] = useState<CashflowRange>('7d');
  const [setupDismissed, setSetupDismissed] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false;
    try {
      return window.localStorage.getItem(SETUP_DISMISSED_STORAGE_KEY) === '1';
    } catch {
      return false;
    }
  });

  const dismissSetup = () => {
    setSetupDismissed(true);
    try {
      window.localStorage.setItem(SETUP_DISMISSED_STORAGE_KEY, '1');
    } catch {
      // Storage may be unavailable (private mode, quota). The in-memory flag still suppresses the card for this session.
    }
  };

  const userName = session?.user?.name || session?.user?.email || 'there';
  const firstName = userName.split(' ')[0] || userName;
  const userEmail = session?.user?.email ?? null;
  const userImage = session?.user?.image ?? null;

  const practiceSlug = currentPractice?.slug ?? practices[0]?.slug ?? null;
  const practiceBasePath = practiceSlug
    ? `/practice/${encodeURIComponent(practiceSlug)}`
    : null;
  const orgName = currentPractice?.name?.trim() || 'Practice';
  const orgInitial = (orgName.charAt(0) || 'B').toUpperCase();

  const { details: practiceDetails, hasDetails, fetchDetails } = usePracticeDetails(
    currentPractice?.id ?? null,
    practiceSlug,
    false,
  );
  const services = practiceDetails?.services ?? currentPractice?.services;

  useEffect(() => {
    if (!currentPractice?.id || hasDetails) return;
    void fetchDetails();
  }, [currentPractice?.id, hasDetails, fetchDetails]);

  const accentColor = practiceDetails?.accentColor ?? currentPractice?.accentColor ?? null;
  useEffect(() => {
    if (accentColor) applyAccentColor(accentColor);
  }, [accentColor]);

  const { counts: sidebarCounts } = useSidebarCounts(
    currentPractice?.id ?? null,
    'home',
  );

  const sidebarUser = { name: userName, email: userEmail, image: userImage };
  const completeCount = SETUP_STEPS.filter((s) => s.complete).length;
  const progressPct = (completeCount / SETUP_STEPS.length) * 100;
  const hasCashflowData = CASHFLOW_METRICS.some((m) => m.value !== '$0');
  const hasIntakes = RECENT_INTAKES.length > 0;
  const pendingIntakes = RECENT_INTAKES.filter((r) => r.status === 'pending');
  const firstPendingIntakeId = pendingIntakes[0]?.id ?? null;

  const renderSidebar = (forceExpanded: boolean) =>
    practiceSlug ? (
      <PracticeSidebar
        practiceSlug={practiceSlug}
        org={{ name: orgName, initial: orgInitial }}
        user={sidebarUser}
        collapsed={desktopCollapsed}
        forceExpanded={forceExpanded}
        onToggleCollapsed={() => setDesktopCollapsed((v) => !v)}
        onItemActivate={() => setMobileSidebarOpen(false)}
        activeItemId="home"
        workspaceSection="home"
        services={services}
        counts={sidebarCounts}
      />
    ) : null;

  const { open: openCommandPalette } = useCommandPalette();
  const header = (
    <WorkspaceShellHeader
      orgInitial={orgInitial}
      title="Home"
      onMenuClick={() => setMobileSidebarOpen(true)}
      onSearchClick={() => openCommandPalette()}
    />
  );

  const handleNewInvoice = () => {
    if (practiceBasePath) navigate(`${practiceBasePath}/invoices`);
  };
  const handleAddClient = () => {
    if (practiceBasePath) navigate(`${practiceBasePath}/contacts`);
  };
  const handleViewAllIntakes = () => {
    if (practiceBasePath) navigate(`${practiceBasePath}/intakes`);
  };
  const handleIntakeOpen = (intakeId: string) => {
    if (practiceBasePath) navigate(`${practiceBasePath}/intakes/${intakeId}`);
  };

  const main = (
    <div className="h-full overflow-y-auto px-6 py-8 md:px-10 md:py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0 max-w-full">
            <h1 className="truncate text-2xl font-semibold text-input-text">Welcome back, {firstName}</h1>
            <p className="mt-1 text-sm text-input-placeholder">
              Here&apos;s what&apos;s happening with your practice today.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {firstPendingIntakeId && (
              <Button
                variant="primary"
                onClick={() => handleIntakeOpen(firstPendingIntakeId)}
              >
                Review {pendingIntakes.length} pending {pendingIntakes.length === 1 ? 'intake' : 'intakes'}
              </Button>
            )}
            <Button variant="secondary" icon={Plus} onClick={handleNewInvoice}>
              New invoice
            </Button>
            <Button variant="secondary" icon={UserPlus} onClick={handleAddClient}>
              Add client
            </Button>
          </div>
        </div>

        {!setupDismissed && completeCount < SETUP_STEPS.length && (
          <section className="card p-6 md:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-input-text">
                Finish setting up your practice
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-input-placeholder">
                  {completeCount} of {SETUP_STEPS.length} complete
                </span>
                <button
                  type="button"
                  onClick={dismissSetup}
                  aria-label="Dismiss setup checklist"
                  className="btn btn-icon btn-icon-xs"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
            </div>
            <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-card-hover">
              <div
                className="h-full rounded-full bg-accent-500 transition-[width] motion-reduce:transition-none"
                style={{ width: `${progressPct}%` }}
                role="progressbar"
                aria-valuenow={completeCount}
                aria-valuemin={0}
                aria-valuemax={SETUP_STEPS.length}
                aria-label={`${completeCount} of ${SETUP_STEPS.length} setup steps complete`}
              />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {SETUP_STEPS.map((step, idx) => (
                <div
                  key={step.id}
                  className="flex flex-col gap-2.5 rounded-lg border border-line-subtle bg-surface-card-hover p-4"
                >
                  <div className="flex items-center gap-2.5">
                    {step.complete ? (
                      <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-accent-500 text-[rgb(var(--accent-foreground))]">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                      </span>
                    ) : (
                      <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-line-utility text-[10px] font-semibold text-input-text">
                        {idx + 1}
                      </span>
                    )}
                    <span className="text-sm font-semibold text-input-text">{step.title}</span>
                  </div>
                  <p className="text-xs leading-snug text-input-placeholder">{step.description}</p>
                </div>
              ))}
            </div>
          </section>
        )}

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-input-text">Cashflow</h2>
            {hasCashflowData && (
              <SegmentedToggle<CashflowRange>
                value={cashflowRange}
                options={CASHFLOW_RANGES}
                onChange={setCashflowRange}
                ariaLabel="Cashflow range"
              />
            )}
          </div>
          {hasCashflowData ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {CASHFLOW_METRICS.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-col gap-2 rounded-2xl border border-card-border bg-card p-5"
                >
                  <span className="text-xs font-medium text-input-placeholder">{m.label}</span>
                  <span className="text-3xl font-bold tabular-nums text-input-text">{m.value}</span>
                  <span className="text-xs leading-snug text-input-placeholder">{m.hint}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="card-muted flex flex-col items-start gap-3 rounded-2xl p-6">
              <p className="text-sm text-input-placeholder">
                Send your first invoice and your cashflow will fill in here.
              </p>
              <Button variant="secondary" icon={Plus} onClick={handleNewInvoice}>
                Send first invoice
              </Button>
            </div>
          )}
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-input-text">Recent intakes</h2>
            {hasIntakes && (
              <Button variant="link" onClick={handleViewAllIntakes}>
                View all
              </Button>
            )}
          </div>
          {hasIntakes ? (
            <div className="overflow-hidden rounded-2xl border border-card-border bg-card">
              <div className="hidden grid-cols-[260px_1fr_140px_100px_100px] items-center gap-4 border-b border-line-subtle px-5 py-3 md:grid">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-input-placeholder">Client</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-input-placeholder">Matter</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-input-placeholder">Date submitted</span>
                <span className="text-right text-[11px] font-semibold uppercase tracking-wider text-input-placeholder">Amount</span>
                <span className="text-right text-[11px] font-semibold uppercase tracking-wider text-input-placeholder">Status</span>
              </div>
              {RECENT_INTAKES.map((row, idx) => (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => handleIntakeOpen(row.id)}
                  className={[
                    'group grid w-full grid-cols-1 gap-2 px-5 py-4 text-left transition-colors hover:bg-surface-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 md:grid-cols-[260px_1fr_140px_100px_100px] md:items-center md:gap-4',
                    idx > 0 ? 'border-t border-line-subtle' : '',
                  ].filter(Boolean).join(' ')}
                >
                  <div className="flex min-w-0 items-center gap-2.5">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-card-hover text-[11px] font-semibold text-input-text">
                      {row.initials}
                    </span>
                    <span className="truncate text-sm font-medium text-input-text">{row.client}</span>
                  </div>
                  <span className="truncate text-sm text-input-placeholder">{row.matter}</span>
                  <span className="truncate text-sm text-input-placeholder">{row.date}</span>
                  <span className="text-sm font-semibold tabular-nums text-input-text md:text-right">{row.amount}</span>
                  <div className="flex items-center gap-2 md:justify-end">
                    <StatusBadge status={row.status}>{row.statusLabel}</StatusBadge>
                    <ArrowRight
                      className="hidden h-4 w-4 text-input-placeholder transition-opacity group-hover:opacity-100 md:block md:opacity-0"
                      aria-hidden="true"
                    />
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className="card-muted flex flex-col items-start gap-3 rounded-2xl p-6">
              <p className="text-sm text-input-placeholder">
                No intakes yet. Share your intake link or add a client to start receiving submissions.
              </p>
              <Button variant="secondary" icon={UserPlus} onClick={handleAddClient}>
                Add first client
              </Button>
            </div>
          )}
        </section>
      </div>
    </div>
  );

  return (
    <AppShell
      className="bg-transparent h-dvh"
      accentBackdropVariant="none"
      header={header}
      sidebar={renderSidebar(false)}
      desktopSidebarCollapsed={desktopCollapsed}
      mobileSidebar={renderSidebar(true)}
      mobileSidebarOpen={mobileSidebarOpen}
      onMobileSidebarClose={() => setMobileSidebarOpen(false)}
      main={main}
      mainClassName="min-h-0 h-full overflow-hidden"
    />
  );
};

export default PracticeHomePage;

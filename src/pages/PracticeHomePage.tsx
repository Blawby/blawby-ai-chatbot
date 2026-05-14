import { useEffect, useState } from 'preact/hooks';
import { Plus, UserPlus, Rocket, Check } from 'lucide-preact';
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

type CashflowRange = '7d' | '30d' | 'all';

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
  { id: 'i1', client: 'Client Name', initials: 'CN', matter: 'I am going through a divorce', date: 'Apr 25, 2026', amount: '$7,500', status: 'pending', statusLabel: 'Pending' },
  { id: 'i2', client: 'Client Name', initials: 'CN', matter: 'I am going through a divorce', date: 'Apr 25, 2026', amount: '$7,500', status: 'pending', statusLabel: 'Pending' },
  { id: 'i3', client: 'Client Name', initials: 'CN', matter: 'Going through a divorce', date: 'Apr 24, 2026', amount: '$7,500', status: 'success', statusLabel: 'Accepted' },
];

const PracticeHomePage = () => {
  const { session } = useSessionContext();
  const { currentPractice, practices } = useWorkspaceResolver();
  const { navigate } = useNavigation();
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);
  const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);
  const [cashflowRange, setCashflowRange] = useState<CashflowRange>('7d');

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

  const header = (
    <WorkspaceShellHeader
      orgInitial={orgInitial}
      title="Home"
      onMenuClick={() => setMobileSidebarOpen(true)}
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

  const main = (
    <div className="h-full overflow-y-auto px-6 py-8 md:px-10 md:py-10">
      <div className="mx-auto flex max-w-6xl flex-col gap-7">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold text-heading">Welcome back, {firstName}</h1>
            <p className="mt-1 text-sm text-secondary">
              Here&apos;s what&apos;s happening with your practice today.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <Button variant="primary" icon={Plus} onClick={handleNewInvoice}>
              New invoice
            </Button>
            <Button variant="secondary" icon={UserPlus} onClick={handleAddClient}>
              Add client
            </Button>
          </div>
        </div>

        <section
          className="rounded-2xl border border-line-glass/30 p-6 md:p-7"
          style={{ background: 'linear-gradient(180deg, #1A1F3D 0%, #151B30 100%)' }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2.5">
              <Rocket className="h-5 w-5 text-accent-300" aria-hidden="true" />
              <h2 className="text-base font-bold text-heading">Get started with your practice</h2>
            </div>
            <span className="text-sm font-medium text-secondary">
              {completeCount} of {SETUP_STEPS.length} complete
            </span>
          </div>
          <div className="mt-4 h-1.5 w-full overflow-hidden rounded-full bg-surface-utility/10">
            <div
              className="h-full rounded-full bg-accent-500 transition-[width]"
              style={{
                width: `${progressPct}%`,
              }}
            />
          </div>
          <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {SETUP_STEPS.map((step, idx) => (
              <div
                key={step.id}
                className="flex flex-col gap-2.5 rounded-xl border border-line-glass/20 bg-surface-utility/5 p-4"
              >
                <div className="flex items-center gap-2.5">
                  {step.complete ? (
                    <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-accent-500 text-[rgb(var(--accent-foreground))]">
                      <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                    </span>
                  ) : (
                    <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-line-glass/30 text-[10px] font-bold text-heading">
                      {idx + 1}
                    </span>
                  )}
                  <span className="text-sm font-semibold text-heading">{step.title}</span>
                </div>
                <p className="text-xs leading-snug text-secondary">{step.description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-heading">Cashflow</h2>
            <SegmentedToggle<CashflowRange>
              value={cashflowRange}
              options={CASHFLOW_RANGES}
              onChange={setCashflowRange}
              ariaLabel="Cashflow range"
            />
          </div>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {CASHFLOW_METRICS.map((m) => (
              <div
                key={m.id}
                className="flex flex-col gap-2 rounded-2xl border border-card-border bg-card p-5"
              >
                <span className="text-xs font-medium text-secondary">{m.label}</span>
                <span className="text-3xl font-bold text-heading tabular-nums">{m.value}</span>
                <span className="text-xs leading-snug text-secondary">{m.hint}</span>
              </div>
            ))}
          </div>
        </section>

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-bold text-heading">Recent Intakes</h2>
            <button
              type="button"
              onClick={handleViewAllIntakes}
              className="text-sm font-medium text-secondary transition-colors hover:text-heading"
            >
              View all
            </button>
          </div>
          <div className="overflow-hidden rounded-2xl border border-card-border bg-card">
            <div className="hidden grid-cols-[260px_1fr_140px_100px_100px] items-center gap-4 border-b border-line-glass/20 px-5 py-3 md:grid">
              <span className="text-[11px] font-semibold uppercase tracking-wider text-secondary">Client</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-secondary">Matter</span>
              <span className="text-[11px] font-semibold uppercase tracking-wider text-secondary">Date Submitted</span>
              <span className="text-right text-[11px] font-semibold uppercase tracking-wider text-secondary">Amount</span>
              <span className="text-right text-[11px] font-semibold uppercase tracking-wider text-secondary">Status</span>
            </div>
            {RECENT_INTAKES.map((row, idx) => (
              <div
                key={row.id}
                className={[
                  'grid grid-cols-1 gap-2 px-5 py-4 md:grid-cols-[260px_1fr_140px_100px_100px] md:items-center md:gap-4',
                  idx > 0 ? 'border-t border-line-glass/20' : '',
                ].filter(Boolean).join(' ')}
              >
                <div className="flex items-center gap-2.5">
                  <span className="flex h-8 w-8 items-center justify-center rounded-full bg-input-placeholder/20 text-[11px] font-bold text-heading">
                    {row.initials}
                  </span>
                  <span className="text-sm font-medium text-heading">{row.client}</span>
                </div>
                <span className="text-sm text-secondary">{row.matter}</span>
                <span className="text-sm text-secondary">{row.date}</span>
                <span className="text-sm font-semibold tabular-nums text-heading md:text-right">{row.amount}</span>
                <div className="flex justify-start md:justify-end">
                  <StatusBadge status={row.status}>{row.statusLabel}</StatusBadge>
                </div>
              </div>
            ))}
          </div>
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

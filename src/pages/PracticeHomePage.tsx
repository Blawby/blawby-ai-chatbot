import { useEffect, useMemo, useState } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Plus, UserPlus, Check, X, ArrowRight } from 'lucide-preact';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useWorkspaceResolver } from '@/shared/hooks/useWorkspaceResolver';
import { usePracticeDetails } from '@/shared/hooks/usePracticeDetails';
import { useSidebarCounts } from '@/shared/hooks/useSidebarCounts';
import { useClientsData } from '@/shared/hooks/useClientsData';
import { applyAccentColor } from '@/shared/utils/accentColors';
import { useNavigation } from '@/shared/utils/navigation';
import { Button } from '@/shared/ui/Button';
import { SegmentedToggle, type SegmentedToggleOption } from '@/shared/ui/input/SegmentedToggle';
import { PracticeSidebar } from '@/shared/ui/nav/PracticeSidebar';
import { WorkspaceShellHeader } from '@/shared/ui/layout/WorkspaceShellHeader';
import { AppShell } from '@/shared/ui/layout/AppShell';
import { useCommandPalette } from '@/features/search/contexts/CommandPaletteContext';
import { usePracticeBillingData } from '@/features/practice-dashboard/hooks/usePracticeBillingData';
import { listIntakes, type IntakeListItem } from '@/features/intake/api/intakesApi';
import { resolveIntakeTitle } from '@/features/intake/utils/intakeTitle';
import { formatRelativeTime } from '@/features/matters/utils/formatRelativeTime';
import { formatCurrency } from '@/shared/utils/currencyFormatter';
import { getMajorAmountValue, type MajorAmount } from '@/shared/utils/money';
import { getOnboardingStatusPayload, isAbortError, isHttpError } from '@/shared/lib/apiClient';
import { extractStripeStatusFromPayload } from '@/features/onboarding/utils';

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
  href: string | null;
}
type StripeStatus = ReturnType<typeof extractStripeStatusFromPayload>;

const hasMoneyValue = (value: MajorAmount | null | undefined) =>
  Math.abs(getMajorAmountValue(value)) > 0;

const intakeStatusLabel = (status: string | null | undefined) => {
  if (status === 'accepted') return 'Accepted';
  if (status === 'declined') return 'Declined';
  return 'Pending';
};

const intakeStatusClass = (status: string | null | undefined) => {
  if (status === 'accepted') return 'status-success';
  if (status === 'declined') return 'status-error';
  return 'status-warning';
};

const initialsFor = (name: string) => {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  return parts.slice(0, 2).map((part) => part.charAt(0).toUpperCase()).join('');
};

const PracticeHomePage = () => {
  const { session } = useSessionContext();
  const location = useLocation();
  // Read the slug from the URL so the resolver picks `currentPractice` for the
  // workspace we're on — not the snapshot's last-active practice. Without this,
  // a switcher-driven navigation to /practice/<other-slug> leaves the sidebar
  // showing the previous org's name (see feat/org-switcher 2026-05-22).
  const urlPracticeSlug = useMemo(() => {
    const match = location.path.match(/^\/practice\/([^/]+)/);
    if (!match) return null;
    try {
      return decodeURIComponent(match[1]);
    } catch {
      return null;
    }
  }, [location.path]);
  const { currentPractice } = useWorkspaceResolver({
    practiceSlug: urlPracticeSlug,
  });
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

  const practiceSlug = currentPractice?.slug ?? null;
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
  useEffect(() => {
    if (!currentPractice?.id || hasDetails) return;
    void fetchDetails();
  }, [currentPractice?.id, hasDetails, fetchDetails]);

  const accentColor = practiceDetails?.accentColor ?? currentPractice?.accentColor ?? null;
  useEffect(() => {
    if (accentColor) applyAccentColor(accentColor);
  }, [accentColor]);

  const { counts: sidebarCounts, raw: rawSidebarCounts, isLoading: countsLoading } = useSidebarCounts(
    currentPractice?.id ?? null,
    'home',
  );
  const activePracticeId = currentPractice?.id ?? null;
  const activeClientsData = useClientsData(
    activePracticeId ?? '',
    'active',
    session?.user?.id ?? null,
    { enabled: Boolean(activePracticeId) },
  );
  const {
    summaryStats,
    loading: practiceBillingLoading,
    error: practiceBillingError,
  } = usePracticeBillingData({
    practiceId: activePracticeId,
    enabled: Boolean(activePracticeId),
    matterLimit: 25,
    windowSize: cashflowRange,
  });
  const [stripeStatus, setStripeStatus] = useState<StripeStatus>(null);
  const [stripeLoading, setStripeLoading] = useState(false);
  const [stripeError, setStripeError] = useState<string | null>(null);
  const [recentIntakes, setRecentIntakes] = useState<IntakeListItem[]>([]);
  const [recentIntakesLoading, setRecentIntakesLoading] = useState(false);
  const [recentIntakesError, setRecentIntakesError] = useState<string | null>(null);

  useEffect(() => {
    if (!activePracticeId) {
      setStripeStatus(null);
      setStripeError(null);
      setStripeLoading(false);
      return;
    }
    const controller = new AbortController();
    setStripeLoading(true);
    setStripeError(null);
    void getOnboardingStatusPayload(activePracticeId, { signal: controller.signal })
      .then((payload) => {
        if (controller.signal.aborted) return;
        setStripeStatus(extractStripeStatusFromPayload(payload));
      })
      .catch((error) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        if (isHttpError(error) && error.response.status === 404) {
          setStripeStatus(null);
          setStripeError(null);
          return;
        }
        setStripeStatus(null);
        setStripeError(error instanceof Error ? error.message : 'Unable to load billing setup status');
      })
      .finally(() => {
        if (!controller.signal.aborted) setStripeLoading(false);
      });
    return () => controller.abort();
  }, [activePracticeId]);

  useEffect(() => {
    if (!activePracticeId) {
      setRecentIntakes([]);
      setRecentIntakesError(null);
      setRecentIntakesLoading(false);
      return;
    }
    const controller = new AbortController();
    setRecentIntakesLoading(true);
    setRecentIntakesError(null);
    void listIntakes(activePracticeId, { page: 1, limit: 5 }, { signal: controller.signal })
      .then((result) => {
        if (controller.signal.aborted) return;
        setRecentIntakes(result.intakes);
      })
      .catch((error) => {
        if (isAbortError(error) || controller.signal.aborted) return;
        setRecentIntakes([]);
        setRecentIntakesError(error instanceof Error ? error.message : 'Unable to load recent intakes');
      })
      .finally(() => {
        if (!controller.signal.aborted) setRecentIntakesLoading(false);
      });
    return () => controller.abort();
  }, [activePracticeId]);

  const sidebarUser = { name: userName, email: userEmail, image: userImage };
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
  const completeCount = setupSteps.filter((s) => s.complete).length;
  const progressPct = (completeCount / setupSteps.length) * 100;
  const setupLoading = countsLoading || activeClientsData.isLoading || stripeLoading;
  const hasCashflowData = summaryStats.some((m) => hasMoneyValue(m.value));
  const hasIntakes = recentIntakes.length > 0;
  const pendingIntakeCount = rawSidebarCounts?.intakes?.pending_review ?? 0;

  const renderSidebar = (forceExpanded: boolean) =>
    practiceSlug ? (
      <PracticeSidebar
        practiceSlug={practiceSlug}
        org={{
          id: currentPractice?.id,
          slug: currentPractice?.slug ?? practiceSlug,
          name: orgName,
          initial: orgInitial,
          logoUrl: currentPractice?.logo ?? null,
        }}
        user={sidebarUser}
        collapsed={desktopCollapsed}
        forceExpanded={forceExpanded}
        onToggleCollapsed={() => setDesktopCollapsed((v) => !v)}
        onItemActivate={() => setMobileSidebarOpen(false)}
        activeItemId="home"
        workspaceSection="home"
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
    if (practiceBasePath) navigate(`${practiceBasePath}/invoices/new`);
  };
  const handleAddClient = () => {
    if (practiceBasePath) navigate(`${practiceBasePath}/contacts/new`);
  };
  const handleViewAllIntakes = () => {
    if (practiceBasePath) navigate(`${practiceBasePath}/intakes/responses`);
  };
  const handleIntakeOpen = (intakeId: string) => {
    if (practiceBasePath) navigate(`${practiceBasePath}/intakes/responses/${encodeURIComponent(intakeId)}`);
  };
  const handleSetupStep = (step: SetupStep) => {
    if (step.href) navigate(step.href);
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
            {pendingIntakeCount > 0 && (
              <Button
                variant="primary"
                onClick={handleViewAllIntakes}
              >
                Review {pendingIntakeCount} pending {pendingIntakeCount === 1 ? 'intake' : 'intakes'}
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

        {!setupDismissed && completeCount < setupSteps.length && (
          <section className="card p-6 md:p-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-base font-semibold text-input-text">
                Finish setting up your practice
              </h2>
              <div className="flex items-center gap-3">
                <span className="text-sm font-medium text-input-placeholder">
                  {setupLoading ? 'Checking setup' : `${completeCount} of ${setupSteps.length} complete`}
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
                aria-valuemax={setupSteps.length}
                aria-label={`${completeCount} of ${setupSteps.length} setup steps complete`}
              />
            </div>
            <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {setupSteps.map((step, idx) => (
                <button
                  key={step.id}
                  type="button"
                  disabled={!step.href}
                  onClick={() => handleSetupStep(step)}
                  className="flex min-h-[116px] flex-col gap-2.5 rounded-lg border border-line-subtle bg-surface-card-hover p-4 text-left transition-colors hover:bg-surface-card focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 disabled:cursor-default disabled:hover:bg-surface-card-hover"
                >
                  <div className="flex items-center gap-2.5">
                    {step.complete ? (
                      <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full bg-accent-500 text-[rgb(var(--accent-foreground))]">
                        <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden="true" />
                      </span>
                    ) : (
                      <span className="flex h-[22px] w-[22px] items-center justify-center rounded-full border border-line-subtle text-[10px] font-semibold text-input-text">
                        {idx + 1}
                      </span>
                    )}
                    <span className="text-sm font-semibold text-input-text">{step.title}</span>
                  </div>
                  <p className="text-xs leading-snug text-input-placeholder">{step.description}</p>
                </button>
              ))}
            </div>
            {stripeError ? (
              <p className="mt-3 text-xs text-error">{stripeError}</p>
            ) : null}
          </section>
        )}

        <section className="flex flex-col gap-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold text-input-text">Cashflow</h2>
            <SegmentedToggle<CashflowRange>
              value={cashflowRange}
              options={CASHFLOW_RANGES}
              onChange={setCashflowRange}
              ariaLabel="Cashflow range"
            />
          </div>
          {practiceBillingLoading && summaryStats.length === 0 ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {[0, 1, 2, 3].map((item) => (
                <div key={item} className="rounded-2xl border border-card-border bg-card p-5">
                  <div className="h-3 w-24 rounded-full bg-surface-card-hover" />
                  <div className="mt-4 h-8 w-28 rounded-full bg-surface-card-hover" />
                  <div className="mt-3 h-3 w-36 rounded-full bg-surface-card-hover" />
                </div>
              ))}
            </div>
          ) : practiceBillingError ? (
            <div className="card-muted rounded-2xl p-6">
              <p className="text-sm font-medium text-input-text">Cashflow could not load.</p>
              <p className="mt-1 text-sm text-input-placeholder">{practiceBillingError}</p>
            </div>
          ) : hasCashflowData ? (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {summaryStats.map((m) => (
                <div
                  key={m.id}
                  className="flex flex-col gap-2 rounded-2xl border border-card-border bg-card p-5"
                >
                  <span className="text-xs font-medium text-input-placeholder">{m.label}</span>
                  <span className="text-3xl font-bold tabular-nums text-input-text">{formatCurrency(m.value)}</span>
                  <span className="text-xs leading-snug text-input-placeholder">{m.helper}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="card-muted flex flex-col items-start gap-3 rounded-2xl p-6">
              <p className="text-sm font-medium text-input-text">No invoice activity yet.</p>
              <p className="text-sm text-input-placeholder">
                Create and send an invoice, then collected revenue, overdue balances, and ready-to-invoice work will appear here.
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
              <div className="hidden grid-cols-[260px_1fr_140px_110px] items-center gap-4 border-b border-line-subtle px-5 py-3 md:grid">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-input-placeholder">Client</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-input-placeholder">Subject</span>
                <span className="text-[11px] font-semibold uppercase tracking-wider text-input-placeholder">Date submitted</span>
                <span className="text-right text-[11px] font-semibold uppercase tracking-wider text-input-placeholder">Status</span>
              </div>
              {recentIntakes.map((row, idx) => {
                const contactName = row.metadata?.name?.trim() || row.metadata?.email?.trim() || 'Unknown contact';
                const subject = resolveIntakeTitle(row.metadata, row.metadata?.name?.trim() || 'Intake response');
                return (
                  <button
                    key={row.uuid}
                    type="button"
                    onClick={() => handleIntakeOpen(row.uuid)}
                    className={[
                      'group grid w-full grid-cols-1 gap-2 px-5 py-4 text-left transition-colors hover:bg-surface-card-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-500/40 md:grid-cols-[260px_1fr_140px_110px] md:items-center md:gap-4',
                      idx > 0 ? 'border-t border-line-subtle' : '',
                    ].filter(Boolean).join(' ')}
                  >
                    <div className="flex min-w-0 items-center gap-2.5">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-surface-card-hover text-[11px] font-semibold text-input-text">
                        {initialsFor(contactName)}
                      </span>
                      <span className="truncate text-sm font-medium text-input-text">{contactName}</span>
                    </div>
                    <span className="truncate text-sm text-input-placeholder">{subject}</span>
                    <span className="truncate text-sm text-input-placeholder">{formatRelativeTime(row.created_at)}</span>
                    <div className="flex items-center gap-2 md:justify-end">
                      <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${intakeStatusClass(row.triage_status)}`}>
                        {intakeStatusLabel(row.triage_status)}
                      </span>
                      <ArrowRight
                        className="hidden h-4 w-4 text-input-placeholder transition-opacity group-hover:opacity-100 md:block md:opacity-0"
                        aria-hidden="true"
                      />
                    </div>
                  </button>
                );
              })}
            </div>
          ) : recentIntakesLoading ? (
            <div className="overflow-hidden rounded-2xl border border-card-border bg-card">
              {[0, 1, 2].map((row) => (
                <div key={row} className="grid grid-cols-1 gap-2 border-t border-line-subtle px-5 py-4 first:border-t-0 md:grid-cols-[260px_1fr_140px_110px] md:items-center md:gap-4">
                  <div className="h-4 w-36 rounded-full bg-surface-card-hover" />
                  <div className="h-4 w-48 rounded-full bg-surface-card-hover" />
                  <div className="h-4 w-24 rounded-full bg-surface-card-hover" />
                  <div className="h-6 w-20 rounded-full bg-surface-card-hover md:ml-auto" />
                </div>
              ))}
            </div>
          ) : recentIntakesError ? (
            <div className="card-muted rounded-2xl p-6">
              <p className="text-sm font-medium text-input-text">Recent intakes could not load.</p>
              <p className="mt-1 text-sm text-input-placeholder">{recentIntakesError}</p>
            </div>
          ) : (
            <div className="card-muted flex flex-col items-start gap-3 rounded-2xl p-6">
              <p className="text-sm font-medium text-input-text">No intake responses yet.</p>
              <p className="text-sm text-input-placeholder">
                New submissions will appear here after a visitor completes an intake form.
              </p>
              <Button variant="secondary" onClick={() => practiceBasePath && navigate(`${practiceBasePath}/intakes/forms`)}>
                Manage intake forms
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

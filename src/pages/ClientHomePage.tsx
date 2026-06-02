import { useMemo } from 'preact/hooks';
import { useLocation } from 'preact-iso';
import { Sparkles, Paperclip, ArrowUp } from 'lucide-preact';
import { useSessionContext } from '@/shared/contexts/SessionContext';
import { useWorkspace } from '@/shared/hooks/useWorkspace';
import { useWorkspaceResolver } from '@/shared/hooks/useWorkspaceResolver';
import { useNavigation } from '@/shared/utils/navigation';
import { signOut } from '@/shared/utils/auth';
import { getWorkspaceSettingsPath } from '@/shared/utils/workspace';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { useClientDashboardData } from '@/features/client-dashboard/hooks/useClientDashboardData';
import { JourneyProgress, type JourneyStep } from '@/design-system/patterns';
import { Pill, Bar } from '@/design-system/primitives';
import { LeftRail, BrandMark, type LeftRailItem } from '@/design-system/layout';
import { SidebarProfileMenu } from '@/shared/ui/nav/SidebarProfileMenu';
import { getClientNavConfig } from '@/shared/config/navConfig';
import type { IconComponent } from '@/shared/ui/Icon';

// ---------------------------------------------------------------------------
// Local helpers
// ---------------------------------------------------------------------------

const formatLongDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
};

const formatShortDate = (iso: string | null | undefined): string => {
  if (!iso) return '—';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const formatCurrency = (value: number | null | undefined): string => {
  if (typeof value !== 'number' || !Number.isFinite(value)) return '—';
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value);
};

const firstName = (full: string): string => {
  const trimmed = full.trim();
  if (!trimmed) return 'there';
  const first = trimmed.split(/\s+/)[0];
  if (first.includes('@')) return first.split('@')[0];
  return first;
};

const userInitials = (name: string): string => {
  const trimmed = name.trim();
  if (!trimmed) return '··';
  return trimmed
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('') || '··';
};

// Map a matter status to a 5-step journey. The design's canonical journey is
// case-type-specific (e.g. Auto Injury → Case opened, Records, Demand sent,
// Awaiting response, Settlement). We provide a generic intake → active →
// litigation → resolution skeleton; per-case-type templates are a TODO.
//
// TODO(backend): expose a `journey` field on BackendMatter (or compute it
// from milestones) so each matter renders its own template + dates.
const ACTIVE_STATUSES = new Set([
  'active',
  'pleadings_filed',
  'discovery',
  'mediation',
  'pre_trial',
  'trial',
  'order_entered',
  'appeal_pending',
]);

const buildGenericJourney = (status: string | null | undefined): JourneyStep[] => {
  const s = (status ?? '').toLowerCase();
  const isOpened = Boolean(s);
  const isIntakeDone = s !== 'first_contact' && s !== 'intake_pending' && Boolean(s);
  const isEngaged = isIntakeDone && s !== 'conflict_check' && s !== 'eligibility' && s !== 'consultation_scheduled' && s !== 'engagement_pending';
  const isActive = ACTIVE_STATUSES.has(s);
  const isResolved = s === 'closed' || s === 'completed' || s === 'order_entered';

  const step = (idx: number, name: string, done: boolean, now: boolean): JourneyStep => ({
    id: `step-${idx}`,
    name,
    status: done ? 'done' : now ? 'now' : 'future',
  });

  // 1 Opened · 2 Intake · 3 Engagement · 4 Active work · 5 Resolution
  return [
    step(1, 'Case opened', isOpened, !isOpened),
    step(2, 'Intake complete', isIntakeDone, isOpened && !isIntakeDone),
    step(3, 'Engagement signed', isEngaged, isIntakeDone && !isEngaged),
    step(4, 'Active work', isActive, isEngaged && !isActive && !isResolved),
    step(5, 'Resolution', isResolved, isActive && !isResolved),
  ];
};

// ---------------------------------------------------------------------------
// Page-scoped style block.
// All rules are namespaced under .client-portal-page so they don't bleed
// into the rest of the app. Uses DS tokens only.
// ---------------------------------------------------------------------------

const PortalStyles = () => (
  <style>{`
    .client-portal-page {
      background:
        radial-gradient(ellipse 1000px 600px at 80% -10%, color-mix(in oklab, var(--accent) 12%, transparent), transparent 60%),
        var(--paper);
      background-attachment: fixed;
      min-height: 100%;
    }

    /* Firm topbar */
    .cp-topbar {
      border-bottom: 1px solid var(--rule);
      background: color-mix(in oklab, var(--paper) 94%, transparent);
      backdrop-filter: blur(10px);
      position: sticky; top: 0; z-index: 10;
    }
    .cp-topbar-inner {
      max-width: 1080px; margin: 0 auto;
      padding: 12px 16px;
      display: flex; align-items: center; gap: 12px;
    }
    @media (min-width: 640px) {
      .cp-topbar-inner { padding: 16px 24px; gap: 16px; }
    }
    .cp-firm-name {
      font-family: var(--serif); font-size: 16px; line-height: 1.1;
      letter-spacing: -0.01em; color: var(--ink);
      flex: 1; min-width: 0;
    }
    @media (min-width: 640px) {
      .cp-firm-name { font-size: 18px; }
    }
    .cp-firm-name em { color: var(--accent); font-style: italic; }
    .cp-firm-sub {
      display: block; font-family: var(--mono); font-size: 9.5px;
      color: var(--dim); letter-spacing: 0.14em; text-transform: uppercase;
      margin-top: 4px;
    }
    /* On mobile, the user chip collapses to just the avatar circle per
       Mobile.html (.m-portal .portal-nav .av — 28px). Name + role only
       show from sm: up. */
    .cp-user-chip {
      display: flex; align-items: center; gap: 10px;
      padding: 0;
      border: 0; border-radius: 0;
      background: transparent;
      flex-shrink: 0;
    }
    @media (min-width: 640px) {
      .cp-user-chip {
        padding: 6px 12px 6px 14px;
        border: 1px solid var(--rule); border-radius: var(--r-pill);
        background: var(--card);
      }
    }
    .cp-user-chip-avatar {
      width: 28px; height: 28px; border-radius: 50%;
      background: linear-gradient(135deg, var(--ink-2), var(--ink));
      color: var(--paper); font-family: var(--sans); font-weight: 600;
      font-size: 10.5px; display: grid; place-items: center;
    }
    @media (min-width: 640px) {
      .cp-user-chip-avatar { width: 26px; height: 26px; }
    }
    .cp-user-chip-meta { display: none; }
    @media (min-width: 640px) {
      .cp-user-chip-meta { display: block; }
    }
    .cp-user-chip-name { font-size: 13px; line-height: 1.1; color: var(--ink); }
    .cp-user-chip-role {
      display: block; font-family: var(--mono); font-size: 10px;
      color: var(--dim); letter-spacing: 0.06em; text-transform: uppercase;
      margin-top: 2px;
    }

    /* Wrap — extra bottom padding on mobile to clear the sticky reply bar
       (~56px) + the mobile LeftRail (~60px + safe-area). */
    .cp-wrap {
      max-width: 1080px; margin: 0 auto;
      padding: 24px 16px 180px;
    }
    @media (min-width: 640px) {
      .cp-wrap { padding: 32px 24px 120px; }
    }
    @media (min-width: 768px) {
      .cp-wrap { padding: 40px 32px 80px; }
    }

    /* Greeting — mobile scales to 32px per Mobile.html (.m-portal .greet h2 = 28px,
       EngagementReview mobile h1 = 32px). Bumps to 52px on desktop per design. */
    .cp-greet-date {
      font-family: var(--mono); font-size: 10.5px;
      letter-spacing: 0.14em; text-transform: uppercase;
      color: var(--dim); margin-bottom: 8px;
    }
    .cp-greet-h1 {
      font-family: var(--serif); font-weight: 400; font-size: 32px;
      line-height: 1.05; letter-spacing: -0.02em; margin: 0;
      max-width: 20ch; text-wrap: balance; color: var(--ink);
    }
    @media (min-width: 640px) {
      .cp-greet-h1 { font-size: 40px; line-height: 1.02; }
    }
    @media (min-width: 768px) {
      .cp-greet-h1 { font-size: 52px; }
    }
    .cp-greet-h1 em { color: var(--accent); font-style: italic; }
    .cp-greet-p {
      margin: 12px 0 0; max-width: 56ch;
      color: var(--ink-2); font-size: 16px; line-height: 1.55;
    }

    /* Status hero card — tighter top margin on mobile (24px vs 32px desktop). */
    .cp-status-card {
      margin-top: 24px;
      background: var(--card); border: 1px solid var(--rule);
      border-radius: var(--r-md); overflow: hidden;
      box-shadow: var(--shadow-3);
    }
    @media (min-width: 640px) {
      .cp-status-card { margin-top: 32px; }
    }
    /* Mobile: topband stacks vertically (title above, stage pill below).
       Desktop ≥640px: row layout with stage pill right-aligned. */
    .cp-status-topband {
      padding: 18px 20px;
      display: flex; flex-direction: column;
      gap: 12px;
      border-bottom: 1px solid var(--rule);
      background: linear-gradient(180deg, color-mix(in oklab, var(--accent) 10%, var(--card)), var(--card));
    }
    @media (min-width: 640px) {
      .cp-status-topband {
        padding: 20px 24px;
        flex-direction: row;
        justify-content: space-between;
        align-items: flex-start;
        gap: 16px;
        flex-wrap: wrap;
      }
    }
    .cp-status-stage {
      /* When stacked on mobile, the stage block sits flush-left; on desktop
         it right-aligns. */
    }
    @media (min-width: 640px) {
      .cp-status-stage { text-align: right; }
    }
    .cp-band-label {
      font-family: var(--mono); font-size: 10px;
      color: var(--accent-deep); letter-spacing: 0.14em; text-transform: uppercase;
    }
    .cp-band-label-dim { color: var(--dim); }
    .cp-band-title {
      font-family: var(--serif); font-weight: 400; font-size: 24px;
      margin: 6px 0 0; letter-spacing: -0.012em; line-height: 1.15;
      color: var(--ink);
    }
    @media (min-width: 768px) {
      .cp-band-title { font-size: 28px; }
    }
    .cp-band-sub {
      font-size: 13px; color: var(--dim); margin-top: 4px;
      font-family: var(--mono); letter-spacing: 0.04em; text-transform: uppercase;
    }

    /* Next-up banner inside status card — tighter padding on mobile. */
    .cp-next-up {
      padding: 18px 20px;
      border-top: 1px solid var(--rule);
      background: var(--paper-2);
      display: grid; grid-template-columns: 1fr; gap: 14px; align-items: center;
    }
    @media (min-width: 640px) {
      .cp-next-up { padding: 22px 24px; }
    }
    @media (min-width: 768px) {
      .cp-next-up { grid-template-columns: 1fr auto; gap: 18px; }
    }
    .cp-next-label {
      font-family: var(--mono); font-size: 10px;
      letter-spacing: 0.14em; text-transform: uppercase; color: var(--dim);
    }
    .cp-next-what {
      font-family: var(--serif); font-size: 18px; line-height: 1.3;
      margin: 4px 0 0; max-width: 56ch; color: var(--ink);
    }
    .cp-next-what em { color: var(--accent-deep); font-style: italic; }
    .cp-next-acts { display: flex; gap: 8px; flex-shrink: 0; flex-wrap: wrap; }

    /* Main two-col grid — collapses to single column at <1024px.
       Mobile single-column order is: messages → upcoming → attorney →
       retainer → docs → payments (matches the DOM order). */
    .cp-main {
      display: grid;
      grid-template-columns: 1fr; gap: 18px; margin-top: 24px;
    }
    @media (min-width: 640px) {
      .cp-main { gap: 24px; margin-top: 32px; }
    }
    @media (min-width: 1024px) {
      .cp-main { grid-template-columns: 1.5fr 1fr; }
    }
    .cp-col { display: flex; flex-direction: column; gap: 24px; }

    /* Section card */
    .cp-section {
      background: var(--card); border: 1px solid var(--rule);
      border-radius: var(--r-md); overflow: hidden;
      box-shadow: var(--shadow-1);
    }
    .cp-section-head {
      padding: 14px 20px; border-bottom: 1px solid var(--rule);
      background: var(--paper-2);
      display: flex; justify-content: space-between; align-items: center;
      gap: 12px;
    }
    .cp-section-head h3 {
      font-family: var(--serif); font-size: 18px; margin: 0;
      font-weight: 400; letter-spacing: -0.005em; color: var(--ink);
    }
    .cp-section-head-label {
      font-family: var(--mono); font-size: 10px; color: var(--dim);
      letter-spacing: 0.1em; text-transform: uppercase;
    }
    .cp-section-head-link {
      font-size: 12px; color: var(--ink-2); cursor: pointer;
      border-bottom: 1px dotted var(--dim-2);
      background: none; border-top: 0; border-left: 0; border-right: 0;
      padding: 0; font-family: var(--sans);
    }
    .cp-section-head-link:hover { color: var(--ink); }

    /* Section empty state */
    .cp-empty {
      padding: 28px 20px; text-align: center;
      font-size: 13px; color: var(--dim); font-style: italic;
    }

    /* Attorney (dark) card — slightly less padding on mobile. */
    .cp-attorney {
      background: var(--ink); color: var(--paper);
      border-radius: var(--r-md); padding: 18px;
      display: flex; flex-direction: column; gap: 12px;
      box-shadow: var(--shadow-2);
    }
    @media (min-width: 640px) {
      .cp-attorney { padding: 22px; gap: 14px; }
    }
    .cp-attorney-head {
      display: flex; gap: 12px; align-items: center;
    }
    .cp-attorney-avatar {
      width: 48px; height: 48px; border-radius: 50%;
      background: var(--accent); color: var(--accent-ink);
      box-shadow: 0 0 0 4px rgba(245,197,24,0.18);
      display: grid; place-items: center;
      font-family: var(--serif); font-style: italic; font-size: 22px;
    }
    .cp-attorney-who {
      font-family: var(--serif); font-size: 18px; line-height: 1.2;
      color: var(--paper);
    }
    .cp-attorney-role {
      display: block; font-family: var(--mono); font-size: 10.5px;
      color: color-mix(in oklab, var(--paper) 60%, transparent);
      letter-spacing: 0.04em; text-transform: uppercase;
      margin-top: 4px;
    }
    .cp-attorney-p {
      font-size: 13.5px;
      color: color-mix(in oklab, var(--paper) 75%, var(--ink-3));
      line-height: 1.55; margin: 0;
    }
    .cp-attorney-contact {
      display: flex; flex-direction: column; gap: 4px;
      font-family: var(--mono); font-size: 12px;
      color: color-mix(in oklab, var(--paper) 80%, transparent);
      letter-spacing: 0.02em;
      padding: 12px 0 0; border-top: 1px solid rgba(255,255,255,0.12);
    }
    .cp-attorney-line {
      display: flex; justify-content: space-between;
      align-items: center; padding: 4px 0;
    }
    .cp-attorney-k {
      color: color-mix(in oklab, var(--paper) 50%, transparent);
      text-transform: uppercase; font-size: 10px; letter-spacing: 0.1em;
    }
    .cp-attorney-v { color: var(--paper); }

    /* Retainer */
    .cp-retainer { padding: 20px; }
    .cp-retainer-label {
      font-family: var(--mono); font-size: 10px;
      letter-spacing: 0.12em; text-transform: uppercase; color: var(--dim);
    }
    /* Retainer balance numeral — 28px mobile (matches .m-portal .retainer .amt
       in Mobile.html), 36px from sm: up. */
    .cp-retainer-balance {
      font-family: var(--serif); font-size: 28px; line-height: 1;
      margin: 8px 0 4px; letter-spacing: -0.012em; color: var(--ink);
    }
    @media (min-width: 640px) {
      .cp-retainer-balance { font-size: 36px; }
    }
    .cp-retainer-balance small {
      font-family: var(--mono); font-size: 12px; color: var(--dim);
      font-feature-settings: "tnum"; margin-left: 4px;
    }
    .cp-retainer-sub {
      font-family: var(--mono); font-size: 11px; color: var(--dim);
      letter-spacing: 0.04em; text-transform: uppercase; margin-bottom: 14px;
    }
    .cp-retainer-why {
      margin-top: 14px; padding-top: 14px;
      border-top: 1px solid var(--rule);
      font-size: 12.5px; color: var(--dim); line-height: 1.5;
    }
    .cp-retainer-why b { color: var(--ink-2); font-weight: 500; }
    .cp-retainer-note {
      font-size: 12.5px; color: var(--ink-2); font-style: italic;
      margin-top: 10px;
    }
    .cp-retainer-note em { color: var(--accent-deep); }

    /* Footer (trust line) */
    .cp-foot {
      margin-top: 48px; padding-top: 24px;
      border-top: 1px solid var(--rule);
      display: flex; flex-direction: column; gap: 12px;
      justify-content: space-between; align-items: flex-start;
      font-family: var(--mono); font-size: 10.5px;
      color: var(--dim); letter-spacing: 0.04em; text-transform: uppercase;
    }
    @media (min-width: 768px) {
      .cp-foot { flex-direction: row; align-items: flex-end; }
    }
    .cp-foot-secondary { color: var(--dim-2); display: block; margin-top: 4px; }
    .cp-foot-brand { text-align: left; }
    @media (min-width: 768px) {
      .cp-foot-brand { text-align: right; }
    }
    .cp-foot a, .cp-foot button {
      color: var(--ink-2); border-bottom: 1px dotted var(--dim-2);
      cursor: pointer; background: none; border-top: 0; border-left: 0;
      border-right: 0; padding: 0; font: inherit;
    }

    /* Sticky mobile reply bar — sits ABOVE the mobile LeftRail (which has its
       own safe-area-inset padding). The LeftRail nav row is ~60px tall
       (icon + 11px label + 16px padding), so we position the reply bar
       at bottom = calc(60px + env(safe-area-inset-bottom)). */
    .cp-mobile-reply {
      position: fixed;
      left: 0; right: 0;
      bottom: calc(60px + env(safe-area-inset-bottom, 0px));
      padding: 10px 14px;
      display: flex; align-items: center; gap: 8px;
      border-top: 1px solid var(--rule);
      background: var(--card);
      z-index: 20;
    }
    .cp-mobile-reply-field {
      flex: 1; padding: 10px 14px;
      border-radius: var(--r-pill); border: 1px solid var(--rule);
      background: var(--paper); font-size: 14px; color: var(--dim-2);
      cursor: pointer; text-align: left;
      font-family: var(--sans);
      min-height: 40px;
    }
    /* Pill expands toward focus-ring on tap — visual hint that tapping
       opens the full conversation entry. */
    .cp-mobile-reply-field:hover,
    .cp-mobile-reply-field:focus-visible {
      border-color: var(--ink-3);
      color: var(--ink-2);
      outline: none;
    }
    .cp-mobile-reply-send {
      width: 40px; height: 40px; border-radius: 50%;
      background: var(--ink); color: var(--accent);
      display: grid; place-items: center; flex-shrink: 0;
      border: 0; cursor: pointer;
    }
  `}</style>
);

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

const ClientHomePage = () => {
  const { session } = useSessionContext();
  const location = useLocation();
  const { canAccessPractice } = useWorkspace();
  const { currentPractice } = useWorkspaceResolver();
  const { navigate, navigateToPricing } = useNavigation();

  const userName = session?.user?.name || session?.user?.email || 'there';
  const userEmail = session?.user?.email ?? null;
  const userImage = session?.user?.image ?? null;
  const showUpgrade = !canAccessPractice;

  const clientPracticeSlug = currentPractice?.slug ?? null;
  const practiceId = currentPractice?.id ?? null;
  const practiceName = currentPractice?.name ?? null;

  // TODO(backend): expose `practice.practiceAreas` and `barNumber` on the
  // Practice payload so we can render the firm sub-line authentically. Until
  // then, fall back to city/state if present.
  const practiceMeta = useMemo(() => {
    const parts: string[] = [];
    if (currentPractice?.city) parts.push(currentPractice.city);
    if (currentPractice?.state) parts.push(currentPractice.state);
    return parts.join(', ');
  }, [currentPractice?.city, currentPractice?.state]);

  const { matterCards, outstandingBalance } = useClientDashboardData({
    practiceId,
    practiceSlug: clientPracticeSlug,
    enabled: Boolean(practiceId && clientPracticeSlug),
  });

  // Pick the most-recently-updated active matter as the focus of the page.
  // (matterCards is already sorted desc by updated_at in the hook.)
  const activeMatter = matterCards[0] ?? null;

  // TODO(backend): until per-case-type journey templates are exposed,
  // derive a generic 5-step skeleton from matter.status.
  const journeySteps = useMemo<JourneyStep[]>(
    () => buildGenericJourney(activeMatter ? 'active' : null),
    [activeMatter],
  );

  const todayLabel = useMemo(() => formatLongDate(new Date().toISOString()), []);

  const settingsPath = useMemo(() => {
    const routeMatch = location.path.match(/^\/(client|practice)\/([^/]+)/);
    if (routeMatch) {
      const workspace = routeMatch[1] as 'client' | 'practice';
      const slug = decodeURIComponent(routeMatch[2]);
      return getWorkspaceSettingsPath(workspace, slug);
    }
    return clientPracticeSlug ? getWorkspaceSettingsPath('client', clientPracticeSlug) : null;
  }, [clientPracticeSlug, location.path]);

  const basePath = clientPracticeSlug ? `/client/${encodeURIComponent(clientPracticeSlug)}` : '';

  // LeftRail items (preserve onboarding nav contract per §5e.2 lock).
  const railItems = useMemo<LeftRailItem[]>(() => {
    if (!clientPracticeSlug) return [];
    const config = getClientNavConfig(
      { practiceSlug: clientPracticeSlug, role: 'client', canAccessPractice: false },
      'home',
    );
    const items: LeftRailItem[] = config.rail.map((item) => ({
      id: item.id,
      label: item.label,
      icon: item.icon as IconComponent,
      href: item.href,
      matchHrefs: item.matchHrefs,
      badge: item.badge,
      variant: item.variant,
      isAction: item.isAction,
      onClick: item.onClick,
      prefetch: item.prefetch,
    }));

    // "Upgrade to Practice" CTA per locked decision §5 — client-shell may
    // append a single CTA chip-style action to the rail.
    if (showUpgrade) {
      items.push({
        id: 'upgrade',
        label: 'Upgrade to Practice',
        icon: Sparkles as IconComponent,
        href: '#',
        isAction: true,
        onClick: () => navigateToPricing(),
      });
    }

    return items;
  }, [clientPracticeSlug, showUpgrade, navigateToPricing]);

  const profileFooter = session?.user ? (
    <SidebarProfileMenu
      user={{ name: userName, email: userEmail, image: userImage }}
      onAccount={() => clientPracticeSlug && navigate(`/client/${encodeURIComponent(clientPracticeSlug)}/settings/account`)}
      onSettings={() => settingsPath && navigate(settingsPath)}
      onSignOut={() => void signOut({ navigate })}
    />
  ) : null;

  const openConversations = () => basePath && navigate(`${basePath}/conversations`);
  const openMatters = () => basePath && navigate(`${basePath}/matters`);
  const openInvoices = () => basePath && navigate(`${basePath}/invoices`);
  const openFiles = () => basePath && navigate(`${basePath}/files`);

  // ---------------------------------------------------------------------------
  // Main content
  // ---------------------------------------------------------------------------

  const greetingFirstName = firstName(userName);

  const main = (
    <div className="client-portal-page h-full overflow-y-auto">
      <PortalStyles />

      {/* Firm-branded topbar */}
      <header className="cp-topbar">
        <div className="cp-topbar-inner">
          <div className="cp-firm-name">
            {practiceName ?? 'Your firm'}
            {practiceMeta ? <span className="cp-firm-sub">{practiceMeta}</span> : null}
          </div>
          <div className="cp-user-chip">
            <div className="cp-user-chip-avatar" aria-hidden="true">
              {userInitials(userName)}
            </div>
            {/* Name + role hidden on mobile per Mobile.html portal nav (avatar only). */}
            <div className="cp-user-chip-meta">
              <div className="cp-user-chip-name">{userName}</div>
              <span className="cp-user-chip-role">client</span>
            </div>
          </div>
        </div>
      </header>

      <div className="cp-wrap">
        {/* Greeting */}
        <section className="cp-greet">
          <div className="cp-greet-date">{todayLabel}</div>
          <h1 className="cp-greet-h1">
            Hi <em>{greetingFirstName}.</em> Here&apos;s where your case stands.
          </h1>
          <p className="cp-greet-p">
            {activeMatter
              ? <>Your matter is moving forward. We&apos;ll reach out the moment something needs your attention.</>
              : <>You don&apos;t have an active matter yet. Start a conversation below to get the ball rolling.</>
            }
          </p>
        </section>

        {/* Status hero card */}
        {activeMatter ? (
          <section className="cp-status-card" aria-labelledby="cp-active-matter-title">
            <div className="cp-status-topband">
              <div>
                <div className="cp-band-label">Your case</div>
                <h2 id="cp-active-matter-title" className="cp-band-title">
                  {activeMatter.title}
                </h2>
                {activeMatter.updatedAt ? (
                  <div className="cp-band-sub">
                    Updated {formatShortDate(activeMatter.updatedAt)}
                    {activeMatter.practiceArea ? ` · ${activeMatter.practiceArea}` : ''}
                  </div>
                ) : null}
              </div>
              <div className="cp-status-stage">
                <div className="cp-band-label cp-band-label-dim">Current stage</div>
                <div style={{ marginTop: 6 }}>
                  <Pill tone="gold">
                    {activeMatter.statusLabel ?? 'In progress'}
                  </Pill>
                </div>
              </div>
            </div>

            {/* JourneyProgress — first DS consumer */}
            <JourneyProgress steps={journeySteps} />

            <div className="cp-next-up">
              <div>
                <div className="cp-next-label">What&apos;s next</div>
                {/* TODO(backend): expose next-deadline / next-task on the
                    matter so we can render an authentic date here. */}
                <p className="cp-next-what">
                  We&apos;ll let you know the moment there&apos;s an update on
                  your case. <em>Nothing required from you right now.</em>
                </p>
              </div>
              <div className="cp-next-acts">
                <Button variant="ghost" size="sm" onClick={openMatters}>
                  View timeline
                </Button>
                <Button variant="primary" size="sm" onClick={openConversations}>
                  Message your attorney
                </Button>
              </div>
            </div>
          </section>
        ) : (
          <section className="cp-status-card">
            <div className="cp-status-topband">
              <div>
                <div className="cp-band-label cp-band-label-dim">Your case</div>
                <h2 className="cp-band-title">No active matter yet</h2>
                <div className="cp-band-sub">Get started in a few minutes</div>
              </div>
            </div>
            <div className="cp-next-up">
              <div>
                <div className="cp-next-label">Get started</div>
                <p className="cp-next-what">
                  Start a conversation and we&apos;ll triage your situation.
                  No commitment, no charge for the first chat.
                </p>
              </div>
              <div className="cp-next-acts">
                <Button variant="primary" size="sm" onClick={openConversations}>
                  Start a conversation
                </Button>
              </div>
            </div>
          </section>
        )}

        {/* Two-column main */}
        <div className="cp-main">
          {/* LEFT */}
          <div className="cp-col">
            {/* Messages */}
            <section className="cp-section" aria-labelledby="cp-msgs-h">
              <div className="cp-section-head">
                <h3 id="cp-msgs-h">Messages with your attorney</h3>
                <button type="button" className="cp-section-head-link" onClick={openConversations}>
                  view all
                </button>
              </div>
              {/* TODO(backend): wire to the messages/conversation hook for
                  the active matter — show last 2-3 messages with attorney. */}
              <div className="cp-empty">
                No recent messages yet. Your conversation history will appear here.
              </div>
            </section>

            {/* Upcoming events */}
            <section className="cp-section" aria-labelledby="cp-up-h">
              <div className="cp-section-head">
                <h3 id="cp-up-h">Upcoming</h3>
                <span className="cp-section-head-label">next 30 days</span>
              </div>
              {/* TODO(backend): wire to matter tasks / calendar so we can
                  render real due-dates here. */}
              <div className="cp-empty">
                No upcoming events. Anything time-sensitive will show up here.
              </div>
            </section>
          </div>

          {/* RIGHT */}
          <aside className="cp-col">
            {/* Attorney card (dark ink) */}
            <div className="cp-attorney">
              <div className="cp-attorney-head">
                <div className="cp-attorney-avatar" aria-hidden="true">
                  {/* TODO(backend): expose responsible_attorney profile so we
                      can render real initials + photo. */}
                  {practiceName ? practiceName.charAt(0).toUpperCase() : 'A'}
                </div>
                <div>
                  <div className="cp-attorney-who">
                    {/* TODO(backend): pull responsible attorney name from
                        matter.responsible_attorney_id → user record. */}
                    {practiceName ?? 'Your attorney'}
                  </div>
                  <span className="cp-attorney-role">your attorney</span>
                </div>
              </div>
              <p className="cp-attorney-p">
                Reach out any time — your attorney responds within a business day.
                If you have a court date or are in danger, call the office directly.
              </p>
              <div className="cp-attorney-contact">
                {currentPractice?.businessEmail ? (
                  <div className="cp-attorney-line">
                    <span className="cp-attorney-k">Email</span>
                    <span className="cp-attorney-v">{currentPractice.businessEmail}</span>
                  </div>
                ) : null}
                {currentPractice?.businessPhone ? (
                  <div className="cp-attorney-line">
                    <span className="cp-attorney-k">Office</span>
                    <span className="cp-attorney-v">{currentPractice.businessPhone}</span>
                  </div>
                ) : null}
              </div>
            </div>

            {/* Retainer balance */}
            <section className="cp-section" aria-labelledby="cp-ret-h">
              <div className="cp-section-head">
                <h3 id="cp-ret-h">Your retainer</h3>
                <button type="button" className="cp-section-head-link" onClick={openInvoices}>
                  view billing
                </button>
              </div>
              <div className="cp-retainer">
                <div className="cp-retainer-label">Outstanding balance</div>
                <div className="cp-retainer-balance">
                  {/* TODO(backend): expose retainer balance (trust account)
                      distinct from outstanding invoice balance. For now,
                      render outstanding balance from invoices. */}
                  {formatCurrency(outstandingBalance)}
                </div>
                <div className="cp-retainer-sub">across all matters</div>

                {/* TODO(backend): show used vs. total retainer with a Bar
                    once retainer accounting is exposed. */}
                <Bar value={0} max={100} label="Retainer used" />

                <div className="cp-retainer-note">
                  Healthy — we&apos;ll reach out before any <em>replenishment.</em>
                </div>

                <div className="cp-retainer-why">
                  Your retainer is held in an <b>IOLTA trust account</b> and only
                  used as work is performed. You&apos;ll get a notice before any
                  draw — not a surprise charge.
                </div>
              </div>
            </section>

            {/* Documents */}
            <section className="cp-section" aria-labelledby="cp-docs-h">
              <div className="cp-section-head">
                <h3 id="cp-docs-h">Documents</h3>
                <button type="button" className="cp-section-head-link" onClick={openFiles}>
                  open files
                </button>
              </div>
              {/* TODO(backend): wire to documents/files API filtered by the
                  active matter — show signed engagement, shared PDFs,
                  uploads. Empty state for now. */}
              <div className="cp-empty">
                No documents shared yet. Engagement letters and shared files will appear here.
              </div>
            </section>

            {/* Payment history */}
            <section className="cp-section" aria-labelledby="cp-pay-h">
              <div className="cp-section-head">
                <h3 id="cp-pay-h">Payment history</h3>
                <button type="button" className="cp-section-head-link" onClick={openInvoices}>
                  all invoices
                </button>
              </div>
              {/* TODO(backend): show paid invoices (recent) — until then,
                  empty state. */}
              <div className="cp-empty">
                No payments yet. Your retainer and invoice history will appear here.
              </div>
            </section>
          </aside>
        </div>

        {/* Trust footer */}
        <footer className="cp-foot">
          <div>
            Encrypted end-to-end · <a href="/legal/privacy">privacy</a> · <a href="/legal/terms">terms</a>
            <span className="cp-foot-secondary">
              No attorney-client communications are shared without your written consent.
            </span>
          </div>
          {/* When the footer stacks on mobile, this block aligns left;
              when it sits side-by-side on sm: + it right-aligns. */}
          <div className="cp-foot-brand">
            powered by <b style={{ color: 'var(--ink-2)' }}>Blawby</b>
            <span className="cp-foot-secondary">blawby.com</span>
          </div>
        </footer>
      </div>

      {/* Mobile sticky reply bar (above mobile LeftRail). */}
      <div className="cp-mobile-reply lg:hidden" role="navigation" aria-label="Quick reply">
        <button
          type="button"
          className="cp-mobile-reply-field"
          onClick={openConversations}
        >
          Message your attorney…
        </button>
        <button
          type="button"
          className="cp-mobile-reply-send"
          onClick={openConversations}
          aria-label="Open conversation"
        >
          <Icon icon={ArrowUp} className="h-4 w-4" />
        </button>
        <span className="sr-only">
          <Icon icon={Paperclip} className="h-4 w-4" />
        </span>
      </div>
    </div>
  );

  return (
    <div className="flex h-dvh flex-col lg:flex-row">
      <LeftRail
        variant="desktop"
        items={railItems}
        brandMark={<BrandMark className="px-2 py-2" />}
        footer={profileFooter}
        className="hidden lg:flex"
      />
      <main className="flex-1 min-h-0 overflow-hidden order-first lg:order-none">
        {main}
      </main>
      <LeftRail
        variant="mobile"
        items={railItems}
        className="lg:hidden"
      />
    </div>
  );
};

export default ClientHomePage;

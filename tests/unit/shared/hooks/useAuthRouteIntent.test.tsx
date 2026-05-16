// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/preact';

const mocks = vi.hoisted(() => ({
  sessionValue: {
    session: null as
      | {
          user?: Record<string, unknown>;
          session?: Record<string, unknown>;
        }
      | null,
    isPending: false,
    isAnonymous: false,
    activePracticeId: null as string | null,
  },
  ensureValue: {
    isResolving: false,
    forceResolve: vi.fn(),
  },
  resolverValue: {
    practices: [] as Array<{ id: string; slug: string }>,
    currentPractice: null as { id: string; slug: string } | null,
    practicesLoading: false,
    hasPracticeMembership: false,
    defaultWorkspace: 'practice' as 'practice' | 'client',
  },
  practiceManagementValue: {
    refetch: vi.fn(),
  },
  locationValue: {
    path: '/',
    query: {} as Record<string, string>,
    url: '/',
    route: vi.fn(),
  },
}));

vi.mock('@/shared/contexts/SessionContext', () => ({
  useSessionContext: () => ({
    session: mocks.sessionValue.session,
    isPending: mocks.sessionValue.isPending,
    isAnonymous: mocks.sessionValue.isAnonymous,
    activePracticeId: mocks.sessionValue.activePracticeId,
    stripeCustomerId: null,
    error: null,
  }),
  useMemberRoleContext: () => ({
    activeMemberRole: 'owner',
    activeMemberRoleLoading: false,
  }),
}));

vi.mock('@/shared/hooks/useEnsureActiveOrganization', () => ({
  useEnsureActiveOrganization: () => ({
    isResolving: mocks.ensureValue.isResolving,
    forceResolve: mocks.ensureValue.forceResolve,
  }),
}));

vi.mock('@/shared/hooks/useWorkspaceResolver', () => ({
  useWorkspaceResolver: () => ({
    practices: mocks.resolverValue.practices,
    currentPractice: mocks.resolverValue.currentPractice,
    practicesLoading: mocks.resolverValue.practicesLoading,
    hasPracticeMembership: mocks.resolverValue.hasPracticeMembership,
    defaultWorkspace: mocks.resolverValue.defaultWorkspace,
    isPending: false,
    rolePending: false,
    activeRole: 'owner',
    isClientMember: false,
    canAccessPracticeWorkspace: true,
    canAccessClientWorkspace: false,
    hasPracticeAccess: true,
    resolvePracticeBySlug: () => null,
  }),
}));

vi.mock('@/shared/hooks/usePracticeManagement', () => ({
  usePracticeManagement: () => ({
    refetch: mocks.practiceManagementValue.refetch,
  }),
}));

vi.mock('preact-iso', () => ({
  useLocation: () => ({
    path: mocks.locationValue.path,
    query: mocks.locationValue.query,
    url: mocks.locationValue.url,
    route: mocks.locationValue.route,
  }),
}));

import { useAuthRouteIntent } from '@/shared/hooks/useAuthRouteIntent';

const ownerSession = (overrides: Record<string, unknown> = {}) => ({
  user: {
    id: 'user-1',
    is_anonymous: false,
    onboarding_complete: true,
    ...overrides,
  },
  session: {
    active_organization_id: 'org-1',
  },
});

beforeEach(() => {
  mocks.sessionValue.session = null;
  mocks.sessionValue.isPending = false;
  mocks.sessionValue.isAnonymous = false;
  mocks.sessionValue.activePracticeId = null;
  mocks.ensureValue.isResolving = false;
  mocks.ensureValue.forceResolve = vi.fn().mockResolvedValue(undefined);
  mocks.resolverValue.practices = [];
  mocks.resolverValue.currentPractice = null;
  mocks.resolverValue.practicesLoading = false;
  mocks.resolverValue.hasPracticeMembership = false;
  mocks.resolverValue.defaultWorkspace = 'practice';
  mocks.practiceManagementValue.refetch = vi.fn().mockResolvedValue(undefined);
  mocks.locationValue.path = '/';
  mocks.locationValue.query = {};
  mocks.locationValue.url = '/';
  mocks.locationValue.route = vi.fn();
});

describe('useAuthRouteIntent', () => {
  it('returns loading while session is pending', () => {
    mocks.sessionValue.isPending = true;

    const { result } = renderHook(() => useAuthRouteIntent());

    expect(result.current).toEqual({ kind: 'loading', reason: 'session-pending' });
  });

  it('returns unauthenticated when no user', () => {
    const { result } = renderHook(() => useAuthRouteIntent());

    expect(result.current.kind).toBe('unauthenticated');
  });

  it('returns practice-workspace for a settled owner session', () => {
    mocks.sessionValue.session = ownerSession();
    mocks.resolverValue.hasPracticeMembership = true;
    mocks.resolverValue.currentPractice = { id: 'p1', slug: 'demo-owner' };
    mocks.resolverValue.practices = [{ id: 'p1', slug: 'demo-owner' }];

    const { result } = renderHook(() => useAuthRouteIntent());

    expect(result.current).toEqual({ kind: 'practice-workspace', slug: 'demo-owner' });
  });

  it('cold sign-in: returns loading (NOT no-subscription) while recovery is resolving', () => {
    // THE /pricing flash scenario. Session resolved, no practice yet (recovery
    // hook hasn't activated one), recovery still in flight. Must be 'loading',
    // never 'no-subscription'.
    mocks.sessionValue.session = {
      user: { id: 'user-1', is_anonymous: false, onboarding_complete: true },
      session: { active_organization_id: null },
    };
    mocks.ensureValue.isResolving = true;
    mocks.resolverValue.hasPracticeMembership = false;

    const { result } = renderHook(() => useAuthRouteIntent());

    expect(result.current).toEqual({ kind: 'loading', reason: 'recovery-resolving' });
  });

  it('cold sign-in: returns loading while practices are mid-fetch', () => {
    mocks.sessionValue.session = ownerSession();
    mocks.resolverValue.practicesLoading = true;

    const { result } = renderHook(() => useAuthRouteIntent());

    expect(result.current).toEqual({ kind: 'loading', reason: 'practices-loading' });
  });

  it('returns no-subscription only when everything is settled and membership is empty', () => {
    mocks.sessionValue.session = {
      user: { id: 'user-1', is_anonymous: false, onboardingComplete: true, onboarding_complete: true },
      session: { active_organization_id: null },
    };
    mocks.ensureValue.isResolving = false;
    mocks.resolverValue.practicesLoading = false;
    mocks.resolverValue.hasPracticeMembership = false;

    const { result } = renderHook(() => useAuthRouteIntent());

    expect(result.current).toEqual({ kind: 'no-subscription' });
  });

  it('post-stripe: returns post-stripe-syncing while ?subscription=success is being processed', async () => {
    mocks.sessionValue.session = ownerSession();
    mocks.locationValue.query = { subscription: 'success' };
    mocks.locationValue.url = '/?subscription=success';
    // Keep forceResolve pending so the syncing flag stays true.
    mocks.ensureValue.forceResolve = vi.fn().mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useAuthRouteIntent());

    await waitFor(() => {
      expect(mocks.ensureValue.forceResolve).toHaveBeenCalled();
    });
    expect(result.current).toEqual({ kind: 'loading', reason: 'post-stripe-syncing' });
  });

  it('post-stripe: transitions to authenticated kind once sync completes and URL is stripped', async () => {
    mocks.sessionValue.session = ownerSession();
    mocks.resolverValue.hasPracticeMembership = true;
    mocks.resolverValue.currentPractice = { id: 'p1', slug: 'demo-owner' };
    mocks.resolverValue.practices = [{ id: 'p1', slug: 'demo-owner' }];
    mocks.locationValue.query = { subscription: 'success' };
    mocks.locationValue.url = '/?subscription=success';

    const { result, rerender } = renderHook(() => useAuthRouteIntent());

    await waitFor(() => {
      expect(mocks.ensureValue.forceResolve).toHaveBeenCalled();
      expect(mocks.practiceManagementValue.refetch).toHaveBeenCalled();
      // URL was stripped via preact-iso's `route()` (replace=true), not via
      // a raw replaceState — keeps useLocation's reactive query in sync.
      expect(mocks.locationValue.route).toHaveBeenCalledWith('/', true);
    });

    // Simulate the URL being stripped — flip the location mock and re-render.
    mocks.locationValue.query = {};
    mocks.locationValue.url = '/';
    rerender();

    expect(result.current).toEqual({ kind: 'practice-workspace', slug: 'demo-owner' });
  });

  it('routes to onboarding-required when onboarding is incomplete', () => {
    mocks.sessionValue.session = ownerSession({ onboarding_complete: false });

    const { result } = renderHook(() => useAuthRouteIntent());

    expect(result.current.kind).toBe('onboarding-required');
  });

  it('does not redirect when already on /onboarding (returns loading)', () => {
    mocks.sessionValue.session = ownerSession({ onboarding_complete: false });
    mocks.locationValue.path = '/onboarding';

    const { result } = renderHook(() => useAuthRouteIntent());

    expect(result.current).toEqual({ kind: 'loading', reason: 'on-onboarding-route' });
  });

  it('routes anonymous users to a workspace kind, bypassing onboarding/subscription gates', () => {
    mocks.sessionValue.session = {
      user: { id: 'anon-1', is_anonymous: true, onboarding_complete: false },
      session: { active_organization_id: null },
    };
    mocks.sessionValue.isAnonymous = true;
    mocks.resolverValue.defaultWorkspace = 'client';

    const { result } = renderHook(() => useAuthRouteIntent());

    // Anonymous + no practice → client-workspace fallback.
    expect(result.current).toEqual({ kind: 'client-workspace' });
  });
});

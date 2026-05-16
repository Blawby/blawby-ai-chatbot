import { describe, it, expect } from 'vitest';
import {
  computeRouteIntent,
  getActiveOrganizationPointer,
  type RouteIntent,
  type RouteIntentInputs,
} from '@/shared/auth/routeIntent';

function inputs(overrides: Partial<RouteIntentInputs> = {}): RouteIntentInputs {
  return {
    isSessionPending: false,
    user: {
      id: 'user_123',
      isAnonymous: false,
      onboardingComplete: true,
    },
    activeOrganizationId: 'org_abc',
    isResolvingActiveOrg: false,
    practicesLoading: false,
    hasPracticeMembership: true,
    defaultWorkspace: 'practice',
    currentPracticeSlug: 'demo-owner',
    fallbackPracticeSlug: 'demo-owner',
    isSubscriptionSuccessReturn: false,
    subscriptionSyncInFlight: false,
    currentPath: '/practice/demo-owner',
    ...overrides,
  };
}

describe('computeRouteIntent', () => {
  it('returns loading while the session is pending — overrides everything else', () => {
    expect(
      computeRouteIntent(inputs({ isSessionPending: true, practicesLoading: true }))
    ).toEqual<RouteIntent>({ kind: 'loading' });
  });

  it('returns unauthenticated when no user', () => {
    expect(
      computeRouteIntent(inputs({ user: null, currentPath: '/' }))
    ).toEqual<RouteIntent>({ kind: 'unauthenticated' });
  });

  it('captures redirectAfterAuth for non-trivial paths', () => {
    expect(
      computeRouteIntent(
        inputs({ user: null, currentPath: '/practice/demo-owner/settings/account' })
      )
    ).toEqual<RouteIntent>({
      kind: 'unauthenticated',
      redirectAfterAuth: '/practice/demo-owner/settings/account',
    });
  });

  it('does NOT set redirectAfterAuth for /, /auth, or /public/* paths', () => {
    expect(
      computeRouteIntent(inputs({ user: null, currentPath: '/auth' }))
    ).toEqual<RouteIntent>({ kind: 'unauthenticated' });

    expect(
      computeRouteIntent(inputs({ user: null, currentPath: '/public/some-firm' }))
    ).toEqual<RouteIntent>({ kind: 'unauthenticated' });
  });

  it('routes to onboarding-required when onboarding incomplete', () => {
    expect(
      computeRouteIntent(
        inputs({
          user: { id: 'u1', isAnonymous: false, onboardingComplete: false },
          currentPath: '/',
        })
      )
    ).toEqual<RouteIntent>({ kind: 'onboarding-required', userId: 'u1' });
  });

  it('captures returnTo for onboarding when on a non-trivial path', () => {
    expect(
      computeRouteIntent(
        inputs({
          user: { id: 'u1', isAnonymous: false, onboardingComplete: false },
          currentPath: '/practice/demo-owner/settings/account',
        })
      )
    ).toEqual<RouteIntent>({
      kind: 'onboarding-required',
      userId: 'u1',
      returnTo: '/practice/demo-owner/settings/account',
    });
  });

  it('stays in loading kind for onboarding-incomplete users already on /onboarding', () => {
    // Prevents a render-loop where the consumer would otherwise re-emit a
    // Redirect to /onboarding on every render.
    expect(
      computeRouteIntent(
        inputs({
          user: { id: 'u1', isAnonymous: false, onboardingComplete: false },
          currentPath: '/onboarding',
        })
      )
    ).toEqual<RouteIntent>({ kind: 'loading' });
  });

  it('returns post-stripe-syncing while ?subscription=success is being processed', () => {
    expect(
      computeRouteIntent(
        inputs({
          isSubscriptionSuccessReturn: true,
          subscriptionSyncInFlight: true,
          hasPracticeMembership: false,
          activeOrganizationId: null,
        })
      )
    ).toEqual<RouteIntent>({ kind: 'post-stripe-syncing' });
  });

  it('falls through to the right kind once post-stripe sync completes', () => {
    expect(
      computeRouteIntent(
        inputs({
          isSubscriptionSuccessReturn: true,
          subscriptionSyncInFlight: false,
          hasPracticeMembership: true,
          activeOrganizationId: 'org_abc',
        })
      )
    ).toEqual<RouteIntent>({ kind: 'practice-workspace', slug: 'demo-owner' });
  });

  it('returns loading when the recovery hook is still resolving (THE /pricing flash fix)', () => {
    expect(
      computeRouteIntent(
        inputs({
          isResolvingActiveOrg: true,
          hasPracticeMembership: false,
          activeOrganizationId: null,
        })
      )
    ).toEqual<RouteIntent>({ kind: 'loading' });
  });

  it('returns loading when the practice list is still in-flight', () => {
    expect(
      computeRouteIntent(
        inputs({
          practicesLoading: true,
          hasPracticeMembership: false,
          activeOrganizationId: null,
        })
      )
    ).toEqual<RouteIntent>({ kind: 'loading' });
  });

  it('returns no-subscription only when membership AND active org are both definitively absent', () => {
    expect(
      computeRouteIntent(
        inputs({
          hasPracticeMembership: false,
          activeOrganizationId: null,
          practicesLoading: false,
          isResolvingActiveOrg: false,
        })
      )
    ).toEqual<RouteIntent>({ kind: 'no-subscription' });
  });

  it('belt-and-braces: active_organization_id set => never no-subscription, even with empty membership list', () => {
    expect(
      computeRouteIntent(
        inputs({
          hasPracticeMembership: false,
          activeOrganizationId: 'org_abc',
          currentPracticeSlug: null,
          fallbackPracticeSlug: null,
        })
      )
    ).toEqual<RouteIntent>({ kind: 'client-workspace' });
  });

  it('routes to client-workspace when default workspace is client', () => {
    expect(
      computeRouteIntent(
        inputs({
          defaultWorkspace: 'client',
          hasPracticeMembership: true,
        })
      )
    ).toEqual<RouteIntent>({ kind: 'client-workspace' });
  });

  it('routes to practice-workspace using current slug', () => {
    expect(
      computeRouteIntent(
        inputs({ currentPracticeSlug: 'firm-one', fallbackPracticeSlug: 'firm-two' })
      )
    ).toEqual<RouteIntent>({ kind: 'practice-workspace', slug: 'firm-one' });
  });

  it('falls back to fallbackPracticeSlug when currentPracticeSlug is missing', () => {
    expect(
      computeRouteIntent(
        inputs({ currentPracticeSlug: null, fallbackPracticeSlug: 'firm-two' })
      )
    ).toEqual<RouteIntent>({ kind: 'practice-workspace', slug: 'firm-two' });
  });

  it('returns loading rather than emitting a slugless practice-workspace', () => {
    expect(
      computeRouteIntent(
        inputs({ currentPracticeSlug: null, fallbackPracticeSlug: null })
      )
    ).toEqual<RouteIntent>({ kind: 'loading' });
  });

  it('anonymous user skips onboarding gate entirely', () => {
    expect(
      computeRouteIntent(
        inputs({
          user: { id: 'anon_1', isAnonymous: true, onboardingComplete: false },
          defaultWorkspace: 'client',
          hasPracticeMembership: false,
          activeOrganizationId: 'org_abc',
        })
      )
    ).toEqual<RouteIntent>({ kind: 'client-workspace' });
  });

  it('trims whitespace-only slugs to null', () => {
    expect(
      computeRouteIntent(
        inputs({ currentPracticeSlug: '   ', fallbackPracticeSlug: 'firm-real' })
      )
    ).toEqual<RouteIntent>({ kind: 'practice-workspace', slug: 'firm-real' });
  });
});

describe('getActiveOrganizationPointer', () => {
  it('returns null for missing or empty values', () => {
    expect(getActiveOrganizationPointer(null)).toBeNull();
    expect(getActiveOrganizationPointer(undefined)).toBeNull();
    expect(getActiveOrganizationPointer({})).toBeNull();
    expect(getActiveOrganizationPointer({ session: null })).toBeNull();
    expect(getActiveOrganizationPointer({ session: undefined })).toBeNull();
    expect(getActiveOrganizationPointer({ session: {} })).toBeNull();
    expect(getActiveOrganizationPointer({ session: { active_organization_id: '' } })).toBeNull();
    expect(
      getActiveOrganizationPointer({ session: { active_organization_id: '   ' } })
    ).toBeNull();
  });

  it('returns trimmed value for non-empty strings', () => {
    expect(
      getActiveOrganizationPointer({ session: { active_organization_id: 'org_abc' } })
    ).toBe('org_abc');
    expect(
      getActiveOrganizationPointer({ session: { active_organization_id: '  org_abc  ' } })
    ).toBe('org_abc');
  });

  it('returns null for non-string values', () => {
    expect(
      getActiveOrganizationPointer({ session: { active_organization_id: 123 as unknown as string } })
    ).toBeNull();
    expect(
      getActiveOrganizationPointer({ session: { active_organization_id: null as unknown as string } })
    ).toBeNull();
  });
});

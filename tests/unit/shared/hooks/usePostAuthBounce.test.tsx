// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderHook } from '@testing-library/preact';
import type { RouteIntent } from '@/shared/auth/routeIntent';

const navigateMock = vi.hoisted(() => vi.fn());
const consumePostAuthConversationContextMock = vi.hoisted(() => vi.fn());

const mocks = vi.hoisted(() => ({
  sessionValue: {
    session: null as
      | {
          user?: { id: string; is_anonymous?: boolean; onboarding_complete?: boolean };
          session?: Record<string, unknown>;
        }
      | null,
    isPending: false,
  },
  intent: { kind: 'practice-workspace', slug: 'demo-owner' } as RouteIntent,
  locationValue: {
    path: '/',
    url: '/',
  },
}));

vi.mock('@/shared/contexts/SessionContext', () => ({
  useSessionContext: () => ({
    session: mocks.sessionValue.session,
    isPending: mocks.sessionValue.isPending,
    isAnonymous: false,
    activePracticeId: null,
    stripeCustomerId: null,
    error: null,
  }),
}));

vi.mock('@/shared/utils/navigation', () => ({
  useNavigation: () => ({ navigate: navigateMock }),
}));

vi.mock('@/shared/auth/AuthRouteIntentContext', () => ({
  useAuthRouteIntentValue: () => mocks.intent,
}));

vi.mock('@/shared/utils/anonymousIdentity', () => ({
  consumePostAuthConversationContext: consumePostAuthConversationContextMock,
}));

vi.mock('preact-iso', () => ({
  useLocation: () => ({
    path: mocks.locationValue.path,
    url: mocks.locationValue.url,
  }),
}));

import { usePostAuthBounce } from '@/shared/hooks/usePostAuthBounce';

const authedSession = () => ({
  user: { id: 'user-1', is_anonymous: false, onboarding_complete: true },
  session: { active_organization_id: 'org-1' },
});

beforeEach(() => {
  navigateMock.mockReset();
  consumePostAuthConversationContextMock.mockReset();
  consumePostAuthConversationContextMock.mockReturnValue(null);
  mocks.sessionValue.session = null;
  mocks.sessionValue.isPending = false;
  mocks.intent = { kind: 'practice-workspace', slug: 'demo-owner' };
  mocks.locationValue.path = '/';
  mocks.locationValue.url = '/';
  window.sessionStorage.clear();
});

describe('usePostAuthBounce', () => {
  it('navigates to the pending public conversation when authenticated and intent is settled', () => {
    mocks.sessionValue.session = authedSession();
    consumePostAuthConversationContextMock.mockReturnValue({
      workspace: 'public',
      practiceSlug: 'demo-owner',
      conversationId: 'conv-1',
    });

    renderHook(() => usePostAuthBounce());

    expect(navigateMock).toHaveBeenCalledWith(
      '/public/demo-owner/conversations/conv-1',
      true
    );
  });

  it('navigates to intakeAwaitingInvitePath and clears the key on /auth return', () => {
    mocks.sessionValue.session = authedSession();
    mocks.locationValue.path = '/auth';
    mocks.locationValue.url = '/auth';
    window.sessionStorage.setItem('intakeAwaitingInvitePath', '/practice/demo-owner/intakes/123');

    renderHook(() => usePostAuthBounce());

    expect(navigateMock).toHaveBeenCalledWith('/practice/demo-owner/intakes/123', true);
    expect(window.sessionStorage.getItem('intakeAwaitingInvitePath')).toBeNull();
  });

  it('consumes intakeAwaitingInvitePath without navigating on non-auth routes', () => {
    // Pins Finding #17: outside the auth-return flow, the pending path is
    // stale by definition. Remove it but do NOT navigate.
    mocks.sessionValue.session = authedSession();
    mocks.locationValue.path = '/practice/demo-owner';
    mocks.locationValue.url = '/practice/demo-owner';
    window.sessionStorage.setItem('intakeAwaitingInvitePath', '/practice/demo-owner/intakes/123');

    renderHook(() => usePostAuthBounce());

    expect(navigateMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('intakeAwaitingInvitePath')).toBeNull();
  });

  it('removes an invalid pending path without navigating', () => {
    mocks.sessionValue.session = authedSession();
    mocks.locationValue.path = '/auth';
    mocks.locationValue.url = '/auth';
    window.sessionStorage.setItem('intakeAwaitingInvitePath', '//evil.com/x');

    renderHook(() => usePostAuthBounce());

    expect(navigateMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('intakeAwaitingInvitePath')).toBeNull();
  });

  it('does NOT fire while the intent is still loading', () => {
    mocks.sessionValue.session = authedSession();
    mocks.intent = { kind: 'loading', reason: 'recovery-resolving' };
    window.sessionStorage.setItem('intakeAwaitingInvitePath', '/practice/demo-owner/intakes/123');
    consumePostAuthConversationContextMock.mockReturnValue({
      workspace: 'public',
      practiceSlug: 'demo-owner',
      conversationId: 'conv-1',
    });

    renderHook(() => usePostAuthBounce());

    expect(navigateMock).not.toHaveBeenCalled();
    // Pending path is preserved — the bounce will get its chance once the
    // intent settles into a workspace kind.
    expect(window.sessionStorage.getItem('intakeAwaitingInvitePath')).toBe(
      '/practice/demo-owner/intakes/123'
    );
  });

  it('does NOT fire while the intent is unauthenticated', () => {
    mocks.intent = { kind: 'unauthenticated' };
    window.sessionStorage.setItem('intakeAwaitingInvitePath', '/practice/demo-owner/intakes/123');

    renderHook(() => usePostAuthBounce());

    expect(navigateMock).not.toHaveBeenCalled();
    expect(window.sessionStorage.getItem('intakeAwaitingInvitePath')).toBe(
      '/practice/demo-owner/intakes/123'
    );
  });
});

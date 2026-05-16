// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/preact';

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/utils/navigation', () => ({
  useNavigation: () => ({ navigate: navigateMock }),
}));

import { AuthenticatedRouter } from '@/shared/auth/AuthenticatedRouter';
import type { RouteIntent } from '@/shared/auth/routeIntent';

beforeEach(() => {
  navigateMock.mockReset();
});

afterEach(() => {
  cleanup();
});

describe('<AuthenticatedRouter />', () => {
  it('renders null and does not navigate for loading intent', () => {
    const intent: RouteIntent = { kind: 'loading' };
    render(<AuthenticatedRouter intent={intent} currentPath="/practice/demo-owner" />);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('renders the loadingFallback when provided', () => {
    const intent: RouteIntent = { kind: 'loading', reason: 'session-pending' };
    const { container } = render(
      <AuthenticatedRouter
        intent={intent}
        currentPath="/"
        loadingFallback={<div data-testid="loader">loading…</div>}
      />
    );
    expect(container.textContent).toContain('loading…');
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('renders null and does not navigate for loading + post-stripe-syncing reason', () => {
    // Post-stripe sync is now a loading reason, not a separate kind.
    const intent: RouteIntent = { kind: 'loading', reason: 'post-stripe-syncing' };
    render(<AuthenticatedRouter intent={intent} currentPath="/" />);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('emits redirect to /auth for unauthenticated intent', () => {
    const intent: RouteIntent = { kind: 'unauthenticated' };
    render(<AuthenticatedRouter intent={intent} currentPath="/practice/demo-owner" />);
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/auth', true);
  });

  it('preserves redirectAfterAuth in the /auth redirect', () => {
    const intent: RouteIntent = {
      kind: 'unauthenticated',
      redirectAfterAuth: '/practice/demo-owner/settings/account',
    };
    render(<AuthenticatedRouter intent={intent} currentPath="/practice/demo-owner/settings/account" />);
    expect(navigateMock).toHaveBeenCalledWith(
      '/auth?redirect=%2Fpractice%2Fdemo-owner%2Fsettings%2Faccount',
      true
    );
  });

  it('does NOT redirect away from /auth when intent is unauthenticated', () => {
    const intent: RouteIntent = { kind: 'unauthenticated' };
    render(<AuthenticatedRouter intent={intent} currentPath="/auth" />);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('emits redirect to /onboarding for onboarding-required intent', () => {
    const intent: RouteIntent = { kind: 'onboarding-required', userId: 'u1' };
    render(<AuthenticatedRouter intent={intent} currentPath="/" />);
    expect(navigateMock).toHaveBeenCalledWith('/onboarding', true);
  });

  it('preserves returnTo in the /onboarding redirect', () => {
    const intent: RouteIntent = {
      kind: 'onboarding-required',
      userId: 'u1',
      returnTo: '/practice/demo-owner',
    };
    render(<AuthenticatedRouter intent={intent} currentPath="/practice/demo-owner" />);
    expect(navigateMock).toHaveBeenCalledWith(
      '/onboarding?returnTo=%2Fpractice%2Fdemo-owner',
      true
    );
  });

  it('does NOT redirect away from /onboarding when intent is onboarding-required', () => {
    const intent: RouteIntent = { kind: 'onboarding-required', userId: 'u1' };
    render(<AuthenticatedRouter intent={intent} currentPath="/onboarding" />);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('emits redirect to /pricing for no-subscription intent', () => {
    const intent: RouteIntent = { kind: 'no-subscription' };
    render(<AuthenticatedRouter intent={intent} currentPath="/" />);
    expect(navigateMock).toHaveBeenCalledWith('/pricing', true);
  });

  it('does NOT redirect away from /pricing when intent is no-subscription', () => {
    const intent: RouteIntent = { kind: 'no-subscription' };
    render(<AuthenticatedRouter intent={intent} currentPath="/pricing" />);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('kicks user out of /onboarding once practice-workspace intent settles', () => {
    const intent: RouteIntent = { kind: 'practice-workspace', slug: 'demo-owner' };
    render(<AuthenticatedRouter intent={intent} currentPath="/onboarding" />);
    expect(navigateMock).toHaveBeenCalledWith('/practice/demo-owner', true);
  });

  it('does not redirect a user already on their practice workspace', () => {
    const intent: RouteIntent = { kind: 'practice-workspace', slug: 'demo-owner' };
    render(<AuthenticatedRouter intent={intent} currentPath="/practice/demo-owner/settings/account" />);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('kicks user out of /onboarding once client-workspace intent settles', () => {
    const intent: RouteIntent = { kind: 'client-workspace' };
    render(<AuthenticatedRouter intent={intent} currentPath="/onboarding" />);
    expect(navigateMock).toHaveBeenCalledWith('/client/dashboard', true);
  });

  it('does not redirect a user already on /client/*', () => {
    const intent: RouteIntent = { kind: 'client-workspace' };
    render(<AuthenticatedRouter intent={intent} currentPath="/client/dashboard" />);
    expect(navigateMock).not.toHaveBeenCalled();
  });

  it('does not navigate again when re-rendered with the same intent', () => {
    const intent: RouteIntent = { kind: 'no-subscription' };
    const { rerender } = render(<AuthenticatedRouter intent={intent} currentPath="/" />);
    expect(navigateMock).toHaveBeenCalledTimes(1);
    rerender(<AuthenticatedRouter intent={intent} currentPath="/" />);
    expect(navigateMock).toHaveBeenCalledTimes(1);
  });
});

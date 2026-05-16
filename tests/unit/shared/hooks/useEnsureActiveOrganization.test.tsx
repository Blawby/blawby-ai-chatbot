// @vitest-environment jsdom

import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/preact';

const mocks = vi.hoisted(() => ({
  sessionValue: {
    session: null as { user?: Record<string, unknown>; session?: Record<string, unknown> } | null,
    isPending: false,
    isAnonymous: false,
  },
  orgListMock: vi.fn(),
  setActivePractice: vi.fn(),
  getSession: vi.fn(),
}));

vi.mock('@/shared/contexts/SessionContext', () => ({
  useSessionContext: () => ({
    session: mocks.sessionValue.session,
    isPending: mocks.sessionValue.isPending,
    isAnonymous: mocks.sessionValue.isAnonymous,
    error: null,
    stripeCustomerId: null,
    activePracticeId: null,
  }),
}));

vi.mock('@/shared/lib/authClient', () => ({
  getSession: mocks.getSession,
  authClient: {
    organization: {
      list: mocks.orgListMock,
      setActive: mocks.setActivePractice,
    },
  },
}));

import { useEnsureActiveOrganization } from '@/shared/hooks/useEnsureActiveOrganization';

const completedOwnerSession = (overrides: Record<string, unknown> = {}) => ({
  user: {
    id: 'user-1',
    is_anonymous: false,
    onboarding_complete: true,
    ...overrides,
  },
  session: {
    active_organization_id: null,
  },
});

const resetWindowLocation = () => {
  window.history.replaceState({}, '', '/');
};

describe('useEnsureActiveOrganization', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.sessionValue.session = null;
    mocks.sessionValue.isPending = false;
    mocks.sessionValue.isAnonymous = false;
    mocks.orgListMock.mockReset();
    mocks.setActivePractice.mockReset();
    mocks.getSession.mockReset();
    resetWindowLocation();
    window.dispatchEvent(new CustomEvent('auth:session-cleared'));
  });

  afterEach(() => {
    window.dispatchEvent(new CustomEvent('auth:session-cleared'));
  });

  it('does not fetch when user is anonymous', async () => {
    mocks.sessionValue.session = completedOwnerSession();
    mocks.sessionValue.isAnonymous = true;

    const { result } = renderHook(() => useEnsureActiveOrganization());

    await new Promise((r) => setTimeout(r, 0));

    expect(mocks.orgListMock).not.toHaveBeenCalled();
    expect(mocks.setActivePractice).not.toHaveBeenCalled();
    expect(result.current.isResolving).toBe(false);
  });

  it('does not fetch when onboarding is incomplete', async () => {
    mocks.sessionValue.session = completedOwnerSession({ onboarding_complete: false });

    renderHook(() => useEnsureActiveOrganization());

    await new Promise((r) => setTimeout(r, 0));

    expect(mocks.orgListMock).not.toHaveBeenCalled();
    expect(mocks.setActivePractice).not.toHaveBeenCalled();
  });

  it('auto-activates first practice when active org is null and practices exist', async () => {
    mocks.sessionValue.session = completedOwnerSession();
    mocks.orgListMock.mockResolvedValue([{ id: 'practice-1', slug: 'first' }]);
    mocks.setActivePractice.mockResolvedValue(undefined);
    mocks.getSession.mockResolvedValue(null);

    const logSpy = vi.spyOn(console, 'info').mockImplementation(() => undefined);
    const eventSpy = vi.fn();
    window.addEventListener('auth:session-updated', eventSpy);

    renderHook(() => useEnsureActiveOrganization());

    await waitFor(() => {
      expect(mocks.setActivePractice).toHaveBeenCalledWith({ organizationId: 'practice-1' });
    });

    expect(mocks.getSession).toHaveBeenCalled();
    expect(eventSpy).toHaveBeenCalled();
    expect(logSpy).toHaveBeenCalledWith(
      '[Workspace] auto-activated first practice (no active_organization_id on session)'
    );

    window.removeEventListener('auth:session-updated', eventSpy);
    logSpy.mockRestore();
  });

  it('does not call setActivePractice when active org is already set', async () => {
    mocks.sessionValue.session = {
      ...completedOwnerSession(),
      session: { active_organization_id: 'existing-org' },
    };

    renderHook(() => useEnsureActiveOrganization());

    await new Promise((r) => setTimeout(r, 0));

    expect(mocks.orgListMock).not.toHaveBeenCalled();
    expect(mocks.setActivePractice).not.toHaveBeenCalled();
  });

  it('does not call setActivePractice when practices list is empty', async () => {
    mocks.sessionValue.session = completedOwnerSession();
    mocks.orgListMock.mockResolvedValue([]);

    renderHook(() => useEnsureActiveOrganization());

    await waitFor(() => {
      expect(mocks.orgListMock).toHaveBeenCalled();
    });
    expect(mocks.setActivePractice).not.toHaveBeenCalled();
  });

  it('does NOT memoize when authClient.organization.list throws — retry must remain possible', async () => {
    mocks.sessionValue.session = completedOwnerSession();
    mocks.orgListMock.mockRejectedValueOnce(new Error('network blip'));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const first = renderHook(() => useEnsureActiveOrganization());
    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalled();
    });
    expect(mocks.setActivePractice).not.toHaveBeenCalled();
    first.unmount();

    // A second consumer for the same user must be allowed to retry — the failed
    // call must not have memoized userId as "resolved". This is the regression
    // guard for ce-code-review finding #1 (memoization-of-failure / 6-reviewer
    // convergence): a transient error should not permanently lock the user out
    // of recovery.
    mocks.orgListMock.mockResolvedValueOnce([{ id: 'practice-1', slug: 'first' }]);
    mocks.setActivePractice.mockResolvedValue(undefined);
    mocks.getSession.mockResolvedValue(null);

    renderHook(() => useEnsureActiveOrganization());
    await waitFor(() => {
      expect(mocks.setActivePractice).toHaveBeenCalledWith({ organizationId: 'practice-1' });
    });

    warnSpy.mockRestore();
  });

  it('does NOT memoize when authClient.organization.list returns a non-array shape', async () => {
    mocks.sessionValue.session = completedOwnerSession();
    mocks.orgListMock.mockResolvedValueOnce({ unexpected: 'shape' } as unknown as unknown[]);

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const first = renderHook(() => useEnsureActiveOrganization());
    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalled();
    });
    expect(mocks.setActivePractice).not.toHaveBeenCalled();
    first.unmount();

    // Retry path: same user, well-formed response, must succeed.
    mocks.orgListMock.mockResolvedValueOnce([{ id: 'practice-1', slug: 'first' }]);
    mocks.setActivePractice.mockResolvedValue(undefined);
    mocks.getSession.mockResolvedValue(null);

    renderHook(() => useEnsureActiveOrganization());
    await waitFor(() => {
      expect(mocks.setActivePractice).toHaveBeenCalledWith({ organizationId: 'practice-1' });
    });

    warnSpy.mockRestore();
  });

  it('does NOT memoize when setActive rejects mid-recovery — retry must remain possible', async () => {
    mocks.sessionValue.session = completedOwnerSession();
    mocks.orgListMock.mockResolvedValue([{ id: 'practice-1', slug: 'first' }]);
    mocks.setActivePractice.mockRejectedValueOnce(new Error('setActive backend 500'));

    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const first = renderHook(() => useEnsureActiveOrganization());
    await waitFor(() => {
      expect(warnSpy).toHaveBeenCalled();
    });
    first.unmount();

    // Retry path: setActive resolves successfully on the next attempt.
    mocks.setActivePractice.mockResolvedValueOnce(undefined);
    mocks.getSession.mockResolvedValue(null);

    renderHook(() => useEnsureActiveOrganization());
    await waitFor(() => {
      expect(mocks.setActivePractice).toHaveBeenCalledTimes(2);
    });

    warnSpy.mockRestore();
  });

  it('does not double-fetch for the same userId across consumers', async () => {
    mocks.sessionValue.session = completedOwnerSession();
    mocks.orgListMock.mockResolvedValue([{ id: 'practice-1', slug: 'first' }]);
    mocks.setActivePractice.mockResolvedValue(undefined);
    mocks.getSession.mockResolvedValue(null);

    renderHook(() => useEnsureActiveOrganization());
    renderHook(() => useEnsureActiveOrganization());

    await waitFor(() => {
      expect(mocks.setActivePractice).toHaveBeenCalledTimes(1);
    });
    expect(mocks.orgListMock).toHaveBeenCalledTimes(1);
  });

  it('auto-fire path skips when ?subscription=success is present in URL', async () => {
    mocks.sessionValue.session = completedOwnerSession();
    window.history.replaceState({}, '', '/?subscription=success');

    renderHook(() => useEnsureActiveOrganization());

    await new Promise((r) => setTimeout(r, 10));

    expect(mocks.orgListMock).not.toHaveBeenCalled();
    expect(mocks.setActivePractice).not.toHaveBeenCalled();
  });

  it('forceResolve runs the recovery even when ?subscription=success is present', async () => {
    mocks.sessionValue.session = completedOwnerSession();
    window.history.replaceState({}, '', '/?subscription=success');
    mocks.orgListMock.mockResolvedValue([{ id: 'practice-1', slug: 'first' }]);
    mocks.setActivePractice.mockResolvedValue(undefined);
    mocks.getSession.mockResolvedValue(null);

    const { result } = renderHook(() => useEnsureActiveOrganization());

    await act(async () => {
      await result.current.forceResolve();
    });

    expect(mocks.setActivePractice).toHaveBeenCalledWith({ organizationId: 'practice-1' });
    expect(mocks.getSession).toHaveBeenCalled();
  });

  it('forceResolve is idempotent across multiple invocations for the same user', async () => {
    mocks.sessionValue.session = completedOwnerSession();
    mocks.orgListMock.mockResolvedValue([{ id: 'practice-1', slug: 'first' }]);
    mocks.setActivePractice.mockResolvedValue(undefined);
    mocks.getSession.mockResolvedValue(null);

    const { result } = renderHook(() => useEnsureActiveOrganization());

    await act(async () => {
      await Promise.all([result.current.forceResolve(), result.current.forceResolve()]);
    });

    expect(mocks.orgListMock).toHaveBeenCalledTimes(1);
    expect(mocks.setActivePractice).toHaveBeenCalledTimes(1);
  });

  it('initial isResolving is true on render #1 when eligible (loading-by-default)', () => {
    // THE /pricing-flash fix. Pre-fix this initial value was always false, and
    // gate code reading it on render #1 saw a stale "not loading" signal and
    // navigated to /pricing before the recovery hook's effect even fired.
    mocks.sessionValue.session = completedOwnerSession();
    // Make orgList never resolve so isResolving stays true.
    mocks.orgListMock.mockReturnValue(new Promise(() => undefined));

    const { result } = renderHook(() => useEnsureActiveOrganization());

    expect(result.current.isResolving).toBe(true);
  });

  it('initial isResolving is false when not eligible (anonymous user)', () => {
    mocks.sessionValue.session = completedOwnerSession();
    mocks.sessionValue.isAnonymous = true;

    const { result } = renderHook(() => useEnsureActiveOrganization());

    expect(result.current.isResolving).toBe(false);
  });

  it('initial isResolving is false when not eligible (onboarding incomplete)', () => {
    mocks.sessionValue.session = completedOwnerSession({ onboarding_complete: false });

    const { result } = renderHook(() => useEnsureActiveOrganization());

    expect(result.current.isResolving).toBe(false);
  });

  it('initial isResolving is false when active org is already set', () => {
    mocks.sessionValue.session = {
      ...completedOwnerSession(),
      session: { active_organization_id: 'existing-org' },
    };

    const { result } = renderHook(() => useEnsureActiveOrganization());

    expect(result.current.isResolving).toBe(false);
  });

  it('initial isResolving is false on ?subscription=success (post-Stripe owns that path)', () => {
    mocks.sessionValue.session = completedOwnerSession();
    window.history.replaceState({}, '', '/?subscription=success');

    const { result } = renderHook(() => useEnsureActiveOrganization());

    expect(result.current.isResolving).toBe(false);
  });

  it('initial isResolving is false when session is pending', () => {
    mocks.sessionValue.session = completedOwnerSession();
    mocks.sessionValue.isPending = true;

    const { result } = renderHook(() => useEnsureActiveOrganization());

    expect(result.current.isResolving).toBe(false);
  });

  it('drops memo on auth:session-cleared so a new user can be resolved', async () => {
    mocks.sessionValue.session = completedOwnerSession();
    mocks.orgListMock.mockResolvedValue([{ id: 'practice-1', slug: 'first' }]);
    mocks.setActivePractice.mockResolvedValue(undefined);
    mocks.getSession.mockResolvedValue(null);

    const first = renderHook(() => useEnsureActiveOrganization());
    await waitFor(() => {
      expect(mocks.setActivePractice).toHaveBeenCalledTimes(1);
    });
    first.unmount();

    window.dispatchEvent(new CustomEvent('auth:session-cleared'));

    mocks.sessionValue.session = {
      ...completedOwnerSession({ id: 'user-2' }),
    };
    mocks.orgListMock.mockResolvedValue([{ id: 'practice-2', slug: 'second' }]);

    renderHook(() => useEnsureActiveOrganization());

    await waitFor(() => {
      expect(mocks.setActivePractice).toHaveBeenCalledWith({ organizationId: 'practice-2' });
    });
  });
});

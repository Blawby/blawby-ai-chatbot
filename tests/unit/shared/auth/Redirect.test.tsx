// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { render, cleanup } from '@testing-library/preact';

const navigateMock = vi.hoisted(() => vi.fn());

vi.mock('@/shared/utils/navigation', () => ({
  // Wrap in an object so the test can swap the inner navigate identity
  // between renders by reassigning navigationOverride.navigate.
  useNavigation: () => ({ navigate: navigationOverride.navigate }),
}));

// Holder for the navigate fn the mocked useNavigation will return. Tests
// reassign `navigationOverride.navigate` to a fresh identity to exercise
// the defensive `lastFiredRef` guard (which must skip re-firing even if
// navigate's identity changes).
const navigationOverride = {
  navigate: navigateMock,
};

import { Redirect } from '@/shared/auth/Redirect';

beforeEach(() => {
  navigateMock.mockReset();
  navigationOverride.navigate = navigateMock;
});

afterEach(() => {
  cleanup();
});

describe('<Redirect />', () => {
  it('calls navigate once on mount with replace=true by default', () => {
    render(<Redirect to="/foo" />);
    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(navigateMock).toHaveBeenCalledWith('/foo', true);
  });

  it('respects an explicit replace=false', () => {
    render(<Redirect to="/foo" replace={false} />);
    expect(navigateMock).toHaveBeenCalledWith('/foo', false);
  });

  it('does NOT re-fire when re-rendered with the same `to`, even if navigate identity changes', () => {
    // The defensive `lastFiredRef` guard pins this — without it, replacing
    // the navigate function identity would re-trigger the effect and push a
    // second navigation for the same target.
    const { rerender } = render(<Redirect to="/foo" />);
    expect(navigateMock).toHaveBeenCalledTimes(1);

    // Swap to a fresh navigate identity and re-render with the same `to`.
    const freshNavigate = vi.fn();
    navigationOverride.navigate = freshNavigate;
    rerender(<Redirect to="/foo" />);

    expect(navigateMock).toHaveBeenCalledTimes(1);
    expect(freshNavigate).not.toHaveBeenCalled();
  });

  it('re-fires when `to` changes', () => {
    const { rerender } = render(<Redirect to="/foo" />);
    expect(navigateMock).toHaveBeenCalledWith('/foo', true);

    rerender(<Redirect to="/bar" />);
    expect(navigateMock).toHaveBeenCalledTimes(2);
    expect(navigateMock).toHaveBeenLastCalledWith('/bar', true);
  });
});

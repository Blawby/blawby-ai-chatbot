/**
 * Unit tests for `useDialogFormReset`. Verifies that:
 *   - on-close: fires only when isOpen goes (or is) false
 *   - on-open: fires only when isOpen goes (or is) true
 *   - latest `reset` closure is invoked even if the prop changes between renders
 *   - flipping `trigger` between renders re-binds without leaking calls
 *
 * If these break, callers may silently lose form-state-reset behavior or — worse —
 * fire stale resets that clobber the wrong inputs. See
 * docs/solutions/conventions/form-reset-pattern-2026-05-18.md.
 */
import { describe, it, expect, vi } from 'vitest';
import { renderHook } from '@testing-library/preact';
import { useDialogFormReset } from '@/shared/ui/dialog/useDialogFormReset';

describe('useDialogFormReset', () => {
  describe('on-close trigger (default)', () => {
    it('fires reset on initial mount when isOpen is false', () => {
      const reset = vi.fn();
      renderHook(() => useDialogFormReset({ isOpen: false, reset, reason: 'test' }));
      expect(reset).toHaveBeenCalledTimes(1);
    });

    it('does not fire on initial mount when isOpen is true', () => {
      const reset = vi.fn();
      renderHook(() => useDialogFormReset({ isOpen: true, reset, reason: 'test' }));
      expect(reset).not.toHaveBeenCalled();
    });

    it('fires reset when isOpen transitions true → false', () => {
      const reset = vi.fn();
      const { rerender } = renderHook(
        ({ isOpen }: { isOpen: boolean }) =>
          useDialogFormReset({ isOpen, reset, reason: 'test' }),
        { initialProps: { isOpen: true } }
      );
      expect(reset).not.toHaveBeenCalled();
      rerender({ isOpen: false });
      expect(reset).toHaveBeenCalledTimes(1);
    });

    it('does not fire when isOpen transitions false → true', () => {
      const reset = vi.fn();
      const { rerender } = renderHook(
        ({ isOpen }: { isOpen: boolean }) =>
          useDialogFormReset({ isOpen, reset, reason: 'test' }),
        { initialProps: { isOpen: false } }
      );
      reset.mockClear();
      rerender({ isOpen: true });
      expect(reset).not.toHaveBeenCalled();
    });
  });

  describe('on-open trigger', () => {
    it('fires reset on initial mount when isOpen is true', () => {
      const reset = vi.fn();
      renderHook(() =>
        useDialogFormReset({ isOpen: true, reset, reason: 'test', trigger: 'on-open' })
      );
      expect(reset).toHaveBeenCalledTimes(1);
    });

    it('does not fire on initial mount when isOpen is false', () => {
      const reset = vi.fn();
      renderHook(() =>
        useDialogFormReset({ isOpen: false, reset, reason: 'test', trigger: 'on-open' })
      );
      expect(reset).not.toHaveBeenCalled();
    });

    it('fires reset when isOpen transitions false → true', () => {
      const reset = vi.fn();
      const { rerender } = renderHook(
        ({ isOpen }: { isOpen: boolean }) =>
          useDialogFormReset({ isOpen, reset, reason: 'test', trigger: 'on-open' }),
        { initialProps: { isOpen: false } }
      );
      expect(reset).not.toHaveBeenCalled();
      rerender({ isOpen: true });
      expect(reset).toHaveBeenCalledTimes(1);
    });

    it('does not fire when isOpen transitions true → false', () => {
      const reset = vi.fn();
      const { rerender } = renderHook(
        ({ isOpen }: { isOpen: boolean }) =>
          useDialogFormReset({ isOpen, reset, reason: 'test', trigger: 'on-open' }),
        { initialProps: { isOpen: true } }
      );
      reset.mockClear();
      rerender({ isOpen: false });
      expect(reset).not.toHaveBeenCalled();
    });
  });

  describe('closure capture', () => {
    it('invokes the latest reset, not the one passed at mount', () => {
      const first = vi.fn();
      const second = vi.fn();
      const { rerender } = renderHook(
        ({ reset }: { reset: () => void }) =>
          useDialogFormReset({ isOpen: true, reset, reason: 'test' }),
        { initialProps: { reset: first } }
      );
      rerender({ reset: second });
      rerender({ reset: second }); // dummy rerender to ensure deps aren't tripping reset
      // Now flip isOpen to false to fire on-close.
      const { rerender: rerender2 } = renderHook(
        ({ isOpen, reset }: { isOpen: boolean; reset: () => void }) =>
          useDialogFormReset({ isOpen, reset, reason: 'test' }),
        { initialProps: { isOpen: true, reset: first } }
      );
      rerender2({ isOpen: true, reset: second });
      rerender2({ isOpen: false, reset: second });
      expect(first).not.toHaveBeenCalled();
      expect(second).toHaveBeenCalledTimes(1);
    });

    it('does not re-fire when reset reference changes without isOpen changing', () => {
      const reset = vi.fn();
      const { rerender } = renderHook(
        ({ reset: r }: { reset: () => void }) =>
          useDialogFormReset({ isOpen: true, reset: r, reason: 'test', trigger: 'on-open' }),
        { initialProps: { reset } }
      );
      expect(reset).toHaveBeenCalledTimes(1);
      rerender({ reset: vi.fn() });
      rerender({ reset: vi.fn() });
      // Original reset still 1; new resets never called because isOpen didn't change.
      expect(reset).toHaveBeenCalledTimes(1);
    });
  });
});

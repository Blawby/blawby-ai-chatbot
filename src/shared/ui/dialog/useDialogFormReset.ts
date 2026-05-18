import { useEffect, useRef } from 'preact/hooks';

/**
 * Hook for the standard dialog-form reset pattern: tie a `reset()` callback to
 * the dialog's `isOpen` lifecycle so draft form state goes back to defaults
 * between dialog uses.
 *
 * Required everywhere a dialog owns local form state that should not survive
 * across separate uses. See
 * docs/solutions/conventions/form-reset-pattern-2026-05-18.md for the full
 * convention, including the documented exceptions.
 *
 * `reason` is required and intentionally unused at runtime — it forces callers
 * to name the trigger and UX intent inline, so reviewers can tell at a glance
 * whether a reset is safe (close/cancel/open lifecycle) or accidentally bound
 * to a UI control change (tab toggle / mode switch / step navigation, which
 * must NOT clear input).
 */
export interface UseDialogFormResetOptions {
  /** The dialog's open state. The hook reacts to its transitions. */
  isOpen: boolean;
  /**
   * Reset callback. May read state via closure; the hook always invokes the
   * latest version, so callers don't need to memoize.
   */
  reset: () => void;
  /**
   * Short human-readable note explaining when and why this reset fires.
   * Required to keep call sites self-documenting.
   *
   * Example: "Cancelled refund workflow — clear draft on close."
   */
  reason: string;
  /**
   * When the reset fires.
   * - `'on-close'` (default): runs when `isOpen` is `false` after a change.
   *   Use for the typical "close = cancel = fresh next open" flow.
   * - `'on-open'`: runs when `isOpen` is `true` after a change. Use when a
   *   previously-interrupted submit/error state on the parent could leak
   *   into the next open and should be cleared at that moment.
   */
  trigger?: 'on-open' | 'on-close';
}

export function useDialogFormReset({
  isOpen,
  reset,
  trigger = 'on-close',
}: UseDialogFormResetOptions): void {
  const resetRef = useRef(reset);
  resetRef.current = reset;

  useEffect(() => {
    if (trigger === 'on-close' && !isOpen) {
      resetRef.current();
      return;
    }
    if (trigger === 'on-open' && isOpen) {
      resetRef.current();
    }
  }, [isOpen, trigger]);
}

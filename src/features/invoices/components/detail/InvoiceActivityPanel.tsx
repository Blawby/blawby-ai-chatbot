import { useMemo } from 'preact/hooks';
import { Panel } from '@/shared/ui/layout/Panel';
import { ActivityTimeline } from '@/shared/ui/activity/ActivityTimeline';
import type { InvoiceDetail } from '@/features/invoices/types';
import { synthesizeInvoiceActivity } from '@/features/invoices/utils/synthesizeInvoiceActivity';

interface InvoiceActivityPanelProps {
  detail: InvoiceDetail;
  /**
   * Rendering mode:
   *  - 'panel' (default) — boxed Panel card; used in legacy/tile layouts.
   *  - 'audit' — slim audit-side treatment matching the LetterPaper-shaped
   *    detail view: max-w tracks the LetterPaper above it (720px), mono
   *    uppercase 'Activity' label, low-contrast timeline. Use when the
   *    activity sits directly below an <InvoicePreview> letter.
   */
  variant?: 'panel' | 'audit';
}

export const InvoiceActivityPanel = ({ detail, variant = 'panel' }: InvoiceActivityPanelProps) => {
  const items = useMemo(() => synthesizeInvoiceActivity(detail), [detail]);

  if (variant === 'audit') {
    return (
      <section
        className="mx-auto mt-6 w-full max-w-[720px] rounded-md border border-line-subtle bg-paper-2/30 px-5 py-4"
        aria-label="Invoice activity"
      >
        <p className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-dim-2">
          Activity
        </p>
        {items.length === 0 ? (
          <p className="text-sm text-dim-2">No activity yet.</p>
        ) : (
          <ActivityTimeline items={items} />
        )}
      </section>
    );
  }

  return (
    <Panel className="rounded-2xl p-5">
      <div className="mb-4 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-ink">Activity</h3>
      </div>
      {items.length === 0 ? (
        <p className="text-sm text-dim-2">No activity yet.</p>
      ) : (
        <ActivityTimeline items={items} />
      )}
    </Panel>
  );
};

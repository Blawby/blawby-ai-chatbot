import { FunctionComponent } from 'preact';

import { Pill } from '@/design-system/primitives';
import { BrandMark } from '@/design-system/layout';
import { cn } from '@/shared/utils/cn';

export interface ClientEngagementBrandTopbarProps {
  /** Recipient (client) display name — rendered in the "For: ..." crumb. */
  recipientName: string;
  className?: string;
}

/**
 * Top brand bar — left: Blawby BrandMark · right: "For: {name}" mono dim line +
 * green-dot "encrypted · audit-logged" Pill. Mirrors `.top` in
 * `design_handoff_blawby_chat_first/screens/EngagementReview.html`.
 *
 * The BrandMark already renders the italic serif accent "B" + sans "Blawby"
 * wordmark per design-system/layout/BrandMark.tsx — we do not need a bespoke
 * brand glyph here.
 */
export const ClientEngagementBrandTopbar: FunctionComponent<ClientEngagementBrandTopbarProps> = ({
  recipientName,
  className,
}) => {
  return (
    <div
      className={cn(
        'mx-auto flex max-w-[900px] items-center justify-between gap-4 px-4 pb-3.5 pt-5 font-mono text-[10.5px] uppercase tracking-[0.1em] text-dim sm:px-8',
        className,
      )}
    >
      <BrandMark />
      <div className="flex items-center gap-3">
        <span>
          For: <b className="font-medium normal-case tracking-normal text-ink">{recipientName}</b>
        </span>
        <Pill tone="live" className="hidden sm:inline-flex">
          encrypted · audit-logged
        </Pill>
      </div>
    </div>
  );
};

export default ClientEngagementBrandTopbar;

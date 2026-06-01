import { FunctionComponent } from 'preact';

import { Pill } from '@/design-system/primitives';
import { cn } from '@/shared/utils/cn';

export interface ClientEngagementPublicFlowFooterProps {
  /** Optional Privacy URL. */
  privacyHref?: string;
  /** Optional Terms URL. */
  termsHref?: string;
  /** Optional decline-escape-hatch handler. When omitted, the link is hidden. */
  onDecline?: () => void;
  className?: string;
}

/**
 * Public-flow footer — mono dim line with TLS audit pill + Privacy / Terms
 * links + an escape-hatch decline link. Mirrors `.foot` from
 * `design_handoff_blawby_chat_first/screens/EngagementReview.html`.
 *
 * Privacy + Terms hrefs are wired through props so the parent owns the routing
 * decision (some workspaces use /policies/privacy, others use an external link).
 * When neither href nor onDecline is supplied the links collapse cleanly.
 */
export const ClientEngagementPublicFlowFooter: FunctionComponent<ClientEngagementPublicFlowFooterProps> = ({
  privacyHref,
  termsHref,
  onDecline,
  className,
}) => {
  return (
    <footer
      className={cn(
        'mx-auto flex max-w-[900px] flex-col items-start justify-between gap-3 border-t border-rule px-4 pb-14 pt-8 font-mono text-[10.5px] uppercase tracking-[0.08em] text-dim-2 sm:flex-row sm:items-center sm:px-8',
        className,
      )}
    >
      <div className="inline-flex items-center gap-2.5">
        <Pill tone="live">tls · audit-logged</Pill>
        <span>Powered by Blawby</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-[18px] gap-y-1">
        {privacyHref ? (
          <a
            href={privacyHref}
            className="text-dim border-b border-dotted border-dim-2 hover:text-ink"
          >
            Privacy
          </a>
        ) : null}
        {termsHref ? (
          <a
            href={termsHref}
            className="text-dim border-b border-dotted border-dim-2 hover:text-ink"
          >
            Terms
          </a>
        ) : null}
        {onDecline ? (
          <button
            type="button"
            onClick={onDecline}
            className="cursor-pointer border-b border-dotted border-dim-2 bg-transparent p-0 font-mono text-[10.5px] uppercase tracking-[0.08em] text-dim hover:text-ink"
          >
            Decline this engagement
          </button>
        ) : null}
      </div>
    </footer>
  );
};

export default ClientEngagementPublicFlowFooter;

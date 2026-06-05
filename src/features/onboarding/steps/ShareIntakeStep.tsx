import { useMemo, useState } from 'preact/hooks';
import { Copy, ExternalLink, Sparkles } from 'lucide-preact';
import { Button } from '@/shared/ui/Button';
import { Icon } from '@/shared/ui/Icon';
import { StatStrip } from '@/design-system/patterns/StatStrip';
import { useToastContext } from '@/shared/contexts/ToastContext';
import { getPublicFormOrigin } from '@/config/urls';
import type { OnboardingDraft } from '../types';

interface ShareIntakeStepProps {
  draft: OnboardingDraft;
}

/**
 * Step 6 body — shows the share/embed surface plus a celebration block.
 *
 * The actual "complete + redirect" CTA lives in StageFooter as the Continue
 * button (label: "Open your workspace →"). This step is the visual reward +
 * proof the user is set up.
 */
export const ShareIntakeStep = ({ draft }: ShareIntakeStepProps) => {
  const { showSuccess, showError } = useToastContext();
  const [copied, setCopied] = useState(false);

  const intakeUrl = useMemo(() => {
    const slug = draft.createdOrganizationSlug ?? 'your-practice';
    return `${getPublicFormOrigin()}/p/${slug}`;
  }, [draft.createdOrganizationSlug]);

  const handleCopy = async () => {
    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard) {
        await navigator.clipboard.writeText(intakeUrl);
        setCopied(true);
        showSuccess('Link copied', 'Paste it anywhere — clients can start their intake.');
        setTimeout(() => setCopied(false), 2000);
      }
    } catch {
      showError('Copy failed', 'Select the link below and copy manually.');
    }
  };

  const handleOpenPreview = () => {
    if (typeof window === 'undefined') return;
    window.open(intakeUrl, '_blank', 'noopener,noreferrer');
  };

  const practiceAreaCount = draft.practiceAreas?.length ?? 0;
  const descriptionWords = (draft.description ?? '').trim().split(/\s+/).filter(Boolean).length;

  return (
    <section className="flex flex-col gap-6">
      <div
        className="card flex flex-col gap-4"
        style={{ padding: '28px' }}
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0 flex-1">
            <p
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '10px',
                letterSpacing: '0.1em',
                textTransform: 'uppercase',
                color: 'var(--dim)',
                margin: 0
              }}
            >
              Your intake link
            </p>
            <p
              className="mt-1.5 truncate"
              style={{
                fontFamily: 'var(--mono)',
                fontSize: '15px',
                color: 'var(--ink)'
              }}
            >
              {intakeUrl}
            </p>
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button
            variant="secondary"
            onClick={handleCopy}
            icon={Copy}
            iconClassName="h-4 w-4"
          >
            {copied ? 'Copied!' : 'Copy link'}
          </Button>
          <Button
            variant="ghost"
            onClick={handleOpenPreview}
            icon={ExternalLink}
            iconClassName="h-4 w-4"
          >
            Open preview
          </Button>
        </div>
      </div>

      <StatStrip
        cells={[
          {
            label: 'Practice areas',
            value: practiceAreaCount,
            extra: practiceAreaCount > 0 ? 'tuned to your work' : 'add anytime in Settings'
          },
          {
            label: 'Practice description',
            value: descriptionWords,
            unit: 'words',
            extra: descriptionWords > 0 ? 'grounding your setup' : 'add in Settings any time'
          }
        ]}
      />

      <div
        className="flex items-start gap-3 rounded-md border p-4"
        style={{
          background: 'var(--accent-soft)',
          borderColor: 'color-mix(in oklab, var(--accent) 30%, var(--rule))',
          borderRadius: 'var(--r-md)'
        }}
      >
        <Icon icon={Sparkles} className="h-5 w-5 mt-0.5" style={{ color: 'var(--accent-deep)' }} />
        <div className="flex-1 text-sm" style={{ color: 'var(--ink)', lineHeight: 1.55 }}>
          <strong>You&apos;re ready.</strong> Your intake link works the moment you finish.
          Share it with clients, embed it on your site, or paste it into any reply.
          We&apos;ll connect Stripe and finish payouts from the workspace banner.
        </div>
      </div>
    </section>
  );
};

/** Step 6 — always continueable; Continue triggers handleComplete. */
export const isShareIntakeComplete = (_draft: OnboardingDraft): boolean => true;

export default ShareIntakeStep;

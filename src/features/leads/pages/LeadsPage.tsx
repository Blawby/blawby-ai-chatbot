import type { ComponentChildren } from 'preact';
import { LeadReviewQueue } from '@/features/leads/components/LeadReviewQueue';
import type { MatterTransitionResult } from '@/shared/hooks/usePracticeManagement';

interface LeadsPageProps {
  practiceId: string | null;
  practiceSlug?: string | null;
  canReviewLeads: boolean;
  acceptMatter: (practiceId: string, matterId: string) => Promise<MatterTransitionResult>;
  rejectMatter: (practiceId: string, matterId: string, reason?: string) => Promise<MatterTransitionResult>;
  className?: string;
  header?: ComponentChildren;
}

export const LeadsPage = ({
  practiceId,
  practiceSlug,
  canReviewLeads,
  acceptMatter,
  rejectMatter,
  className = '',
  header
}: LeadsPageProps) => {
  return (
    <div className={`h-full overflow-y-auto p-6 ${className}`}>
      <div className="max-w-5xl mx-auto space-y-6">
        {header ?? (
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Leads</h1>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Review paid intakes and decide who to bring into the conversation.
            </p>
          </div>
        )}
        <div className="rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-dark-card-bg p-5">
          <LeadReviewQueue
            practiceId={practiceId}
            practiceSlug={practiceSlug}
            canReviewLeads={canReviewLeads}
            acceptMatter={acceptMatter}
            rejectMatter={rejectMatter}
            showHeader={false}
          />
        </div>
      </div>
    </div>
  );
};
